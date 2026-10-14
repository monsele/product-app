---
story_id: ST-113
title: "Add a Curated Illustration Library as the Picture Fallback"
phase: "11 — Visual Storytelling"
status: Done
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-110", "ST-112"]
---

# ST-113 — Curated Illustration Library Fallback

## Story

As a teacher, I want a scene whose picture could not be generated to still
show a relevant illustration in the video's style, so that a failed or
over-budget picture does not leave the scene with only an abstract motif.

## Background

The plan (docs/cinema-reel.md §3) orders picture sources as source figure →
project asset → generated → library → authored motif. ST-110 found that no
library exists, so the "library" step was skipped: a picture that is over
budget, rejected by moderation or failed on its final attempt becomes an
authored motif (`planCinemaIllustrations`, `createCinemaIllustrationJobHandler`).

This story adds the library as a platform catalogue, in the pattern of the
sound-bed catalogue (`sound_bed_tracks`, `pnpm --filter @avlp/api
sound-beds:register`, ADR-012). An operator prompts pictures into it from an
authored list of common concepts. Teachers' lessons never feed it.

## Outcome

- A platform-owned `illustration_library_entries` table holds approved
  pictures, each keyed by treatment (`flat`, `ink-sketch`, `editorial`),
  surface (light or dark), concept and its illustration key, with alt text,
  checksum, storage key, the prompt and provider used, and a status.
- An operator script generates entries from a checked-in concept list:
  `pnpm --filter @avlp/api illustration-library:generate --list <file>
  [--treatment ...] [--surface ...] [--max <n>] [--dry-run]`. It uses the
  existing image provider and moderation, prices the run before any paid call,
  stops at `--max`, and is idempotent per key. A picture is `active` only after
  moderation passes. `--dry-run` prints the plan and estimated cost only.
- `planCinemaIllustrations` gains the library step: a scene with no own
  picture, no project reuse and no remaining generation budget takes a
  matching library picture before falling back to a motif. The worker does the
  same when a generation is rejected by moderation or fails on its final
  attempt.
- A matched library picture is pinned as the scene's hero with a new origin
  `library`. It is recorded in the draft before preview approval, as ADR-015
  already permits, and copied into the project as a project asset so renders
  and version snapshots resolve it exactly like any other hero.

## Scope

- [x] Migration: `illustration_library_entries`; project-asset origin
      `library` if the asset table needs it. Record the table in the ADR-015
      compatibility notes (this story is the first v2 change that migrates).
- [x] Concept list: `apps/api/illustration-library/concepts.json`, authored,
      reviewed and checked in; no lesson or source text.
- [x] Generation script with pricing, `--max`, `--dry-run`, moderation, retry
      and idempotency; logs spend per run.
- [x] Matching in schemas (pure, deterministic): exact illustration key within
      the same treatment and surface first, then the entry with the highest
      content-word overlap above a fixed threshold; ties by key. No model call.
- [x] Planner and worker fallback as described; `CinemaMotifReason` and the
      one-shot step detail record `library` use and match quality.
- [x] Hero origin `library` accepted by the manifest schema and validator.
      Library pictures never bind to evidence scenes (same rule as generated).

## Acceptance Criteria

- [x] AC1 With an empty library, every existing behaviour and test is
      unchanged.
- [x] AC2 A scene over the picture budget whose concept has an active library
      entry in the video's treatment and surface shows that picture; otherwise
      it shows the authored motif, as today.
- [x] AC3 A moderation rejection or final-attempt failure falls back to a
      matching library picture before the motif; the job still succeeds.
- [x] AC4 A library picture never appears on an evidence (grounding-critical)
      scene, and never on a scene whose art direction excludes people when the
      entry depicts people.
- [x] AC5 The generation script makes no paid call on `--dry-run`, never
      exceeds `--max`, and re-running it on the same list generates nothing new.
- [x] AC6 Library entries are readable by every tenant's render, but no tenant
      data (lesson text, briefs, generated project pictures) is ever written
      into the library.
