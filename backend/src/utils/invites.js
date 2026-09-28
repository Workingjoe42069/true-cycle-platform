const crypto = require('crypto');

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// 32 random bytes -> 43-char URL-safe token. Only its hash is stored.
function newInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function inviteExpiry() {
  return new Date(Date.now() + INVITE_TTL_MS);
}

// Links point at the first FRONTEND_ORIGIN (the branded custom domain).
function buildInviteUrl(token) {
  const primaryOrigin = (process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
  return `${primaryOrigin}/?invite=${encodeURIComponent(token)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isUuid(v) {
  return typeof v === 'string' && UUID_RE.test(v);
}

module.exports = { newInviteToken, hashInviteToken, inviteExpiry, buildInviteUrl, isUuid };
