# CRAS: Campus Room Allocation System

A premium, modern room booking platform for campuses, featuring real-time availability tracking, atomic booking transactions, and a glassmorphism dark-themed UI.

## 📁 Project Structure

The codebase is organized into a clean mono-repo style structure, now fully unified under ES Modules (ESM):

```text
room-all/
├── backend/            # Express.js server & PostgreSQL logic (ESM)
│   ├── src/            # server.js, seed.js, unseed.js
│   ├── sql/            # schema_v2.sql (Source of Truth)
│   └── package.json    # Modernized for "type": "module"
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

3. **Development Mode**:
   Start both the backend and frontend simultaneously from the root with hot-reloading:
   ```bash
   npm run dev
   ```
   - **Frontend**: `http://localhost:5173`
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
- **🔐 Robust Auth**: JWT-based authentication with a secure Signup/Login flow.
- **🔍 Searchable Picker**: Debounced (300ms) room search in the booking modal.
- **📅 Visual Calendar**: Real-time room schedule with "Booked by" owner visibility.
- **📜 Booking History**: Unified view of all reservations with direct cancellation.
- **🛡️ Secure Transactions**: PostgreSQL atomic operations to prevent double-booking.

## 🛠️ Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Lucide Icons.
- **Backend**: Node.js (ESM), Express, JSONWebToken, Bcrypt.
- **Database**: PostgreSQL (Dockerized).
