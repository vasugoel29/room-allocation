# CRAS: Campus Room Allocation System

A premium, modern room booking platform for campuses, featuring real-time availability tracking, atomic booking transactions, and a glassmorphism dark-themed UI.

## 📁 Project Structure

The codebase is organized into a clean mono-repo style structure, now fully unified under ES Modules (ESM):

```text
room-all/
├── backend/            # Express.js server & PostgreSQL logic (ESM)
│   ├── src/            # server.js; db.js holds the baseline schema and every migration
│   ├── seed/           # deterministic seeder: rooms + faculty directory (+ demo timetable)
│   └── package.json    # Modernized for "type": "module"
├── shared/             # rules both apps import: timetable times, IST dates, booking hours (no deps)
├── frontend/           # React + Vite application (ESM)
│   ├── src/            # App.jsx, components/, index.css
│   └── package.json    # Vite & ESLint configuration
├── docker-compose.yml  # PostgreSQL database container config
└── package.json        # Root-level orchestration & build scripts
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: (v20+)
- **Docker & Docker Compose**: For the database.

### Setup & Installation (new machine)

1. **Get the code** — all current work is on the `testing` branch:
   ```bash
   git clone <repo-url> && cd room-allocation && git checkout testing
   ```
2. **Install dependencies** (from the root):
   ```bash
   npm run install:all
   ```
3. **Start PostgreSQL**:
   ```bash
   docker compose up -d
   ```
4. **Create the env files** (they are not in git): `cp backend/.env.example backend/.env` and
   `cp frontend/.env.example frontend/.env`, then for local development set:
   - `backend/.env`: `DATABASE_URL=postgresql://roomuser:roompass@localhost:5432/roomdb`,
     `JWT_SECRET=<32+ random chars>`, `ACL_CLIENT_SECRET=<from the ACL team>`, `AUTH_DEV_LOGIN=true`,
     `CORS_ORIGIN=http://localhost:5173`, `APP_URL=http://localhost:5173`. Leave `NODE_ENV` out (`npm run dev` sets it).
   - `frontend/.env`: `VITE_DEV_LOGIN=true`.
   **Offline (no live ACL):** instead of `ACL_CLIENT_SECRET`, set `ACL_MODE=mock` and `ACL_MOCK_SOURCE=personas` in
   `backend/.env`. Developer sign-in then accepts four fixed personas, each with its role's suggested permissions:
   `dev.admin@nsut.ac.in`, `abhinav.tomar@nsut.ac.in` (faculty), `dev.rep@nsut.ac.in` and `dev.student@nsut.ac.in`
   (the students are in the demo timetable's section, so seed with `--demo-timetable`). Refused in production.
5. **Create the database, migrate and seed** (the seeder applies every migration first; safe to re-run):
   ```bash
   npm run db:create --prefix backend
   npm run seed                                   # 130 rooms + 231 faculty
   npm run seed --prefix backend -- --demo-timetable   # optional: two demo section timetables
   ```
   No people are seeded: you appear on your first sign-in, and only if the college ACL grants
   your email CRAS permissions (see RUNBOOK §9). The real timetable comes through the admin import.
6. **Run**:
   ```bash
   npm run dev
   ```
   - **Frontend**: `http://localhost:5173` (developer sign-in with your @nsut.ac.in email)
   - **Backend**: `http://localhost:4000`

### 🏗️ Verification & Building

The root repository includes a unified pipeline for quality control and deployment:

- **Full Verification**: Run linter, tests, and build in one go:
  ```bash
   npm run build
  ```
- **Linting**:
  ```bash
  npm run lint
  ```
- **Testing**:
  ```bash
  npm run test
  ```

## 🌍 Free Deployment

CRAS is architected to be deployed entirely for free using generous cloud tiers:
- **Database**: [Neon.tech](https://neon.tech/) (Free Serverless PostgreSQL)
- **Backend API**: [Render.com](https://render.com/) (Free Node Web Service)
- **Frontend App**: [Vercel](https://vercel.com/) (Free Static Hosting)

Please see the [Deployment Guide](./deployment_guide.md) for step-by-step instructions on hooking these services up securely.

## ✨ Core Features

- **🎨 Premium UI**: Modern dark theme using Tailwind CSS, glassmorphism, and **buttery smooth transitions**.
- **📱 Mobile Optimized**: High-performance responsive layouts, including a 2-column Day view and GPU-accelerated navigation.
- **🔐 Auth**: Google SSO (or developer sign-in locally); identity, roles and permissions come from the college ACL.
- **🔍 Searchable Picker**: Debounced (300ms) room search in the booking modal.
- **📅 Visual Calendar**: Real-time room schedule with "Booked by" owner visibility.
- **📜 Booking History**: Unified view of all reservations with direct cancellation.
- **🛡️ Secure Transactions**: PostgreSQL atomic operations to prevent double-booking.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js (ESM), Express, JSONWebToken, Bcrypt.
- **Database**: PostgreSQL (Dockerized).
