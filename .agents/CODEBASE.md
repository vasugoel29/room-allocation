# Room Allocation — Codebase Reference for Agents

> Last updated: July 2026. Read this entire file before modifying any source file.

---

## 1. What This Is

A full-stack room booking and academic timetable platform for a university campus.

- **Users**: Students, Student Reps, Faculty, Admin
- **Core flows**: Browse rooms → Book a slot → Transfer booking to faculty → Cancel class → Admin manages everything
- **Stack**: React (Vite + Tailwind v4) frontend · Node.js/Express backend · PostgreSQL · Deployed on Render

---

## 2. Project Root

```
room-allocation/
├── frontend/                 # React SPA (Vite)
├── backend/                  # Express REST API
├── e2e/                      # Playwright end-to-end tests
├── docker-compose.yml
├── faculties_data.json       # Source data: faculty timetables
├── hajiri.timetables.json    # Source data: section timetables
└── .agents/CODEBASE.md       # ← you are here
```

---

## 3. Frontend Architecture (`frontend/src/`)

### Entry Points
| File | Purpose |
|---|---|
| `main.jsx` | React root, wraps everything in `AppProvider` |
| `App.jsx` | Router, sidebar navigation, layout shell, theme toggle |
| `index.css` | CSS variables (design tokens), Tailwind v4 theme overrides, utility classes |

### Pages (`pages/`)
| File | Role | Notes |
|---|---|---|
| `AdminDashboard.jsx` | Admin hub with tab-based navigation | 856 lines — routes to feature components via `?tab=` param |
| `AdminTimetable.jsx` | Timetable search/override UI for admins | Embedded in AdminDashboard via `tab=timetable` |
| `Timetable.jsx` | Student/Faculty personal timetable | Day + Week view, cancel class action |
| `FacultyDashboard.jsx` | Faculty override/cancellation portal | |
| `MobileBooking.jsx` | Mobile-only full-screen booking wizard | ~597 lines, duplicates some logic from `BookingModal` |
| `Bookings.jsx` | Thin wrapper around `HistoryView` | 16 lines only |
| `MobileHistory.jsx` | Mobile-only wrapper around `HistoryView` | 22 lines |
| `HistoryPage.jsx` | Desktop wrapper around `HistoryView` | **Likely dead** — route redirects to `/bookings` |
| `Profile.jsx` | User profile edit/view | |
| `PromotionRequest.jsx` | Student requests role promotion | |
| `Login.jsx`, `Signup.jsx`, `ForgotPassword.jsx`, `ResetPassword.jsx` | Auth pages | |

### Features (`features/`)
Self-contained modules composed by pages:
- `features/admin/` — AdminBookings, AdminUsers, AdminQuickBook, AdminRequests, AdminRooms, AdminDepartments, AdminAnalytics, AdminAuditLog, AdminUploads
- `features/history/HistoryView` — shared booking history list (used by Bookings, MobileHistory, HistoryPage)
- `features/booking/` — booking-related sub-components
- `features/auth/` — auth components

### Components (`components/`)
- `components/ui/` — Calendar, RoomFilter, BottomNav, PageSearch, DatePickerDropdown, DateScroller, CustomSelect, ErrorBoundary, FloatingActions, PWAInstallOverlay
- `components/modals/` — BookingModal, ConfirmModal, AdminUserModal, AdminRoomModal, AdminDepartmentModal, AdminPromotionActionModal, HistoryModal, PromotionModal

### Global State (`context/AppContext.jsx`)
**Single context** — do not create new contexts.

Key state and fetchers:
```js
{
  user, logout,
  rooms, fetchRooms,
  bookings, fetchBookings,
  availability, fetchAvailability,
  timetableData, facultyTimetableData,
  facultyOverrides, fetchFacultyOverrides,
  faculties, fetchFaculties,
  departments, fetchDepartments,
  incomingTransfers, outgoingTransfers, fetchTransfers,
  selectedDay, setSelectedDay,
  viewMode, setViewMode,      // 'day' | 'week'
  theme, setTheme,            // 'light' | 'dark'
  deferredPrompt,             // PWA install prompt
  refreshAllData, loadInitialData
}
```

### Services (`services/`)
Thin API wrappers. **Always use these — never call `fetch` directly in components.**
| File | Covers |
|---|---|
| `authService.js` | login, logout, signup, getFaculties, approve |
| `bookingService.js` | CRUD bookings, transfers, cancellations |
| `roomService.js` | rooms, availability, timetable data |
| `adminService.js` | audit logs, analytics, CSV export, quick book |
| `facultyService.js` | faculty overrides |
| `promotionService.js` | promotion requests |

