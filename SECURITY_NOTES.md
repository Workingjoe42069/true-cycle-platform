# Security Review — OWASP Top 10 (2021)

This is a code-level review of the backend/frontend in this repo. It's not
a substitute for a live penetration test against your running production
server — I have no network access to a deployed URL from inside this chat.
What I *can* do, and did do, is walk every OWASP Top 10 category against
the actual code and either close the gap or call it out explicitly below.

| # | Category | Status | Notes |
|---|---|---|---|
| A01 | Broken Access Control | **Addressed** | Every client-data route re-checks ownership server-side on every request (`requireClientAccess`, `requireCoach` in `middleware/auth.js`), reading the caller's role fresh from the database each time — not just from the token. A client's session can never reach `/api/notes/*`. A coach can only reach a client's data if a `ct_relationships` row proves that link. This replaces the earlier prototype's UI-only role separation. |
| A02 | Cryptographic Failures | **Addressed** | Passwords are hashed server-side with bcrypt (cost factor 12) — the plaintext password never touches the database. Session tokens are signed JWTs in httpOnly, sameSite cookies, `secure` in production (HTTPS-only). `.env` (with `JWT_SECRET` and `DATABASE_URL`) is gitignored. |
| A03 | Injection | **Addressed** | All database access uses parameterized queries via `pg` (`$1, $2...` placeholders) — no string-concatenated SQL anywhere in the codebase. No use of `eval`, `child_process`, or dynamic query building. |
| A04 | Insecure Design | **Addressed** | Invite codes are single-use, expire in 7 days, and are generated with `crypto.randomBytes` (unguessable), closing the gap flagged in the earlier Team GPS review. Generic "Invalid email or password" errors on login prevent user enumeration. |
| A05 | Security Misconfiguration | **Addressed** | `helmet()` sets standard security headers. CORS is locked to an explicit allowlist (`FRONTEND_ORIGIN`) with credentials, not a wildcard. The global error handler never returns stack traces or internals to the client — only a generic message, with real detail going to server logs only. |
| A06 | Vulnerable & Outdated Components | **Your ongoing responsibility** | Dependencies are pinned to recent stable majors in `package.json`. Run `npm audit` periodically and keep `npm outdated` in your deploy checklist — this isn't something a one-time review can guarantee going forward. |
| A07 | Identification & Authentication Failures | **Addressed** | Auth endpoints are rate-limited (20 attempts / 15 min / IP) to slow brute force. Passwords must be 10+ characters. Sessions expire after 12 hours. Password reset uses single-use, 1-hour-expiring tokens sent only to the email on file, with the same generic response whether or not that email has an account (no enumeration). |
| A08 | Software & Data Integrity Failures | **Addressed** | No unpinned remote script includes beyond Google Fonts (static, reputable). No deserialization of untrusted data. `npm install` uses `package.json`, not arbitrary remote code execution paths. |
| A09 | Security Logging & Monitoring Failures | **Partial** | Errors are logged server-side. **Gap you should plan for:** there's no structured audit log of who logged in, from where, or failed-login patterns beyond what rate limiting catches. Worth adding before you're relying on this for anything sensitive at scale. |
| A10 | Server-Side Request Forgery (SSRF) | **Not applicable / addressed** | The backend never makes outbound requests based on user-supplied URLs or input. |

## What's still explicitly open

1. **HTTPS termination** — non-optional before real users log in. Render provides this automatically for you; if you move to your own server later, you need a reverse proxy (e.g., Caddy or nginx) with a real certificate.
2. **Structured auth event logging** — nice-to-have for an audit trail; not built.

Neither of these blocks a safe *test* deployment behind HTTPS on Render.

## Client invitations (emailed links) — added Sept 2026

- Coaches invite clients by first name, last name and email; the client receives a personal link (`/?invite=<token>`).
- Tokens are 32 random bytes; only a SHA-256 hash is stored (`ct_client_invitations.token_hash`), so a database leak does not yield working links.
- Links are single-use, expire after 7 days, and are rotated on every resend (the previous link stops working). Coaches can cancel.
- The client's email is taken from the invitation server-side and cannot be changed at signup; any email sent in the request body is ignored.
- The token is removed from the address bar on page load, the page sets `Referrer-Policy: no-referrer`, and the lookup uses POST so tokens stay out of access logs.
- All user-supplied values are HTML-escaped in outgoing email; header values are stripped of line breaks.
- Coach-only endpoints are scoped by `coach_user_id` (a coach cannot see, resend or cancel another coach's invitations). Outgoing invite email is rate-limited per coach (30/hour), resends have a 60-second cooldown and a 10-send cap per invitation.
- The old copy/paste invite-code endpoint (`POST /api/auth/invite`) has been removed.
