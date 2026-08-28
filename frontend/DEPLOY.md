# Deploy Guide

## 1. Get this code into a GitHub repo (using GitHub Desktop)

1. In GitHub Desktop: **File -> New Repository**. Name it something like
   `true-cycle-platform`, and set the local path to a folder you'll copy
   this project's contents into (or point it at this folder directly).
2. Copy everything from this project (`backend/`, `frontend/`,
   `render.yaml`, `SECURITY_NOTES.md`, `DEPLOY.md`, `README.md`) into that
   repo folder.
3. GitHub Desktop will show all the new files under "Changes." Write a
   commit summary like `Initial commit: shared backend + Commitment Tracker`
   and click **Commit to main**.
4. Click **Publish repository**. Choose private unless you have a reason
   to make it public (it will contain no secrets — `.env` is gitignored —
   but private is the sensible default for client-facing business code).

From here on, every time you want to ship a change: edit the files, review
the diff in GitHub Desktop, write a commit message describing what
changed, **Commit to main**, then **Push origin**. That's your "check
changes back into the repo" step.

## 2. Deploy the backend to Render (free tier, to test)

1. Go to [render.com](https://render.com) and sign in with your GitHub
   account.
2. **New -> Blueprint**, and pick the repo you just published. Render will
   read `render.yaml` at the root and offer to create:
   - A free PostgreSQL database (`true-cycle-db`)
   - A free web service (`true-cycle-api`) running the backend, that runs
     migrations automatically on each deploy (`npm run migrate && npm start`)
3. Before clicking **Apply**, edit the `FRONTEND_ORIGIN` environment
   variable to match wherever you'll serve `frontend/index.html` from (see
   step 3). You can also update it later in the Render dashboard without
   redeploying the whole blueprint.
4. Click **Apply**. Render builds and deploys. When it's live, you'll get
   a URL like `https://true-cycle-api.onrender.com`. Test it:
   ```
   curl https://true-cycle-api.onrender.com/api/health
   ```
   You should get `{"ok":true}`.

**Free tier note:** Render's free web services spin down after inactivity
and take ~30-60 seconds to wake up on the next request. Fine for testing;
worth upgrading to a paid instance before you rely on it with real clients.

## 3. Deploy the frontend

The frontend is a single static HTML file. Two good free options:

**Option A — Render Static Site** (keeps everything in one place):
1. In Render: **New -> Static Site**, same repo, root directory `frontend`,
   no build command, publish directory `.`.
2. Once deployed, open `frontend/index.html` in your repo and set
   `window.API_BASE` at the top of the `<script>` block to your actual
   backend URL from step 2 (e.g., `https://true-cycle-api.onrender.com`).
   Commit and push — Render redeploys automatically.
3. Go back to the backend service's environment variables and set
   `FRONTEND_ORIGIN` to this static site's URL exactly (scheme + host, no
   trailing slash) — the cookie-based login won't work cross-origin
   otherwise.

**Option B — Vercel:** same idea — point it at the `frontend` folder, no
build step needed for a static HTML file.

## 4. Test it end to end

- Open the frontend URL, choose "I'm the Coach," create a coach account.
- Use "+ Invite Client" in the roster bar to generate a code.
- Open the frontend URL in a different browser (or incognito), choose
  "I'm a Client," create an account with that invite code.
- Build a 1-3-5 as the client, log a check-in, then switch back to the
  coach view and confirm you can see the client's data and add a private
  coach note that the client's login can't see.

## 5. Once you're happy with it — going live on truecycle.com

You have two paths, as you noted:

**A. Keep it on Render, point a subdomain at it (CNAME)**
- In Render, add a **Custom Domain** to both the static site and the API
  (e.g., `app.truecyclecoaching.com` for the frontend,
  `api.truecyclecoaching.com` for the backend). Render will give you a
  CNAME target for each.
- Whoever manages DNS for truecyclecoaching.com (your registrar or host)
  adds two CNAME records pointing those subdomains at the targets Render
  gives you. This is the "someone set up a CNAME record" step you
  mentioned — I don't have access to your domain's DNS, so this part has
  to happen wherever truecyclecoaching.com is registered/hosted.
- Update `FRONTEND_ORIGIN` on the backend and `window.API_BASE` on the
  frontend to the new domains once DNS resolves.

**B. Move the whole thing onto your own server**
- Copy `backend/` and run it there with a process manager (pm2 or a
  systemd service), pointed at a Postgres instance you control.
- Put a reverse proxy (Caddy is the easiest — it handles HTTPS certs
  automatically) in front of it, and serve `frontend/index.html` as a
  static file from the same or a different domain.
- Either way, HTTPS is the one non-negotiable step — see `SECURITY_NOTES.md`.

Both paths use the exact same codebase — the only things that change are
`FRONTEND_ORIGIN`, `window.API_BASE`, and where the process actually runs.

## Mobile

Your Team GPS App already has a Capacitor scaffold from earlier work. The
same approach wraps this Commitment Tracker frontend once it's running
against the live API: Capacitor just loads the deployed web URL (or a
bundled copy of `frontend/index.html`) inside a native shell. Once you've
got this working on the web, say the word and I'll wire up that Capacitor
wrapper for this app the same way.
