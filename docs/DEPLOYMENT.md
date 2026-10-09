# Deploying Agentry

Agentry is one Node.js process with a SQLite database. Anything that runs Node 20+ with a persistent disk can host it.

## Replit (recommended)

1. **Import**: in Replit choose *Create Repl → Import from GitHub* and pick this repository.
2. **Secrets** (padlock icon):
   - `JWT_SECRET`: a long random string. Generate one with `openssl rand -base64 32`.
   - `ANTHROPIC_API_KEY`: from https://console.anthropic.com.
   - Optional: `ALLOW_SIGNUP=true` for multi-user, `TZ=America/New_York` for schedules.
3. **Run**: the Run button executes `scripts/replit-run.sh` (install → build → start). The preview shows the web app.
4. **Deploy**: click *Deploy → Reserved VM*. The build and run commands are already set in `.replit`.
   - Use a **Reserved VM**, not Autoscale. Autoscale sleeps when idle, so scheduled agents would not fire and paused runs would wait until the next request.
5. **Phone**: install the app (Expo Go during development, or your store build) and enter the deployment URL, e.g. `https://agentry-yourname.replit.app`.

### Data persistence on Replit

The database lives at `DATABASE_PATH` (default `data/agentry.db`). On a Reserved VM it survives restarts. Redeploying, however, builds a fresh filesystem. For long-lived production use, do one of the following:

- point `DATABASE_PATH` at a persistent volume if your plan offers one, or
- back up `data/agentry.db` before redeploying (it is a single file; the WAL files `-wal` and `-shm` are checkpointed on shutdown).

Moving to Postgres is a contained change: all SQL lives in `server/src/db.ts`, `server/src/repo.ts` and `server/src/routes/*`.

## Docker or any VPS

```bash
npm run setup && npm run build
NODE_ENV=production JWT_SECRET=... ANTHROPIC_API_KEY=... DATABASE_PATH=/var/lib/agentry/agentry.db npm start
```

Put it behind a TLS-terminating reverse proxy (Caddy, nginx). The server listens on `PORT` (default 3000) and trusts `X-Forwarded-*` headers.

## Push notifications

Push uses the free Expo Push service, so you don't manage APNs or FCM keys directly. Steps:

1. `cd mobile && npx eas-cli@latest init`. This writes the EAS `projectId` into `app.json`, which push tokens require.
2. Build the app with EAS (push does not work in the iOS simulator or on the web).
3. Open the app and tap **Settings → Enable push notifications**. The device token is stored on your server.

Agentry sends a push when an agent needs approval, when a scheduled or webhook run finishes or fails, and when an agent calls its `send_push_notification` tool.

## Health check

`GET /api/health` returns `{ "ok": true, "version": "...", "mode": "anthropic" | "mock" }`.
