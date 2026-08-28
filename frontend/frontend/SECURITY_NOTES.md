# Security Review — OWASP Top 10 (2021)

_Last reviewed: fresh pass against the current codebase, including auth cookie changes, password reset, and the seed script._

This is a code-level review, verified by actually running the backend against a real local Postgres instance and exercising every route with real HTTP requests (auth, roster, commitments, check-ins, notes, password reset, and access-control edge cases like a client trying to read another user's coach notes). It's not a substitute for a live penetration test against your running production server — I have no network access to a deployed URL from inside this chat.

## Findings from this pass

**Fixed during this review:**
- **Predictable demo credentials (A07)** — `seed.js` previously created the demo coach/client accounts with fixed, hardcoded passwords that were printed in chat and in the README. Since you're expected to run this against your real production database (via Render's Shell), a published fixed password would have been a real, standing way into your live app. Fixed: the script now generates a random password per account on first creation only, prints it once, and never repeats it (or stores it) on subsequent runs.

**Verified as already sound (no change needed):**
- Every route re-checks ownership from the database on every request (A01) — reconfirmed live: a client's session gets a 403 trying to read another client's coach notes.
- CSRF: the session cookie now uses `SameSite=None` (required for the frontend and backend living on different hostnames), which does widen the set of cross-site requests a browser will attach the cookie to. This is mitigated by two things working together: the strict CORS origin allowlist, and every mutating route requiring a `Content-Type: application/json` body — a plain HTML form (the classic CSRF vector) cannot set that content type, and a script-based cross-origin request triggers a CORS preflight that gets rejected for any origin not on the allowlist. Net effect: cross-site *reads* of non-sensitive endpoints are theoretically possible from a malicious page but return no usable data to the attacker page (CORS blocks the attacker from reading the response); cross-site *writes* are blocked by the preflight check.
- SQL injection: confirmed no string-built queries anywhere — everything parameterized.
- XSS: checked every `innerHTML` sink in the frontend against every field that holds user-entered text (names, goals, strategies, check-in notes, coach notes) — all pass through `escapeHtml()` before rendering. Nothing found unescaped.

**Residual, lower-priority items (acceptable for now, worth knowing about):**
- **No server-side session revocation (A07)** — "Log out" clears the cookie in the browser, but the underlying JWT itself stays technically valid until it expires (12 hours) if someone captured it separately. Given the cookie is httpOnly (not reachable by JS/XSS) and this app has no XSS findings, the realistic exposure is low, but a session table with real revocation would close this fully if you want it later.
- **Rate limiting is per-IP, not per-account** — someone could distribute login attempts against one specific victim's email across many IPs to work around the 20-attempts/15-min limit. Not urgent at this scale; worth revisiting if this ever handles a larger user base.

## Full category walkthrough


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
