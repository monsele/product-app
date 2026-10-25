---
story_id: ST-124
title: Interpret design guides and creative philosophy
phase: "13"
status: In Review
depends_on: [ST-123]
epics: [E11, E13, E21]
---

# ST-124 - Interpret design guides and creative philosophy

Implement step 3 of docs/bring-your-own-design-system.md under ADR-017 after
ST-123 is Done. Add explicit, quota-checked, metered interpretation jobs for
validated guides/tokens/references and plain language. Return reviewable draft
proposals tied to their input revision, supplied-versus-inferred provenance,
conflicts and capability reports. Imported text is untrusted data. Preserve
exact locks and approved educational content. Pass approved principles to visual
and illustration planning without arbitrary code or geometry.

Acceptance: formal-guide and inspiration-only paths, conflicting/unsupported
requirements surfaced, locked-rule protection, stale result rejection,
paid-call idempotency/retries/usage, cross-owner rejection, prompt evaluation
fixtures and all affected checks. Unsupported locks must block application.

Out of scope: live integrations, moving proofs, project application.

## Dev Agent Record

Implemented on `story/st-124-design-system-interpretation`, 2026-10-19. ST-123
was Done before work began. The separately authorized FX-001 index entry was
preserved. Plan: shared contracts and receipts first; owner-scoped queue/status/
accept APIs; bounded worker interpretation and metering; existing-screen review
UI; explicit approved guidance inputs for planners; security, concurrency,
failure, prompt-fixture and browser verification.

### Result

- Formal-guide input supports validated Markdown, bounded PDF text and token
  JSON. Inspiration can start from a description alone or up to four validated,
  downscaled private reference images. Inputs pin the saved revision and hashes.
- Proposals show supplied versus inferred provenance, exact source quotations,
  conflicts, unsupported requirements and capability reports. Existing rules,
  philosophy and all exact presentation controls survive interpretation.
- Explicit acceptance saves a new design-system draft revision exactly once.
  It requires successful job completion and rejects stale/archived revisions.
  Unsupported free-text locks remain blocking in the existing custom compiler.
- Paid authorization is explicit. Owner-wide reservations serialize concurrent
  quota checks; workers recheck the existing generation quotas and approved
  provider/model. Conditional dispatch and durable response receipts prevent
  duplicate paid calls. Actual and failed/unconfirmed usage is recorded.
- Only explicit rate-limit rejections retry dispatch. Ambiguous dispatches stop
  automatic retries, retain conservative usage and require billing reconciliation.
  Confirmed output survives finalization retries without another provider call.
- My Design Systems exposes request/history/status/review/acceptance and keeps
  unsaved edits protected. Interpretation mutations disable surrounding edits.
- Published, owner-scoped immutable principles/references can enter visual-plan@v2
  and illustration jobs through explicit version pins. Educational content,
  deterministic composition eligibility and motion validation are preserved.
  Attaching those pins to a project is deliberately ST-125's application step.

### Files changed

- Shared contracts: `packages/schemas/src/design-system-interpretation.ts`, its
  tests and `index.ts`; optional approved version pin in `creative-design-v2.ts`.
- Persistence: `packages/database/src/design-system-tables.ts`, migration 0080,
  compatibility note and migration journal.
- API: `apps/api/src/design-systems.ts`, `app.ts` and the real-PostgreSQL/HTTP
  design-system integration suite.
- Worker: `design-system-interpretation-job.ts`, `design-system-guidance.ts`,
  interpretation integration tests, PDF contract/isolation/parser, runtime
  registration, visual-plan handler/tests and illustration generation handler.
- Providers: narrow private-reference request support, operation envelope,
  redacted response logging, mock routing, interpretation@v1 and visual-plan@v2
  prompts, registry, prompt evaluation fixtures and Together adapter tests.
- UI: `interpretation-panel.tsx`, existing `systems-editor.tsx` and
  `systems.module.css`; `e2e/design-systems.spec.ts` and desktop/phone captures
  at `output/playwright/st124-interpretation-{1440,390}.png`.
