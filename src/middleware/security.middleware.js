const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const crypto = require('crypto');

// Rate limiting configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'development' ? 10000 : 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});

// CORS configuration
const corsOptions = {
    origin: process.env.NODE_ENV === 'development' 
        ? ['http://localhost:8000', 'http://localhost:3000'] 
        : process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-api-key'],
    exposedHeaders: ['X-CSRF-Token'],
    credentials: true,
    maxAge: 86400 // 24 hours
};

// Generate CSRF token
const generateToken = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Verify CSRF token
const verifyToken = (req, res, next) => {
    if (req.method === 'GET' || req.path === '/api/csrf-token') {
        return next();
    }

    const token = req.headers['x-csrf-token'];
    
    // For Postman testing: allow token to be passed directly
    if (!token || token !== req.app.locals.csrfToken) {
        return res.status(403).json({
            error: 'Invalid CSRF token',
            message: 'Form submission failed security validation'
        });
    }

    next();
};

// Security middleware setup
const setupSecurity = (app) => {
    // Basic security headers with Helmet
    app.use(helmet());
    
    // Parse cookies
    app.use(cookieParser());
    
    // CORS protection
    app.use(cors(corsOptions));
    
    // Rate limiting
    app.use('/api/', limiter);
    
    // Endpoint to get CSRF token
    app.get('/api/csrf-token', (req, res) => {
        const token = generateToken();
        
        // Store token in app locals for verification
        req.app.locals.csrfToken = token;
        
        // Set CSRF token in response header for easier access
        res.set('X-CSRF-Token', token);
        
        res.json({ token });
    });

    // CSRF Protection for all routes except token endpoint
    app.use(verifyToken);
    
    // Security headers
    app.use((req, res, next) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('X-XSS-Protection', '1; mode=block');
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        next();
    });
};

module.exports = setupSecurity;
