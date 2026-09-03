---
story_id: ST-084
title: "Reconcile Scene Durations With Measured Audio Before Real TTS Adoption"
phase: "09 — Provider Readiness"
status: Done
priority: must-have
epics: ["E14", "E15"]
prd_user_stories: []
depends_on: ["ST-060", "ST-063", "ST-064", "ST-066", "ST-068"]
---

# ST-084 — Reconcile Scene Durations With Measured Audio Before Real TTS Adoption

## Story

As a teacher, I want scene timing to adapt to the narration audio that was actually synthesized, so that a lesson whose narration is correctly written can always reach a render instead of failing preflight for drift no one can act on.

## Outcome

Measured audio duration becomes an input to scene timing rather than a prediction checked against it. A lesson whose narration sits inside its word budget passes preflight with any conforming TTS provider, and a scene whose audio would be truncated still blocks the render.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E14, E15
- `docs/reference/epic-technical-implementation-guide.md` — E14, E15 plus applicable cross-cutting sections
- `stories/06-audio-validation-rendering-delivery/ST-063-generate-and-retry-text-to-speech-audio-per-scene.md`
- `stories/06-audio-validation-rendering-delivery/ST-066-implement-the-deterministic-lesson-quality-validation-engine.md`

## Dependencies

- ST-060
- ST-063
- ST-064
- ST-066
- ST-068

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.
This story must be **Done** before any real TTS provider replaces `fixtureSceneAudioTtsProvider`.

## Problem

Three constraints must hold simultaneously today, and one of them is unknowable when the other two are decided:

1. `sum(scene.durationSeconds) === targetDurationSeconds`, an exact equality (`apps/api/src/lesson-validation.ts`).
2. `|audioDurationMs − scene.durationSeconds × 1000| ≤ 1500` for every scene, `severity: "error"` in both directions (`apps/api/src/lesson-validation.ts`).
3. Scene durations are allocated by `allocateStoryboardDurations` at storyboard time, before any audio exists.

Rule 3 turns rules 1 and 2 into a prediction about a synthesis engine's output. The prediction holds today only because `synthesizeFixtureAudio` realizes the planning model exactly; no real engine will, because prosody, punctuation, and phoneme length do not reduce to a word count.

A lesson whose narration is exactly on budget therefore fails preflight with a blocking error per scene, and no remedy is available to the teacher: shortening scenes to fit the audio breaks rule 1, and lengthening narration is rejected by the `WORD_COUNT_OUT_OF_BUDGET` deterministic check in `apps/pipeline-worker/src/narration-job.ts`.

The `"audio-fit-warning"` invalidation scope in `packages/schemas/src/index.ts` already anticipates reconciliation; the automated counterpart was never implemented.

## Scope

- [x] Make the audio-fit rule asymmetric: audio longer than its scene is an error, audio shorter is an acknowledgeable warning.
- [x] Add a deterministic reconciliation step that re-times scenes from measured audio once every scene's audio is `ready`.
- [x] Replace the exact lesson-duration equality with a bounded tolerance, retaining an error outside the band.
- [x] Guarantee that a lesson version snapshots reconciled durations, so a render reproduces what preflight approved.
- [x] Give the fixture TTS provider deterministic, seeded jitter so tolerance and reconciliation paths stay exercised.

## Technical Implementation Requirements

- Speech is the hard constraint and visuals are elastic: reconciliation sets scene duration from measured audio, never the reverse. `getSceneFrameTiming` already derives enter and exit frames from any duration, so no scene template change is required.
- Reconciliation is deterministic and idempotent: the same measured audio must always produce the same durations, and re-running it must not create a new revision.
- Reconciliation must not silently mutate an approved lesson version. Either it runs before the version is cut, or it is an explicit teacher-visible action producing a new version. Immutability of existing versions is non-negotiable.
- Reconciled durations must stay inside the per-scene bounds enforced by `scene_duration_out_of_range`; a scene whose audio cannot fit those bounds is a blocking error naming the scene.
- Reconciliation is tenant-scoped and runs in one transaction with the storyboard revision bump.
- Changing a scene duration must continue to invalidate the `preview`, `render`, and `validation` scopes.
- Reconciliation makes no provider call; it reads persisted `scene_audio.duration_ms` only.

## Contracts and Persistence

- Reconciliation outcome per scene: previous duration, measured audio duration, applied duration, and clamp reason.
- Lesson-duration tolerance constant shared by the allocator and the validation engine, exported from `@avlp/schemas` so the two cannot drift apart.
- `audio_duration_mismatch` gains a direction (`overrun` or `underrun`) in its `details`.
- No new table is required if reconciliation writes through the existing `scenes` revision path; a migration is required only if the outcome is persisted for audit.

## Interfaces

