# True Cycle Coaching — Platform

One shared backend (Node/Express + PostgreSQL) with a single login, serving
two client apps:

- **Team GPS App** — teams, one annual ONE Thing, 3 priorities x 5 strategies, 4-1-1 check-ins
- **Commitment Tracker** — 1-3-5 individual coaching commitments, 4-1-1 check-ins, coach roster + private coach notes

A person creates **one account**. Depending on how that account is set up,
they can use either app, both, or switch between a coach role and a client
role on different commitments.

## Repo layout

```
backend/            Node/Express + PostgreSQL API (shared by both frontends)
frontend/            Commitment Tracker web app (fetch()-based, replaces the
                      window.storage prototype)
render.yaml           One-click Render deploy config (API + Postgres)
SECURITY_NOTES.md     OWASP Top 10 review of this codebase
DEPLOY.md             Step-by-step: GitHub -> Render -> your domain
```

The Team GPS frontend from the earlier build point at this same
`backend/` — same login, same `users` table, different tables underneath
(`gps_plans`/`checkins` vs. `ct_commitments`/`ct_checkins`).

## Quick start (local)

```bash
cd backend
cp .env.example .env      # fill in DATABASE_URL and JWT_SECRET
npm install
npm run migrate
npm run dev                # http://localhost:4000
```

Open `frontend/index.html` in a browser (or serve it with any static
server) — set `window.API_BASE` at the top of the file to your backend URL.

See `DEPLOY.md` for taking this from your machine to GitHub to Render to
your own domain.
