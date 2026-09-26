---
story_id: FX-001
title: "Refresh the Storyboard Revision After Audio Duration Reconciliation"
phase: "Fixups"
status: Done
priority: must-have
epics: ["E5", "E13", "E14"]
prd_user_stories: []
depends_on: ["ST-059", "ST-080", "ST-084", "ST-089"]
---

# FX-001 — Refresh the Storyboard Revision After Audio Duration Reconciliation

## Story

As a teacher, when I accept an AI illustration or edit a scene after my
narration audio has finished generating, I want the action to work the first
time. I should not get an `edit_conflict` error that keeps coming back until I
reload the browser.

## Problem

### Symptom

On the storyboard workspace, clicking **Accept** on an illustration candidate
in the scene detail panel returns `409 edit_conflict`: "The storyboard or
scene changed. Please refresh and try again." The teacher did not make any
other change. Clicking **Accept** again fails the same way. The action only
succeeds after a full browser refresh.

Observed on 2026-09-22, project `01a0cacc-4547-7835-b7c4-fcd924b96a92`,
`POST /projects/:projectId/illustration-candidates/01a0cadf-9d44-7663-b6ff-bbdb3995b18b/accept`,
correlation ID `01a0cae1-ab1b-76f8-9912-b11b5683a661`.

### Timeline (from `lesson_specs` and `audit_events`)

| Time (UTC) | Event                                                                      | Lesson-spec revision |
| ---------- | -------------------------------------------------------------------------- | -------------------- |
| 20:44:34   | Storyboard generated; workspace loaded                                     | 0                    |
| 20:45:18   | "Generate all audio & captions" queued for all 7 scenes                    | 0                    |
| 20:46:21   | System `storyboard.edited` event: `duration_reconciliation` re-times scenes (for example, scene 1 goes from 20s to 12s) | 0 → 1 |
| 20:49:42   | Teacher clicks **Accept**; the client sends `expectedStoryboardRevision: 0` | server holds 1 → **409** |
| 20:52:40+  | After a browser refresh, accepts succeed                                   | 2 … 13               |

### Root cause

1. **A background job moves the revision forward.** When the last scene's
   audio completes, `scene-audio-job.ts` calls
   `reconcileLessonSceneDurations` (ST-084,
   `apps/pipeline-worker/src/duration-reconciliation.ts`). This increments
   `lesson_specs.revision` and every `scenes.revision`. This is correct and
   intended (ADR-004).
2. **The workspace refreshes only part of its state.** The media poll in
   `storyboard-panel.tsx` (the `refreshMedia` effect, around lines 607-630)
   reloads the **scene list** and bumps `detailAttempt` to reload the **scene
   detail**. It never calls `refresh()` for the main `GET /storyboard`
   response. After audio finishes:
   - `sceneList.value.revision` = 1 (fresh)
   - `detail.sceneRevision` = fresh
   - `view.value.storyboard.revision` = **0 (stale)**
3. **Every mutation in the workspace sends the stale value.**
   `storyboard.revision` is passed down as `lessonSpecRevision` and
   `storyboardRevision`, and as the `revision` local used by the
   add/duplicate/delete/reorder handlers. The API's optimistic-concurrency
   guard (`mutableDraftLessonSpecRow`, `apps/api/src/storyboard.ts`) correctly
   rejects it.
4. **A failure never triggers a refresh.** `IllustrationCandidatePanel.act`
   (`illustration-candidate-panel.tsx`, around lines 145-166) throws a generic
   message on any non-OK response and does not call `onChanged()`. The parent
   never refetches, so every retry sends the same stale revision. The
   contact-sheet view (ST-089) does not have this bug: it always reloads in
   `finally`.

### Impact

The same stale revision is sent by:

- illustration candidate accept and reject (scene detail panel)
- scene edits (`SceneEditorForm`, `revision={lessonSpecRevision}`)
- scene regeneration candidate apply (`scene-detail-panel.tsx`,
  `expectedRevision: lessonSpecRevision`)
- add, duplicate, delete, and reorder scenes (`storyboard-panel.tsx`)
- grounding-panel actions (`lessonSpecRevision`)

So every storyboard mutation fails once narration audio has finished in the
same browser session. The server behaves correctly; no data is lost or
corrupted.

## Outcome

After the scene-audio batch finishes, the workspace's storyboard revision
matches the server. A conflict on any illustration-candidate action refreshes
the workspace, so the next click succeeds without a manual browser reload.

## Recommended Solution

### 1. Refresh the storyboard when the media poll settles (root-cause fix)

In `storyboard-panel.tsx`, in the `refreshMedia` effect's `!stillPending`
branch, also refetch the main storyboard response so `storyboard.revision`
picks up the reconciliation bump:

