# True Cycle Backend

Shared Node/Express + PostgreSQL API for the Team GPS App and Commitment
Tracker. One `users` table, one login, both apps.

## Setup

```bash
cp .env.example .env    # fill in DATABASE_URL and a real JWT_SECRET
npm install
npm run migrate
npm run dev              # http://localhost:4000
```

## Demo data

To always have something ready to show, seed a linked demo coach + client
with a sample commitment, two check-ins, and a coach note:

```bash
npm run seed
```

Safe to run more than once -- it skips anything that already exists rather
than duplicating it. Prints the demo login credentials when it finishes.
Change or delete these accounts before real client data goes on this app.

Generate a secret:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Commitment Tracker endpoints (all under /api)

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/auth/signup/coach` | anyone | Create a coach account |
| POST | `/auth/signup/client` | anyone + invite code | Create a client account, links to the coach who issued the code |
| POST | `/auth/invite` | coach | Generate a 7-day, single-use invite code for a new client |
| POST | `/auth/login` | anyone | Log in (shared by coach & client) |
| POST | `/auth/logout` | anyone | Clear session |
| POST | `/auth/forgot-password` | anyone | Request a password reset email (always returns a generic response) |
| POST | `/auth/reset-password` | anyone with a valid token | Set a new password from an emailed reset link |
| GET | `/auth/me` | logged in | Current user + role |
| GET | `/roster` | coach | List of that coach's clients |
| GET/POST | `/commitments/:clientId` | client-self or their coach | Get / save the 1-3-5 |
| PATCH | `/commitments/:clientId/steps/:i` | client-self or their coach | Toggle a step done/undone |
| GET/POST | `/checkins/:clientId` | client-self or their coach | Get / log a 4-1-1 check-in |
| GET/POST | `/notes/:clientId` | **coach only** | Private coaching notes -- never reachable with a client's session |

Every route re-checks the caller's role and ownership **from the
database** on every request (`requireAuth`, `requireCoach`,
`requireClientAccess` in `src/middleware/auth.js`). This is the piece that
was missing in the artifact prototype, where role separation was UI-only.

## What's still on you before real production traffic

- **HTTPS termination** on wherever this actually runs (Render gives you
  this automatically; if you self-host, you need a reverse proxy + cert).
- Consider adding structured auth event logging (who logged in, from
  where, failed attempts) if you want an audit trail beyond rate limiting.
