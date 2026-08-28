// Creates a demo coach + demo client (already linked, with a sample 1-3-5
// commitment, two check-ins, and a coach note) so there's always something
// to point to when demoing the app. Safe to run more than once -- it skips
// anything that already exists instead of erroring or duplicating.
require('dotenv').config();
const crypto = require('crypto');
const { pool } = require('./db');
const { hashPassword } = require('./utils/hash');

function randomPassword() {
  // 16 random bytes -> a readable-enough, unpredictable password. Printed
  // once to the console when the account is first created; not stored
  // anywhere in the repo or this script.
  return crypto.randomBytes(12).toString('base64url');
}

const DEMO_COACH = { email: 'demo.coach@truecyclecoaching.com', name: 'Demo Coach' };
const DEMO_CLIENT = { email: 'demo.client@truecyclecoaching.com', name: 'Alex Rivera' };

async function findOrCreateUser(client, { email, name, commitment_role }, generatedPasswords) {
  const existing = await client.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rowCount > 0) return existing.rows[0].id;

  const password = randomPassword();
  const passwordHash = await hashPassword(password);
  const result = await client.query(
    `INSERT INTO users (email, name, password_hash, commitment_role)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [email, name, passwordHash, commitment_role]
  );
  generatedPasswords[email] = password;
  return result.rows[0].id;
}

async function run() {
  const client = await pool.connect();
  const generatedPasswords = {};
  try {
    console.log('Seeding demo data...');

    const coachId = await findOrCreateUser(client, { ...DEMO_COACH, commitment_role: 'coach' }, generatedPasswords);
    const clientId = await findOrCreateUser(client, { ...DEMO_CLIENT, commitment_role: 'client' }, generatedPasswords);

    const rel = await client.query(
      'SELECT 1 FROM ct_relationships WHERE coach_user_id = $1 AND client_user_id = $2',
      [coachId, clientId]
    );
    if (rel.rowCount === 0) {
      await client.query(
        'INSERT INTO ct_relationships (coach_user_id, client_user_id) VALUES ($1, $2)',
        [coachId, clientId]
      );
      console.log('Linked demo client to demo coach.');
    }

    const existingCommitment = await client.query(
      'SELECT id FROM ct_commitments WHERE client_user_id = $1 AND is_active = true',
      [clientId]
    );
    let commitmentId;
    if (existingCommitment.rowCount === 0) {
      const strategies = [
        'Align the leadership team early, before the quarter starts',
        'Hold a short weekly check-in instead of one long monthly review',
        'Give one person clear ownership of each priority',
      ];
      const steps = [
        { text: 'Schedule the Q3 kickoff session', done: true },
        { text: 'Draft the three priorities for review', done: true },
        { text: 'Send the draft to leadership', done: false },
        { text: 'Lock the weekly check-in time on every calendar', done: false },
        { text: 'Assign an owner to each priority', done: false },
      ];
      const result = await client.query(
        `INSERT INTO ct_commitments (client_user_id, why, goal, cadence, strategies, steps)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [
          clientId,
          'Our team loses momentum every quarter because we don\u2019t align early. Fixing this changes how we lead all year.',
          'Run a fully aligned Q3 planning cycle with my leadership team',
          'Monthly',
          JSON.stringify(strategies),
          JSON.stringify(steps),
        ]
      );
      commitmentId = result.rows[0].id;
      console.log('Created demo commitment.');
    } else {
      commitmentId = existingCommitment.rows[0].id;
    }

    const existingCheckins = await client.query('SELECT id FROM ct_checkins WHERE client_user_id = $1', [clientId]);
    if (existingCheckins.rowCount === 0) {
      const checkins = [
        {
          progress: 'Kickoff scheduled, first draft of the three priorities is done.',
          obstacle: 'Calendar conflicts pushed the kickoff back a week.',
          rethink: 'Book recurring sessions two weeks out instead of one at a time.',
          support: 'Need the VP\u2019s calendar unlocked for a recurring hold.',
          rating: 6,
          next_commitment: 'Send the draft to leadership for review.',
        },
        {
          progress: 'Leadership reviewed the draft, two priorities are locked in.',
          obstacle: 'Still deciding ownership for the third priority.',
          rethink: 'Bring it to Friday\u2019s leadership meeting for a decision, not another round of email.',
          support: 'Nothing new needed \u2014 just a decision.',
          rating: 8,
          next_commitment: 'Get ownership assigned by Friday.',
        },
      ];
      for (const c of checkins) {
        await client.query(
          `INSERT INTO ct_checkins (commitment_id, client_user_id, progress, obstacle, rethink, support, rating, next_commitment)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [commitmentId, clientId, c.progress, c.obstacle, c.rethink, c.support, c.rating, c.next_commitment]
        );
      }
      console.log('Created 2 demo check-ins.');
    }

    const existingNotes = await client.query('SELECT id FROM ct_coach_notes WHERE client_user_id = $1', [clientId]);
    if (existingNotes.rowCount === 0) {
      await client.query(
        `INSERT INTO ct_coach_notes (coach_user_id, client_user_id, text) VALUES ($1, $2, $3)`,
        [coachId, clientId, 'Responds well to concrete deadlines -- keep check-ins short and action-focused rather than open-ended.']
      );
      console.log('Created 1 demo coach note.');
    }

    console.log('\nDone.');
    if (Object.keys(generatedPasswords).length > 0) {
      console.log('\nNewly-created demo login credentials (shown once -- write these down now):\n');
      for (const [email, password] of Object.entries(generatedPasswords)) {
        console.log(`  ${email} / ${password}`);
      }
      console.log('\nUse the "Forgot your password?" link if you lose these -- they are not stored anywhere in plaintext.');
    } else {
      console.log('\nDemo accounts already existed -- no new passwords were generated. Use "Forgot your password?" if you need to reset either one.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
