const express = require('express');
const { pool } = require('../db');
const { requireAuth, requireCoach } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, requireCoach, async (req, res) => {
  const result = await pool.query(
    `SELECT u.id, u.name, u.email, r.created_at AS joined_at
     FROM ct_relationships r
     JOIN users u ON u.id = r.client_user_id
     WHERE r.coach_user_id = $1
     ORDER BY u.name ASC`,
    [req.user.id]
  );
  res.json({ clients: result.rows });
});

module.exports = router;
