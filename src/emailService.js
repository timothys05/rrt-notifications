'use strict';

const sgMail = require('@sendgrid/mail');

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

async function sendConfirmationEmail(toEmail) {
  const msg = {
    to: toEmail,
    from: {
      email: process.env.SENDGRID_FROM_EMAIL,
      name: process.env.SENDGRID_FROM_NAME || 'RRT Notifications',
    },
    subject: 'Report Received — Confirmation',
    text: `Hello,\n\nWe have received your report. For more information, visit us at tl237rrt.com or call 833-778-4435. You can also download the RRT app on the App Store or Google Play.\n\nThank you.`,
    html: `<p>Hello,</p><p>We have received your report. For more information, visit us at <a href="https://tl237rrt.com">tl237rrt.com</a> or call <a href="tel:8337784435">833-778-4435</a>. You can also download the RRT app on the <a href="https://apps.apple.com/us/app/rapid-response-team/id6451216856">App Store</a> or <a href="https://play.google.com/store/apps/details?id=com.younglawgroup.accidentreporting">Google Play</a>.</p><p>Thank you.</p>`,
  };

  let response;
  try {
    [response] = await sgMail.send(msg);
  } catch (err) {
    console.error(
      `[email] SendGrid error for ${toEmail}: status=${err.code ?? err.response?.statusCode} message=${err.message} body=${JSON.stringify(err.response?.body)}`
    );
    throw err;
  }
  console.log(`[email] Confirmation sent to ${toEmail} — status ${response.statusCode}`, response.body ?? '');
}

module.exports = { sendConfirmationEmail };
