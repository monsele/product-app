---
story_id: ST-104
title: "Add the Prompt-to-Video ADR, Focus and Audience Contracts, and Focus-Aware Prompts"
phase: "10 — Prompt to Video"
status: Ready
priority: should-have
epics: ["E6", "E7", "E8", "E9", "E10", "E19"]
prd_user_stories: ["E6-US1", "E6-US2", "E6-US3", "E7-US1", "E8-US1", "E9-US1", "E10-US1"]
depends_on: ["ST-077", "ST-090", "ST-102"]
---

# ST-104 — Add the Prompt-to-Video ADR, Focus and Audience Contracts, and Focus-Aware Prompts

## Story

As a teacher or a self-learner, I want to tell the system what I want a lesson to focus on,
and have it pitched at an adult or advanced level when needed. The generated objectives,
outline, narration and storyboard should then explain what I asked about, for any subject.

## Outcome

This is the first of three stories that deliver prompt-to-video (ST-104 → ST-105 → ST-106).
It makes the architecture decision and delivers everything the automatic runner needs from
contracts and prompts. It is useful on its own: the normal wizard gets an optional focus field.

- ADR-012 is accepted.
- A lesson configuration can carry an optional `focusPrompt`.
- The audience contract adds an `advanced` difficulty and adult bands. LessonSpec goes to
  1.9 and stays compatible with 1.8.
- New prompt versions use the focus and the audience and are subject-neutral. Objectives
  generation reports whether the document covers the focus.
- A small `ai.lesson-intent` call infers the subject and title from the prompt and the
  document headings.

## Product Decisions (recorded 2026-09-25)

| Decision | Choice |
| --- | --- |
| Users | Both teachers (drafting for students) and self-learners (adult or professional) |
| Automation | Automatic up to the preview; exactly one human approval before render (ST-105/ST-106) |
| Rollout | Pilot cohort flag, server-enforced (ST-105) |
| Depth | Add an `advanced` difficulty and adult audience bands |
| Subjects | Any subject; engineering was an example only |
| Frameworks | No LangChain, LangGraph or agent SDK; reuse `@avlp/jobs` and the existing NestJS services |

## Conflicts the ADR must resolve

- PRD objective 3 (`docs/reference/mvp-prd.md:47`) says teachers "review and edit every
  important AI-generated decision". The core workflow (`:125-173`) and the approval rules for
  objectives and outline (`:692`, `:739`) say the same.
- Technical guide §2.2 (`epic-technical-implementation-guide.md:63`): "The generation pipeline
  is not one long autonomous operation."