- [x] AC7 A version that used a library picture re-renders identically after
      the library entry is retired, because the picture was copied into the
      project.

## Required Tests

- [x] Matching unit tests: exact key, overlap threshold, treatment and surface
      isolation, determinism.
- [x] Planner tests: budget exhausted with and without a match; evidence and
      no-people exclusions.
- [x] Worker integration test (Postgres): moderation rejection → library
      picture, metered once.
- [x] Script tests: dry run, max, idempotent re-run.
- [x] Render test: a library hero renders through the normal asset path.

## Out of Scope

- Teachers saving their own pictures to a personal or shared library.
- Promoting pictures generated for lessons into the platform library (their
  briefs derive from tenant content).
- A library management UI; entries are managed by the script and status field.

## Decisions for the product owner

- **Initial size and budget.** Proposed: about 40 common concepts × 3
  treatments × 2 surfaces = 240 pictures, generated in batches with `--max`.
  Price the first batch with `--dry-run` before approving it.
- **Who may run the script.** Proposed: operators only, with the same provider
  key as production; never triggered from the product.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5).
- **Started:** 2026-10-14.
- **Completed:** 2026-10-14. Approved by the product owner after review on 2026-10-14; Done.
- **Branch/PR:** `feat/st113-curated-illustration-library`, branched from
  `fix/st082-render-approval-guidance` (which holds ST-108..112 and is ahead
  of `main`). Not committed or pushed.
- **Migrations:** `0071_illustration_library` (new table
  `illustration_library_entries`, empty; no seed, no backfill). Compatibility
  note: `packages/database/drizzle/0071_illustration_library.compatibility.md`;
  ADR-015 gained a "Compatibility notes / ST-113" section amending its
  "no new storage table" consequence.

### Files changed

- `packages/schemas/src/creative-design-v2.ts`: library contract
  (`illustrationLibraryPrefix`, surfaces and `cinemaIllustrationSurface`,
  concept-list schema, `CinemaLibraryEntry`, `matchCinemaLibraryIllustration`,
  `cinemaLibraryMatchThreshold = 0.5`). `planCinemaIllustrations` accepts
  `library` and returns `library: [{ sceneId, entryId, reason, match, score }]`.
- `packages/database/src/schema.ts`, `drizzle/0071_*`, `meta/_journal.json`:
  table, CHECKs (status, treatment, surface, subject, key prefix, checksum,
  `catalog/illustrations/` prefix, active ⇒ bytes), unique (key, surface).
- `packages/database/src/illustration-library.ts` (new): active-entry query
  and `copyLibraryIllustrationIntoProject`, with injected storage I/O and
  checksum verification. Dedupes by sha256 within the project and holds no
  transaction across storage calls.
- `apps/pipeline-worker/src/illustration-generation-job.ts`: library fallback
  on moderation rejection or final-attempt failure. `bindCinemaHero` now takes
  the origin. `runtime.ts`: a second storage client confined to
  `catalog/illustrations`.
- `apps/api/src/illustration-generation.ts`: library step in
  `queueCinemaIllustrations` (copy, then pin `origin: "library"` in the same
  optimistic draft update as reuse), result field `library`. `runtime.ts`:
  library-scoped storage client. `one-shot-gateway.ts`/`one-shot-runner.ts`:
  step detail `library`, `libraryMatch: "exact:n,overlap:m"` and a decision-log
  entry, all only when a library picture was used.
- `apps/api/src/illustration-library-generation.ts` (new), `package.json`
  script `illustration-library:generate`, and
  `apps/api/illustration-library/concepts.json` (new, 40 concepts; 4 depict
  people, flagged).
