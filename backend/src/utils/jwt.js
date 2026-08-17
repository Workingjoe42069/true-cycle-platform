const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'tcc_session';
const TOKEN_TTL = '12h';

function signSession(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function verifySession(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}

function setSessionCookie(res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production', // HTTPS-only in production
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

module.exports = { COOKIE_NAME, signSession, verifySession, setSessionCookie, clearSessionCookie };
