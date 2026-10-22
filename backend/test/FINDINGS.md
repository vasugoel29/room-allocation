# Audit findings registry

Each finding has a stable ID. Tests that demonstrate a still-open bug are written as
`test.failing('[ID] <expected correct behaviour>', ...)` — they assert the *correct* behaviour,
so they "pass" while the bug exists and start failing once it is fixed (then flip to `test`).

Severity: C critical · H high · M medium · L low. Status: open unless noted.

## Security / auth (SEC)
| ID | Sev | Where | Finding |
|---|---|---|---|
| SEC-01 | C | repo | `backend/scripts/seeded_students_credentials.json` (9,915 plaintext student passwords) + `Report (1).xlsx`, `Faculty Details.xlsx`, `faculties_data.json`, `hajiri.timetables.json` committed to a **public** GitHub repo |
| SEC-02 | C | authController.js:27-31 | Signup lets caller choose `STUDENT_REP` → instant rep rights, bypasses promotion flow |
| SEC-03 | C | authController.js:14-47 | No server-side `@nsut.ac.in` check, no email verification at signup (frontend-only) |
| SEC-04 | H | uploadController.js:391,330 | Imported faculty password = lowercase name w/o spaces; students = name + 4 random digits |
| SEC-05 | H | roomController.js:85-100 | Any STUDENT_REP can flip any room's weekly availability via `POST /availability/override` |
| SEC-06 | H | transferService.js | Transfer `target_faculty_id` not validated as FACULTY → requester approves own faculty step; VIEWER can request transfers |
| SEC-07 | H | authController.js:329-344 | `GET /auth/verify-student/:rollNo` unauthenticated proxy to third-party API with path traversal (`..%2F`) |
| SEC-08 | H | authController.js:196-222 | Self-service `PATCH /auth/users/:id` can change own email (any domain), section, semester, branch → bypass clash checks / take over emails |
| SEC-09 | H | auth.js, authController | 30-day JWT, role trusted from token, no revocation; logout is a no-op; demoted/deleted users keep access |
| SEC-10 | M | bookingRepository.js:10-58 | `GET /bookings` returns all bookings to any user, `limit` uncapped |
| SEC-11 | M | timetableRoutes.js:7 | Unauthenticated debug endpoint `GET /timetable/inspect-database` leaks faculty timetable |
| SEC-12 | M | server.js, controllers | Raw `err.message` / stack returned to clients |
| SEC-13 | M | server.js:89 | `/metrics` public |
| SEC-14 | M | server.js:146-163 | Audit log stores full request bodies (CSV content, reset tokens); anonymous actions attributed to user 1; different JWT fallback secret |
| SEC-15 | M | npm audit | backend: 1 critical (proxy-addr), 7 high (nodemailer, compression, path-to-regexp, xlsx…); frontend: 1 critical (tar), 7 high (react-router…) |
| SEC-16 | M | emailService.js | HTML injection in emails (studentName, adminComment, userName unescaped) |
| SEC-17 | L | authController | Account enumeration (403 for pending faculty before password check; timing; "Email already exists") |
| SEC-18 | L | authController | Emails not normalised (case-sensitive duplicates) |
| SEC-19 | L | authController | No password strength on signup; 6 chars on reset |
| SEC-20 | L | server.js:23 | Sentry DSN hardcoded, 100% tracing, console logs (incl. emails) shipped to Sentry |
| SEC-21 | L | authController:22 | Unauthenticated signup can create arbitrary departments via `departmentName` |
| SEC-22 | L | adminController.js:8-14,54 | CSV export: incomplete formula-injection escaping, unquoted fields |

