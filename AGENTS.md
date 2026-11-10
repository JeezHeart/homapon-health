# AGENTS.md — Child Immunization Capstone

## Project and priorities
- Capstone: AI-Powered Child Immunization Health Monitoring and Management System with SMS Notification, Barangay Homapon, Legazpi City.
- Defense priority: reliability, security, correct records, and a repeatable demonstration. Fix critical issues before adding features.
- Known architecture: React/TypeScript/Vite frontend, Express API, Supabase Auth and PostgreSQL/RLS. Check the current repository before relying on these notes.
- Work with Codex CLI or AGY CLI. Do not require any orchestrator, external agent swarm, or provider-specific commands.

## Before modifying code
- Check `git status` and inspect only the files, callers, and tests relevant to the requested task.
- Confirm actual routes, dependencies, schemas, and behavior instead of guessing from old documents or chat summaries.
- Consult `prd.md` or other specifications only when the task requires requirements context; do not reread every document on every task.
- Define the smallest safe scope and preserve unrelated working code and uncommitted changes.

## Implementation constraints
- Follow existing patterns. Do not rewrite architecture, add dependencies, install tooling, or modify unrelated files without a justified need.
- Keep frontend CRUD/data access routed through the existing protected Express API. Do not introduce direct frontend Supabase table/RPC access.
- Preserve Supabase authentication, server-side token checks, staff authorization, RBAC, RLS, and audit behavior. Never weaken protections to make a feature or test pass.
- Preserve immunization record identity and integrity: do not silently change the child, vaccine, or dose number of an existing dose record.
- Treat vaccine schedules and AI-related indicators as approved, reviewable decision-support information, not diagnosis or invented clinical guidance.
- Treat SMS as a demo unless live delivery is both implemented and explicitly authorized. Do not represent simulations as delivered messages.
- Use fictional records in tests, fixtures, screenshots, and demonstrations. Never expose real child/guardian data, credentials, tokens, or keys in output or commits.
- Keep service-role, SMS, and other secret credentials on the server. Do not place them in client code or logs.
- Ask before destructive operations, production changes, database/schema/RLS migrations, sending real SMS, deployments, or changes that could affect real records.

## Efficient use of AI skills
- For small, clear tasks, work directly; do not require brainstorming, long plans, extra reviewers, worktrees, or subagents.
- Load only relevant skills: e.g. `systematic-debugging` for bugs, `frontend-ui-engineering` for UI, `supabase` for Supabase, and `verification-before-completion` for factual completion claims.
- Use `supabase-postgres-best-practices` when actually changing PostgreSQL objects or RLS. Use other installed skills only when their requirements and tools fit the task.
- Prefer one capable coding agent per task; delegate only if independent work clearly warrants the cost.
- Avoid broad repository dumps, repetitive rereading, and verbose summaries. Do not skip checks needed for safety.

## Verification and reporting
- Reproduce bugs when practical; fix their causes, not just their symptoms. Add or update focused tests when behavior or risk warrants it.
- Run relevant tests, lint, and type checks for affected areas; run wider checks for risky or release-critical changes.
- Review the diff and `git status` after changes. Report commands actually run, their outcomes, edited files, and unresolved risks.
- Never claim a test, build, UI flow, integration, or production action worked without direct evidence.
- Keep responses brief and actionable; do not create documentation or add features outside the task unless requested.