- Worker: reconciliation step invoked after the final `tts.generate` for a lesson completes.
- API: an explicit teacher-triggered reconcile command, if the chosen design makes reconciliation user-visible rather than automatic.
- UI: preflight surfaces underrun as an acknowledgeable warning and overrun as a blocking error, naming the affected scene.

## Acceptance Criteria

- [x] A lesson whose narration is exactly on budget passes preflight when its synthesized audio drifts up to the tolerance on every scene.
- [x] A scene whose audio is longer than its planned duration produces a blocking error naming the scene, and the render command refuses it.
- [x] A scene whose audio is shorter produces an acknowledgeable warning, and the render proceeds once acknowledged.
- [x] After reconciliation, every scene duration is within tolerance of its measured audio and the lesson total is inside the target band.
- [x] Reconciliation is idempotent: running it twice against unchanged audio changes no row and creates no revision.
- [x] A render produced from a lesson version uses exactly the durations that version snapshotted.
- [x] A scene whose audio cannot fit the per-scene bounds fails with a message naming the scene, not a generic duration error.
- [x] Reconciliation on one project never reads or writes another tenant's scenes.

## Required Tests

- [x] Unit: asymmetric severity for overrun and underrun at, inside, and outside the tolerance boundary.
- [x] Unit: reconciliation arithmetic, including per-scene clamping and the unfittable-audio case.
- [x] Unit: lesson-duration tolerance boundaries, replacing the exact-equality assertions.
- [x] Integration: the full audio → reconcile → validate → render path passes for a lesson with jittered fixture audio.
- [x] Integration: an idempotent re-run produces no revision change.
- [x] Concurrency: reconciliation and a concurrent scene edit cannot interleave into a lost update.
- [x] Authorization: a cross-tenant reconciliation attempt is rejected.
- [x] Regression: a lesson version's snapshotted durations match what the renderer receives.

## Out of Scope

- Implementing a real TTS provider adapter; this story only removes the blocker in front of one.
- Solving for `speakingRate` to hit the target duration automatically, and redistributing slack as inter-scene padding. Both are viable follow-ups and should be recorded as such, not built here.
- Changing the narration word-budget model or `narrationWordCountRange`.
- Any scene template or motion-design change.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test, and build commands pass for affected workspaces.
- [x] Documentation and migrations are complete.
- [x] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done.

## Story-Specific Notes

- Discovered 2026-08-30 while driving a local lesson to its first render. The symptom was four `audio_duration_mismatch` errors on a lesson whose narration was exactly on budget: 84 words against an 84-word target for a 45s scene.
- The proximate cause was a defect in `synthesizeFixtureAudio`, which synthesized at a private 150 wpm and ignored the 20 percent pause reservation the budget model assumes, producing 33.6s of audio for a 45s scene. That defect is fixed: the fixture now shares `narrationWordsPerMinute` and `narrationPauseReservation`.
- That fix makes the fixture hit planned durations exactly, so it can no longer surface this class of problem on its own. Seeded jitter is in scope here precisely so the tolerance path stays exercised before a real provider arrives.
- Fixing the fixture also revealed that a lesson with zero validation issues crashed on `values([])` in `apps/api/src/lesson-validation.ts`; the clean-pass path had never executed. That defect is fixed separately and is not part of this story.

## Dev Agent Record

- **Agent:** Claude Opus 5 (Claude Code)
- **Started:** 2026-09-03
- **Completed:** 2026-09-03
- **Branch/PR:** `story/st-084` (local; not published)

### Files changed

- `packages/schemas/src/index.ts` — added the shared timing contract: `sceneAudioFitToleranceMs`, `sceneDurationRoundingMs`, `sceneNarrationPlanToleranceMs`, `sceneAudioFitDirectionSchema`, `sceneDurationClampReasonSchema`, `sceneDurationReconciliationSchema`, and the pure `reconcileSceneDurations` arithmetic.
- `packages/schemas/src/duration-reconciliation.test.ts` — new; reconciliation arithmetic, clamping, idempotency, determinism, and contract conformance.
- `apps/api/src/lesson-validation.ts` — asymmetric `audio_duration_mismatch` with a `direction` in `details`; lesson-duration band replaces exact equality; `narration_duration_mismatch` widened; `audio_duration_mismatch` added to the acknowledgeable set; scene named in every audio-fit message.
- `apps/api/src/lesson-validation.test.ts` — updated the underrun expectation to the new contract; added tolerance-boundary, direction, unknown-duration, lesson-band, and full audio→reconcile→preflight chain cases.
- `apps/api/src/renders.test.ts` — added the regression that a render reproduces the durations its lesson version snapshotted.
- `apps/pipeline-worker/src/duration-reconciliation.ts` — new; the tenant-scoped, idempotent reconciliation step.
- `apps/pipeline-worker/src/duration-reconciliation.integration.test.ts` — new; Postgres-backed reconciliation, idempotency, concurrency, tenant isolation, clamping, and audit coverage.
- `apps/pipeline-worker/src/scene-audio-job.ts` — deterministic seeded fixture jitter; fit warning moved onto the shared tolerance; reconciliation invoked once every scene's audio and captions are ready, before the project becomes validatable.
- `apps/pipeline-worker/src/scene-audio-job.test.ts` — jitter determinism, bound, and drift-visibility cases.

