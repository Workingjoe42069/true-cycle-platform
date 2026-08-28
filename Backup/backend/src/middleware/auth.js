const { verifySession, COOKIE_NAME } = require('../utils/jwt');
const { pool } = require('../db');

// Verifies the session cookie on every request and re-loads the user's
// current role from the database (not just what was in the token) so a
// role change or removal takes effect immediately instead of waiting for
// the token to expire.
async function requireAuth(req, res, next) {
  try {
    const token = req.cookies[COOKIE_NAME];
    if (!token) return res.status(401).json({ error: 'Not authenticated.' });

    const decoded = verifySession(token);
    const result = await pool.query(
      'SELECT id, email, name, commitment_role, team_id, team_role FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (result.rowCount === 0) return res.status(401).json({ error: 'Not authenticated.' });

    req.user = result.rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Not authenticated.' });
  }
}

// Commitment Tracker: caller must be a coach.
function requireCoach(req, res, next) {
  if (req.user.commitment_role !== 'coach') {
    return res.status(403).json({ error: 'Coach access required.' });
  }
  next();
}

// Commitment Tracker: caller must either BE the client in question, or be
// that client's assigned coach. Checked server-side on every request that
// touches a specific client's data -- this is what makes role separation
// real instead of just a UI convention.
async function requireClientAccess(req, res, next) {
  const targetClientId = req.params.clientId || req.body.clientUserId;
  if (!targetClientId) return res.status(400).json({ error: 'Missing client id.' });

  if (req.user.commitment_role === 'client' && req.user.id === targetClientId) {
    req.targetClientId = targetClientId;
    return next();
  }

  if (req.user.commitment_role === 'coach') {
    const rel = await pool.query(
      'SELECT 1 FROM ct_relationships WHERE coach_user_id = $1 AND client_user_id = $2',
      [req.user.id, targetClientId]
    );
    if (rel.rowCount > 0) {
      req.targetClientId = targetClientId;
      return next();
    }
  }

  return res.status(403).json({ error: 'Not authorized for this client.' });
}

module.exports = { requireAuth, requireCoach, requireClientAccess };
