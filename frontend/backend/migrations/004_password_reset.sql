-- 004_password_reset.sql
-- Single-use, short-lived tokens for self-service password reset.

CREATE TABLE password_reset_tokens (
  token         text PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  used_at       timestamptz
);

CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
