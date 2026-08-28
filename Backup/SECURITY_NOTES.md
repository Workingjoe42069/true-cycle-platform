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
| A07 | Identification & Authentication Failures | **Addressed** | Auth endpoints are rate-limited (20 attempts / 15 min / IP) to slow brute force. Passwords must be 10+ characters. Sessions expire after 12 hours. **Gap you should plan for:** there's no password-reset flow yet — if a user forgets their password, you'll need to reset it directly in the database for now. |
| A08 | Software & Data Integrity Failures | **Addressed** | No unpinned remote script includes beyond Google Fonts (static, reputable). No deserialization of untrusted data. `npm install` uses `package.json`, not arbitrary remote code execution paths. |
| A09 | Security Logging & Monitoring Failures | **Partial** | Errors are logged server-side. **Gap you should plan for:** there's no structured audit log of who logged in, from where, or failed-login patterns beyond what rate limiting catches. Worth adding before you're relying on this for anything sensitive at scale. |
| A10 | Server-Side Request Forgery (SSRF) | **Not applicable / addressed** | The backend never makes outbound requests based on user-supplied URLs or input. |

## What's still explicitly open (carried over from the earlier Team GPS review, still true here)

1. **HTTPS termination** — non-optional before real users log in. Render provides this automatically for you; if you move to your own server later, you need a reverse proxy (e.g., Caddy or nginx) with a real certificate.
2. **Password reset flow** — not built. Worth adding once you have live users.
3. **Structured auth event logging** — nice-to-have for an audit trail; not built.

None of these three block a safe *test* deployment behind HTTPS on Render. They matter more as you move toward real client data at scale.
