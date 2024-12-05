const nodemailer = require('nodemailer');

class MailService {
  constructor() {
    this.transporter = null;
    this.testAccount = null;
  }

  async createFakeTransporter() {
    try {
      this.testAccount = await nodemailer.createTestAccount();
      this.transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: this.testAccount.user,
          pass: this.testAccount.pass,
        },
      });

      console.log('Test Email Account:', {
        user: this.testAccount.user,
        pass: this.testAccount.pass,
        previewUrl: 'https://ethereal.email'
      });

      return this.transporter;
    } catch (error) {
      console.error('Failed to create fake transporter:', error);
      throw error;
    }
  }

  createRealTransporter() {
    try {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      return this.transporter;
    } catch (error) {
      console.error('Failed to create real transporter:', error);
      throw error;
    }
  }

  async initialize() {
    const useFakeMailer = process.env.NODE_ENV !== 'production' && process.env.USE_FAKE_MAILER === 'true';
    
    if (useFakeMailer) {
      console.log('Initializing fake mail transporter for development...');
      await this.createFakeTransporter();
    } else {
      console.log('Initializing real SMTP transporter...');
      this.createRealTransporter();
    }

    // Verify the connection
    try {
      await this.transporter.verify();
      console.log('Mail transport initialized and verified');
    } catch (error) {
      console.error('Failed to verify mail transport:', error);
      throw error;
    }
  }

  getTransporter() {
    if (!this.transporter) {
      throw new Error('Mail transport not initialized');
    }
    return this.transporter;
  }

  getTestAccount() {
    return this.testAccount;
  }
}

// Create singleton instance
const mailService = new MailService();

// Initialize the mail service
mailService.initialize().catch(console.error);

// Controller functions
exports.sendEmail = async (req, res) => {
  try {
    const { to, subject, text, html } = req.body;

    if (!to || !subject || (!text && !html)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields' 
      });
    }

    const transporter = mailService.getTransporter();
    const mailOptions = {
      from: process.env.SMTP_FROM || transporter.options.auth.user,
      to,
      subject,
      text,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    
    // If using fake mailer, include the preview URL
    const testAccount = mailService.getTestAccount();
    const response = {
      success: true,
      message: 'Email sent successfully',
      messageId: info.messageId
    };

    if (testAccount) {
      response.previewUrl = nodemailer.getTestMessageUrl(info);
      response.note = 'This is a test email. Check the previewUrl to see the email content.';
    }

    res.status(200).json(response);
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send email', 
      error: error.message 
    });
  }
};

exports.getStatus = async (req, res) => {
  try {
    const transporter = mailService.getTransporter();
    await transporter.verify();
    
    const testAccount = mailService.getTestAccount();
    const response = {
      success: true,
      status: 'Mail server is operational',
      mode: testAccount ? 'development (fake mailer)' : 'production'
    };

    if (testAccount) {
      response.testAccount = {
        user: testAccount.user,
        previewUrl: 'https://ethereal.email'
      };
    }

    res.status(200).json(response);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      status: 'Mail server is not responding',
      error: error.message 
    });
  }
};

exports.getConfig = (req, res) => {
  try {
    const transporter = mailService.getTransporter();
    const testAccount = mailService.getTestAccount();

    const config = {
      mode: testAccount ? 'development (fake mailer)' : 'production',
      host: transporter.options.host,
      port: transporter.options.port,
      secure: transporter.options.secure,
      defaultSender: process.env.SMTP_FROM || transporter.options.auth.user
    };

    res.status(200).json(config);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to get mail server configuration',
      error: error.message
    });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const testAccount = mailService.getTestAccount();
    if (testAccount) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update configuration while using fake mailer. Set USE_FAKE_MAILER=false to use real SMTP.'
      });
    }

    const { host, port, secure, user, pass } = req.body;
    
    // Create new transporter with updated config
    const newTransporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });

    // Verify the new configuration
    await newTransporter.verify();

    // Update environment variables
    process.env.SMTP_HOST = host;
    process.env.SMTP_PORT = port;
    process.env.SMTP_SECURE = secure;
    process.env.SMTP_USER = user;
    process.env.SMTP_PASS = pass;

    // Update the service transporter
    mailService.transporter = newTransporter;

    res.status(200).json({ 
      success: true, 
      message: 'Mail server configuration updated successfully' 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Failed to update mail server configuration',
      error: error.message 
    });
  }
};
