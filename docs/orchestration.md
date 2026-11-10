# Orchestration setup — Phase 0 report (candidate comparison + selected solution)

Date: 2026-10-13. Scope: Phase 0 only. No capstone feature code changed.

## 1. Environment / repository summary

- Working dir: `C:\Users\geheart\OneDrive\Desktop\dev\capstone-system` (git `main`, clean, synced with `origin/main`).
- Commits: `1f98a3b` frontend phase + `4d55611` initial. No uncommitted changes before setup.
- Stack (confirmed from `package.json` / `vite.config.ts` / `src/`): React 19 + TypeScript ~6 + Tailwind 4 + Vite 8 + react-router-dom 7. No Supabase/Postgres/Docker/Vercel/Semaphore code in the repo — matches prd.md frontend-only phase.
- OpenCode: v2.0.26. Node v24.20.0, npm 11.19.0. Auth: OpenCode Console (stored). No secrets printed.
- Existing orchestration: global `~/.config/opencode/opencode.json` already contains plugin `opencode-orchestrator` 2.0.9 (verified via `opencode plugin list`). Project `.opencode/` exists but was empty. No `AGENTS.md` / `opencode.json` / skills / agent defs in the project before setup. One custom subagent exists globally (`code-reviewer.md`, read-only reviewer with React/Tailwind/Supabase/Vercel rules).

## 2. Candidate comparison (official sources checked 2026-10-13)

### A. Oh My OpenAgent → now OmO — REJECT
- Source: https://github.com/code-yeongyu/oh-my-openagent (redirects conceptually to OmO; README: "OmO 5.0: OmO ❤️ Pi", install `curl -fsSL https://get.omo.dev/install.sh | bash`, docs at https://omo.dev/docs, migration guide `docs/guide/migrating-from-opencode.md`).
- Status: very active (~70k stars, ~5.8k forks, ~21k commits, `dev` branch). But it is **no longer an OpenCode orchestrator plugin** — it is a standalone `omo` agent runtime (fork of pi/senpi) that *replaces* OpenCode.
- License: Sustainable Use License (SUL) 1.0 — internal/non-commercial only, not an OSI open-source license.
- Workflow fit: `ultrawork`/`mass ulw` graph + parallel Team Mode + memory system. Powerful but token-heavy and designed to take over the session, conflicting with the PRD's "minimize model calls / smallest agent set" rule.
- Install/removal: new binary into `~/.local/bin` (+ PATH work on Windows), `omo setup` migration, `rm` to remove. Higher disruption than a plugin.
- Verdict: wrong category + restrictive license + heaviest token/complexity cost. Do not install.

### B. OpenCode Agent Orchestration Kit (OAK) — RUNNER-UP, not installed
- Source: https://github.com/jcarlosrodicio/opencode-agent-orchestration-kit (Apache-2.0, ~133 stars, ~10 forks, ~125 commits, `master` branch, CI badge, `compatibility.json`, `install.sh`/`upgrade.sh`/`doctor.sh`/`rollback.sh`/`uninstall.sh`, `oak`/`oc-switch` CLIs via npm).
- Compatibility: OpenCode 1 supported (`>=1.14.41 <2.0.0`); OpenCode 2 **experimental** (`>=2.0.18 <3.0.0`). Current env is OpenCode v2.0.26 → OAK would run experimental. Requires Git + Bash + Node `^22.9 || ^24` + npm + `opencode auth login` (we satisfy Node 24 + Git + auth; Bash exists via `C:\Windows\system32\bash.exe` but WSL backend is broken, so shell-script install is risky on this machine).
- Model support: model-agnostic with per-role `OPENCODE_*_MODEL` overrides — good.
- Workflow: best-structured option — `lead` router + `researcher`/`specifier`/`designer`/`developer`/`reviewer` (+ optional `scoper`/`evaluator`/`debugger`/`evolver`), `/feature`/`/plan`/`/scope`/`/loop`/`/autonomous` with durable JSON state, locks, contract hashing, approval gates, small-gate fast path, adversarial fixtures, `oak check`/`oak doctor` validation. Token control is good (bounded 1–6 iterations).
- Isolation/safety: ownership manifest (`.oak/manifest.json`), dry-run installs, rollback generation, supply-chain pins — good.
- Cost: medium install complexity (clone → `cp env.example .env` → `npm ci` in `opencode/` → `OPENCODE_CONFIG_DIR` override or `./install.sh`), plus a whole harness to learn/maintain. Overlaps the already-installed orchestrator below.
- Verdict: strongest conceptual fit for full-stack rigor, but redundant here + experimental on OpenCode 2 + heavier than needed for a frontend-first student project. Do not install now; reconsider only if the 4-role runtime below proves insufficient for Phases 2–7.

### C. Multi-Agent Orchestrator — REJECT
- Source: https://github.com/kevinkicho/multi-agent-orchestrator (MIT, `private:true`, 0 stars / 0 forks, ~104 commits, `main` branch).
- What it is: **not an OpenCode plugin** — a separate Bun+TypeScript app that spawns multiple `opencode serve` workers on random ports (10000–60000) plus per-project LLM supervisors/brain/team-manager and a web dashboard on `:15828`.
- Requires: Bun ≥1.0, Ollama (default `glm-5.1:cloud`) or cloud keys (`OPENCODE_GO_API_KEY`, OpenAI/Anthropic/…), `bun install` (pulls `opencode-ai` npm dep), `.env` secrets, provider enablement in dashboard. Windows notes mention credential-helper hangs.
- Workflow: Socratic `@worker:`/`@done:` supervision loops (up to 30 rounds/cycle), team hiring/dissolution, event bus, file locks, `agent/<name>` branch isolation, prompt ledger, analytics. Autonomous and token-heavy by design (continuous 30s cycles) — opposite of the PRD's low-waste rule.
- Verdict: unproven, excessive (multi-project autonomous factory with its own server fleet) for a single frontend-first capstone. Do not install.

