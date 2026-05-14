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
    body: 'Your report has been received. Visit tl237rrt.com, call us at 833-778-4435, or download the app on the App Store (https://apps.apple.com/us/app/rapid-response-team/id6451216856) or Google Play (https://play.google.com/store/apps/details?id=com.younglawgroup.accidentreporting).',
  });
  console.log(`[sms] Confirmation sent to ${toPhone}`);
}

module.exports = { sendConfirmationSms };
