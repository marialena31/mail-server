# Mail Server API

A Node.js Express API for managing mail server operations.

## Features

- Send emails
- Check mail server status
- Get and update mail server configuration
- Health check endpoint

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp .env.example .env
```

3. Update the `.env` file with your SMTP server details.

## Running the Server

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Endpoints

### Health Check
- GET `/health` - Check if the API is running

### Mail Operations
- POST `/api/mail/send` - Send an email
- GET `/api/mail/status` - Get mail server status
- GET `/api/mail/config` - Get current mail server configuration
- PUT `/api/mail/config` - Update mail server configuration

## Request Examples

### Send Email
```json
POST /api/mail/send
{
  "to": "recipient@example.com",
  "subject": "Test Email",
  "text": "This is a test email",
  "html": "<p>This is a test email</p>"
}
```

### Update Configuration
```json
PUT /api/mail/config
{
  "host": "smtp.example.com",
  "port": 587,
  "secure": false,
  "user": "your-email@example.com",
  "pass": "your-password"
}
```
