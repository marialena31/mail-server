const apiKeyAuth = (req, res, next) => {
    // Always allow OPTIONS requests
    if (req.method === 'OPTIONS') {
        return next();
    }

    // Skip auth for development environment
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const apiKey = req.headers['x-api-key'];
    
    // In production, only check if API key exists
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'No API key provided. Please include your API key in the x-api-key header.'
        });
    }

    // For now, accept any non-empty API key
    next();
};

module.exports = { apiKeyAuth };
