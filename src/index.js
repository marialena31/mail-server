require('dotenv').config();
const express = require('express');
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
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
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

// Endpoint d'envoi de mail avec pièce jointe (champ 'file' optionnel)
app.post('/api/mail/send', upload.single('file'), async (req, res, next) => {
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
      // Scan VirusTotal si clé présente et non désactivé
      const scanEnabled = process.env.FILE_SCAN_ENABLED !== 'false';
      if (scanEnabled && process.env.VIRUSTOTAL_API_KEY) {
        const axios = require('axios');
        const fsRead = require('fs').readFileSync;
        const fileBuffer = fsRead(req.file.path);
        try {
          const vtResp = await axios.post('https://www.virustotal.com/api/v3/files', fileBuffer, {
            headers: {
              'x-apikey': process.env.VIRUSTOTAL_API_KEY,
              'Content-Type': 'application/octet-stream'
            }
          });
          const analysisId = vtResp.data.data.id;
          // Poll l'analyse jusqu'à résultat
          let verdict = null;
          for (let i = 0; i < 10; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const report = await axios.get(`https://www.virustotal.com/api/v3/analyses/${analysisId}`, {
              headers: { 'x-apikey': process.env.VIRUSTOTAL_API_KEY }
            });
            if (report.data.data.attributes.status === 'completed') {
              verdict = report.data.data.attributes.stats.malicious;
              break;
            }
          }
          if (verdict && verdict > 0) {
            fs.unlinkSync(req.file.path);
            return res.status(400).json({ error: 'Fichier détecté comme malveillant par VirusTotal' });
          }
        } catch (vtErr) {
          // Gestion quota VirusTotal
          if (vtErr.response && vtErr.response.status === 429) {
            // Envoi mail d'alerte à SMTP_USER
            try {
              const nodemailer = require('nodemailer');
              const transporter = await require('./controllers/mail.controller').mailService.getTransporter();
              await transporter.sendMail({
                from: process.env.SMTP_FROM,
                to: process.env.SMTP_USER,
                subject: '[Mail API] Quota VirusTotal dépassé',
                text: 'Le quota VirusTotal API a été dépassé. Les fichiers ne sont plus scannés. Veuillez vérifier votre compte VirusTotal.'
              });
            } catch (mailErr) {
              console.error('Erreur lors de l’envoi du mail d’alerte VirusTotal:', mailErr);
            }
            fs.unlinkSync(req.file.path);
            return res.status(429).json({ error: 'Quota VirusTotal dépassé. Le scan antivirus est temporairement indisponible.' });
          }
          // Autre erreur VirusTotal
          fs.unlinkSync(req.file.path);
          return res.status(500).json({ error: 'Erreur lors du scan VirusTotal', details: vtErr.message });
        }
      }
    }
    // Passe au contrôleur mail avec fichier
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
