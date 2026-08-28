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
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProd, // HTTPS-only in production -- required when sameSite is 'none'
    // 'none' is required because the frontend and backend are on different
    // hostnames (e.g. two separate Render services) -- that's a cross-site
    // relationship as far as the browser's cookie rules are concerned, and
    // 'lax' cookies are not sent on background fetch() calls across sites,
    // only on top-level navigations. Locally (http, same-origin dev server)
    // 'lax' is fine and doesn't require HTTPS.
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
  });
}

module.exports = { COOKIE_NAME, signSession, verifySession, setSessionCookie, clearSessionCookie };