## 3. Selected solution + rationale

**Keep the already-installed `opencode-orchestrator` plugin (agnusdei1207, MIT, v2.0.9) as the primary orchestrator. Install nothing else.**

- Docs: https://github.com/agnusdei1207/opencode-orchestrator and npm `opencode-orchestrator` (installed version 2.0.9; README notes 2.0.15 latest — no upgrade performed in Phase 0).
- Why: OpenCode-2-native plugin (`opencode plugin add/list/remove`), already working with OpenCode v2.0.26 + Node 24.20, zero new dependencies, zero global changes, provider-agnostic (uses existing OpenCode auth), Commander/Planner/Worker/Reviewer maps exactly to the PRD's "one lead + small reusable specialists" model, `/task` + `/plan` + `/stop` with persisted mission state in `.opencode/`, concurrency/token controls via options schema, secret redaction + verification via Reviewer. Small questions bypass roles (low waste). Removal is one command.
- Trade-off accepted: smaller workflow surface than OAK (no researcher/specifier/designer splits, no durable JSON contracts) — acceptable because the PRD's roles B–K are mapped logically (see `AGENTS.md`) rather than run as persistent agents, and OAK remains a documented fallback.

## 4. Roles configured (consolidated, not 11 persistent agents)

Runtime (provided by plugin): Commander = lead/orchestrator, Planner = planning assist, Worker = scoped implementation, Reviewer = independent verification.
Logical PRD coverage A–K is mapped in `AGENTS.md` (e.g., domain/SMS/AI/backend run as scoped Worker tasks with Reviewer passes; AI role stays dormant until data + approval exist). No parallel same-file edits without Commander handoff.

## 5. Files added / modified (Phase 0)

- Added `AGENTS.md` — operating rules, role mapping, frontend-first guardrail, architecture notes, verification commands.
- Added `docs/orchestration.md` — this file (comparison + decision record).
- Modified: nothing else. No `src/`, `package.json`, configs, or global `~/.config/opencode/opencode.json` touched.

## 6. Commands run + results

- `git status --short --branch` + `git log --oneline -5` — clean tree on `main`, synced with origin; 2 commits.
- `opencode --version` — v2.0.26. `node --version` v24.20.0 / `npm --version` 11.19.0.
- `opencode plugin list` — `opencode-orchestrator 2.0.9` present.
- `opencode auth list` — OpenCode Console stored (no secrets shown).
- `npm install` (earlier session, required because `vite` was missing) — 48 packages, 0 vulnerabilities.
- `npm run dev` — Vite v8.3.4 ready on http://localhost:5173/ (background shell).
- Verification (after adding docs): `npm run lint` clean, `npx tsc -b --noEmit` pass, `npm run build` pass (49 modules, dist built in ~312ms).

## 7. Verification + failures

- Candidate URLs fetched from official GitHub sources (see §2 links); no install commands invented or run for A/B/C.
- `tools.list_agents` confirms Commander/Planner/Worker/Reviewer available; `tools.list_background`/`list_tasks` empty (no stray missions).
- Failing pre-existing item: none in repo code. `bash --version` fails on this Windows box (WSL disk attach error) — one reason OAK's `install.sh`/`doctor.sh` path was avoided.
- Post-setup checks to run: lint + type-check + build; `git status` must show only `AGENTS.md` + `docs/orchestration.md` as new.

## 8. Remaining manual steps / limitations / costs

- None required to use the orchestrator: in OpenCode select **Commander** and send `/task "…"` or `/plan "…"`. Keep missions small and file ownership explicit.
- Optional (not done): `opencode plugin update` to 2.0.15+, setting `agentConcurrency: { worker: 2 }` in `opencode.jsonc` to cap parallel spend, adding `docs/DECISIONS.md` per mission. Ask before any global/plugin change.
- Limitations: plugin has no built-in researcher/specifier/designer splits (use Planner/Worker + Reviewer instead); mission state is local `.opencode/` (commit only intentional files, never secrets); AI/SMS/backend roles are logical until their phases are authorized.
- Cost/token: default direct handling for small work; invoke Planner/Worker/Reviewer only when justified; prefer `/plan` before large `/task`.

## 9. Rollback

- Delete the two added files: `AGENTS.md`, `docs/orchestration.md` (and remove `docs/` if left empty).
- If a mission was started: `/stop`, then delete its `.opencode/` mission state (keep the directory itself).
- If the plugin must go: `opencode plugin remove opencode-orchestrator` (global change — ask first).
- Verify: `git status` clean, `opencode plugin list` reflects desired state, `npm run lint && npx tsc -b --noEmit` pass.

## 10. Confirmation

No capstone feature code was changed in Phase 0 — only `AGENTS.md` + this decision record. Next step (Phase 1 frontend) starts only on explicit user authorization.
