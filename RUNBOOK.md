# CRAS — Deployment & Operations Runbook

For whoever deploys and runs CRAS (Campus Room Allocation, NSUT). Production topology, decided Oct 2026:

| Part | Where | Notes |
|---|---|---|
| Frontend (React/Vite PWA) | Vercel | `frontend/vercel.json` sets the CSP, security headers and SPA rewrites |
| API (Node 22, Express 5) | **one** instance | Single process by decision; capacity below |
| Database | PostgreSQL 15+ | Needs the `btree_gist` extension (created by migration v26) |
| Identity | Google Sign-In + college ACL (`acl-lake.vercel.app`) | ACL supplies role and permissions; CRAS has no passwords |
| Email | SMTP (e.g. Gmail app password) | Sent by the outbox worker inside the API process |

---

## 1. Configuration

Every variable is listed with a comment in `backend/.env.example` and `frontend/.env.example`. The ones that matter:

**API (required in production; the process refuses to start without them):**
- `NODE_ENV=production`
- `DATABASE_URL`. TLS is used automatically for non-localhost hosts.
- `JWT_SECRET`: 32+ random characters. Rotating it signs everyone out.
- `SMTP_USER`, `SMTP_PASS`, or `EMAIL_DELIVERY=off` to run in-app-only. Without one of these the API exits at boot (OPS-13).

**API (needed for the app to work):**
- `CORS_ORIGIN`: the Vercel URL(s), comma-separated.
- `APP_URL`: the same frontend URL; email links point here.
- `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_HD=nsut.ac.in`
- `ACL_API_URL`, `ACL_CLIENT_ID`, `ACL_CLIENT_SECRET`
- `INTERNAL_SYNC_TOKEN`: 32+ chars, shared with the ACL cron that pushes faculty-directory changes to `PUT /api/internal/faculties`.

**API (must never be set in production):** `AUTH_DEV_LOGIN=true` and `ACL_MODE=mock` (both are refused when `NODE_ENV=production`), and `RATE_LIMIT_DISABLED=true`.

**Optional:**
- `SENTRY_DSN` (traces sampled at `SENTRY_TRACES_SAMPLE_RATE`, default 0.1)
- `METRICS_TOKEN` (`/metrics` is disabled without it)

**Frontend (Vercel project env):** `VITE_API_URL` (the API base, ending in `/api`), `VITE_GOOGLE_CLIENT_ID` and, optionally, `VITE_SENTRY_DSN`. Leave `VITE_DEV_LOGIN` unset.

**Google OAuth client:** add the Vercel URL to *Authorised JavaScript origins*.

> **CSP note:** `frontend/vercel.json` allows API calls to any `https:` origin (`connect-src 'self' https:`), because the API host isn't known in the repo. Once the API URL is final, replace `https:` with that exact origin to tighten it.

---

## 2. First deployment

1. **Create the database** and a role that owns it. Take a backup of any existing data first (section 6).
2. **Deploy the API** with the environment above. Start command: `npm ci && npm start` in `backend/` (Node 22.12+, pinned in `.nvmrc` and `engines`). The API also imports the repo's `shared/` folder (dependency-free rules used by both apps), so deploy from a full checkout, not a copy of `backend/` alone.
   - On boot the API runs every pending migration in order, each in its own transaction, under a Postgres advisory lock. It only listens once they all succeed. If a migration fails, the process exits and nothing partial is committed. Read the log, fix, redeploy.
3. **Check:** `GET /api/health` returns `{"status":"ok","db":"connected"}`. The log shows `Database connected and migrations synchronized` and either `Email transporter ready` or an SMTP error.
4. **Deploy the frontend** on Vercel (root `frontend/`, build `npm run build`, output `dist`) with its env. Keep the project setting *Include files outside the root directory in the Build Step* on (the default): the app imports `../shared`.
5. **Load reference data** (only on an empty database):
   - Rooms and the faculty directory: Admin → Uploads, or the ACL faculty sync.
   - Faculty timetable: Admin → Uploads → timetable CSV. A re-import replaces the previous one and keeps the old rows soft-deleted. The job result lists skipped rows and any faculty names not in the directory.
   - Section timetables (every semester): `POST /api/timetable/upload { slots: [...] }`. Each section is keyed by the ACL `branch` exactly as the ACL sends it, plus semester and section. An import replaces the classes of the sections it contains. The response lists rejected rows and the room and faculty names CRAS doesn't know (`unresolved`). Those classes are still shown, but they block no CRAS room or faculty member until the name is fixed in the source or the room or person is added. A re-import then links them.
   - Students and staff are not imported: each person appears on their first Google sign-in, with role and section from the ACL.
6. **Smoke test** with real accounts:
   - A rep requests a booking; the faculty member sees the bell and approves; the rep sees the result.
   - An admin quick-books a room.
   - The calendar shows both bookings.

