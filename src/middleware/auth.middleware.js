const apiKeyAuth = (req, res, next) => {
    // Always allow OPTIONS requests
    if (req.method === 'OPTIONS') {
        return next();
    }

    // Skip auth for development environment
    if (process.env.NODE_ENV === 'development') {
        return next();
    }

    const expectedApiKey = process.env.API_KEY;

    // Si aucune clé API n'est définie dans le .env, ne rien vérifier
    if (!expectedApiKey) {
        return next();
    }

    // Sinon, exiger la présence et la correspondance de la clé
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
        return res.status(401).json({ 
            error: 'Unauthorized',
            message: 'No API key provided. Please include your API key in the x-api-key header.'
        });
    }
    if (apiKey !== expectedApiKey) {
        return res.status(401).json({
            error: 'Unauthorized',
            message: 'Invalid API key.'
        });
    }
    next();
};

module.exports = { apiKeyAuth };