### Migrations

None. Reconciliation writes through the existing `lesson_specs` / `scenes` revision path and audits through the existing `storyboard.edited` event type, so no schema or enum change was required.

### Public contract changes

- `@avlp/schemas` gains `sceneAudioFitToleranceMs` (1500), `sceneDurationRoundingMs` (500), `sceneNarrationPlanToleranceMs` (2000), `reconciledLessonDurationToleranceSeconds`, `sceneAudioFitDirectionSchema`, `sceneDurationClampReasonSchema`, `sceneDurationReconciliationSchema`, and `reconcileSceneDurations`. All additive.
- `lessonValidationRulesetVersion` bumped `"1"` → `"2"`. The version is part of the render-authorization input hash, so this forces re-validation of any run that passed under the pre-ST-084 rules (asymmetric audio-fit severity, scene-count-aware lesson band, widened narration-plan band).
- `audio_duration_mismatch` is now emitted at `warning` severity with `acknowledgeable: true` for an underrun, and its `details` carry `direction` (`"overrun"` / `"underrun"` / `null`), `toleranceMs`, and the matching `overrunMs` / `underrunMs`.
- `lesson_duration_mismatch` `details` gain `toleranceSeconds` (now scene-count aware); `narration_duration_mismatch` `details` gain `toleranceMs`.
- No API route, request body, or job envelope changed.

### Commands/tests

| Command | Result |
| --- | --- |
| `pnpm lint` | 16/16 successful |
| `pnpm typecheck` | 16/16 successful |
| `pnpm build` | 16/16 successful |
| `pnpm --filter @avlp/schemas test` | 263 passed (13 files) |
| `pnpm --filter @avlp/api test` | 437 passed, 70 skipped (44 files) |
| `pnpm --filter @avlp/pipeline-worker test` | 218 passed, 33 skipped (19 files) |
| `TEST_DATABASE_URL=… vitest run src/duration-reconciliation.integration.test.ts` | 12 passed (adds a deterministic revision-conflict case) |
| `TEST_DATABASE_URL=… vitest run src/{lesson-validation,renders,storyboard-scene-editor}.test.ts` (api) | 50 passed |

### Screenshots/output

Reconciliation against real Postgres (`duration-reconciliation.integration.test.ts`, 11/11): two 30s scenes whose audio measured 33.4s and 27.6s re-time to 33s and 28s, the lesson total moves 60s → 61s, the lesson-spec revision goes 0 → 1, and a second run returns `unchanged` with an identical `updatedAt`, `contentHash`, and revision. 75s of audio on a 30s scene clamps to the 60s ceiling with `clampReason: "scene_maximum"` and `unfittable: true`, which preflight then reports as a blocking overrun naming that scene.

### Post-review fixes

- **Lesson-duration band is now scene-count aware.** Per-scene reconciliation moves each scene independently by up to `sceneAudioFitToleranceMs + sceneDurationRoundingMs`, and a provider that runs long on every scene shifts the lesson total by that budget times the scene count — a flat 5% band blocked correctly-authored lessons whose average scene runs under ~30s (ACs 1 and 4). `reconciledLessonDurationToleranceSeconds(target, sceneCount)` (new, `@avlp/schemas`) takes the larger of the storyboard-time band and the accumulated per-scene budget; the validation engine uses it for `lesson_duration_mismatch`. Not-yet-reconciled drafts are unaffected (the storyboard-time band is never the smaller value at low scene counts).
- **A reconciliation conflict no longer advances the project to validation.** `advanceProjectMediaStage` now returns whether reconciliation settled; on `conflict` (a concurrent storyboard edit won the revision race) the scene-audio job throws a retryable `DURATION_RECONCILIATION_PENDING` instead of moving the project to `ready_for_validation`, so the retry reconciles the edited storyboard before preflight ever runs on stale timing. The already-committed audio is left untouched.
- **`lessonValidationRulesetVersion` bumped to `"2"`.** The rule semantics changed (asymmetric audio-fit severity, lesson-duration band, narration-plan band), and the version is folded into the render-authorization input hash, so a run that passed under the old rules must not keep authorizing a render. Bumping the constant invalidates those runs and forces re-validation. No test fixture pinned the old value.

### Open follow-ups from review (not blocking)

