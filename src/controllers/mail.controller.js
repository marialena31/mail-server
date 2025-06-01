const nodemailer = require('nodemailer');

// Mail service singleton
const createMailService = () => {
    let transporter = null;
    let testAccount = null;

    const initialize = async () => {
        try {
            // Log SMTP configuration (excluding sensitive data)
            console.log('SMTP Configuration:', {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: process.env.SMTP_SECURE === 'true',
                user: process.env.SMTP_USER,
                from: process.env.SMTP_FROM
            });

            if (process.env.USE_FAKE_MAILER === 'true') {
                console.log('Using fake mailer (Ethereal)');
                testAccount = await nodemailer.createTestAccount();
                transporter = nodemailer.createTransport({
                    host: 'smtp.ethereal.email',
                    port: 587,
                    secure: false,
                    auth: {
                        user: testAccount.user,
                        pass: testAccount.pass,
                    },
                });
            } else {
                console.log('Using real SMTP server');
                transporter = nodemailer.createTransport({
                    host: process.env.SMTP_HOST,
                    port: parseInt(process.env.SMTP_PORT),
                    secure: process.env.SMTP_SECURE === 'true',
                    auth: {
                        user: process.env.SMTP_USER,
                        pass: process.env.SMTP_PASS,
                    },
                    tls: {
                        // Do not fail on invalid certs
                        rejectUnauthorized: false
                    }
                });
            }
            return transporter;
        } catch (error) {
            console.error('Error initializing mail service:', error);
            throw error;
        }
    };

    const getTransporter = async () => {
        if (!transporter) {
            transporter = await initialize();
        }
        return transporter;
    };

    return {
        getTransporter,
        getTestAccount: () => testAccount
    };
};

const mailService = createMailService();

// Controller functions
const validator = require('validator');

exports.sendMail = async (req, res) => {
    const fs = require('fs');
    try {
        const { to, subject, text } = req.body;

        // Validation stricte
        if (!to || !subject || !text) {
            if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
                fs.unlinkSync(req.attachment.path);
            }
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide to, subject, and text fields'
            });
        }
        if (!validator.isEmail(to)) {
            if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
                fs.unlinkSync(req.attachment.path);
            }
            return res.status(400).json({ error: 'Invalid email address' });
        }
        if (!validator.isLength(subject, { min: 3, max: 200 })) {
            if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
                fs.unlinkSync(req.attachment.path);
            }
            return res.status(400).json({ error: 'Subject length invalid' });
        }
        if (!validator.isLength(text, { min: 10, max: 5000 })) {
            if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
                fs.unlinkSync(req.attachment.path);
            }
            return res.status(400).json({ error: 'Message length invalid' });
        }

        // Sanitation
        const cleanSubject = validator.escape(subject);
        const cleanText = validator.escape(text);

        const transporter = await mailService.getTransporter();

        const mailOptions = {
            from: process.env.SMTP_FROM,
            to,
            subject: cleanSubject,
            text: cleanText
        };

        // Ajout de la pièce jointe si présente
        if (req.attachment) {
            // Dernier contrôle de sécurité (extension/mimetype)
            const pathMod = require('path');
            const allowedExt = ['.pdf', '.png', '.jpg', '.jpeg'];
            const allowedMime = ['application/pdf', 'image/png', 'image/jpeg'];
            const ext = pathMod.extname(req.attachment.originalname).toLowerCase();
            if (!allowedExt.includes(ext) || !allowedMime.includes(req.attachment.mimetype)) {
                fs.unlinkSync(req.attachment.path);
                return res.status(400).json({ error: 'Type de fichier non autorisé (contrôle final)' });
            }
            mailOptions.attachments = [
                {
                    filename: req.attachment.originalname,
                    path: req.attachment.path,
                    contentType: req.attachment.mimetype
                }
            ];
        }

        const info = await transporter.sendMail(mailOptions);

        // Supprime le fichier temporaire après envoi
        if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
            fs.unlinkSync(req.attachment.path);
        }

        const response = {
            messageId: info.messageId,
            success: true
        };

        if (process.env.USE_FAKE_MAILER === 'true') {
            response.previewUrl = nodemailer.getTestMessageUrl(info);
        }

        res.json(response);
    } catch (error) {
        // Nettoyage du fichier temporaire en cas d'erreur
        if (req.attachment && req.attachment.path && fs.existsSync(req.attachment.path)) {
            fs.unlinkSync(req.attachment.path);
        }
        console.error('Error sending email:', error);
        res.status(500).json({
            error: 'Failed to send email',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
            details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
        });
    }
};

exports.getStatus = async (req, res) => {
    try {
        const transporter = await mailService.getTransporter();
        await transporter.verify();
        
        res.json({
            status: 'operational',
            timestamp: new Date().toISOString(),
            useFakeMailer: process.env.USE_FAKE_MAILER === 'true',
            smtpConfig: {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: process.env.SMTP_SECURE === 'true',
                user: process.env.SMTP_USER,
                from: process.env.SMTP_FROM
            }
        });
    } catch (error) {
        console.error('Mail server error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Mail server is not responding',
            error: process.env.NODE_ENV === 'development' ? error.message : 'Connection failed',
            details: process.env.NODE_ENV === 'development' ? {
                host: process.env.SMTP_HOST,
                port: process.env.SMTP_PORT,
                secure: process.env.SMTP_SECURE === 'true',
                user: process.env.SMTP_USER,
                from: process.env.SMTP_FROM,
                error: error.toString()
            } : undefined
        });
    }
};

exports.getConfig = async (req, res) => {
    res.json({
        useFakeMailer: process.env.USE_FAKE_MAILER === 'true',
        smtpHost: process.env.SMTP_HOST,
        smtpPort: process.env.SMTP_PORT,
        smtpSecure: process.env.SMTP_SECURE === 'true',
        smtpUser: process.env.SMTP_USER,
        smtpFrom: process.env.SMTP_FROM
    });
};