- Dependency/runtime: worker `package.json`, root `package.json`, lockfile.
  PDF.js is pinned to 6.4.299; minimum Node is now 22.13.
- Documentation: `docs/design-system-interpretation.md`, ADR-017 implementation
  note, design-system delivery status, this record and `STORY_INDEX.md`.

### Migrations and public contracts

- `0080_design_system_interpretations`: additive owner-scoped input/dispatch/
  result records. No backfill or historical artifact mutation. Executed in
  isolated PostgreSQL test databases; apply it through normal deployment before
  using these routes in the running application.
- New strict request/input/output/proposal/status/history contracts at 1.0.
  Existing definitions 1.0/1.1, LessonSpec, NormalizedDocument and manifest
  releases are unchanged. New routes are documented in
  `docs/design-system-interpretation.md`.
- New `design-system.interpret` payload v1, metered as `ai.creative_design`.
  Approved design version pins and visual-plan@v2 are additive. Unpinned jobs
  retain their existing behavior. No project-application endpoint is introduced.

### Verification

- `pnpm --filter @avlp/schemas test`: 577 tests passed.
- `pnpm --filter @avlp/provider-adapters test`: 92 tests passed, including seven
  executable interpretation prompt fixtures and multimodal/log-redaction checks.
- API design-system PostgreSQL/authenticated-HTTP suite: nine tests passed.
- Pipeline suites for interpretation, import validation, visual planning and
  cinema illustration: 50 tests passed against real PostgreSQL with one test
  worker. The initial overloaded parallel run hit existing hook/parser deadlines;
  the serial run passed without changing production parser deadlines.
- `pnpm typecheck`: all sixteen packages passed. Later changed worker files also
  passed scoped typecheck; the final web production build passed its type check.
- `pnpm lint`: all sixteen packages passed; final worker/web scoped lint passed
  after the last affected edits.
- API, worker and their dependency builds passed through Turbo. The final
  `pnpm --filter @avlp/web build` passed, including production route generation.
  A browser/Node timer overload mismatch found by the first web build was fixed
  with an explicit browser timer handle. Existing Next ESLint-plugin warning
  remains non-blocking.
- `pnpm exec playwright test --config playwright.design-systems.config.ts`:
  all three browser flows passed on the final source. Desktop (1440) and phone
  (390) interpretation screenshots were reviewed; citations remain readable and
  neither viewport overflows horizontally. Existing manual editing, keyboard
  focus, revision recovery and failure states still pass.
- The serial worker command uses `--no-file-parallelism --maxWorkers 1
  --hookTimeout 60000 --testTimeout 30000`. It covers interpretation, import
  validation, visual-plan unit/integration and cinema illustration integration
  suites. A separate cold parser run during browser compilation also exceeded
  the production five-second limit; the final serial run passed all fifty tests
  after browser work ended. The actual parser deadline was preserved.
- `git -c core.whitespace=cr-at-eol diff --check` passed. Existing CRLF source
  formatting was preserved. Next-generated config and ST-123 captures were
  restored after testing; only ST-124 captures are included.

### Decisions, deviations and risks

- No paid provider calls were made. Prompt fixtures and adapter transport tests
  establish deterministic boundaries, not a live model quality score. A creator
  still reviews every proposal before accepting it.
- PDF text extraction follows the isolated parser boundary. It adds a bounded
  256 MB old-space budget for interpretation; ordinary import validation stays
  at 128 MB. Both keep the five-second deadline. Scanned PDFs require readable
  text or a description; OCR is not claimed.
- The existing $1.08 conservative approval estimate is reused with an 8,000-token
  output limit. Unknown dispatch reservations need operator/provider billing
  reconciliation; automatic retry would risk a duplicate charge.
- ST-125 owns project application, proof generation, final manifest pinning and
  guidance-aware illustration request identity. This increment provides explicit
  planning inputs without attaching systems to existing videos.
- No scope deviation; the isolation/runtime and dispatch decisions are recorded
  in ADR-017. No follow-on story was started.
