---
story_id: ST-084
title: "Reconcile Scene Durations With Measured Audio Before Real TTS Adoption"
phase: "09 — Provider Readiness"
status: Draft
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

- [ ] Make the audio-fit rule asymmetric: audio longer than its scene is an error, audio shorter is an acknowledgeable warning.
- [ ] Add a deterministic reconciliation step that re-times scenes from measured audio once every scene's audio is `ready`.
- [ ] Replace the exact lesson-duration equality with a bounded tolerance, retaining an error outside the band.
- [ ] Guarantee that a lesson version snapshots reconciled durations, so a render reproduces what preflight approved.
- [ ] Give the fixture TTS provider deterministic, seeded jitter so tolerance and reconciliation paths stay exercised.

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

- [ ] A lesson whose narration is exactly on budget passes preflight when its synthesized audio drifts up to the tolerance on every scene.
- [ ] A scene whose audio is longer than its planned duration produces a blocking error naming the scene, and the render command refuses it.
- [ ] A scene whose audio is shorter produces an acknowledgeable warning, and the render proceeds once acknowledged.
- [ ] After reconciliation, every scene duration is within tolerance of its measured audio and the lesson total is inside the target band.
- [ ] Reconciliation is idempotent: running it twice against unchanged audio changes no row and creates no revision.
- [ ] A render produced from a lesson version uses exactly the durations that version snapshotted.
- [ ] A scene whose audio cannot fit the per-scene bounds fails with a message naming the scene, not a generic duration error.
- [ ] Reconciliation on one project never reads or writes another tenant's scenes.

## Required Tests

- [ ] Unit: asymmetric severity for overrun and underrun at, inside, and outside the tolerance boundary.
- [ ] Unit: reconciliation arithmetic, including per-scene clamping and the unfittable-audio case.
- [ ] Unit: lesson-duration tolerance boundaries, replacing the exact-equality assertions.
- [ ] Integration: the full audio → reconcile → validate → render path passes for a lesson with jittered fixture audio.
- [ ] Integration: an idempotent re-run produces no revision change.
- [ ] Concurrency: reconciliation and a concurrent scene edit cannot interleave into a lost update.
- [ ] Authorization: a cross-tenant reconciliation attempt is rejected.
- [ ] Regression: a lesson version's snapshotted durations match what the renderer receives.

## Out of Scope

- Implementing a real TTS provider adapter; this story only removes the blocker in front of one.
- Solving for `speakingRate` to hit the target duration automatically, and redistributing slack as inter-scene padding. Both are viable follow-ups and should be recorded as such, not built here.
- Changing the narration word-budget model or `narrationWordCountRange`.
- Any scene template or motion-design change.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test, and build commands pass for affected workspaces.
- [ ] Documentation and migrations are complete.
- [ ] No unresolved security, tenant-isolation, idempotency, or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Story-Specific Notes

- Discovered 2026-08-30 while driving a local lesson to its first render. The symptom was four `audio_duration_mismatch` errors on a lesson whose narration was exactly on budget: 84 words against an 84-word target for a 45s scene.
- The proximate cause was a defect in `synthesizeFixtureAudio`, which synthesized at a private 150 wpm and ignored the 20 percent pause reservation the budget model assumes, producing 33.6s of audio for a 45s scene. That defect is fixed: the fixture now shares `narrationWordsPerMinute` and `narrationPauseReservation`.
- That fix makes the fixture hit planned durations exactly, so it can no longer surface this class of problem on its own. Seeded jitter is in scope here precisely so the tolerance path stays exercised before a real provider arrives.
- Fixing the fixture also revealed that a lesson with zero validation issues crashed on `values([])` in `apps/api/src/lesson-validation.ts`; the clean-pass path had never executed. That defect is fixed separately and is not part of this story.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
