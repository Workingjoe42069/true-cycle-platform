const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireClientAccess } = require('../middleware/auth');
const { isNonEmptyString, isOptionalString, isRatingInRange } = require('../utils/validate');

const router = express.Router();

router.get('/:clientId', requireAuth, requireClientAccess, async (req, res) => {
  const result = await pool.query(
    `SELECT id, progress, obstacle, rethink, support, rating, next_commitment, created_at
     FROM ct_checkins WHERE client_user_id = $1 ORDER BY created_at ASC`,
    [req.targetClientId]
  );
  res.json({ checkins: result.rows });
});

router.post('/:clientId', requireAuth, requireClientAccess, async (req, res) => {
  const { progress, obstacle, rethink, support, rating, nextCommitment } = req.body;

  if (!isNonEmptyString(progress, 2000)) return res.status(400).json({ error: 'Progress is required.' });
  if (!isNonEmptyString(nextCommitment, 1000)) return res.status(400).json({ error: 'Next commitment is required.' });
  if (!isRatingInRange(rating)) return res.status(400).json({ error: 'Rating must be 1-10.' });
  if (!isOptionalString(obstacle, 2000) || !isOptionalString(rethink, 2000) || !isOptionalString(support, 2000)) {
    return res.status(400).json({ error: 'One of the fields is too long.' });
  }

  const commitmentResult = await pool.query(
    'SELECT id FROM ct_commitments WHERE client_user_id = $1 AND is_active = true',
    [req.targetClientId]
  );
  if (commitmentResult.rowCount === 0) {
    return res.status(400).json({ error: 'Build a commitment before logging a check-in.' });
  }

  const result = await pool.query(
    `INSERT INTO ct_checkins (commitment_id, client_user_id, progress, obstacle, rethink, support, rating, next_commitment)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, progress, obstacle, rethink, support, rating, next_commitment, created_at`,
    [commitmentResult.rows[0].id, req.targetClientId, progress.trim(), obstacle || null, rethink || null, support || null, Number(rating), nextCommitment.trim()]
  );
  res.status(201).json({ checkin: result.rows[0] });
});

module.exports = router;
