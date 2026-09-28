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

function fromAddress() {
  return process.env.SMTP_FROM || process.env.SMTP_USER;
}

// Anything a user typed (names, etc.) must be escaped before it goes into
// an HTML email body, or it could inject markup/links into the message.
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, m => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]
  ));
}

// Strip line breaks from values used in headers/subjects.
function oneLine(str) {
  return String(str == null ? '' : str).replace(/[\r\n]+/g, ' ').trim();
}

// ---- Brand wrapper for HTML emails (inline styles: email clients ignore <style>) ----
function brandedEmail(innerHtml) {
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#F6F4EF;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F6F4EF;padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:12px;overflow:hidden;border:1px solid #E1DED4;">
    <tr><td style="background:#025256;background:linear-gradient(120deg,#025256,#278180);padding:22px 28px;">
      <div style="font-family:Oswald,'Arial Narrow',Arial,sans-serif;font-size:20px;font-weight:700;color:#FFFFFF;letter-spacing:0.02em;">TRUE CYCLE COACHING</div>
      <div style="font-family:Arial,sans-serif;font-size:13px;color:#E4F1F0;font-style:italic;margin-top:4px;">Commitment Tracker</div>
    </td></tr>
    <tr><td style="padding:28px;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#17282A;">
      ${innerHtml}
    </td></tr>
    <tr><td style="background:#025256;padding:18px 28px;text-align:center;font-family:Arial,sans-serif;">
      <div style="font-size:13px;color:#E4F1F0;font-style:italic;">"Every big goal is really a small cycle, repeated on purpose."</div>
      <div style="margin-top:8px;"><a href="https://www.truecyclecoaching.com" style="color:#B9DAD8;font-size:12px;text-decoration:none;">www.truecyclecoaching.com</a></div>
    </td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

function ctaButton(url, label) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr>
    <td style="background:#ED7942;border-radius:6px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 28px;font-family:Oswald,'Arial Narrow',Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:#FFFFFF;text-decoration:none;">${escapeHtml(label)}</a>
    </td></tr></table>`;
}

// ---- Password reset ----
async function sendPasswordResetEmail(toEmail, toName, resetUrl) {
  const name = oneLine(toName);
  await getTransporter().sendMail({
    from: { name: 'True Cycle Coaching', address: fromAddress() },
    to: toEmail,
    subject: 'Reset your True Cycle Coaching password',
    text:
      `Hi ${name},\n\n` +
      `We received a request to reset your password. This link is valid for 1 hour and can only be used once:\n\n` +
      `${resetUrl}\n\n` +
      `If you didn't request this, you can safely ignore this email -- your password won't change.\n\n` +
      `-- True Cycle Coaching`,
    html: brandedEmail(
      `<p style="margin-top:0;">Hi ${escapeHtml(name)},</p>` +
      `<p>We received a request to reset your password. This link is valid for 1 hour and can only be used once.</p>` +
      ctaButton(resetUrl, 'Reset my password') +
      `<p style="font-size:13px;color:#4B5F61;">If you didn't request this, you can safely ignore this email &mdash; your password won't change.</p>`
    ),
  });
}

// ---- Client invitation ----
async function sendClientInvitationEmail({ toEmail, firstName, coachName, coachEmail, inviteUrl, expiresAt }) {
  const first = oneLine(firstName);
  const coach = oneLine(coachName);
  const coachFirst = coach.split(' ')[0] || coach;
  const expires = new Date(expiresAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'America/Los_Angeles',
  });

  await getTransporter().sendMail({
    from: { name: `${coach} via True Cycle Coaching`, address: fromAddress() },
    replyTo: coachEmail ? { name: coach, address: coachEmail } : undefined,
    to: toEmail,
    subject: `${coach} invited you to the True Cycle Commitment Tracker`,
    text:
      `Hi ${first},\n\n` +
      `${coach} has set up a space for the two of you in the True Cycle Commitment Tracker.\n\n` +
      `It's where you'll get clear on why your goal matters, build the plan behind it -- one goal, three strategies, five action steps -- ` +
      `and check in along the way on what's working, what's in the way, and what comes next. You won't be doing it alone.\n\n` +
      `Create your account here:\n${inviteUrl}\n\n` +
      `This link is just for you, works once, and expires ${expires}.\n\n` +
      `Questions? Reply to this email and it goes straight to ${coachFirst}.\n\n` +
      `-- True Cycle Coaching\nwww.truecyclecoaching.com`,
    html: brandedEmail(
      `<p style="margin-top:0;">Hi ${escapeHtml(first)},</p>` +
      `<p><strong style="color:#025256;">${escapeHtml(coach)}</strong> has set up a space for the two of you in the True Cycle Commitment Tracker.</p>` +
      `<p>It's where you'll get clear on <em>why</em> your goal matters, build the plan behind it &mdash; one goal, three strategies, five action steps &mdash; ` +
      `and check in along the way on what's working, what's in the way, and what comes next. You won't be doing it alone.</p>` +
      ctaButton(inviteUrl, 'Create my account') +
      `<p style="font-size:13px;color:#4B5F61;">This link is just for you, works once, and expires ${escapeHtml(expires)}. ` +
      `Questions? Reply to this email and it goes straight to ${escapeHtml(coachFirst)}.</p>` +
      `<p style="font-size:12px;color:#4B5F61;margin-bottom:0;">Button not working? Copy this address into your browser:<br>` +
      `<span style="word-break:break-all;color:#278180;">${escapeHtml(inviteUrl)}</span></p>`
    ),
  });
}

module.exports = { sendPasswordResetEmail, sendClientInvitationEmail };
