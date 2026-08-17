const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireClientAccess } = require('../middleware/auth');
const { isNonEmptyString, isOptionalString } = require('../utils/validate');

const router = express.Router();

const CADENCES = ['Weekly', 'Biweekly', 'Monthly'];

router.get('/:clientId', requireAuth, requireClientAccess, async (req, res) => {
  const result = await pool.query(
    `SELECT id, why, goal, cadence, strategies, steps, created_at, updated_at
     FROM ct_commitments WHERE client_user_id = $1 AND is_active = true
     ORDER BY created_at DESC LIMIT 1`,
    [req.targetClientId]
  );
  res.json({ commitment: result.rows[0] || null });
});

router.post('/:clientId', requireAuth, requireClientAccess, async (req, res) => {
  const { why, goal, cadence, strategies, steps } = req.body;

  if (!isNonEmptyString(goal, 500)) return res.status(400).json({ error: 'A goal is required.' });
  if (!CADENCES.includes(cadence)) return res.status(400).json({ error: 'Invalid cadence.' });
  if (!isOptionalString(why, 1000)) return res.status(400).json({ error: 'Why statement is too long.' });
  if (!Array.isArray(strategies) || strategies.length < 1 || strategies.length > 5 ||
      !strategies.every(s => isNonEmptyString(s, 300))) {
    return res.status(400).json({ error: 'Please provide 1-5 strategies.' });
  }
  if (!Array.isArray(steps) || steps.length < 1 || steps.length > 8 ||
      !steps.every(s => s && isNonEmptyString(s.text, 300))) {
    return res.status(400).json({ error: 'Please provide 1-8 action steps.' });
  }
  const cleanSteps = steps.map(s => ({ text: s.text, done: Boolean(s.done) }));

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'UPDATE ct_commitments SET is_active = false WHERE client_user_id = $1 AND is_active = true',
      [req.targetClientId]
    );
    const result = await client.query(
      `INSERT INTO ct_commitments (client_user_id, why, goal, cadence, strategies, steps)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, why, goal, cadence, strategies, steps, created_at, updated_at`,
      [req.targetClientId, why || null, goal.trim(), cadence, JSON.stringify(strategies), JSON.stringify(cleanSteps)]
    );
    await client.query('COMMIT');
    res.status(201).json({ commitment: result.rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('save commitment failed:', err.message);
    res.status(500).json({ error: 'Something went wrong saving the commitment.' });
  } finally {
    client.release();
  }
});

router.patch('/:clientId/steps/:stepIndex', requireAuth, requireClientAccess, async (req, res) => {
  const idx = Number(req.params.stepIndex);
  if (!Number.isInteger(idx) || idx < 0) return res.status(400).json({ error: 'Invalid step index.' });

  const current = await pool.query(
    `SELECT id, steps FROM ct_commitments WHERE client_user_id = $1 AND is_active = true`,
    [req.targetClientId]
  );
  if (current.rowCount === 0) return res.status(404).json({ error: 'No active commitment.' });

  const steps = current.rows[0].steps;
  if (idx >= steps.length) return res.status(400).json({ error: 'Invalid step index.' });
  steps[idx].done = !steps[idx].done;

  await pool.query(
    'UPDATE ct_commitments SET steps = $1, updated_at = now() WHERE id = $2',
    [JSON.stringify(steps), current.rows[0].id]
  );
  res.json({ steps });
});

module.exports = router;
