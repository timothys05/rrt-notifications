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

const LITIFY_URL =
  'https://pondlehocky.my.salesforce-sites.com/api/services/apexrest/litify_pm/api/v1/intake/create';

const UNION_IDS = {
  'SMW Local 25': 'a0iRN000007g2ZFYAY',
  'UFCW 27': 'a0iRN000007g2fhYAA',
  'UFCW 1776': 'a0i3h000000KzGqAAK',
  'ICWUC': 'a0iRN000007gRSnYAM',
  'Teamsters 237': 'a0iRN00000333qrYAA',
};

const MONTH_ABBRS = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

function formatIncidentDate(dateStr) {
  // Handle iOS format: MMMdd_yyyy e.g. "Jun04_2026"
  const iosMatch = dateStr.match(/^([A-Za-z]{3})(\d{2})_(\d{4})$/);
  if (iosMatch) {
    const [, mon, dd, yyyy] = iosMatch;
    const mm = MONTH_ABBRS[mon];
    if (mm) return `${mm}/${dd}/${yyyy}`;
  }

  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

app.post('/litify', async (req, res) => {
  const {
    firstName,
    lastName,
    phone,
    email,
    natureOfAccidentOrInjury,
    locationOfAccidentOrInjury,
    date,
    time,
    union,
  } = req.body ?? {};

  if (!firstName || !lastName) {
    return res.status(400).json({ error: 'firstName and lastName are required' });
  }
  if (!union || !UNION_IDS[union]) {
    return res.status(400).json({
      error: `union is required and must be one of: ${Object.keys(UNION_IDS).join(', ')}`,
    });
  }
  if (!date) {
    return res.status(400).json({ error: 'date is required' });
  }

  const descriptionParts = [];
  if (natureOfAccidentOrInjury) descriptionParts.push(`Nature of Accident/Injury: ${natureOfAccidentOrInjury}`);
  if (locationOfAccidentOrInjury) descriptionParts.push(`Location of Accident/Injury: ${locationOfAccidentOrInjury}`);
  if (date) descriptionParts.push(`Date: ${date}`);
  if (time) descriptionParts.push(`Time: ${time}`);
  const description = descriptionParts.join('\n');

  const payload = {
    firstName,
    lastName,
    phone: phone ?? '',
    email: email ?? '',
    description,
    incidentDate: formatIncidentDate(date),
    ClientUnion: UNION_IDS[union],
    websource: 'Eric L. Young, Esq.',
    OtherSource: 'RRT',
    caseType: 'Test',
  };

  try {
    const response = await fetch(LITIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    console.log(`[litify] Response ${response.status}: ${responseText}`);

    if (!response.ok) {
      return res.status(502).json({ error: 'Litify intake API error', status: response.status, body: responseText });
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }

    return res.status(200).json({ ok: true, litify: responseData });
  } catch (err) {
    console.error(`[litify] Request failed: ${err.message}`);
    return res.status(500).json({ error: 'Failed to submit to Litify' });
  }
});

validateEnv();

app.listen(PORT, () => {
  console.log(`[main] RRT Notifications listening on port ${PORT}`);
});
