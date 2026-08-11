# Optimal Classroom Allocation System

An automated system that allocates classrooms to courses, groups, and lecturers
by optimizing room capacity, facilities, and time-slot constraints while
detecting scheduling conflicts.

## Features

- **Dashboard** – utilization, success rate, capacity efficiency, notifications
- **Classrooms** – rooms with building, floor, capacity, type, facilities, status
- **Courses** – courses tied to departments, lecturers, semesters & requirements
- **Lecturers** – staff records with departments and contact details
- **Student Groups** – groups linked to courses, lecturers, and headcounts
- **Allocations** – run the optimization algorithm, then approve/reject proposals
- **Conflicts** – auto-detected scheduling conflicts with severity levels
- **Timetable** – visual weekly grid filtered by semester/room/department
- **Analytics** – utilization, building & department demand, peak periods
- **Reports** – CSV exports (utilization, conflicts, timetables, and more)
- **Users & Roles** – `SUPER_ADMIN`, `ADMIN`, `HOD`, `LECTURER`, `VIEWER`
- **Audit Logs** – full action history for admins

## Tech Stack

| Layer    | Technology                                        |
| -------- | ------------------------------------------------- |
| Frontend | React 18, TypeScript, Vite, React Router          |
| Backend  | Node.js 22+, Express, TypeScript                  |
| Database | SQLite (file-based, auto-migrated & seeded)       |
| Auth     | JWT (8h expiry) + bcrypt password hashing         |
| Validation | Zod                                            |

## Project Structure

```
├── backend/        # Express REST API + SQLite
│   └── src/
│       ├── db/         # schema, migrations, seed data
│       ├── controllers # request handlers
│       ├── services    # business logic + allocation algorithm
│       ├── repositories# data access
│       └── routes/     # API routes
├── frontend/       # React SPA (Vite)
│   └── src/
│       ├── pages/      # dashboard, classrooms, timetable, etc.
│       ├── components/ # layout, shared UI
│       └── api/        # API client + auth context
└── docs/           # project documentation / evidence
```

## Requirements

- **Node.js >= 22.5.0**
- **npm**

## Getting Started (local development)

1. Clone the repository:

   ```bash
   git clone https://github.com/odarko7/Classroom-Allocation-System.git
   cd Classroom-Allocation-System
   ```

2. Install dependencies:

   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Configure the backend environment:

   ```bash
   cd ../backend
   cp .env.example .env
   ```

   Edit `.env` and set a strong `JWT_SECRET`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

4. Start the API (migrations and demo seed run automatically):

   ```bash
   npm run dev        # http://localhost:4000/api
   ```

5. Start the frontend in a second terminal:

   ```bash
   cd ../frontend
   npm run dev        # http://localhost:5173
   ```

6. Open **http://localhost:5173** and sign in (see demo accounts below).

### Demo Account

| Role           | Email                 | Password     |
| -------------- | --------------------- | ------------ |
| Super Admin    | `admin@example.com`   | `Admin@123`  |

## Scripts

### Backend (`backend/`)

| Script              | Description                                  |
| ------------------- | -------------------------------------------- |
| `npm run dev`       | Run the API with auto-reload                 |
| `npm start`         | Run the API in production                    |
| `npm run typecheck` | Type-check the code                          |
| `npm run db:init`   | Initialise the database schema               |
| `npm run db:seed`   | Seed demo data                               |
| `npm test`          | Run the test suite                           |

### Frontend (`frontend/`)

| Script              | Description                    |
| ------------------- | ------------------------------ |
| `npm run dev`       | Vite dev server (port 5173)    |
| `npm run build`     | Type-check + production build  |
| `npm run preview`   | Preview the production build   |
| `npm run typecheck` | Type-check the code            |

## Configuration

Environment variables (`.env` in `backend/`):

| Variable          | Default                              | Description                        |
| ----------------- | ------------------------------------ | ---------------------------------- |
| `PORT`            | `4000`                               | API port                           |
| `NODE_ENV`        | `development`                        | Environment                        |
| `JWT_SECRET`      | *(dev fallback)*                     | Secret used to sign JWT tokens     |
| `JWT_EXPIRES_IN`  | `8h`                                 | Token lifetime                     |
| `DB_PATH`         | `./data/classroom_alloc.db`          | SQLite database file               |
| `SEED_DEMO_DATA`  | `true`                               | Seed demo data on startup          |

## Deployment

The project ships with a multi-stage **Dockerfile**, so it deploys as a single
Node service that serves both the API (`/api`) and the built React frontend.

```bash
# Build the image
docker build -t classroom-allocation .

# Run it (API on PORT, e.g. 4000)
docker run -p 4000:4000 -e PORT=4000 -e JWT_SECRET=change-me classroom-allocation
```

### Deploying to Railway (recommended)

1. Push the repository to GitHub.
2. In Railway: **New Project → Deploy from GitHub** → select the repo.
3. Add the environment variables:
   - `JWT_SECRET` → a long random string
   - `NODE_ENV` → `production`
   - `SEED_DEMO_DATA` → `true`
4. *(Optional)* Add a **volume** mounted at `/app/backend/data` so the SQLite
   database persists across restarts.
5. Open the generated URL and sign in with a demo account.

The same Dockerfile also works on **Render**, **Fly.io**, or any Docker-capable VPS.

## API Overview

Base URL: `/api`

- `GET  /api/health` – health check
- `POST /api/auth/login` – obtain a JWT
- `GET/POST/PUT/DELETE` – `/classrooms`, `/courses`, `/lecturers`,
  `/student-groups`, `/users`, `/allocations`
- `POST /api/allocations/optimize` – run the allocation algorithm
- `GET /api/timetable`, `/api/conflicts`, `/api/reports`, `/api/audit-logs`
- `GET /api/analytics/*` – summary, utilization, buildings, departments,
  time-demand, capacity, conflict-rate
- Supporting: `/semesters`, `/departments`, `/facilities`, `/dashboard`,
  `/notifications`

## License

This project is for academic/educational purposes.