## Booking logic (BKG)
| ID | Sev | Where | Finding |
|---|---|---|---|
| BKG-01 | C | bookingService.js:71-218 | Server never checks the room's own timetable (`room_availability` / `timetable_slots.room_name`) → can book a room during a scheduled class |
| BKG-02 | H | bookingRepository.js:91-114 | No DB exclusion constraint; overlapping bookings race through; same-start race → 500 not 409 |
| BKG-03 | H | bookingService.js:383 | Admin approving a PENDING booking → `user_id -1` audit FK error aborts txn → 500 |
| BKG-04 | H | bookingService.js:265 | RESCHEDULE-type booking passes pg client as `user_id` → always 500 |
| BKG-05 | H | timetableController.js:264 | Approving class cancellation without booking_id → 500 (Date into VARCHAR(20)); also frees slot every week permanently |
| BKG-06 | H | transferService.js | Transfer state machine: booking CANCELLED mid-flow then lost on reject; double completion; resurrects cancelled/past bookings |
| BKG-07 | H | bookingService.js:297-360 | Reschedule skips past/7-day/timetable/student_access/status/end>start checks |
| BKG-08 | M | bookingService.js:406 | `end_time` not validated: end<start → 500, end=start accepted, off-grid/long bookings accepted |
| BKG-09 | M | bookingRepository.js:109 | PENDING bookings don't block user/room; approval re-checks only room → overlaps / 500 |
| BKG-10 | M | bookingService.js:221 | Faculty approval opt-in (omit faculty_id → ACTIVE); faculty_id not validated as FACULTY |
| BKG-11 | M | — | No per-user booking cap |
| BKG-12 | M | timetableController.js:198-260 | Cancellation request can target any booking_id |
| BKG-13 | M | various | Timezone: emails use server-local hours; `slot=` filter uses UTC hour; half-hour clashes missed |
| BKG-14 | M | FK rules | Room/user delete fails (booking_history FKs) or silently cascades future bookings |
| BKG-15 | M | promotionController.js | `POST /promotions` always 500 (undefined vars); approve doesn't check PENDING, can demote FACULTY/ADMIN; reject 2nd request → 500 |
| BKG-16 | L | cache | Cache invalidation gaps; per-process cache |
| BKG-17 | L | bookingService.js:272 | Cancel allows cancelling REJECTED/past bookings; doesn't close open transfers |
| BKG-18 | L | bookingService.js:553 | Quick-book auto-creates junk rooms on typos; invalid date → 500 |
| BKG-19 | L | indexes | Missing indexes on booking_transfers; N+1 in notifications |

## Admin / data / ops (OPS)
| ID | Sev | Where | Finding |
|---|---|---|---|
| OPS-01 | C | scripts/unseed.js:21 | `role != 'admin'` (lowercase) deletes ALL users incl. admins, plus rooms/bookings; no env guard |
| OPS-02 | H | db.js:600-625 | Migrations not transactional, no advisory lock; concurrent boots double-seed |
| OPS-03 | H | server.js / db.js | Server listens before migrations complete |
| OPS-04 | H | db.js v16-v19 | Lossy department/name normalisation migrations, no backup |
| OPS-05 | H | uploadController.js:458 | Timetable import: PM hours not converted (02:00 → hour 2); stale `room_availability` never cleared |
| OPS-06 | H | server.js:106 | 100kb JSON limit breaks bulk CSV imports |
| OPS-07 | H | adminController.js:38-65 | Bookings CSV export leaks pool connection on error → pool exhaustion |
| OPS-08 | M | uploadController.js:355 | Duplicate email in import chunk fails whole job with cryptic error |
| OPS-09 | M | uploadController.js:324 | Import validation weak; v20 columns (department_id, branch_id, semester) not set |
| OPS-10 | M | uploadController.js:10 | Import job status in memory |
| OPS-11 | M | adminController.js:75 | `GET /admin/export/promotions` queries nonexistent table → always 500 |
| OPS-12 | M | timetableController.js:467 | Editing a timetable slot nulls `room_id` |
| OPS-13 | M | emailService.js | Missing SMTP in prod silently logs instead of sending (password reset "succeeds") |
| OPS-14 | M | timetableController.js:50 | Bulk timetable upload duplicates on re-post |
| OPS-15 | L | logger.js | Logger drops stack traces |
| OPS-16 | L | env | `.env.example` missing CORS_ORIGIN, PORT, NODE_ENV, SMTP_FROM_NAME, SENTRY_DSN; env.js expands wrong file |
| OPS-17 | L | repo | `backend/server.log` committed |
| OPS-18 | L | ops | No graceful shutdown, no backup docs, health check behind limiter, in-memory cache/jobs (multi-instance unsafe) |
| OPS-19 | L | seeders | Seeders hardcode `/Users/vasugoel/...` paths, write plaintext creds, `seed_faculties` uses `password123` |

