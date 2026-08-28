-- 002_commitment_tracker.sql
-- Adds the Commitment Tracker on top of the shared `users` table from
-- 001_init.sql. Every user can optionally be a "coach" and/or a "client" --
-- these are independent of Team GPS's team_role.

ALTER TABLE users ADD COLUMN commitment_role text CHECK (commitment_role IN ('coach', 'client'));

-- Which coach a client belongs to. A client has exactly one coach; a coach
-- can have many clients. This is the server-side replacement for the
-- roster the coach picked from in the UI-only prototype.
CREATE TABLE ct_relationships (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id   uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- One active 1-3-5 commitment per client. History of past commitments is
-- kept by simply not deleting rows -- `is_active` marks the current one.
CREATE TABLE ct_commitments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  why              text,
  goal             text NOT NULL,
  cadence          text NOT NULL CHECK (cadence IN ('Weekly', 'Biweekly', 'Monthly')),
  strategies       jsonb NOT NULL, -- ["...", "...", "..."]
  steps            jsonb NOT NULL, -- [{ "text": "...", "done": false }, x5]
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ct_checkins (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id     uuid NOT NULL REFERENCES ct_commitments(id) ON DELETE CASCADE,
  client_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  progress          text NOT NULL,
  obstacle          text,
  rethink           text,
  support           text,
  rating            integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
  next_commitment   text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Coach-only notes. Never returned to a client by any route.
CREATE TABLE ct_coach_notes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_user_id   uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  text             text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ct_relationships_coach ON ct_relationships(coach_user_id);
CREATE INDEX idx_ct_commitments_client ON ct_commitments(client_user_id);
CREATE INDEX idx_ct_checkins_commitment ON ct_checkins(commitment_id);
CREATE INDEX idx_ct_checkins_client ON ct_checkins(client_user_id);
CREATE INDEX idx_ct_notes_client ON ct_coach_notes(client_user_id);
CREATE INDEX idx_ct_notes_coach ON ct_coach_notes(coach_user_id);
