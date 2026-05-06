'use strict';

require('dotenv').config();

const express = require('express');
const { sendConfirmationEmail } = require('./src/emailService');
const { sendConfirmationSms } = require('./src/smsService');

const PORT = process.env.PORT || 3000;

function validateEnv() {
  const required = [
    'SENDGRID_API_KEY',
    'SENDGRID_FROM_EMAIL',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_FROM_PHONE',
  ];

  const missing = required.filter(key => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => {
  res.sendStatus(200);
});

app.post('/notify', async (req, res) => {
  const { email, phone, optInEmail, optInSms } = req.body ?? {};

  if (!email && !phone) {
    return res.status(400).json({ error: 'At least one of email or phone is required' });
  }
  if (optInEmail && !email) {
    return res.status(400).json({ error: 'optInEmail is true but no email provided' });
  }
  if (optInSms && !phone) {
    return res.status(400).json({ error: 'optInSms is true but no phone provided' });
  }

  const notifications = [];

  if (optInEmail && email) {
    notifications.push(
      sendConfirmationEmail(email).catch(err =>
        console.error(`[notify] Email failed for ${email}: ${err.message}`)
      )
    );
  }

  if (optInSms && phone) {
    notifications.push(
      sendConfirmationSms(phone).catch(err =>
        console.error(`[notify] SMS failed for ${phone}: ${err.message}`)
      )
    );
  }

  await Promise.all(notifications);

  if (notifications.length === 0) {
    console.log(`[notify] No notifications sent (all opt-ins false)`);
  }

  res.json({ ok: true });
});

validateEnv();

app.listen(PORT, () => {
  console.log(`[main] RRT Notifications listening on port ${PORT}`);
});