## Schema drift (DRIFT)
| ID | Sev | Finding |
|---|---|---|
| DRIFT-01 | C | `bookings.faculty_id` (+ FK, index) used everywhere but created by no migration → fresh deploy cannot create bookings |
| DRIFT-02 | M | `promotions` table / `requested_role` referenced by export (see OPS-11) |

## Frontend (FE)
| ID | Sev | Where | Finding |
|---|---|---|---|
| FE-01 | H | RoomScheduleGrid.jsx:35 | Room Grid dates via `toISOString()` on local midnight → in IST every row shows the previous day; weekStart is Sunday |
| FE-02 | H | RoomScheduleGrid.jsx:208 | Room Grid "Confirm Booking" sends `{room_id,start_time,...}` but `/bookings/admin/quick` requires `room_name,date,slot` → always 400 |
| FE-03 | H | AdminUserModal.jsx:110 | "Add User" with ADMIN sends `role:'admin'` (lowercase); backend stores it → user has no rights at all |
| FE-04 | H | utils/api.js, Login.jsx | 30-day JWT in localStorage (see SEC-09) |
| FE-05 | H | AppContext.jsx:11 | Role/profile read once from localStorage; promotions/demotions not reflected until re-login |
| FE-06 | H | package.json / lint | `npm run lint` has 30 errors (no-undef in AdminTimetable.jsx, Signup.jsx) → root `npm run build` fails |
| FE-07 | H | Calendar/BookingTypeSelector/FacultySelector | Booking flow is mouse-only (clickable divs) — not keyboard accessible |
| FE-08 | M | Signup.jsx | Signup page is orphaned (no route); would crash if routed (undefined `year`) |
| FE-09 | M | Calendar.jsx:272 | Clicking empty cell area opens modal with no room → always "Please select a room" |
| FE-10 | M | utils/api.js:43 | Non-idempotent POST/PATCH retried on network errors (≤30s) → duplicate bookings/imports |
| FE-11 | M | HistoryView.jsx:19 | Cancel failures silently swallowed in My Bookings |
| FE-12 | M | AppContext.jsx:117 | Calendar loads `GET /bookings?limit=1000` sorted by created_at — beyond 1000 bookings rooms look free; never refreshed |
| FE-13 | M | AppContext/Calendar | Fetch errors only console-logged; "No structural matches found" shown while loading and on error |
| FE-14 | M | useAdminQuickBook.js:7 etc. | More IST bugs: default date is yesterday 00:00–05:30 IST; browser-local hours elsewhere |
| FE-15 | M | admin hooks | Admin search/pickers only search current page; Quick Book user picker only first 20 users |
| FE-16 | M | AdminTimetableSlots.jsx:184 | Raw `fetch('/api/rooms')` ignores VITE_API_URL → empty room dropdown on split deploy |
| FE-17 | M | main.jsx:11-45 | Sentry: hardcoded DSN, sendDefaultPii, 100% sampling, console logs forwarded, test logs every load, reset token URLs |
| FE-18 | M | Profile.jsx:31 | Profile edits lost on reload (localStorage not updated) |
| FE-19 | M | FacultyDashboard.jsx:144 | "Cancel Session" offered on cancelled/past bookings |
| FE-20 | M | AdminUploads.jsx:61 | Upload status polling never cleared / no timeout |
| FE-21 | L | various | Dead code: reschedule endpoint, PromotionModal, HistoryModal, RoomSelector… |
| FE-22 | L | vite.config.js | PWA: no /api navigation denylist, missing includeAssets, stale-chunk risk after deploy |
| FE-23 | L | various | a11y: unlabeled icon buttons, unlinked labels, low-contrast text, modals without dialog role/focus trap |
| FE-24 | L | MobileBooking.jsx, App.jsx | /book-a-slot & /history not role-gated; mobile flow skips static timetable pre-check |
| FE-25 | L | e2e/ | Existing Playwright specs run against the dev DB and use stale selectors |

