const express = require('express');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const { pool } = require('../db');
const { hashPassword, verifyPassword } = require('../utils/hash');
const { sendPasswordResetEmail } = require('../utils/mailer');
const { signSession, setSessionCookie, clearSessionCookie } = require('../utils/jwt');
const { isValidEmail, isValidPassword, isNonEmptyString } = require('../utils/validate');
const { requireAuth, requireCoach } = require('../middleware/auth');

const router = express.Router();

// Slows down credential stuffing / brute force without punishing normal use.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again later.' },
});

// ---- Coach signup ----
router.post('/signup/coach', authLimiter, async (req, res) => {
  const { email, password, name } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  if (!isNonEmptyString(name, 200)) return res.status(400).json({ error: 'Please enter your name.' });

  try {
    const existing = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      // Generic message -- do not reveal whether the email is registered.
      return res.status(409).json({ error: 'That email could not be registered. Try logging in instead.' });
    }

    const passwordHash = await hashPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, name, password_hash, commitment_role)
       VALUES ($1, $2, $3, 'coach') RETURNING id, email, name, commitment_role`,
      [email.toLowerCase(), name.trim(), passwordHash]
    );
    const user = result.rows[0];
    const token = signSession({ userId: user.id });
    setSessionCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    console.error('signup/coach failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// ---- Coach: generate a single-use, time-limited invite code for a new client ----
router.post('/invite', requireAuth, requireCoach, async (req, res) => {
  const code = crypto.randomBytes(9).toString('base64url'); // ~12 chars, unguessable
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
  await pool.query(
    'INSERT INTO ct_invite_codes (code, coach_user_id, expires_at) VALUES ($1, $2, $3)',
    [code, req.user.id, expiresAt]
  );
  res.status(201).json({ code, expiresAt });
});

// ---- Client signup, redeeming a coach's invite code ----
router.post('/signup/client', authLimiter, async (req, res) => {
  const { email, password, name, inviteCode } = req.body;
  if (!isValidEmail(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 10 characters.' });
  if (!isNonEmptyString(name, 200)) return res.status(400).json({ error: 'Please enter your name.' });
  if (!isNonEmptyString(inviteCode, 64)) return res.status(400).json({ error: 'An invite code from your coach is required.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const inviteResult = await client.query(
      `SELECT coach_user_id, expires_at, used_at FROM ct_invite_codes
       WHERE code = $1 FOR UPDATE`,
      [inviteCode]
    );
    if (inviteResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That invite code is not valid.' });
    }
    const invite = inviteResult.rows[0];
    if (invite.used_at || new Date(invite.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That invite code has expired or already been used. Ask your coach for a new one.' });
    }

    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'That email could not be registered. Try logging in instead.' });
    }

    const passwordHash = await hashPassword(password);
    const userResult = await client.query(
      `INSERT INTO users (email, name, password_hash, commitment_role)
       VALUES ($1, $2, $3, 'client') RETURNING id, email, name, commitment_role`,
      [email.toLowerCase(), name.trim(), passwordHash]
    );
    const user = userResult.rows[0];

    await client.query(
      'INSERT INTO ct_relationships (coach_user_id, client_user_id) VALUES ($1, $2)',
      [invite.coach_user_id, user.id]
    );
    await client.query('UPDATE ct_invite_codes SET used_at = now() WHERE code = $1', [inviteCode]);

    await client.query('COMMIT');

    const token = signSession({ userId: user.id });
    setSessionCookie(res, token);
    res.status(201).json({ user });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('signup/client failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
});

// ---- Login (shared by coach and client) ----
router.post('/login', authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!isValidEmail(email) || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Invalid email or password.' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, name, commitment_role, password_hash FROM users WHERE email = $1',
      [email.toLowerCase()]
    );
    // Same generic error whether the email doesn't exist or the password is
    // wrong -- avoids leaking which emails are registered.
    if (result.rowCount === 0) return res.status(401).json({ error: 'Invalid email or password.' });

    const user = result.rows[0];
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signSession({ userId: user.id });
    setSessionCookie(res, token);
    delete user.password_hash;
    res.json({ user });
  } catch (err) {
    console.error('login failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  clearSessionCookie(res);
  res.json({ ok: true });
});

// ---- Request a password reset link ----
router.post('/forgot-password', authLimiter, async (req, res) => {
  const { email } = req.body;
  // Always return the same generic response whether or not the email is
  // registered, and whether or not the send succeeds -- this endpoint must
  // not be usable to discover which emails have accounts.
  const genericResponse = { message: 'If an account exists for that email, a reset link has been sent.' };

  if (!isValidEmail(email)) return res.json(genericResponse);

  try {
    const userResult = await pool.query('SELECT id, name FROM users WHERE email = $1', [email.toLowerCase()]);
    if (userResult.rowCount === 0) return res.json(genericResponse);

    const user = userResult.rows[0];
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    const primaryOrigin = (process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
    const resetUrl = `${primaryOrigin}/?resetToken=${token}`;
    try {
      await sendPasswordResetEmail(email.toLowerCase(), user.name, resetUrl);
    } catch (mailErr) {
      // Log the real failure server-side, but the client still gets the
      // generic response -- a broken mail send shouldn't leak account info.
      console.error('sendPasswordResetEmail failed:', mailErr.message);
    }

    res.json(genericResponse);
  } catch (err) {
    console.error('forgot-password failed:', err.message);
    res.json(genericResponse);
  }
});

// ---- Complete a password reset ----
router.post('/reset-password', authLimiter, async (req, res) => {
  const { token, newPassword } = req.body;
  if (!isNonEmptyString(token, 200)) return res.status(400).json({ error: 'Invalid or expired reset link.' });
  if (!isValidPassword(newPassword)) return res.status(400).json({ error: 'Password must be at least 10 characters.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tokenResult = await client.query(
      'SELECT user_id, expires_at, used_at FROM password_reset_tokens WHERE token = $1 FOR UPDATE',
      [token]
    );
    if (tokenResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Invalid or expired reset link.' });
    }
    const record = tokenResult.rows[0];
    if (record.used_at || new Date(record.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'That reset link has expired or already been used. Request a new one.' });
    }

    const passwordHash = await hashPassword(newPassword);
    await client.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, record.user_id]);
    await client.query('UPDATE password_reset_tokens SET used_at = now() WHERE token = $1', [token]);
    await client.query('COMMIT');

    res.json({ message: 'Password updated. You can log in now.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('reset-password failed:', err.message);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  } finally {
    client.release();
  }
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
