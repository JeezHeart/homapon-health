# Capstone System — AI-Powered Child Immunization (Brgy. Homapon)

Phases 0–3 built (frontend + API/Supabase + Auth/audit); Phases 4–7 not started.
Full requirements: `prd.md`. Capstone paper: ask the team for the latest `.docx`.

## Folders

| Folder | What lives there | Run from here |
|---|---|---|
| `frontend/` | React + TypeScript + Tailwind + Vite app (`src/`, `public/`, `index.html`, configs) | `cd frontend` then `npm run dev` |
| `backend/` | Express API (`src/`) + Supabase SQL (`supabase/schema.sql`, `rls.sql`, `seed.sql`, `staff-check.sql`) | `cd backend`, copy `.env.example` to `.env`, then `node src/index.js` |
| `docs/` | Orchestration/setup notes | — |
| Root | `prd.md` (spec), `AGENTS.md` (agent rules), this README | — |

## Commands

```powershell
cd frontend
npm install      # first time only
npm run dev      # dev server → http://localhost:5173/
npm run lint
npx tsc -b --noEmit
npm run build
```

```powershell
cd backend
npm install      # first time only
node src/index.js  # API → http://localhost:3001/api/health
```

## Rules that matter

- Fictional demo data only. Never real child data, never secrets in code.
- SMS delivery requires explicit live configuration and authorization. Experimental record review makes no clinical or accuracy claim.
- Login is real email+password (Supabase Auth) when API configured, else demo name+role.