- `docs/reference/mvp-plan.md:437` excludes "fully autonomous publishing".
- The PRD market boundary (`mvp-prd.md:27-28`) is introductory science for learners aged 10–16.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md`: E6–E10, E19
- `docs/reference/epic-technical-implementation-guide.md`: §2.2, §5.1, §5.3
- `docs/adr/ADR-001`, `ADR-003`, `ADR-005`, `ADR-007`, `ADR-008`
- `packages/provider-adapters/src/prompts/`, including `prompts.ts` and `index.ts`
- `docs/design.md`, for the configuration field

## Dependencies

ST-077, ST-090, ST-102. All are Done.

## Scope

### 1. ADR

- [ ] **Write `docs/adr/ADR-012-prompt-to-video-pilot.md`.** It supersedes the four conflicts
  above for the pilot cohort only. ADR-005 is the precedent.
- [ ] **What the ADR keeps:**
  - grounding checks and citations
  - deterministic blocking validation
  - immutable versions and manifests
  - a human gate before render (no autonomous publishing)
  - an audit entry for every automatic approval
- [ ] **What the ADR records:**
  - an orchestration consumer hosted in the API process (built in ST-105)
  - no agent framework
- [ ] **Acceptance:** the product owner accepts the ADR before any contract change merges.

### 2. Contracts (shared schemas first)

- [ ] **`focusPrompt`.** Add an optional `focusPrompt` (1–1,000 characters, trimmed) to
  `lessonConfigurationSchema` (`packages/schemas/src/index.ts` ~:2697), plus a
  `focus_prompt` column on `lesson_configurations`.
- [ ] **Audience values.** Add `advanced` to difficulty. Add `adult-intermediate` and
  `adult-professional` to `ageBand`. Existing values are unchanged.
- [ ] **LessonSpec 1.9.** LessonSpec `audience` accepts the new values, so bump
  `schemaVersion` 1.8 → 1.9. Readers accept 1.8, and existing lesson versions stay valid.
- [ ] **Params.** Add `focusPrompt` to the params schemas for objectives, outline, narration
  and storyboard (`index.ts` :4073, :4462, :4966, :6219). The API services
  (`apps/api/src/{objectives,outline,narration,storyboard}.ts`) map it from the
  configuration, so it enters `inputVersion` and the idempotency key.
- [ ] **Coverage output.** Add `objectiveOutputV2Schema` with `focusCoverage`, which is one of:
  - `{ status: "covered" }`
  - `{ status: "partial", missing: string[] }`
  - `{ status: "not_covered", reason }`
  - When there is no focus, the value is always `covered`.

### 3. Prompts

- [ ] **New versions.** Add `objectives/v3`, `outline/v3`, `narration/v4` and `storyboard/v3`.
  Each one:
  - takes a `{{focus}}` slot, filled with `"none"` when there is no focus, because
    `renderPrompt` rejects unfilled variables (`prompts.ts:137`)
  - uses wording driven by audience and difficulty, with the hardcoded "aged 10-16" text removed
  - is subject-neutral: the domain comes from `{{configuration}}.subject`, and science-only
    phrasing is removed
- [ ] **Focus coverage.** `objectives/v3` must choose objectives that serve the focus, cite
  only relevant blocks, and report `focusCoverage`. Outline and narration already narrow to
  the blocks the objectives cite (`outline.ts:178-185`, `narration.ts:272`). This is how the
  focus narrows everything downstream. Do not add retrieval.
- [ ] **Register the versions.** Bump the `current*GenerationCompatibility` constants
  (`index.ts:4302, 4615, 4995, 6248`) and register them in `prompts/index.ts`. Older prompt
  versions stay registered.
- [ ] **`ai.lesson-intent`.** Add a small structured call, prompt `lesson-intent/v1`, returning
  `{ subject, lessonTitle }`.
  - Its input is the focus prompt plus the document title and section headings only. It
    never receives the full text.
  - It uses the existing model-call plumbing: quota, usage record and repair policy.
  - Expose it as a service method for ST-105. It has no public endpoint in this story.

### 4. Wizard

- [ ] **Configuration field.** Add an optional "What should the lesson focus on?" field to the
  configuration screen (`apps/web/app/workspace/[projectId]/configuration/`).
  - It saves `focusPrompt`.
  - It offers the new audience options.
  - Follow `docs/design.md`.
- [ ] **Objectives panel.** When generated objectives report `partial` or `not_covered`, show
  the coverage result as an advisory notice.

## Technical Implementation Requirements

- The new enum values must not break existing rows, fixtures or render parity (ST-098).
- Prompt versions are pinned per job, so in-flight jobs finish on their original version.
- Never log `focusPrompt`. Treat it as user content, like source text.
- No subject-specific branching anywhere.

## Contracts and Persistence

- Schemas: `focusPrompt`, the new difficulty and `ageBand` values, LessonSpec 1.9,
  `objectiveOutputV2Schema`, and the params additions.
- Prompts: the four new versions plus `lesson-intent/v1`.
- Migration: the `focus_prompt` column, plus the enum and check-constraint values.

## Interfaces

- `PUT /projects/:projectId/configuration` accepts `focusPrompt` and the new audience values.
- `GET /projects/:projectId/objectives` includes `focusCoverage`.
- Service: `LessonIntentService.infer(...)`, used internally by ST-105.

## Acceptance Criteria

- [ ] ADR-012 exists and is accepted.
- [ ] A lesson configured with a focus generates objectives, outline and narration that
  address the focus. A lesson without a focus behaves as before.
- [ ] Each of three different-subject fixtures (for example engineering, history and biology)
  produces subject-appropriate objectives with no science-specific wording.
- [ ] A focus the document cannot answer produces `focusCoverage.status = "not_covered"`
  with a reason, shown as a notice.
- [ ] `adult-professional` with `advanced` produces a 1.9 LessonSpec. Existing 1.8 lesson
  versions still load, preview and re-render unchanged.
- [ ] `ai.lesson-intent` returns a subject and title, records usage, and never receives the
  full source text.
- [ ] Changing the focus changes the idempotency key, so a new generation runs rather than a
  cached one.

## Required Tests

- [ ] **Unit:**
  - the new enum values, and 1.8/1.9 schema compatibility
  - `focusCoverage` parsing
  - prompt rendering with and without a focus
  - no unfilled variables in any new version
- [ ] **Integration** (mock provider):
  - focus flows into the params hash
  - `not_covered` is surfaced
  - `lesson-intent` records usage and quota
- [ ] **Regression:** existing lesson fixtures validate and render unchanged (ST-098 parity).
- [ ] **UI:** the focus field saves and reloads, the audience options appear, and the coverage
  notice renders.

## Out of Scope

- The automatic runner (ST-105).
- The prompt-to-video screens (ST-106).
- The brief, budget and self-repair work (ST-107).
- Retrieval or embeddings.
- New scene templates.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test and build commands pass for the affected workspaces.
- [ ] Documentation and migrations are complete.
- [ ] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

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