`npm run seed` / `unseed` are for development only. They refuse to run against production or non-local databases unless forced with an explicit override; never force them on production.

---

## 3. Releases and rollback

- **Migrations only move forward.** Never edit a migration that has run anywhere (including a teammate's dev DB); add a new one. Each migration's number and name is recorded in `schema_migrations`.
- **Code rollback:** redeploy the previous commit. All migrations so far are additive or backfills, so older code runs against a newer schema, with one exception: anything older than v24 expects hard-deleted rows to be gone. Don't roll back across v24.
- **Schema rollback:** not automated. Restore the pre-release backup (section 6) only if a migration corrupted data; otherwise roll forward with a fix.
- **Before each release:**
  1. CI must be green (`.github/workflows/ci.yml`: backend Jest + Postgres, frontend lint/Vitest/build, Playwright e2e).
  2. Take a backup.
  3. Deploy during low traffic (not around class changeovers).
- **Graceful shutdown:** `SIGTERM` stops new connections, `/api/health` returns 503 so the load balancer drains, in-flight requests finish (up to `SHUTDOWN_TIMEOUT_MS`, default 10 s), and then the DB pool closes. Use the platform's normal rolling restart.

---

## 4. Running it

**Health and logs**
- `GET /api/health` is outside the rate limiter, caches its DB check for 2 s, and returns 503 while draining. Point the platform health check here.
- Logs are JSON lines on stdout/stderr. Watch for:
  - `"level":"ERROR"` in general;
  - `Email delivery failed permanently`;
  - `Email transporter verification failed`;
  - `ACL` errors.
- `GET /metrics` (Prometheus) needs `Authorization: Bearer $METRICS_TOKEN`.

**Notifications (Phase 7)**
- Every booking, transfer and class-cancellation event writes a `notifications` row in the same transaction as the change. The in-app bell reads these rows, and the outbox worker emails the ones with `email_status='pending'`.
- Failed emails retry with backoff (1 → 60 min) and are marked `failed` after 8 attempts or 24 h.
- Outbox status:

  ```sql
  SELECT email_status, count(*) FROM notifications GROUP BY 1;
  SELECT id, email, email_attempts, email_last_error FROM notifications
   WHERE email_status IN ('pending','failed') ORDER BY id DESC LIMIT 50;
  ```

- To resend emails that failed after an SMTP outage is fixed:

  ```sql
  UPDATE notifications SET email_status='pending', email_attempts=0, email_next_at=NOW()
   WHERE email_status='failed' AND created_at > NOW() - interval '2 days';
  ```

**Abuse guard:** leaky-bucket limits only refuse absurd volumes (see `RATE_LIMIT_*`). A 429 includes `Retry-After`.

**Deleting things:** every delete or cancel in the UI is a soft delete (`is_active=false`, `deactivated_at`, or a `CANCELLED` status). Never `DELETE` production rows by hand. Deactivate a user in Admin → Users; that cancels their upcoming bookings and signs them out.

---

## 5. Capacity

Measured on one API process against PostgreSQL 15 (k6 scenarios in `load/`, run with `load/run.sh <scenario>`):

| Scenario | Result |
|---|---|
| Peak: 400 students + 58 reps + 20 faculty + 3 admins, 4.5 min | p95 294 ms, p99 468 ms, 366 req/s, 0 errors |
| Booking race: 1,000 attempts on 5 slots | exactly 5 bookings, all others 409, 0 server errors |
| Spike: 800 users reopening the app every 3–8 s | 0 errors; p95 8.9 s (queueing past capacity) |
| Stress: arrivals ramping to ~2,000 req/s | saturates at ~500–620 req/s, sheds load with client timeouts, no server errors |
| Abuse | floods and brute-force get 429s; normal users are unaffected |

One process tops out around **600 req/s**, roughly 1.6 ms of CPU per request. That is about 1.5× the measured peak.

**To scale beyond one instance** (not needed today), first move the per-process state to PostgreSQL or Redis:
- the CSV-import job store (`uploadController.js`);
- the short-lived caches (`utils/cache.js`, `utils/sharedCache.js`, the principal cache), including their invalidation;
- the rate-limit buckets.

The outbox worker is already safe to run on several instances (`FOR UPDATE SKIP LOCKED`).

---

## 6. Backup and restore

- **Backups:** use the managed provider's daily automated backups with point-in-time recovery if available. Otherwise run a nightly `pg_dump -Fc "$DATABASE_URL" > cras-$(date +%F).dump` from a cron host, keep 30 days, and store copies off the database host.
- **Before every release:** take an on-demand dump.
- **Restore** into a new database, then point `DATABASE_URL` at it:

  ```bash
  createdb cras_restore
  pg_restore --no-owner -d cras_restore cras-YYYY-MM-DD.dump
  ```

  Then start the API against it. Migrations bring an older dump up to date automatically.
- **Test a restore once per semester.** An untested backup is not a backup.

---

## 7. Security operations

- **Rotate when exposed, and at least yearly:**
  - `JWT_SECRET` (signs everyone out);
  - `ACL_CLIENT_SECRET` (in the ACL admin);
  - `INTERNAL_SYNC_TOKEN` (update the ACL cron at the same time);
  - `SMTP_PASS`;
  - `METRICS_TOKEN`.
- **Session model:** 12-hour session tokens supported both via `Authorization: Bearer <token>` in localStorage and HTTP-only `token` cookie, accompanied by a client-accessible `permissions` cookie.
- **Revoking / Updating access:** changes in the central ACL are validated live on every API call. If a user's role or permissions are changed or if an unauthorized request is made, cookies and local access are automatically refreshed with the updated ACL permissions. Removing or deactivating the person in the ACL immediately invalidates their session and clears auth cookies.

---

## 8. Open actions before go-live

These need the repository owner and are not done by code changes:
0. **Configure the CRAS permissions in the ACL** (section 9). CRAS grants nothing by itself, so until the ACL grants these names nobody can use the app.
1. **Make the repository private.**
2. **Rotate the leaked ACL client secret** (ACL-04) and set a new `JWT_SECRET`.
3. **Purge the leaked secret and credential files from git history.** This is a history rewrite plus force-push, done deliberately with every collaborator re-cloning afterwards.
4. **Tighten `connect-src`** in `frontend/vercel.json` to the final API origin (section 1).
5. **Set up the backup schedule and run one test restore** (section 6).

---

## 9. Permission catalog (configure these in the ACL)

CRAS checks exactly these names, as the ACL sends them in `permissions`. There is no mapping and no default: no grant means no access, and a role on its own grants nothing. The live list, with descriptions, is served at `GET /api/permissions/catalog`.

| Permission | Grants |
|---|---|
| `cras.calendar` | See the rooms calendar: availability and who holds a slot (never the purpose). Read-only on its own |
| `cras.timetable` | See your own timetable: your section's classes, or the classes you teach |
| `cras.bookings` | The Bookings tab and everything a booker does: request a room (approved by the named faculty member), request someone else's booking and answer requests for your own, reschedule or cancel your own, ask a faculty member to cancel a class |
| `cras.bookings.direct` | Bookings take effect immediately with no approval, including committee rooms and the auditorium |
| `cras.faculty_portal` | Approve or reject requests that name you, review class-cancellation requests for your classes, cancel or restore your own class for a date |
| `cras.admin` | The whole Admin Console |

Profile and the notification inbox need no permission.

**Suggested role bundles** (configure as roles in the ACL):

| Role | Permissions |
|---|---|
| Student | `cras.calendar`, `cras.timetable` |
| Class representative | `cras.calendar`, `cras.timetable`, `cras.bookings` |
| Faculty | `cras.calendar`, `cras.timetable`, `cras.bookings.direct`, `cras.faculty_portal` |
| Admin | `cras.calendar`, `cras.timetable`, `cras.bookings`, `cras.bookings.direct`, `cras.admin` |

**Scopes (optional limits on a grant).** The ACL can limit any permission with `scopes_by_permission`. CRAS enforces them; the same text is served in the catalog.

| Form | Meaning |
|---|---|
| no entry, or `[{}]` | unrestricted (every grant today) |
| `[{ "branch": "INFORMATION TECHNOLOGY" }, { "building": "APJ Block" }]` | any one object may match |
| `{ "branch": "INFORMATION TECHNOLOGY", "semester": 5 }` | every key in one object must match; a value may be a list |

| Key | Matches |
|---|---|
| `department`, `branch`, `semester`, `section` | the person acted on (their ACL attributes) |
| `building`, `room` | the room (its CRAS building or name) |

An unknown key matches nothing. Where scopes apply:
- `cras.calendar`: which rooms you see.
- `cras.bookings` / `cras.bookings.direct`: which rooms you can book, move into or take over.
- `cras.admin`: rooms you manage, and people you act on (bookings, users, quick book, timetable search, import and slots, analytics, exports). A scoped admin cannot run the faculty directory or faculty timetable CSV imports, because those replace data for the whole campus.
- `cras.timetable` and `cras.faculty_portal` are not scoped; they only ever show your own data.

The audit log and faculty directory export stay campus-wide for every admin.

**Checks that stay inside CRAS, whatever the ACL grants:**
- only the faculty member named on a request can approve it;
- only the owner can manage their own bookings, though the admin can manage anyone's;
- booking times, conflicts and the one-commitment-per-slot rule always apply.

**Faculty:** someone counts as faculty if their email is in the faculty directory, which the ACL faculty sync fills. That link drives the teaching-timetable checks, separately from permissions.
