'use strict';

require('dotenv').config();

const { createPoller } = require('./src/blobPoller');
const { parseReport } = require('./src/reportParser');
const { sendConfirmationEmail } = require('./src/emailService');
const { sendConfirmationSms } = require('./src/smsService');

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS, 10) || 5 * 60 * 1000;

function validateEnv() {
  const required = [
    'AZURE_STORAGE_CONNECTION_STRING',
    'AZURE_CONTAINER_NAME',
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

async function processBlob(blobName, content) {
  let report;
  try {
    report = parseReport(content, blobName);
  } catch (err) {
    console.error(`[processor] Parse error for "${blobName}": ${err.message}`);
    return;
  }

  const { email, phone, optInEmail, optInSms } = report;
  console.log(`[processor] "${blobName}" — email: ${email || '(none)'}, phone: ${phone || '(none)'}, optInEmail: ${optInEmail}, optInSms: ${optInSms}`);

  const notifications = [];

  if (optInEmail && email) {
    notifications.push(
      sendConfirmationEmail(email).catch(err =>
        console.error(`[processor] Email failed for "${blobName}": ${err.message}`)
      )
    );
  } else if (email) {
    console.log(`[processor] "${blobName}" — skipping email to ${email}: optInEmail is false`);
  }

  if (optInSms && phone) {
    notifications.push(
      sendConfirmationSms(phone).catch(err =>
        console.error(`[processor] SMS failed for "${blobName}": ${err.message}`)
      )
    );
  } else if (phone) {
    console.log(`[processor] "${blobName}" — skipping SMS to ${phone}: optInSms is false`);
  }

  if (notifications.length === 0) {
    console.log(`[processor] "${blobName}" — no notifications sent`);
  }

  await Promise.all(notifications);
}

async function runPollCycle(poller) {
  const newBlobs = await poller.poll();

  for (const { blobName, content } of newBlobs) {
    await processBlob(blobName, content);
  }
}

async function main() {
  validateEnv();

  const poller = createPoller();

  console.log(`[main] Starting RRT Notifications service. Polling every ${POLL_INTERVAL_MS / 1000}s.`);

  // Run immediately on startup, then on the interval
  await runPollCycle(poller);

  setInterval(() => {
    runPollCycle(poller).catch(err => console.error(`[main] Poll cycle error: ${err.message}`));
  }, POLL_INTERVAL_MS);
}

main().catch(err => {
  console.error(`[main] Fatal error: ${err.message}`);
  process.exit(1);
});
