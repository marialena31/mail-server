const crypto = require('crypto');

// Generate a secure random API key (32 bytes converted to hex = 64 characters)
const apiKey = crypto.randomBytes(32).toString('hex');

console.log('Generated API Key:', apiKey);
