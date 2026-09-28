-- 005_client_invitations.sql
-- Coach invites a client by name + email. The client receives an emailed
-- link containing a random token; only a SHA-256 hash of that token is
-- stored here, so a database leak can't be turned into working invite links.
-- Invitations are single-use, expire, can be resent (which rotates the
-- token, killing the old link), and can be cancelled by the coach.
--
-- Replaces the older copy/paste invite codes in ct_invite_codes, which is
-- left in place (unused) so earlier migrations stay valid.

CREATE TABLE ct_client_invitations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  first_name        text NOT NULL,
  last_name         text NOT NULL,
  email             citext NOT NULL,
  token_hash        text NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz NOT NULL,
  last_sent_at      timestamptz,
  send_count        integer NOT NULL DEFAULT 0,
  accepted_at       timestamptz,
  accepted_user_id  uuid REFERENCES users(id) ON DELETE SET NULL,
  cancelled_at      timestamptz
);

CREATE INDEX idx_ct_client_invitations_coach ON ct_client_invitations(coach_user_id);

-- At most one open invitation per coach per email address.
CREATE UNIQUE INDEX uq_ct_client_invitations_open
  ON ct_client_invitations(coach_user_id, email)
  WHERE accepted_at IS NULL AND cancelled_at IS NULL;
