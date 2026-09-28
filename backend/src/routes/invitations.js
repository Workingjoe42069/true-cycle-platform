const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../db');
const { requireAuth, requireCoach } = require('../middleware/auth');
const { isValidEmail, isNonEmptyString } = require('../utils/validate');
const { newInviteToken, hashInviteToken, inviteExpiry, buildInviteUrl, isUuid } = require('../utils/invites');
const { sendClientInvitationEmail } = require('../utils/mailer');

const router = express.Router();

// Per-coach cap on outgoing invitation email (create + resend), so a
// compromised or abusive coach account can't use us as a spam relay.
const sendLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => 'coach:' + req.user.id,
  message: { error: 'Too many invitations sent in the last hour. Please try again later.' },
});

// Public lookup is guessable-token territory: keep it tight per IP.
const lookupLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_PER_INVITE = 10;

function toPublic(row) {
  const expired = new Date(row.expires_at) < new Date();
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    createdAt: row.created_at,
    lastSentAt: row.last_sent_at,
    expiresAt: row.expires_at,
    expired,
    emailDelivered: !!row.last_sent_at,
  };
}

// Sends (or re-sends) the email for an invitation row with a freshly
// issued token. Returns true if the email went out.
async function deliver(invite, token, coach) {
  try {
    await sendClientInvitationEmail({
      toEmail: invite.email,
      firstName: invite.first_name,
      coachName: coach.name,
      coachEmail: coach.email,
      inviteUrl: buildInviteUrl(token),
      expiresAt: invite.expires_at,
    });
    await pool.query(
      'UPDATE ct_client_invitations SET last_sent_at = now(), send_count = send_count + 1 WHERE id = $1',
      [invite.id]
    );
    return true;
  } catch (err) {
    console.error('sendClientInvitationEmail failed:', err.message);
    return false;
  }
}

// ---- Coach: invite a client by name + email ----
router.post('/', requireAuth, requireCoach, sendLimiter, async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (!isNonEmptyString(firstName, 100)) return res.status(400).json({ error: 'Please enter the client\'s first name.' });
  if (!isNonEmptyString(lastName, 100)) return res.status(400).json({ error: 'Please enter the client\'s last name.' });
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });

  const cleanEmail = email.trim().toLowerCase();
  const first = firstName.trim();
  const last = lastName.trim();

  try {
    const existingUser = await pool.query(
      `SELECT u.id,
              EXISTS (SELECT 1 FROM ct_relationships r WHERE r.coach_user_id = $2 AND r.client_user_id = u.id) AS is_my_client
       FROM users u WHERE u.email = $1`,
      [cleanEmail, req.user.id]
    );
    if (existingUser.rowCount > 0) {
      const msg = existingUser.rows[0].is_my_client
        ? 'That person is already one of your clients.'
        : 'That email address already has an account, so it can\'t be invited as a new client.';
      return res.status(409).json({ error: msg });
    }

    const token = newInviteToken();
    const expiresAt = inviteExpiry();

    // If this coach already has an open invitation for this email, refresh
    // it (new token, new expiry, updated name) instead of creating a duplicate.
    const upsert = await pool.query(
      `INSERT INTO ct_client_invitations (coach_user_id, first_name, last_name, email, token_hash, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (coach_user_id, email) WHERE accepted_at IS NULL AND cancelled_at IS NULL
       DO UPDATE SET first_name = EXCLUDED.first_name,
                     last_name  = EXCLUDED.last_name,
                     token_hash = EXCLUDED.token_hash,
                     expires_at = EXCLUDED.expires_at
       RETURNING *, (xmax <> 0) AS was_update`,
      [req.user.id, first, last, cleanEmail, hashInviteToken(token), expiresAt]
    );
    const invite = upsert.rows[0];

    const sent = await deliver(invite, token, req.user);
    const fresh = await pool.query('SELECT * FROM ct_client_invitations WHERE id = $1', [invite.id]);

    res.status(invite.was_update ? 200 : 201).json({
      invitation: toPublic(fresh.rows[0]),
      emailSent: sent,
      refreshedExisting: invite.was_update,
    });
  } catch (err) {
    console.error('create invitation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---- Coach: list open (not accepted, not cancelled) invitations ----
router.get('/', requireAuth, requireCoach, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM ct_client_invitations
       WHERE coach_user_id = $1 AND accepted_at IS NULL AND cancelled_at IS NULL
       ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json({ invitations: result.rows.map(toPublic) });
  } catch (err) {
    console.error('list invitations failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---- Coach: resend (issues a new link; the old one stops working) ----
router.post('/:id/resend', requireAuth, requireCoach, sendLimiter, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Invitation not found.' });
  try {
    const found = await pool.query(
      `SELECT * FROM ct_client_invitations
       WHERE id = $1 AND coach_user_id = $2 AND accepted_at IS NULL AND cancelled_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (found.rowCount === 0) return res.status(404).json({ error: 'Invitation not found.' });
    const current = found.rows[0];

    if (current.send_count >= MAX_SENDS_PER_INVITE) {
      return res.status(429).json({ error: 'This invitation has been sent the maximum number of times. Cancel it and create a new one.' });
    }
    if (current.last_sent_at && Date.now() - new Date(current.last_sent_at).getTime() < RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'That invitation was just sent. Please wait a minute before resending.' });
    }

    const token = newInviteToken();
    const updated = await pool.query(
      `UPDATE ct_client_invitations SET token_hash = $1, expires_at = $2 WHERE id = $3 RETURNING *`,
      [hashInviteToken(token), inviteExpiry(), current.id]
    );
    const sent = await deliver(updated.rows[0], token, req.user);
    const fresh = await pool.query('SELECT * FROM ct_client_invitations WHERE id = $1', [current.id]);
    res.json({ invitation: toPublic(fresh.rows[0]), emailSent: sent });
  } catch (err) {
    console.error('resend invitation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---- Coach: cancel ----
router.delete('/:id', requireAuth, requireCoach, async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(404).json({ error: 'Invitation not found.' });
  try {
    const result = await pool.query(
      `UPDATE ct_client_invitations SET cancelled_at = now()
       WHERE id = $1 AND coach_user_id = $2 AND accepted_at IS NULL AND cancelled_at IS NULL`,
      [req.params.id, req.user.id]
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Invitation not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error('cancel invitation failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---- Public: look up an invitation from its emailed link (prefills signup) ----
// POST rather than GET so the token never lands in URL/access logs.
router.post('/lookup', lookupLimiter, async (req, res) => {
  const { token } = req.body || {};
  const invalid = { error: 'This invitation link has expired or has already been used. Ask your coach to send a new one.' };
  if (!isNonEmptyString(token, 200)) return res.status(400).json(invalid);
  try {
    const result = await pool.query(
      `SELECT i.first_name, i.last_name, i.email, i.expires_at, c.name AS coach_name
       FROM ct_client_invitations i JOIN users c ON c.id = i.coach_user_id
       WHERE i.token_hash = $1 AND i.accepted_at IS NULL AND i.cancelled_at IS NULL`,
      [hashInviteToken(token)]
    );
    if (result.rowCount === 0) return res.status(400).json(invalid);
    const row = result.rows[0];
    if (new Date(row.expires_at) < new Date()) return res.status(400).json(invalid);
    res.json({
      invitation: {
        firstName: row.first_name,
        lastName: row.last_name,
        email: row.email,
        coachName: row.coach_name,
        expiresAt: row.expires_at,
      },
    });
  } catch (err) {
    console.error('invitation lookup failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
