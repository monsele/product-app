---
story_id: ST-001
title: "Bootstrap the TypeScript Monorepo and Engineering Tooling"
phase: "00 \u2014 Foundation"
status: Done
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US2", "E21-US3"]
depends_on: []
---

# ST-001 — Bootstrap the TypeScript Monorepo and Engineering Tooling

## Story

As the engineering team, we need a reproducible monorepo and quality gates so every later story is implemented against the same conventions.

## Outcome

A clean repository builds locally and in CI, exposes placeholder applications, and supplies the commands every coding agent must run.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US2, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- None. This is a starting story.

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create a pnpm workspace with Turborepo.
- [ ] Create `apps/web`, `apps/api`, `apps/pipeline-worker`, and `apps/renderer`.
- [ ] Create `services/ingestion` as a Python service placeholder.
- [ ] Create packages for schemas, database, jobs, storage, observability, design system, and test fixtures.
- [ ] Configure strict TypeScript, linting, formatting, Vitest, and a basic Playwright project.
- [ ] Add Docker Compose services for PostgreSQL and Redis.
- [ ] Add CI jobs for install, lint, typecheck, unit tests, and build.
- [ ] Add health endpoints or commands for each runnable application.

## Technical Implementation Requirements

- Use TypeScript as the default language for web, API, AI workers, and renderer; Python is reserved for Docling ingestion.
- Enable `strict`, `noImplicitAny`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Keep applications independently deployable while sharing workspace packages.
- Provide `.env.example` files without secrets and a central environment validation package.
- Define root scripts: `lint`, `typecheck`, `test`, `build`, `dev`, and `ci`.
- Add repository-level `AGENTS.md` from this story pack.

## Contracts and Persistence

- No product schemas are introduced in this story.
- Package boundaries and import aliases are treated as the first architectural contract.

## Interfaces

- Web health page.
- API `GET /health`.
- Worker startup/health commands.
- Docker Compose PostgreSQL and Redis connectivity.

## Acceptance Criteria

- [ ] A fresh clone can install dependencies and run all root quality commands.
- [ ] CI runs the same quality commands and succeeds.
- [ ] All placeholder applications build without implementing product features.
- [ ] The Python service has a documented local environment and a health check.
- [ ] No authentication, database domain tables, AI calls, Docling parsing, or Remotion scenes are implemented.

## Required Tests

- [ ] CI smoke test.
- [ ] Workspace package import smoke test.
- [ ] Environment validation tests.
- [ ] Docker Compose health checks.

## Out of Scope

- Any MVP feature behavior.
- Choosing paid providers.
- Production cloud infrastructure.

## Story-Specific Notes

- Record any departure from the recommended repository structure in an ADR.

## Implementation Checklist

- [ ] Inspect the current repository and related completed stories.
- [ ] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [ ] Implement only this story's scope.
- [ ] Add or update schemas before changing consumers.
- [ ] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [ ] Add structured logs, correlation, audit, and usage records where applicable.
- [ ] Run the required automated tests and affected workspace quality commands.
- [ ] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [ ] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [ ] Every acceptance criterion is implemented and verified.
- [ ] Every required test is implemented and passing.
- [ ] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [ ] Database migrations and compatibility notes are complete where applicable.
- [ ] Public schemas, events, and endpoints are documented.
- [ ] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [ ] No out-of-scope feature or unrelated refactor was added.
- [ ] The Dev Agent Record is complete.
- [ ] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-07 12:01 +01:00
- **Completed:** 2026-08-07 12:14 +01:00
- **Branch/PR:** Not created; the supplied workspace is not a Git worktree.
- **Files changed:** Root pnpm/Turbo, TypeScript, ESLint, Prettier, Compose, and CI configuration; all four app placeholders; the config, schemas, database, jobs, storage, observability, design-system, and test-fixtures packages; Python ingestion placeholder; Playwright smoke placeholder; workspace lockfile.
- **Migrations:** None.
- **Contracts changed:** Package names/import boundaries and the validated `@avlp/config` environment boundary. Product schemas are intentionally deferred to ST-002 and later stories.
- **Commands/tests run:** `pnpm install`; `pnpm format:check`; `pnpm run ci` (lint, typecheck, Vitest, and build all passed); worker and renderer health commands; API `GET /health`; `docker compose config --quiet`.
- **Screenshots or representative output:** API health returned `{"status":"ok","service":"api"}`; both worker health commands returned `{"status":"ok",...}`.
- **Decisions and assumptions:** Used pnpm 10 and Turborepo, Next.js for the web placeholder, and NestJS with Fastify for the API, per ADR-001. Empty placeholder packages explicitly allow a zero-test result while environment and workspace-import smoke tests run in Vitest.
- **Deviations from story/technical guide:** No architecture deviation. The local Docker daemon and Python runtime were unavailable, so Compose runtime health checks and the Python endpoint could not be executed locally; CI contains the Compose health job.
- **Known risks or follow-up:** Start Docker Desktop and install Python before relying on local Compose/ingestion health verification. Next.js emits a non-blocking warning that its ESLint plugin is not configured; add it when web-specific lint rules are introduced.
- **Review follow-up (2026-08-07):** Corrected the CI invocation to `pnpm run ci`, configured Playwright to manage the web placeholder server, enabled the web-health smoke test, and added browser installation plus the smoke test to CI. Verified with `pnpm install --frozen-lockfile`, `pnpm run ci`, `CI=true pnpm exec playwright test`, `pnpm format:check`, and `docker compose up -d --wait` (PostgreSQL and Redis healthy; containers then removed with `docker compose down -v`).