- `docs/adr/ADR-015-*.md`: compatibility note.
- Tests: `packages/schemas/src/creative-design-v2.test.ts`,
  `packages/scene-library/src/cinema/cinema.test.tsx`,
  `apps/api/src/preview-manifest.test.ts`,
  `apps/api/src/cinema-illustrations.integration.test.ts`,
  `apps/api/src/illustration-library-generation.test.ts` (new),
  `apps/pipeline-worker/src/cinema-illustration-library.integration.test.ts` (new).

### Public contract changes

- Additive schemas exports (listed above). `CinemaIllustrationPlan` gains a
  required `library` array, always `[]` when no library is given.
- `CinemaIllustrationQueueResult.library` (optional in the type, always set).
- Worker job metadata on fallback: `fallback: "library"`, `libraryEntryId`,
  `libraryMatch`, `libraryScore`, `assetId`, `bound`, or
  `fallback: "motif"` with a code-only `libraryError`.
- No manifest, snapshot, job-payload or API route shape changed.
  `origin: "library"` already existed in the v2 schema (ST-109).

### Commands/tests

`TEST_DATABASE_URL=<DATABASE_URL from .env>`, `--hookTimeout=180000` for
integration files.

- Matching and planner units, `packages/schemas` (all 23 files): 463 passed.
- Worker Postgres: `cinema-illustration-library.integration.test.ts` (4 new)
  plus `cinema-illustration-job.integration.test.ts` (6 existing): 10 passed.
  Covers rejection → library, metered once (one `failed` usage row); final
  failure → library with project-copy reuse; retired, other-surface and
  no-people → motif; checksum mismatch → motif with the job still
  succeeding; library rows unchanged.
- API Postgres: `cinema-illustrations.integration.test.ts`: 7 passed (5
  existing plus empty-library-unchanged, over-budget → library pin, and AC7
  retirement keeping the pinned project copy).
- Script: `illustration-library-generation.test.ts`: 8 passed (args, concept
  list, plan, dry run makes no call or write, `--max`, idempotent re-run,
  rejected not retried, failed retried, refusal without provider).
- Render path: `cinema.test.tsx` 21 passed; `preview-manifest.test.ts`,
  one-shot gateway and runner tests: 55 passed.
- `packages/database` with Postgres: 15 passed (migrations apply).
- `pnpm typecheck` 16/16 passed. `pnpm build` 16/16 passed.
- `pnpm lint`: one error in
  `packages/scene-library/src/text-overflow.test.ts:55` (`_title` unused).
  This story does not touch that file, so it predates the branch; left as is.
  All files this story changed lint clean.
- `pnpm test` (`turbo --continue`): web 362, schemas 463, provider-adapters 84,
  jobs, auth, observability, storage, database, config, evals and test-fixtures
  all pass. The failures and how each was resolved:
  - 13 API route tests and 2 worker `project-asset-validation-job` tests timed
    out at 5 s / 30 s under parallel turbo load. Rerun alone they pass: API
    12 files, 152 passed (`--no-file-parallelism`); worker 4 passed.
  - Renderer `render-review.integration.test.ts` timed out at 240 s under
    load and passes alone (4 passed).
  - Pre-existing, not caused by this story: scene-library snapshot mismatches
    in `full-lesson-render`, `scene-preview-render-smoke` and
    `summary-scene-render`. They reproduce identically with HEAD's
    `creative-design-v2.ts` temporarily restored and rebuilt, the only
    upstream source this story changed for that package.
  - Pre-existing: design-system `video-preview-render-smoke` frame-hash
    mismatch. That package has no workspace dependencies, so it cannot be
    affected by this story.
- `graphify update .` run.

### Screenshots/output

Representative dry-run line:
`Illustration library plan: 3 to generate (max 20), 0 already done, 0 left for
a later run. Estimated cost: $0.0067 at $0.00225 per image.`
No paid call was made in development; all provider calls in tests are mocks.

### Decisions/assumptions

- **Surface** is light or dark, chosen by whether black or white text has more
  contrast on the palette's `surface` colour. API and worker use the same
  colour (the worker payload carries `palette.surface`).