- **No dedicated re-trigger for a reconciliation left unsettled by a retry-exhausting edit storm.** `advanceProjectMediaStage` is the only path to `ready_for_validation`; if the last `tts.generate` job dead-letters on `DURATION_RECONCILIATION_PENDING`, recovery needs a later narration/voice edit (re-queues audio) or a manual regenerate. Low probability. A dedicated reconciliation job, or letting `POST /validation-runs` reconcile from `audio_generation`, would close it.
- **Reconciliation writes `scenes`/`lesson_specs` directly, not through `sceneEditInvalidation`.** Validation and render invalidation still fire via `lessonSpecContentHash`; preview freshness relies on the derived manifest and is not asserted by a test.

### Decisions/assumptions

- **Reconciliation is automatic and worker-side, not a teacher command.** The story allowed either. It runs at the point every scene holds ready audio and captions, immediately before the project advances to `ready_for_validation` — that is, before any lesson version is cut, so the immutability of existing versions is structural rather than enforced by a check.
- **Speech is the hard constraint.** Durations are set from measured audio and never the reverse. Rounding to whole seconds leaves at most 500ms of residual, comfortably inside the 1500ms fit tolerance.
- **Idempotency is derived, not remembered.** The target durations are a pure function of persisted `scene_audio.duration_ms`, so a re-run computes the same values, finds them already applied, and returns before opening a write.
- **Concurrency is resolved by the existing optimistic revision guard.** A teacher edit landing mid-reconciliation bumps the revision, the guarded update matches no row, and the reconciliation is dropped rather than overwriting the edit.
- **The audit trail reuses `storyboard.edited`** with `actor: system` and `metadata.operation: "duration_reconciliation"`, carrying the previous duration, measured duration, applied duration, clamp reason, and unfittable flag per scene. This satisfies the story's per-scene outcome contract without an enum migration.
- **No UI change was needed.** The preflight panel already groups issues by scope, renders an acknowledge control for any `acknowledgeable` warning, and deep-links by `sceneId`. The audio-fit messages now name the scene explicitly so the text is actionable on its own.
- **Fixture jitter is seeded from the narration text** (SHA-256, ±8% capped at ±1200ms). Content-addressed audio identity and job idempotency both assume the same narration always synthesizes identically, so the drift had to be deterministic rather than random.

### Deviations

- **`narration_duration_mismatch` was widened, which the story's Scope does not name.** It compared the narration plan against the scene duration with a ±1s equality — the same class of prediction-checked-against-reality defect as the two rules the story does name. Once reconciliation moves a scene onto its measured audio, that rule fires and blocks the lesson, so acceptance criteria 1 and 4 cannot hold without it. The new band is `sceneNarrationPlanToleranceMs` = the audio-fit tolerance plus the 500ms reconciliation rounding residual, both exported from `@avlp/schemas`. This was found by the chain test, not assumed.
- **The audio-fit rule was already asymmetric in one direction.** An underrun produced no issue at all rather than an error. The story describes it as an error in both directions; the change made here is underrun → *acknowledgeable warning*, so the teacher can see and accept trailing silence instead of it passing silently. One existing test asserted the silent behaviour and was updated.
- **A scene whose audio underruns the per-scene minimum clamps to 3s and surfaces as a warning**, not an error. The story names the unfittable case only for audio that is too long; audio shorter than the floor still fits its clamped scene.
- **The `"audio-fit-warning"` invalidation scope needed no work.** `sceneEditInvalidation` already adds it, plus `preview`, `render`, and `validation`, whenever `durationSeconds` changes.

### Known risks/follow-up

- **Integration tests were verified against an ad-hoc local PostgreSQL 17 on port 5432, not the project's docker-compose instance** (Docker was not running in this environment). `duration-reconciliation.integration.test.ts` passes 11/11 in isolation. Running the worker's integration files together against that ad-hoc server times out in `beforeAll` at the 10s hook budget — this affects pre-existing untouched integration files (`model-call`, `document-ingestion`, `document-validation`, `project-cleanup`, `runtime`) identically, so it is an environment limit on concurrent temp-database creation, not a defect in this story. These should be re-run against the compose Postgres.
- **`@avlp/design-system` and `@avlp/scene-library` tests fail on this machine**, both before and after this change (confirmed by stashing). They are Remotion pixel visual-regression comparisons; no file in either package was touched.
- **Reconciliation only ever grows or shrinks scenes to fit speech.** Solving for `speakingRate` to hit the target duration, and redistributing slack as inter-scene padding, remain the follow-ups the story records as out of scope. Until one of them exists, a lesson whose narration is written well below budget will render shorter than its configured target, within the 5% lesson band.
- **A scene whose audio exceeds the 60s ceiling is still a hard stop** for the teacher: preflight names the scene, but the only remedies are shortening that scene's narration or splitting the scene. That is the intended behaviour, not a gap.
