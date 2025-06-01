require('dotenv').config();
// --- SENTRY ---
const Sentry = require('@sentry/node');
Sentry.init({
  dsn: process.env.SENTRY_DSN, // Ajoute SENTRY_DSN=... dans ton .env
  tracesSampleRate: 0.0 // Pas besoin de traces de perf ici
});
// --------------
const express = require('express');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
const cors = require('cors');
const { apiKeyAuth } = require('./middleware/auth.middleware');
const setupSecurity = require('./middleware/security.middleware');
const mailController = require('./controllers/mail.controller');
const multer = require('multer');
const fs = require('fs');

// Configure Multer for file uploads
const uploadDir = './uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});
const upload = multer({ storage });

const app = express();

// Trust proxy - required for rate limiting behind Vercel
app.set('trust proxy', 1);

// Debug logging
console.log('Starting server...');
console.log('Environment:', process.env.NODE_ENV);

// Setup security middleware
setupSecurity(app);

// Basic middleware
app.use(cors({
  origin: 'http://localhost:8000',
  credentials: true
}));
app.use(bodyParser.json({ limit: '10kb' })); // Limit payload size
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));

// Input validation middleware
app.use((req, res, next) => {
    if (req.body && Object.keys(req.body).length > 0) {
        // Sanitize input (basic example)
        Object.keys(req.body).forEach(key => {
            if (typeof req.body[key] === 'string') {
                req.body[key] = req.body[key].trim();
            }
        });
    }
    next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('UNCAUGHT ERROR:', err);
  if (err && err.stack) {
    console.error(err.stack);
  }
  res.status(500).json({
    error: 'Internal Server Error',
    message: err && err.message ? err.message : String(err),
    details: err && err.stack ? err.stack : undefined
  });
});

// Public endpoints (no auth required)
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Mail Server API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Protected routes
app.use('/api', apiKeyAuth);

// Rate limiting strict pour l'envoi de mail (5 req/min/IP)
const sendLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5,
  message: 'Trop de requêtes. Veuillez réessayer plus tard.'
});

// Endpoint d'envoi de mail avec pièce jointe (champ 'file' optionnel)
app.post('/api/mail/send', sendLimiter, upload.single('file'), async (req, res, next) => {
  console.log('--- Nouvelle requête upload reçue ---');
  try {
    // Contrôles de base
    const allowedExt = ['.pdf', '.png', '.jpg', '.jpeg'];
    const allowedMime = ['application/pdf', 'image/png', 'image/jpeg'];
    const maxSize = 5 * 1024 * 1024; // 5 Mo
    if (req.file) {
      const path = require('path');
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (!allowedExt.includes(ext) || !allowedMime.includes(req.file.mimetype)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Type de fichier non autorisé' });
      }
      if (req.file.size > maxSize) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: 'Fichier trop volumineux (max 5Mo)' });
      }
    }
    // --- VALIDATION & SANITATION ---
    const validator = require('validator');
    const sanitizeInput = (input) =>
      validator.escape(input.toString().trim().replace(/[\r\n\t]/g, ' '));

    // Champs requis
    const from = req.body.from && validator.isEmail(req.body.from.trim()) ? req.body.from.trim() : null;
    const to = req.body.to && validator.isEmail(req.body.to.trim()) ? req.body.to.trim() : null;
    let subject = req.body.subject ? sanitizeInput(req.body.subject) : '';
    let text = req.body.text ? sanitizeInput(req.body.text) : '';

    // Validation stricte
    if (!from || !to || !subject || !text) {
      if (typeof Sentry.captureMessage === 'function') {
        Sentry.captureMessage(
          `[ALERTE][Validation] Tentative d'envoi avec champ(s) invalide(s) : from=${from}, to=${to}, subject=${subject}`,
          'warning'
        );
      }
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: 'Champs requis manquants ou invalides',
        details: { from, to, subject, text }
      });
    }

    // Limite la taille du texte (anti spam/injection)
    if (text.length > 5000 || subject.length > 255) {
      if (typeof Sentry.captureMessage === 'function') {
        Sentry.captureMessage(
          `[ALERTE][Validation] Tentative d'envoi avec texte ou sujet trop long : subject.length=${subject.length}, text.length=${text.length}`,
          'warning'
        );
      }
      if (req.file && req.file.path && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({
        error: 'Texte ou sujet trop long',
        details: { subjectLength: subject.length, textLength: text.length }
      });
    }

    // Passe au contrôleur mail avec fichier et champs validés
    req.body.from = from;
    req.body.to = to;
    req.body.subject = subject;
    req.body.text = text;
    req.attachment = req.file || null;
    mailController.sendMail(req, res, next);
  } catch (error) {
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    next(error);
  }
});
app.get('/api/mail/status', mailController.getStatus);
app.get('/api/mail/config', mailController.getConfig);

// Global error handler
app.use((err, req, res, next) => {
  // Capture l'erreur dans Sentry (compatible v8+)
  if (typeof Sentry.captureException === 'function') {
    Sentry.captureException(err);
  }

    console.error('Error:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        ...(process.env.NODE_ENV === 'development' ? { stack: err.stack } : {})
    });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

module.exports = app;