### Utilities (`utils/`)
| File | Purpose |
|---|---|
| `api.js` | `apiFetch` wrapper with exponential-backoff retry, auto-logout on 401 |
| `timetableLogic.js` | **Critical** — `getMergedSchedule`, `getClassConflict`, `isRoomReallyFree`, time normalizers |
| `dateHelpers.js` | `formatDateDisplay`, `formatWeekDisplay`, `getTodayRange`, `getWeekRange` |
| `roleUtils.js` | `getRoleLabel(role)` string mapping |

### Hooks (`hooks/`)
| File | Purpose |
|---|---|
| `useAdminData.js` | Fetches bookings + promotions for admin dashboard |
| `useAdminUsers.js` | User list with pagination |
| `useAdminQuickBook.js` | Quick booking form state |
| `useDepartments.js` | Departments list |
| `useFacultyRequests.js` | Faculty override requests |
| `useSearchDebounce.js` | Generic debounced search value |
| `useWindowSize.js` | `isMobile`, `isDesktop` responsive flags |

---

## 4. Backend Architecture (`backend/src/`)

### Layer Order — respect boundaries strictly
```
Routes → Controllers → Services → Repositories → db.js (pg Pool)
```
Never put SQL in controllers. Never put HTTP concerns in services.

### Routes (all mounted under `/api/`)
| File | Prefix |
|---|---|
| `authRoutes.js` | `/auth` |
| `roomRoutes.js` | `/rooms` |
| `bookingRoutes.js` | `/bookings` |
| `promotionRoutes.js` | `/promotions` |
| `facultyRoutes.js` | `/faculty` |
| `transferRoutes.js` | `/transfers` |
| `departmentRoutes.js` | `/departments` |
| `adminRoutes.js` | `/admin` |
| `timetableRoutes.js` | `/timetable` |

### Controllers
Validate input, call services, return HTTP. **No SQL.**

### Services
Business logic. Use `runInTransaction` from `db.js` for multi-step operations.
- `bookingService.js` — conflict detection, booking CRUD (most complex: 16 KB)
- `transferService.js` — multi-step transfer approval flow
- `loggerService.js` — audit log writes
- `departmentService.js`, `userService.js` — thin delegation

### Repositories
All SQL here. Parameterised queries only (`$1`, `$2`, etc.).

### `db.js`
- `pg.Pool` connection
- Versioned migration runner (`migrations[]` array, runs on startup)
- Exports: `query(text, params)`, `runInTransaction(callback)`

### Key Tables
```
users              — id, name, email, role, department_id, year, section, is_approved
rooms              — id, name, capacity, floor, building, has_ac, has_projector, room_type
bookings           — id, room_id, created_by, start_time, end_time, purpose, class_name, user_role, status
booking_transfers  — id, booking_id, requested_by, target_faculty_id, owner_id, status
promotion_requests — id, user_id, status, reason, admin_comment
departments        — id, name
timetable_slots    — department, semester, section, day_of_week, slot_time, subject_name, room_name, faculty_name
faculty_slots      — (faculty-specific timetable data)
audit_logs         — actor, action, target_id, details, created_at
```

### Middleware
- `authenticate.js` — JWT verification, attaches `req.user`
- `authorize.js` — role guards (`requireRole`, `requireApproved`)
- `validate.js` — Joi schema validation

---

## 5. Design System

Defined in `frontend/src/index.css`. Use token names only — never hardcode colours.

### Surface Hierarchy
```
Token            Dark value    Light value    Usage
surface-lowest   #0a0c10       #F8FAFC        Page background
surface-low      #0f1218       #F1F5F9        Cards, sidebar, rows (even)
surface-mid      #151921       #E2E8F0        Inner sections, rows (odd)
surface-high     #1c222d       #CBD5E1        Pills, elevated chips ← use for pill bg
surface-highest  #2d333f       #94A3B8        Borders, dividers ← use for pill border
```

### Key Colours
```
primary / accent   #5D5FEF   (indigo)
text-primary       #f8fafc   (dark) / #1e1b4b (light)
text-secondary     #94a3b8   (dark) / #475569 (light)
```

