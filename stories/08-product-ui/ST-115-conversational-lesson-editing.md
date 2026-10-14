---
story_id: ST-115
title: "Add Conversational Editing to the Storyboard Workspace"
phase: "08 — Product UI"
status: Ready
priority: should-have
epics: ["E9", "E12", "E15", "E21"]
prd_user_stories: ["E9-US1", "E12-US2", "E12-US4", "E15-US1", "E21-US2"]
depends_on: ["ST-049", "ST-051", "ST-056", "ST-080", "ST-111"]
---

# ST-115 — Conversational Lesson Editing

## Story

As a teacher reviewing a storyboard, I want to type requests such as "make
scene 3 simpler", "slow down the transition into the summary" or "use a
gentler tone across the whole lesson", and keep refining in a conversation, so
that I can direct changes in plain language without finding the right form
field or regeneration mode for each one.

## Background

The building blocks exist, but only as one-shot, one-target actions:

- Scene regeneration (ST-051): `POST :projectId/scenes/:sceneId/regenerate`
  with a mode (`improve-visual`, `simplify`, `shorten`, `regenerate`) and an
  optional 500-character `instruction`, then `apply-candidate` /
  `reject-candidate` after a before/after comparison.
- Narration block regeneration (ST-049): `POST
  :projectId/narration-blocks/:blockId/regenerate`, then candidate accept or
  reject.
- Schema-driven field editing (ST-056): title, narration, on-screen text,
  `durationSeconds`, transition and visual fields, plus scene reorder (E12-US2).

There is no thread, no memory of earlier requests, and no way to address
several scenes or the whole lesson at once. This story adds a conversation
layer that **plans** changes using those existing operations. It adds no new
way to mutate a lesson.

## Outcome

- An "Ask for changes" panel in the storyboard workspace. It is scoped to the
  selected scene by default, and the teacher can switch it to selected scenes
  or the whole lesson.
- Each teacher message makes one metered `ai.edit-plan` call. The call
  returns a **change plan**: an ordered list of operations from a closed set,
  each with a one-line, teacher-facing rationale:
  - `regenerate-scene` (sceneId, mode, instruction ≤ 500) → ST-051 job
  - `regenerate-narration-block` (blockId, instruction) → ST-049 job
  - `edit-scene-field` (sceneId, path from editor metadata, value) → ST-056
    patch, validated against the template's field limits
  - `reorder-scenes` (new order of existing IDs)
  - `answer-only`: no change, for questions or for requests that cannot be met.
    The reason is stated, e.g. "Scene 4 can't be 8 s: its narration measures
    14 s (ADR-004). Shorten the narration instead?"
- The plan is shown as a proposal. **Nothing changes until the teacher
  applies it**, either all at once or item by item. Generated operations open
  the existing before/after candidate review. Field edits show a diff.
- Every operation carries the storyboard `expectedRevision` it was planned
  against. A stale plan is refused with a "re-plan" action, never applied over
  newer edits.
- **Undo last applied turn**: restores the revision recorded before that turn,
  but only while the storyboard revision is unchanged since.
- Threads persist per project and reload. Earlier turns (the last 10) are
  passed as context, so "make it shorter again" resolves against the previous
  change.

## Scope

- [ ] Schemas: `editPlanSchema` (closed operation union, ≤ 12 operations per
      plan, ≤ 8 distinct scenes per plan), `editThreadMessageSchema`. The
      `edit-scene-field` paths must come from `sceneEditorMetadata`.
- [ ] Prompt `edit-plan/v1` in `provider-adapters`. Its inputs are the
      request, scope, scene summaries (template, title, on-screen text,
      duration, transition), editor field catalogue, measured narration
      durations and the last 10 turns. Source text goes only to the existing
      regeneration jobs, never to the planner. Never emits pixel coordinates,
      fonts or animation code.
- [ ] Migration: `lesson_edit_threads`, `lesson_edit_messages` (role, text,
      plan JSON, applied operation IDs, before/after revision, status).
      Project-owned, tenant-scoped.
- [ ] API: `GET/POST :projectId/edit-thread/messages` (Idempotency-Key
      required), `POST :projectId/edit-thread/plans/:planId/apply` (all or a
      subset), `POST :projectId/edit-thread/plans/:planId/undo`.
- [ ] Apply step dispatches only to the existing services/jobs above.
      Generated operations are tracked until their candidates are ready.
- [ ] UI panel per `docs/design.md`: thread, plan cards with rationale, apply
      / apply selected / dismiss, progress per operation, candidate review
      hand-off, undo, scope switcher, keyboard and screen-reader support.
- [ ] Cost controls: every turn counts against generation quota (E21-US2),
      with a per-thread turn limit (`MAX_EDIT_TURNS_PER_HOUR`, default 20).

## Acceptance Criteria

- [ ] AC1 "Make scene 3 simpler" with scene 3 selected yields a plan with one
      `regenerate-scene` (mode `simplify`). Applying it opens the existing
      before/after review, and rejecting it leaves the storyboard unchanged.
- [ ] AC2 A whole-lesson request ("make every on-screen line shorter")
      yields field edits for at most 8 scenes and tells the teacher when more
      scenes were left for a follow-up turn.
- [ ] AC3 A plan proposing a field path not in the template's editor
      metadata, or a value over its limit, is rejected server-side. The
      teacher sees "couldn't plan that change", never a partial apply.
- [ ] AC4 A request that conflicts with measured narration timing returns
      `answer-only` with the reason and an alternative.
- [ ] AC5 Applying a plan after the storyboard changed elsewhere returns 409
      with a re-plan action, and no operation runs.
- [ ] AC6 Undo restores the exact pre-turn revision. It is refused after any
      later edit.
- [ ] AC7 Reloading the page shows the full thread, including which plans
      were applied, partly applied, dismissed or undone.
- [ ] AC8 Messages are never logged. Audit metadata records only message
      length and operation counts (same treatment as `focusPrompt`, ADR-013 §3).
- [ ] AC9 A user without access to the project gets 404 on every thread
      endpoint.

## Required Tests

- [ ] Unit: plan schema limits, field-path validation against editor
      metadata, operation-to-service mapping.
- [ ] Prompt evaluation cases: single scene, multi-scene, whole lesson,
      timing conflict, ambiguous request (answer-only asking which scene),
      out-of-bounds request (layout coordinates).
- [ ] Integration (Postgres): message → plan → apply → candidate accept;
      stale-revision 409; undo; idempotent replay of a message.
- [ ] Authorization: cross-tenant thread access.
- [ ] UI: plan card states, partial apply, keyboard flow, reduced motion.
- [ ] E2E (Playwright, mocked provider): one full conversational edit through
      to preview.

## Out of Scope

- Editing after render. A finished MP4 is changed by editing the storyboard
  and re-rendering, as today.
- Changing the source document, objectives or outline through chat.
- Style pack, voice or sound-bed changes through chat.
- Voice input.
- Driving the one-shot runner from chat (a later story).
- Free-form layout instructions. The renderer owns layout, and the planner
  explains this with `answer-only`.

## Decisions for the product owner

- **Default scope.** Proposed: the selected scene, so whole-lesson changes
  are a deliberate switch.
- **Apply model.** Proposed: always propose, never auto-apply, even for
  simple field edits. This matches "review and edit every important
  AI-generated decision" (PRD objective 3).

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
