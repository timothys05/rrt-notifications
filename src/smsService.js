'use strict';

const twilio = require('twilio');

let client;

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

async function sendConfirmationSms(toPhone) {
  await getClient().messages.create({
    to: toPhone,
    from: process.env.TWILIO_FROM_PHONE,
    body: 'Your report has been received and is being processed. Thank you.',
  });
  console.log(`[sms] Confirmation sent to ${toPhone}`);
}

module.exports = { sendConfirmationSms };
