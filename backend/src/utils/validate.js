const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(v) {
  return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v);
}

// Minimum bar, not a full policy: length only. bcrypt handles the rest.
// (NIST 800-63B recommends length over forced complexity rules.)
function isValidPassword(v) {
  return typeof v === 'string' && v.length >= 10 && v.length <= 128;
}

function isNonEmptyString(v, maxLen = 2000) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= maxLen;
}

function isOptionalString(v, maxLen = 2000) {
  return v === undefined || v === null || (typeof v === 'string' && v.length <= maxLen);
}

function isRatingInRange(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 10;
}

module.exports = { isValidEmail, isValidPassword, isNonEmptyString, isOptionalString, isRatingInRange };
