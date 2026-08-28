-- 003_invite_codes.sql
-- Coaches generate a short-lived invite code; a new client redeems it at
-- signup to get linked to that coach. Codes expire and are single-use --
-- this closes the "invite code expiry" gap flagged as a pre-production
-- hardening item in the earlier Team GPS security notes.

CREATE TABLE ct_invite_codes (
  code             text PRIMARY KEY,
  coach_user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  used_at          timestamptz
);

CREATE INDEX idx_ct_invite_codes_coach ON ct_invite_codes(coach_user_id);
