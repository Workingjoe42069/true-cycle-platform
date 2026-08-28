-- 001_init.sql
-- Team GPS App schema. Run against a fresh Postgres database.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive text for emails/usernames

CREATE TABLE teams (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name          text NOT NULL,
  invite_code   text NOT NULL UNIQUE,
  lead_user_id  uuid,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One users table, shared by both apps (this is the "single login" table).
CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             citext NOT NULL UNIQUE,
  name              text NOT NULL,
  password_hash     text NOT NULL,
  -- Team GPS membership (nullable: a user may never join a team)
  team_id           uuid REFERENCES teams(id) ON DELETE SET NULL,
  team_role         text CHECK (team_role IN ('lead', 'member')),
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE teams ADD CONSTRAINT teams_lead_user_fk
  FOREIGN KEY (lead_user_id) REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE gps_plans (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id      uuid NOT NULL UNIQUE REFERENCES teams(id) ON DELETE CASCADE,
  why          text,
  one_thing    text NOT NULL,
  year         integer NOT NULL,
  priorities   jsonb NOT NULL, -- [{ "title": "...", "strategies": ["...", ...] }, x3]
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkins (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  team_id          uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  cadence          text NOT NULL CHECK (cadence IN ('Daily', 'Weekly', 'Monthly')),
  priority_index   integer NOT NULL CHECK (priority_index BETWEEN 0 AND 2),
  progress         text NOT NULL,
  obstacle         text,
  rethink          text,
  support          text,
  rating           integer NOT NULL CHECK (rating BETWEEN 1 AND 10),
  next_commitment  text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_team_id ON users(team_id);
CREATE INDEX idx_checkins_user_id ON checkins(user_id);
CREATE INDEX idx_checkins_team_id ON checkins(team_id);
