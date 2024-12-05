const express = require('express');
const router = express.Router();
const mailController = require('../controllers/mail.controller');

// Send email
router.post('/send', mailController.sendEmail);

// Get mail server status
router.get('/status', mailController.getStatus);

// Get mail server configuration
router.get('/config', mailController.getConfig);

// Update mail server configuration
router.put('/config', mailController.updateConfig);

module.exports = router;
