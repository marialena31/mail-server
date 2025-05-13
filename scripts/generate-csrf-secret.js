const crypto = require('crypto');

// Generate a random 32-byte hex string
const csrfSecret = crypto.randomBytes(32).toString('hex');

console.log('Generated CSRF Secret:');
console.log(csrfSecret);
