const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: false, // STARTTLS on port 587
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS, // Google Workspace: a 16-character App Password, not the account login password
    },
  });
  return transporter;
}

async function sendPasswordResetEmail(toEmail, toName, resetUrl) {
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await getTransporter().sendMail({
    from: `"True Cycle Coaching" <${from}>`,
    to: toEmail,
    subject: 'Reset your True Cycle Coaching password',
    text:
      `Hi ${toName},\n\n` +
      `We received a request to reset your password. This link is valid for 1 hour and can only be used once:\n\n` +
      `${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email -- your password won't change.\n\n` +
      `-- True Cycle Coaching`,
    html:
      `<p>Hi ${toName},</p>` +
      `<p>We received a request to reset your password. This link is valid for 1 hour and can only be used once:</p>` +
      `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
      `<p>If you didn't request this, you can safely ignore this email — your password won't change.</p>` +
      `<p>&mdash; True Cycle Coaching</p>`,
  });
}

module.exports = { sendPasswordResetEmail };