```ts
if (!stillPending) {
  setAudioBatchBusy(false);
  setDetailAttempt((current) => current + 1);
  void refresh().catch(() => undefined);
  void runValidation();
}
```

Add `refresh` to the effect's dependency list. The scene-list effect is keyed
on `revision`, so it refetches naturally once the new revision arrives.

### 2. Recover from conflicts in the illustration candidate panel

In `illustration-candidate-panel.tsx`, treat `409` the way the contact sheet
does: reload and notify the parent, so the next click uses fresh revisions.

```ts
if (!response.ok) {
  if (response.status === 409) {
    await reload();
    onChanged();
    throw new Error(
      "This scene changed since it loaded. It has been refreshed — try again.",
    );
  }
  throw new Error("Illustration action failed. Refresh and try again.");
}
```

The error must stay visible: the teacher's click did **not** take effect, so
the action must not silently retry. Silent retries are out of scope (see
below).

### 3. (Optional) Use one revision source in the workspace

`storyboard-panel.tsx` holds two copies of the revision
(`view.value.storyboard.revision` and `sceneList.value.revision`) that can
drift. Fix 1 is enough for this defect. A follow-up can derive mutations from
the larger of the two, or refresh both together, so this class of drift cannot
come back.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-004-measured-narration-controls-playback-duration.md`
- `stories/09-provider-readiness/ST-084-reconcile-scene-durations-with-measured-audio-before-real-tts-adoption.md`
- `stories/08-product-ui/ST-089-add-contact-sheet-candidate-review-for-generated-illustrations.md`
- `docs/design.md` — error and status messaging for storyboard actions

## Scope

- `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx`
- `apps/web/app/workspace/[projectId]/storyboard/illustration-candidate-panel.tsx`
- Tests next to those files

## Acceptance Criteria

1. After "Generate all audio & captions" completes and duration
   reconciliation increments the lesson-spec revision, accepting an
   illustration candidate from the scene detail panel succeeds on the first
   click without a browser reload.
2. After the same sequence, scene edits and add, duplicate, delete, and
   reorder all succeed on the first attempt.
3. When an illustration candidate accept or reject returns `409`, the panel
   shows a conflict-specific message, and the storyboard and candidate list
   are refetched. A second click then succeeds if nothing else has changed.
4. A non-409 failure keeps the existing generic message and behavior.
5. The API's concurrency guard is unchanged. A genuinely stale request is
   still rejected with `409 edit_conflict`.

## Required Tests

- `storyboard-panel` test: when the media poll moves from pending to settled,
  the storyboard endpoint is refetched and the `lessonSpecRevision` passed to
  the scene detail panel updates to the new revision.
- `illustration-candidate-panel` test: a `409` from accept calls `reload()`
  and `onChanged()` and shows the conflict message. A `500` does not call
  `onChanged()` and shows the generic message.
- Regression: accept with a matching revision still succeeds and calls
  `onChanged()` once.
- Run the existing `storyboard.playwright.test.tsx` and
  `illustration-candidate-panel.test.tsx` suites unchanged.

## Out of Scope

- Changing the server's revision guard or making duration reconciliation skip
  the revision increment. The increment is correct: the storyboard really
  changed.
- Automatically retrying the teacher's action after a conflict.
- Push-based (SSE/WebSocket) storyboard change notifications.
- Changes to the contact-sheet view, which already recovers correctly.

## Definition of Done

- All acceptance criteria and required tests pass.
- `pnpm run typecheck` and `pnpm run lint` are clean for `@avlp/web`.
- Manually verified with the run-app flow: generate the storyboard, generate
  all audio, then accept an illustration without reloading.
- The Dev Agent Record below is completed.

## Dev Agent Record

- **Agent:** Claude Code (claude-opus-5-5)
- **Started:** 2026-09-26
- **Completed:** 2026-09-26
- **Branch/PR:** `fix/fx-001-refresh-storyboard-revision` (branched from `feat/st-096-select-and-compare-standard-and-demonstration-videos`, which holds the unmerged ST-096..ST-102 work). Not pushed; no PR opened.
- **Files changed:**
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.tsx`: the media poll body is extracted to the exported `pollSceneMedia`. When audio and captions settle, it now also refetches `GET /storyboard` so `storyboard.revision` (passed as `lessonSpecRevision`/`storyboardRevision` and used by add/duplicate/delete/reorder) picks up the duration-reconciliation bump. `sceneMediaPending` replaces two duplicated predicates. `runSceneMutation` now also refetches the storyboard when a mutation fails, so a conflict does not repeat. The new exported `sceneDetailWhileReloading` keeps the detail on screen while the same scene's detail is refetched; it resets to loading only when a different scene is selected. The inspector, including the illustration panel's inline `role="alert"` conflict notice, therefore stays mounted on every layout. `SceneEditorForm` already resyncs its draft when `detail.scene.scene` changes.
  - `apps/web/app/workspace/[projectId]/storyboard/illustration-candidate-panel.tsx`: the request/response handling moves out of `act` into the exported `runIllustrationCandidateAction`. On a `409`, it reloads candidates, calls `onChanged()` (the parent then refetches the storyboard and scene detail) and returns a conflict-specific message. On any other non-OK response, it keeps the generic message and does not call `onChanged()`. The action is never retried automatically.
  - `apps/web/app/workspace/[projectId]/storyboard/storyboard-panel.test.ts`, `illustration-candidate-panel.test.tsx`: new tests.