## Found while writing tests (NEW)
| ID | Sev | Where | Finding |
|---|---|---|---|
| NEW-auth-1 | L | authController.js:14-47,293 | No input validation on signup/reset: missing password/email/name, semester 12, numeric password → 500 instead of 400 |
| NEW-auth-2 | L | authController.js:178 | Admin `POST /auth/users` stores any role string (e.g. "GOD") → user has level 0 |
| NEW-bookings-1 | L | bookingService.js:272 | Cancelling an already-CANCELLED booking → 200, overwrites cancelled_at, duplicate audit row |
| NEW-bookings-2 | L | bookingService.js:308 | Reschedule weekend rule also blocks FACULTY/ADMIN (who may create weekend bookings) |
| NEW-bookings-3 | L | bookingService.js:16 | `?limit=-5` / `?page=-1` → 500 |
| NEW-bookings-4 | L | bookingService.js:561 | Quick-book with non-existent target_user_id → 500 (FK) |
| NEW-bookings-5 | L | facultyRoutes.js | `/faculty/abc/approve` → 500 with err.message + stack; no id validation |
| NEW-bookings-6 | L | bookingService.js:396 | Faculty rejection writes no REJECT_BOOKING audit row |
| NEW-bookings-7 | M | bookingService.js:309 | Reschedule weekend check uses server-local `getDay()` (UTC in prod) |
| NEW-RTT-1 | L | roomController getRooms | Paginated `meta.total` counts rooms hidden from students |
| NEW-RTT-2 | M | roomController | Duplicate room name on create/rename → 500 instead of 409 |
| NEW-RTT-3 | L | roomController | No validation: capacity 'lots'/name >32 chars → 500, capacity -5 accepted, bad date/weekStart → 500 with raw error |
| NEW-RTT-4 | M | roomController updateRoom | PATCH is a full overwrite: `{capacity}` alone → 500; partial update wipes building/floor/type/AC/projector/student_access |
| NEW-RTT-5 | M | roomController override | Unknown room → 500; day 'Funday'/hour 99 stored; missing is_available stores NULL |
| NEW-RTT-6 | L | transferRoutes | `/transfers/abc/accept` → 500 |
| NEW-RTT-7 | M | transferService.rejectTransfer | No status check: an ACCEPTED transfer can be "rejected" afterwards (status lies, booking stays moved) |
| NEW-RTT-8 | L | timetableController | search without name/department, faculty/check without date, hour 25 / invalid date → 500 |
| NEW-admin-1 | M | adminController.js:69-99 | Bookings export with invalid date: 200 + header sent, then ERR_HTTP_HEADERS_SENT, socket aborted (truncated "success") |
| NEW-admin-2 | L | adminController.js:86 | Export times use `Date#toString` (server-TZ dependent, non-ISO) |
| NEW-admin-3 | L | adminController.js:141 | Audit logs page/limit negative → 500; limit uncapped |
| NEW-admin-4 | L | adminController.js:226 | Analytics daily trends grouped by UTC day, peak hours by IST |
| NEW-admin-5 | L | uploadController.js:31 | CSV parser drops escaped quotes (`""`) |
| NEW-admin-6 | M | uploadController.js:358,414 | Import upserts by email regardless of role: student CSV rewrites ADMIN/FACULTY profiles |
| NEW-admin-7 | L | middleware/auth.js:39 | `requireRole('<unknown>')` allows everyone (latent) |

