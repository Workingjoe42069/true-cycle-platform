require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth');
const rosterRoutes = require('./routes/roster');
const commitmentsRoutes = require('./routes/commitments');
const checkinsRoutes = require('./routes/checkins');
const notesRoutes = require('./routes/notes');

const app = express();

// Trust the first proxy hop (Render, etc. sit behind a load balancer) so
// rate limiting and secure cookies see the real client IP/protocol.
app.set('trust proxy', 1);

app.use(helmet());

const allowedOrigins = (process.env.FRONTEND_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

app.use(cookieParser());
app.use(express.json({ limit: '100kb' })); // caps request body size (denial-of-service guard)

// General-purpose rate limit on top of the stricter one on /auth.
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
}));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/roster', rosterRoutes);
app.use('/api/commitments', commitmentsRoutes);
app.use('/api/checkins', checkinsRoutes);
app.use('/api/notes', notesRoutes);

// CORS rejection
app.use((err, req, res, next) => {
  if (err && err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'Origin not allowed.' });
  }
  next(err);
});

// Generic error handler -- never leak stack traces or internals to the client.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Something went wrong.' });
});

module.exports = app;
