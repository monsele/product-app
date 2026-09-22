---
story_id: FX-001
title: "Refresh the Storyboard Revision After Audio Duration Reconciliation"
phase: "Fixups"
status: Ready
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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:** None expected.
- **Contracts changed:** None expected.
- **Commands/tests run:**
- **Decisions and assumptions:**
- **Known risks:**
- **Deviations:**
