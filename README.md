# CRAS: Campus Room Allocation System

A premium, modern room booking platform for campuses, featuring real-time availability tracking, atomic booking transactions, and a glassmorphism dark-themed UI.

## 📁 Project Structure

The codebase is organized into a clean mono-repo style structure:

```text
room-all/
├── backend/            # Express.js server & PostgreSQL logic
│   ├── src/            # server.cjs, seed.cjs, unseed.cjs
│   ├── sql/            # schema_v2.sql (Source of Truth)
│   └── package.json    # Features nodemon for auto-reload
├── frontend/           # React + Vite application
│   ├── src/            # App.jsx, components/, index.css
│   └── package.json    # Vite configuration
├── docs/               # Technical requirements and PRD
├── docker-compose.yml  # PostgreSQL database container config
└── package.json        # Root-level orchestration scripts
```

## 🚀 Getting Started

### Prerequisites

- **Node.js**: (v18+)
- **Docker & Docker Compose**: For the database.

### Setup & Installation

1. **Install Dependencies**:
   Run this from the root folder to install all packages for both frontend and backend:
   ```bash
   npm run install:all
   ```

2. **Start the Database**:
   ```bash
   docker-compose up -d
   ```

3. **Run the Application**:
   Start both the backend and frontend simultaneously from the root:
   ```bash
   npm run dev
   ```
   - **Frontend**: `http://localhost:5173`
   - **Backend**: `http://localhost:4000`

## ✨ Core Features

- **🔐 Robust Auth**: JWT-based authentication with a secure Signup/Login flow.
- **🔍 Searchable Picker**: Debounced (300ms) room search in the booking modal.
- **📅 Visual Calendar**: Real-time room schedule with "Booked by" owner visibility.
- **📜 Booking History**: Unified view of all past and upcoming reservations with direct cancellation.
- **🛡️ Secure Transactions**: PostgreSQL atomic operations to prevent double-booking.
- **🎨 Premium UI**: Modern dark theme using Tailwind CSS and glassmorphism effects.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js, Express, JSONWebToken, Bcrypt.
- **Database**: PostgreSQL (Dockerized).
