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
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        
        const allowedOrigins = process.env.NODE_ENV === 'development' 
            ? ['http://localhost:8000', 'http://localhost:3000']
            : process.env.ALLOWED_ORIGINS 
                ? process.env.ALLOWED_ORIGINS.split(',')
                : [];
        
        if (allowedOrigins.includes(origin) || process.env.NODE_ENV === 'development') {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token', 'x-csrf-token', 'x-api-key'],
    exposedHeaders: ['X-CSRF-Token', 'x-csrf-token'],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204
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

    // Get token from header or cookies
    const token = req.headers['x-csrf-token'] || req.cookies['XSRF-TOKEN'];
    
    // In a real app, you might want to validate against a session or database
    // For this example, we'll just check if the token exists and is a valid format
    if (!token || typeof token !== 'string' || token.length < 32) {
        return res.status(403).json({
            error: 'Invalid CSRF token',
            message: 'Form submission failed security validation. Please refresh the page and try again.'
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
        
        // Set CSRF token in a secure, httpOnly cookie
        res.cookie('XSRF-TOKEN', token, {
            secure: process.env.NODE_ENV === 'production',
            httpOnly: true,
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        
        // Also send token in response for non-browser clients
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
