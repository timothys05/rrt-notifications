'use strict';

require('dotenv').config();

const express = require('express');
const { sendConfirmationEmail } = require('./src/emailService');
const { sendConfirmationSms } = require('./src/smsService');
const { appendOptinRow, getOptinsCsv } = require('./src/optinService');

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

app.post('/register-optin', async (req, res) => {
  const { firstName, lastName, phone, email, smsOptIn, emailOptIn, timestamp } = req.body ?? {};

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }
  if (!phone && !email) {
    return res.status(400).json({ error: 'At least one of phone or email is required' });
  }

  const row = {
    firstName,
    lastName,
    phone: phone ?? '',
    email: email ?? '',
    smsOptIn: smsOptIn ?? false,
    emailOptIn: emailOptIn ?? false,
    timestamp: timestamp ?? new Date().toISOString(),
  };

  try {
    await appendOptinRow(row);
    console.log(`[optin] Recorded opt-in for ${firstName} ${lastName}`);
    res.json({ ok: true });
  } catch (err) {
    console.error(`[optin] Failed to save opt-in: ${err.message}`);
    res.status(500).json({ error: 'Failed to save opt-in' });
  }
});

app.get('/export-optins', async (req, res) => {
  const exportUser = process.env.EXPORT_USER;
  const exportPass = process.env.EXPORT_PASS;

  const authHeader = req.headers.authorization ?? '';
  const base64 = authHeader.startsWith('Basic ') ? authHeader.slice(6) : '';
  const [user, pass] = Buffer.from(base64, 'base64').toString().split(':');

  if (!exportUser || !exportPass || user !== exportUser || pass !== exportPass) {
    res.set('WWW-Authenticate', 'Basic realm="export"');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const csv = await getOptinsCsv();
    res.set('Content-Type', 'text/csv');
    res.set('Content-Disposition', 'attachment; filename="optins.csv"');
    res.send(csv);
  } catch (err) {
    if (err.statusCode === 404) {
      return res.status(404).json({ error: 'No opt-ins recorded yet' });
    }
    console.error(`[export] Failed to fetch optins.csv: ${err.message}`);
    res.status(500).json({ error: 'Failed to fetch opt-ins' });
  }
});

validateEnv();

app.listen(PORT, () => {
  console.log(`[main] RRT Notifications listening on port ${PORT}`);
});
