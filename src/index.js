require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { apiKeyAuth } = require('./middleware/auth.middleware');
const setupSecurity = require('./middleware/security.middleware');
const mailController = require('./controllers/mail.controller');

const app = express();

// Trust proxy - required for rate limiting behind Vercel
app.set('trust proxy', 1);

// Debug logging
console.log('Starting server...');
console.log('Environment:', process.env.NODE_ENV);

// Setup security middleware
setupSecurity(app);

// Basic middleware
app.use(cors());
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
app.post('/api/mail/send', mailController.sendMail);
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
