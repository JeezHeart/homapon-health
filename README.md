# Capstone System — AI-Powered Child Immunization (Barangay Homapon, Legazpi City)

Web-based Child Immunization Health Monitoring and Management System with **iProg SMS** reminders, **WHO LMS child growth monitoring**, and **AI-assisted vaccination date-interval review**.

For your team's Taglish defense walkthrough and debugging map, see [`docs/debugging-guide.md`](docs/debugging-guide.md).

## Folder Structure

| Folder / File | What lives there |
|---|---|
| `frontend/` | React + TypeScript + Tailwind + Vite web app (`src/`, `test/`, `public/`, configs) |
| `backend/` | Express API (`src/`), automated tests (`test/`), and Supabase SQL/migrations (`supabase/`) |
| `docs/` | Defense cheat sheet (`debugging-guide.md`), technical docs (`guides/`), diagrams (`diagrams/{drawio,png,svg}`), and thesis paper/data (`thesis/`) |
| `scripts/` | Staff admin utility (`change-staff-password.cjs`) |
| `prd.md` | Product requirements document |
| `AGENTS.md` | Engineering and safety guidelines for the repository |

## Running Locally

### 1. Backend API (`backend/`)
```powershell
cd backend
npm install        # first time only
# Copy .env.example to .env and configure Supabase / iProg SMS / Groq keys
npm run dev        # starts API server (health check: /api/health)
```

### 2. Frontend App (`frontend/`)
```powershell
cd frontend
npm install        # first time only
# Copy .env.example to .env and configure VITE_API_BASE_URL + Supabase public keys
npm run dev        # starts Vite dev server -> http://localhost:5173/
```

## Verification Commands (from repository root)

```powershell
# Backend tests
npm --prefix backend test

# Frontend lint & TypeScript check
npm --prefix frontend run lint
npx --prefix frontend tsc -p frontend/tsconfig.app.json --noEmit

# Frontend unit tests
Push-Location frontend
node --test --test-concurrency=1 "test/*.test.mjs"
Pop-Location

# Frontend production build
npm --prefix frontend run build
```

## Important Rules

- Use **fictional demo records** only in tests, screenshots, and demonstrations. Never commit secrets or real child/guardian data.
- Keep `SMS_DRY_RUN=true` during demos unless live **iProg SMS** delivery is explicitly authorized.
- AI screening and review guidance provide **decision support only** — never clinical diagnosis.
