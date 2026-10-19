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
