const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireCoach } = require('../middleware/auth');
const { isNonEmptyString } = require('../utils/validate');

const router = express.Router();

// Coach-only, both to read and to write. A client's session token can
// never reach these routes: requireCoach checks req.user.commitment_role
// from the database on every request, and a client's row can never have
// commitment_role = 'coach'.
router.get('/:clientId', requireAuth, requireCoach, async (req, res) => {
  const owns = await pool.query(
    'SELECT 1 FROM ct_relationships WHERE coach_user_id = $1 AND client_user_id = $2',
    [req.user.id, req.params.clientId]
  );
  if (owns.rowCount === 0) return res.status(403).json({ error: 'Not authorized for this client.' });

  const result = await pool.query(
    `SELECT id, text, created_at FROM ct_coach_notes
     WHERE coach_user_id = $1 AND client_user_id = $2 ORDER BY created_at ASC`,
    [req.user.id, req.params.clientId]
  );
  res.json({ notes: result.rows });
});

router.post('/:clientId', requireAuth, requireCoach, async (req, res) => {
  const { text } = req.body;
  if (!isNonEmptyString(text, 4000)) return res.status(400).json({ error: 'Note text is required.' });

  const owns = await pool.query(
    'SELECT 1 FROM ct_relationships WHERE coach_user_id = $1 AND client_user_id = $2',
    [req.user.id, req.params.clientId]
  );
  if (owns.rowCount === 0) return res.status(403).json({ error: 'Not authorized for this client.' });

  const result = await pool.query(
    `INSERT INTO ct_coach_notes (coach_user_id, client_user_id, text)
     VALUES ($1, $2, $3) RETURNING id, text, created_at`,
    [req.user.id, req.params.clientId, text.trim()]
  );
  res.status(201).json({ note: result.rows[0] });
});

module.exports = router;