- **Matching**: exact key first, then Jaccard over the illustration-key words
  (stop words removed, plurals folded) ≥ 0.5, ties by key ascending. The
  library is used only for over-budget scenes and failed generations, never
  ahead of generation within budget. Evidence and no-people scenes keep their
  existing motif reasons. Story wording asked for `CinemaMotifReason` to
  record library use; instead the plan has a separate `library` list (with
  `reason: "over_budget"` and match quality), because a scene that gets a
  picture is not a motif.
- **No new project-asset origin.** The copy is a normal active
  `project_assets` row with provenance `ai_generated` (accurate: the picture
  was generated) and `originalName: library-illustration.png`. The manifest
  carries `origin: "library"`. The story allowed this ("if the asset table
  needs it").
- **Storage keys** are `catalog/illustrations/<treatment>/<surface>/<entry
  id>/<sha256>.png`. A test found that a checksum-only key collides when two
  entries have identical bytes.
- **Script safety**: a row is claimed (`generating`) before the paid call.
  `active`, `rejected`, `retired` and `generating` rows are never re-paid;
  `failed` rows are retried, and retries count toward `--max`. A stale
  `generating` row from a crashed run is left for operator review rather than
  re-paid. Without `TOGETHER_API_KEY` a real run refuses (no mock fallback,
  ST-090); a dry run needs no key. Spend is logged per run and stored per row
  (`cost_usd`); platform spend has no tenant, so no `usage_records` row is
  written.
- **Library prompts** use a neutral palette per surface and one drawing
  language per treatment (flat: fine/cutout; ink-sketch: hand-drawn/vignette;
  editorial: no line/vignette). People appear only for concepts flagged
  `depictsPeople`.

### Deviations

- Step detail and job metadata names (`library`, `libraryMatch`,
  `libraryEntryId`) are as described above, not a new `CinemaMotifReason`
  value (see Decisions).
- The library tables and copies are not exercised end to end in a running
  app or against real object storage. Storage is mocked at the
  `getBytes`/`putBytes` boundary in tests.

### Known risks/follow-up

- **Product-owner decisions still open:** the initial batch size and budget
  (proposed 40 × 3 × 2 = 240 pictures, about $0.54 at $0.00225 each) and who
  may run the script. Price it first with
  `pnpm --filter @avlp/api illustration-library:generate --list
  illustration-library/concepts.json --dry-run`.
- A library picture uses a neutral per-surface palette, so its colours may not
  match a pack's accent exactly. The treatment and surface do match.
- Concurrent copies of the same entry into one project can create a
  duplicate project asset (harmless; later uses reuse the first by checksum).
- If the draft's optimistic update loses a race, the copied asset is left
  unpinned but active and is reused on the next call.

### Review outcome (2026-10-14)

Story code review: approve with follow-ups; approved by the product owner.
No blocking or high findings. Open follow-ups, not yet implemented:

- **M2 (do before any non-dry-run script run):** the generation script has no
  approval gate (`--yes` or `--max-cost`) and records platform spend only in
  `cost_usd` and logs, not `usage_records`. Add the gate and record the
  spend decision in an ADR (AGENTS.md paid-call rule).
- **M1:** the one-shot budget-cap path (`one-shot-runner.ts`
  `evaluateIllustrations`) skips the library step, so capped v2 runs get
  motifs even when a free library match exists (ADR-015 §6 order).
- **L1:** the optimistic draft update in `queueCinemaIllustrations` is not
  checked, so a lost race reports library pins that were not saved.
- **L2:** API library copy failures are swallowed without a log.
- **L3:** library storage clients can write to `catalog/illustrations`; use
  read-only credentials in deployed environments.
- **L4:** the script drops the recorded cost when a step after the paid call
  fails.
- **L5:** unvalidated cast of treatment and surface in
  `activeIllustrationLibraryEntries`.
- **Pre-existing:** a redelivered v2 illustration job whose candidate is
  `failed` pays again and is not metered (usage `onConflictDoNothing`).