- **Migrations:** None.
- **Contracts changed:** None. API concurrency guard unchanged (AC5).
- **Commands/tests run:**
  - `npx vitest run storyboard-panel.test illustration-candidate-panel.test storyboard.playwright` (in `apps/web`): 3 files, 19 tests passed. This includes the existing `storyboard.playwright.test.tsx` (unchanged) and the existing `illustration-candidate-panel` render test.
  - `npx tsc --noEmit` (in `apps/web`): clean.
  - `pnpm --filter @avlp/web run lint`: clean.
  - `pnpm --filter @avlp/web run test`: 266 of 267 tests passed. The one failure, `configuration/lesson-configuration-input.test.ts > pre-fills the form from a persisted configuration`, fails the same way on the base commit with these changes stashed. Its expected object lacks the `creativeStylePack: null` field that ST-102 added. It is unrelated to FX-001 and was left untouched.
- **Decisions and assumptions:**
  - `apps/web` has no DOM test environment; component tests either render static markup or call exported pure helpers (for example `deriveSaveVersionOutcome`). The required behavior tests therefore target the extracted `pollSceneMedia` and `runIllustrationCandidateAction`, which the components call directly.
  - The same 409 recovery also applies to **Generate illustration**, which shares `act`. Its stale-scene 409 has the same cause and the same remedy.
  - Recommended fix 3 (a single revision source) was not implemented because it is optional.
- **Known risks:**
  - `advanceProjectMediaStage` reconciles durations in a step after the last audio and caption rows are marked ready. A poll that lands in that short window refetches the pre-reconciliation revision. Illustration actions and add/duplicate/delete/reorder now refetch on failure, so the next attempt succeeds. Scene edits (`SceneEditorForm`) and scene-regeneration apply are outside this story's listed scope files, so they rely on their existing `onChanged` paths.
  - Manual run-app verification was **not** performed: Docker Desktop was not running in the agent environment. A reviewer should do the Definition of Done flow (generate the storyboard, generate all audio, accept an illustration without reloading).
  - Code-review follow-ups:
    1. First review: the conflict message was lost when the scene detail reload unmounted the inspector. Passing the message up to the parent was tried first, but the second review found the parent's notice lives in the center canvas, which is hidden on the tabbed mobile layout and is not next to the control. The root cause was fixed instead: `sceneDetailWhileReloading` keeps the same-scene detail mounted during a refetch, and the parent-message plumbing was removed.
    2. After that fix: `vitest run` over the illustration-candidate-panel, storyboard-panel, storyboard.playwright, scene-detail-panel and scene-editor-form tests: 5 files, 32 tests passed. `tsc --noEmit` and `eslint app/workspace/[projectId]/storyboard/` were clean. `prettier --check` still reports the edited `illustration-candidate-panel.tsx`, its test and `storyboard-panel.tsx` as unformatted, but they are equally unformatted on the base commit, so no whole-file reformat was done. A final `pnpm --filter @avlp/web run test` passed 269 of 270 tests; the only failure is the same unrelated `lesson-configuration-input.test.ts` case.
  - Refreshing the same scene no longer remounts the inspector, so child components get new props instead of fresh state. Of the prop-derived state, `SceneEditorForm`'s draft resyncs from `detail.scene.scene`, but the nested relation editor's from/to selectors (`scene-editor-form.tsx:397-398`) are initialized once and could point at removed nodes if a background change edits that scene's nodes. Duration reconciliation only re-times scenes, so it does not trigger this.
- **Approval:** The repository owner approved the story on 2026-09-26 after the final story-code-review ("approve with follow-ups"). The Definition of Done manual run-app check had not been performed by the agent when it was approved.
- **Deviations:** The required tests exercise extracted helpers rather than a mounted component, because the web package has no DOM test environment. `runSceneMutation` now refetches the storyboard after a failure; this is a small defensive addition in a scope file. FX-001 has no row in `STORY_INDEX.md`, so only the story front matter status was updated.