## Performance / capacity (PERF) — from k6 (`load/`), single Node process, local Postgres
| ID | Sev | Finding |
|---|---|---|
| PERF-01 | H | Every app open fetches `GET /bookings?limit=1000` (~500 KB JSON, all users' bookings). Peak scenario (400 students + 58 reps + 20 faculty + 3 admins): p95 4.1 s, `/health` p95 4.6 s (event loop saturated), ~240 req/s ceiling, 0.9% connection resets, 3.9 GB transferred in 5 min |
| PERF-02 | H | Booking race (200 reps, 5 slots): integrity held (exactly 5 created) but 45/1000 losers got 500 instead of 409 (BKG-02 under load) |
| PERF-03 | M | `/api/health` shares the saturated event loop and the API limiter → platform health probes can fail under load and trigger restarts |
| PERF-04 | info | Leaky-bucket abuse guard verified: flood → 3,002× 429, password guessing → 380× 429, bystander users 0× 429 |
| PERF-05 | info | Node 20.14 is below Vite's minimum (20.19+); pin an engine version for deploys |

## Found by e2e / frontend tests (NEW-E2E, NEW-FE)
| ID | Sev | Where | Finding |
|---|---|---|---|
| NEW-E2E-1 | M | features/admin/AdminQuickBook.jsx | Room Jump / Slot dropdown items overlapping the recipient column are unclickable (header backdrop-blur stacking context, no z-index) |
| NEW-E2E-2 | H | Profile.jsx + userRepository.update | Empty semester/section/group sent as '' into INTEGER columns → 500; students without those fields (all CSV imports) cannot edit their profile |
| NEW-FE-1 | L | utils/timetableLogic.js:233 | `isRoomReallyFree` matches room names by substring ("101" busy when "1101" has a class) — only reached from dead RoomSelector |
| NEW-FE-2 | L | services/adminService.js:120 | Audit-log search not URL-encoded ("R&D" breaks the query) |
| NEW-FE-3 | L | components/ui/BottomNav.jsx:55 | Pending-transfer badge only on a `history` tab; reps get `bookings`, so never see it on mobile |
| NEW-FE-4 | L | pages/RoomScheduleGrid.jsx:222 | Week header reads `weekDates[5]` (only 0–4 exist) → "Oct 19 – " |

## Found while migrating to the ACL / faculty-directory model (Phase 1–2)
| ID | Sev | Status | Finding |
|---|---|---|---|
| ACL-01 | C | fixed | `/auth/google` accepted an email with no Google token, and only `jwt.decode`d tokens → anyone could sign in as anyone |
| ACL-02 | C | fixed | Startup auto-wiped all tables on a "mismatched schema" heuristic; migration v1 began with DROP TABLE |
| ACL-03 | C | fixed | Boot seeded `admin@nsut.ac.in` with a fixed password hash whenever no admin existed |
| ACL-04 | C | fixed in code; **rotate secret** | ACL client secret hardcoded as a fallback in the public repo (still valid) |
| ACL-05 | H | fixed | Faculty picker returned `faculties.id` but bookings/approvals used `users.id` |
| ACL-06 | H | fixed | Full ACL payload (incl. mobile) in a 30-day localStorage JWT; ACL revocation ineffective |
| ACL-07 | C | fixed in tree; **history purge pending** | Branch re-committed `seeded_students_credentials.json` |
| NEW-P2-1 | M | fixed | Admin could edit/approve a soft-deleted user (update lacked `AND is_active`) |
| NEW-P2-2 | L | fixed | Deactivating a user didn't clear admin-status/availability caches after cancelling their bookings |

## Found while unifying the booking rules (Phase 4)
| ID | Sev | Status | Finding |
|---|---|---|---|
| NEW-P4-1 | M | fixed | Room-timetable check treated a multi-hour booking as one slot, so a release covering only the first hour hid a class in the second |
| NEW-P4-2 | H | fixed | A student could reschedule an approved booking anywhere and keep it ACTIVE without the faculty re-approving |
| NEW-P4-3 | M | fixed | Cancelling a reschedule booking via owner/room soft-delete left its class-slot release active |
| NEW-P4-4 | L | fixed | Approval 409s had no `conflict` body (create/reschedule did) |
| NEW-P4-5 | H | fixed | Concurrent approvals of overlapping requests → 500 (exclusion violation not mapped) |
| NEW-P4-6 | M | fixed | Quick Book accepted impossible dates (Feb 30) and booked the rolled-over day |
| NEW-P4-7 | M | fixed | Deadlocks / serialization failures surfaced as 500; now retried, then 409 |
| NEW-P4-8 | L | fixed | Legacy same-start unique indexes duplicated (and contradicted) the exclusion constraints (migration v28) |
| NEW-P4-9 | H | fixed | Transfer completion to a busy requester, or an overlapping grab mid-flow → 500 |
| NEW-P4-T1 | M | fixed | A refused accept on an unavailable booking marked the transfer REJECTED, then rolled that back |
| NEW-P4-T2 | M | fixed | Unique (booking, requester) blocked asking again after a withdrawal (migration v29: unique only among open requests) |

## Found in Phase 5 (performance and operations)
| ID | Sev | Status | Finding |
|---|---|---|---|
| PERF-06 | H | fixed | `jsonwebtoken` re-derived the HMAC key on every verify (a thrown-and-caught `createPublicKey`) and each request verified its token 2–3× (limiter, authenticate, audit): 24% of server CPU at peak. Now one cached `KeyObject` and one verification per token |
| PERF-07 | M | fixed | Calendar rows were re-read, re-filtered and re-serialised per viewer; now one shared JSON body per window and view for 5 s, cleared by any successful write |
| NEW-P5-1 | L | fixed (removed) | `bookingService.rescheduleBooking` (frontend) POSTs `/bookings/:id/reschedule`, which doesn't exist (backend is `PATCH /bookings/:id`); nothing calls it |
| NEW-P5-2 | M | fixed | Sentry: 100% tracing + profiling in the backend; browser sent default PII, 100% traces/profiles, a placeholder `yourserver.io` trace target and fake test metrics on every page load |
| NEW-P5-4 | H | fixed | Dated releases (approved class cancellations, reschedules) were enforced server-side but missing from `/availability`, so the calendar still showed the room taken and the rep's timetable still listed the cancelled class |
| NEW-P5-5 | M | fixed | Node's 5 s keep-alive + 511 backlog: users pausing between screens reconnected in bursts that overflowed the accept queue (`dial: i/o timeout` at peak); keep-alive now 65 s, backlog 2048 |
| NEW-P5-3 | L | fixed | Load-test kit still used pre-Phase-4 flows (student bookings without a faculty; contention via PENDING requests that never hold a room) |

## Phase 6 (robustness and UX) — status of earlier findings
Fixed (their `test.failing` / `it.fails` / `test.fail()` markers are now ordinary regression tests):
NEW-RTT-1, NEW-RTT-3, NEW-RTT-5, NEW-RTT-6, NEW-RTT-8, NEW-bookings-5, NEW-admin-3, NEW-admin-5, OPS-05, OPS-09,
OPS-12, OPS-14, BKG-16, FE-07, FE-09, FE-10, FE-11, FE-13, FE-15, FE-19, FE-21, FE-24, NEW-FE-1, NEW-FE-2,
NEW-FE-3, NEW-E2E-1, NEW-P5-1. BKG-11 closed by product decision (no per-student cap; approval + one
commitment per slot). Open, needs a decision: FE-04 (session token in localStorage vs an httpOnly cookie).

| ID | Sev | Status | Finding |
|---|---|---|---|
| NEW-P6-1 | M | fixed | Shared validators: malformed ids, dates, hours, booleans and pagination are 400s with a message, never 500s; every `/:id` route has one guard |
| NEW-P6-2 | L | fixed | Jest run-in-band flake ("Maximum call stack size exceeded" in jest-util): a disabled `Sentry.init` still wrote the SDK's global carrier, which Jest re-wrapped per test file. Sentry is no longer initialised when disabled |
| NEW-P6-3 | info | — | Stress (2,000 req/s offered): one Node process serves ~500–620 req/s, then sheds load with client timeouts (3.6%); no server errors, no integrity violations. Docker Desktop's proxy wedged under the 2,000-connection stress and needed a restart (local harness only) |

## Phase 7 (notifications)
| ID | Sev | Status | Finding |
|---|---|---|---|
| OPS-13 | H | fixed | Email failures were silent (fire-and-forget after commit; missing SMTP only warned). Now: transactional outbox, worker with retries/backoff and a terminal `failed` state; production refuses to start without SMTP unless `EMAIL_DELIVERY=off` |
| NEW-P7-1 | L | fixed | An admin withdrawing their own transfer request was recorded as REJECTED (role took precedence over being the requester), so the owner was never told it was withdrawn |
| FE-04 | M | closed (decision) | Bearer token stays in localStorage (frontend and API on different domains); mitigated by a strict CSP in `frontend/vercel.json` (pinned by a test) and server-side revocation |

## Product decisions applied (20 Oct 2026)
| Item | Change |
|---|---|
| Faculty "cancel my class" | Built: records the override, releases the room for that date/hour only, faculty no longer "busy" then; restorable; 404 if they don't teach then |
| Admin reschedule | Admins can move anyone's booking under the owner's rules; owner notified (`booking_moved`) |
| Bookings export | A date-only start/end covers the whole IST day |
| Analytics | "Last N days" counts up to now only |
| Student export | Includes class representatives (with a role column), excludes deactivated accounts |
| Department/branch master list | Read-only in CRAS; written only by the ACL cron via `PUT /api/internal/departments` (migration v33: `acl_id`) |
| Timetable times | Explicit AM/PM honoured; bare 01:00–07:59 keep the afternoon convention |

## Round 2 (20 Oct 2026)
| ID | Status | Change |
|---|---|---|
| ACL catalog | done | Six `cras.*` permissions granted only by the ACL; no role-based access anywhere (backend gates, service rules, frontend) |
| OPS-19 | fixed | Seeding is one deterministic, idempotent entry point (`backend/seed`): real rooms + faculty directory as code, demo timetable for dev/test; no file reads, no randomness, never deletes or revives; migrations no longer read files (v1 baseline inline, v10 no longer seeds) |
| NEW-R2-1 | fixed | The app requested the faculty list and transfers for every user on load; now each loader asks only for what the person's permissions allow (no 403 noise) |
| DATA-01 | fixed | The ACL `department_name` was overwritten by a join to the unused departments table; departments/branches tables dropped (v35), department and branch are ACL attributes |
| DATA-02 | fixed | 1,314 "free" weekly rows and 630 "blocked" rows were written by the old seeder from an occupancy snapshot; all soft-deleted (v34, v36). `room_availability` now holds admin weekly blocks only (CHECK) |
| DATA-03 | fixed | The calendar showed classes only from those derived rows, so 872 class-hours looked free but were refused with 409; classes now come straight from the timetables by `room_id` for the calendar, the Room Grid and the booking check alike |
| DATA-04 | fixed | Timetables matched people and rooms by free-text names and three alias maps; now `room_id`/`faculty_id` and the ACL section key (branch + semester + section, exact). Unknown names are kept as labels and reported by the import |
| DATA-05 | fixed | The faculty CSV import blocked only a slot's first hour; derived blocks are gone, a 2-hour class blocks both hours |
| DATA-06 | fixed | No status/role/type CHECKs, nullable keys, CASCADE/SET NULL foreign keys contradicting soft delete; v37 adds the checks, NOT NULL keys and RESTRICT everywhere (ACL revocation now marks the snapshot instead of deleting it) |
| PERF-05 | fixed | Two full-table GiST indexes (600 kB) were redundant with the exclusion indexes except for PENDING-by-room lookups; replaced by a partial index (0.29 → 0.015 ms on the load DB); transfer inbox indexes added; boolean and duplicate indexes dropped |
| MAINT-01 | fixed | Timetable rules and SQL moved out of the controller into `services/timetableService` + `repositories/timetableRepository`; every room-release write goes through the repository |
| MAINT-02 | fixed | One `shared/` module (timetable time parser, IST helpers, booking hours) imported by backend and frontend, replacing the separate copies; the calendar grids now offer 08:00–20:00 like the server (were 08:00–18:00) |
| MAINT-03 | fixed | The calendar and mobile booking used two "is the room free" checks that matched only a booking's first hour and counted PENDING requests; one shared function now follows the server rule |
| MAINT-04 | fixed | Slots like "11:00 PM-01:00 AM" parsed to an end before the start; now rejected (and retired by v36) |
| MAINT-05 | fixed | Legacy `{ id }` tokens no longer accepted; one JWT secret definition; the rate limiter reuses the cached session verification; one cache-invalidation helper; one frontend `readJson` for API errors; import job status stored in `import_jobs` (survives restarts, v38) |
| DEC-19 | done | Admin booking over a timetabled class cancels the class for that date (release + teacher record tied to the booking), notifies the teacher and section, restores both on cancel/move (v39) |
| DEC-20 | done | ACL scopes enforced: people (department, branch, semester, section) and rooms (building, room) per permission; published in the catalog and RUNBOOK §9; scoped admins can't run whole-campus imports |