### Utility Classes
- `.glass` — glassmorphism (no border, backdrop-blur, based on surface-low)
- `.shadow-ambient` — tinted drop shadow
- `.no-scrollbar` — hidden scrollbar, still scrollable
- `.chip` / `.chip-active` / `.chip-inactive` — selection pills

### Week View Layout (Timetable pages)
Both `Timetable.jsx` and `AdminTimetable.jsx` week views use:
- Rows = days (Mon–Fri) alternating `bg-surface-low` / `bg-surface-mid`
- Pills = `bg-surface-high border-surface-highest` (solid, not opacity hacks)
- Dynamic booking pills = `bg-primary/15 border-primary/40` (or `bg-accent/15`)
- Day label column: `w-24`, `border-r border-surface-mid`
- Pill row: `overflow-x-auto overflow-y-hidden no-scrollbar`
- Outer wrapper: `h-full overflow-hidden` with inner scroll div `flex-1 min-h-0 overflow-y-auto`

---

## 6. Timetable Logic — Critical Section

**`utils/timetableLogic.js`** is the single source of truth.

### `getMergedSchedule(user, dateStr, bookings, availability, timetableData, facultyTimetableData, facultyOverrides)`
1. Derive `dayOfWeek` from `dateStr`
2. Build `staticClasses` from `timetableData` (student) or `facultyTimetableData` (faculty)
   - Both include `className` built from `department + semester + section`
3. Filter bookings to this date → map to dynamic slots
4. Apply faculty override cancellations (remove cancelled static slots)
5. Merge, sort by time, **deduplicate** (same subject+room+time = one entry)
6. Map `displayTime` via `formatTo24h`

### Time Normalization Heuristic
Source JSON uses 12-hour clock without AM/PM marker. Rule: hours 1–7 → add 12 (PM). Hours 8–12 → keep (AM/noon). Applied consistently in `getHourFromTime`, `getSortableMinutes`, `formatTo24h`.

### Other Exports
- `getClassConflict(...)` — returns conflict name for booking validation
- `isRoomReallyFree(...)` — checks booking + static + override layers
- `getDayOfWeek(dateInput)` — 'Mon'|'Tue'|... from date

---

## 7. Role System

| Role | Capabilities |
|---|---|
| `STUDENT` | View timetable, view calendar, request promotion |
| `STUDENT_REP` | + Cancel own section classes, create bookings |
| `FACULTY` | + Create bookings, cancel own sessions, view faculty timetable |
| `ADMIN` | Everything — user/room management, timetable overrides, CSV uploads |

Frontend role check: `user.role === 'ADMIN'` etc.
Backend route guard: `authorize.requireRole(['ADMIN'])`.

---

## 8. Patterns & Conventions

- **Error handling**: Services throw `Error`. Controllers catch → `res.status(xxx).json({ error: msg })`. Frontend services check `res.ok` and throw.
- **Pagination**: API returns `{ data: [], meta: { page, limit, total } }`.
- **Toasts**: `react-hot-toast`. No toasts on search/filter results — only on user-initiated actions.
- **Date format**: ISO `YYYY-MM-DD` strings in frontend, `TIMESTAMPTZ` in DB.
- **Naming**: camelCase JS, PascalCase components, kebab-case CSS classes.
- **No direct fetch**: Always go through a service file.
- **No new contexts**: Use AppContext or pass props.
- **Height containment**: Pages use `h-full overflow-hidden` on root, `flex-1 min-h-0 overflow-y-auto` on scrollable inner div.

---

## 9. Common Gotchas

1. **`surface-*` opacity tricks don't work** — the colours are too close. Use solid token classes (`bg-surface-high`, not `bg-surface-low/80`).
2. **`h-full` without `min-h-0` on flex children** will cause vertical overflow. Always pair with `min-h-0`.
3. **`getMergedSchedule` must be the only place** that merges static + dynamic timetable. Don't replicate this logic in components.
4. **`toTitleCase`** is defined locally in `AdminTimetable.jsx` — it should be moved to `utils/`.
5. **`getShortDept`** is defined locally in `AdminTimetable.jsx` — it should be moved to `utils/`.
6. **`getDatesOfWeek`** is duplicated between `Timetable.jsx` and `AdminTimetable.jsx` — should be in `utils/dateHelpers.js`.
7. **`getInitialDate`** (next weekday logic) is duplicated in `AppContext.jsx` (`initialDay`) and `MobileBooking.jsx` (`getInitialDate`).
