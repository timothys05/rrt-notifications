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
    text: `Hello,\n\nWe have received your report and it is being processed.\n\nThank you.`,
    html: `<p>Hello,</p><p>We have received your report and it is being processed.</p><p>Thank you.</p>`,
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
