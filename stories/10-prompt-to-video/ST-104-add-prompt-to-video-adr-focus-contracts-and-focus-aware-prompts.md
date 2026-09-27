---
story_id: ST-104
title: "Add the Prompt-to-Video ADR, Focus and Audience Contracts, and Focus-Aware Prompts"
phase: "10 — Prompt to Video"
status: Done
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

- **Agent:** Claude Code (claude-opus-5-5)
- **Started:** 2026-09-27
- **Completed:** 2026-09-27
- **Branch/PR:** `feat/st-104-focus-audience-contracts`, cut from `feat/st-103-sound-bed-and-render-review` at `e270a87`. Not pushed; no PR.
- **Files changed:**
  - ADR and docs:
    - `docs/adr/ADR-013-prompt-to-video-pilot.md` (new)
    - `packages/schemas/LESSONSPEC_COMPATIBILITY.md`
    - `packages/evals/README.md`
  - Schemas (`packages/schemas`):
    - `src/index.ts`: audience enums, `lessonFocusPromptSchema` and `focusPromptParam`, and configuration plus input `focusPrompt`.
    - Also in `src/index.ts`: params `focusPrompt`, `objectiveFocusCoverageSchema`, `objectiveOutputV2Schema` and `objectiveOutputSchema`, and set `focusCoverage`.
    - Also in `src/index.ts`: LessonSpec 1.9 with in-place 1.8 reading, the four compatibility constants bumped, the `ai.lesson-intent` operation, and the lesson-intent contracts.
    - `lesson-spec-v1.schema.json`: regenerated.
    - `src/focus-audience.test.ts`: new.
    - Existing tests updated: `lesson-spec`, `lesson-configuration`, `narration`, `demonstration-pilot`.
  - Prompts (`packages/provider-adapters`):
    - New prompt files: `prompts/objectives/v3.ts`, `prompts/outline/v3.ts`, `prompts/narration/v4.ts`, `prompts/storyboard/v3.ts` and `prompts/lesson-intent/v1.ts`.
    - `prompts/audience.ts` (new): the `{{focus}}` and `{{audience}}` variables.
    - Registered in `prompts/index.ts`. `prompts.ts` adds the `lesson-intent` kind, and `job-envelope.ts` adds `ai.lesson-intent`.
    - `dynamic-mock-provider.ts`: V2 objectives with a keyword-based coverage stand-in, the new narrator identity, and lesson intent.
    - Tests: `src/focus-prompts.test.ts` (new) and `src/prompts.test.ts`.
  - Database (`packages/database`):
    - `src/schema.ts`: `lesson_configurations.focus_prompt`, `learning_objective_sets.focus_coverage`, and the usage enum value.
    - `drizzle/0068_focus_prompt_and_audience.sql` and its `.compatibility.md`.
    - `drizzle/meta/_journal.json`.
  - Observability (`packages/observability`):
    - `src/model-calls.ts` (new): `PostgresModelCallRepository` and `PostgresGenerationQuotaGuard`, moved unchanged from the worker.
    - `src/index.ts` and `package.json`.
  - Worker (`apps/pipeline-worker`):
    - `src/model-call.ts`: fills `{{focus}}` and `{{audience}}`, and re-exports the moved classes.
    - `src/objectives-job.ts`: accepts V1 or V2 output and persists `focusCoverage`.
    - Tests: `objectives-job.test.ts`. The persist-call casts in `narration-job.test.ts`, `outline-job.test.ts` and `storyboard-job.test.ts` are there because the parsed params type now has an optional key.
  - API (`apps/api`):
    - `src/lesson-configuration.ts`: persists `focusPrompt`; audit records only `focusSet`.
    - `src/objectives.ts`, `outline.ts`, `narration.ts`, `storyboard.ts`: `focusPromptParam` in params. `objectives.ts` also exposes and clones `focusCoverage`.
    - `src/lesson-versions.ts`: writes 1.9 and restores 1.8 or 1.9.
    - `src/lesson-intent.ts` (new): `LessonIntentService` and `ProviderLessonIntentService`.
    - `package.json`: adds `@avlp/provider-adapters`.
    - Tests: `src/focus-intent.integration.test.ts` (new), `lesson-configuration.integration.test.ts` and `lesson-versions.test.ts`.
  - Web (`apps/web`):
    - `configuration/lesson-configuration-input.ts`: labels, form state, save input and change detection.
    - `configuration/configuration-workspace.tsx`: the focus textarea with helper text, character count and inline error, plus a responsive difficulty grid.
    - `objectives/objectives-input.ts` and `objectives/objectives-panel.tsx`: the coverage notice.
    - Unit tests for all of the above.
  - E2E: `e2e/focus-prompt.spec.ts` (new).
  - Evals: `src/runner.test.ts`.
  - Lockfile: `pnpm-lock.yaml`, with three workspace-link entries only.
- **Migrations:** `0068_focus_prompt_and_audience`. It is additive, with no backfill.
  - Nullable `lesson_configurations.focus_prompt`, with a check constraint for 1-1,000 characters and no surrounding spaces.
  - Nullable `learning_objective_sets.focus_coverage jsonb`.
  - `usage_operation_type` gains `'ai.lesson-intent'`.
  - Age band and difficulty are unconstrained `text`, so they need no DDL.
  - Applied cleanly by every Postgres integration suite.
- **Public contract changes:**
  - `PUT /projects/:id/configuration`:
    - Accepts the optional `focusPrompt`. Omitted keeps the stored value, and `null` clears it.
    - Accepts the new `ageBand` and `difficulty` values.
    - The response carries `configuration.focusPrompt`. The reader defaults an absent key to `null`.
  - `GET /projects/:id/objectives` returns `set.focusCoverage` (and `approved.focusCoverage`). It is absent for sets generated before v3.
  - LessonSpec: writers emit `1.9`, and readers accept `1.8` in place.
  - Prompts: objectives, outline and storyboard go to `v3`, and narration to `v4`; older versions stay registered. `lesson-intent/v1` is new.
  - Operation `ai.lesson-intent` is added.
  - Service `LessonIntentService.infer({ ownerUserId, projectId, focusPrompt, idempotencyKey, correlationId })` returns `{ subject, lessonTitle, modelCallId }`. It has no endpoint.
- **Commands/tests:**
  - Integration suites ran with `TEST_DATABASE_URL` set to the local Postgres container (`localhost:5433`).
  - `packages/schemas`: `vitest run`, 383 passed (12 new ST-104 tests). `tsc` build, and `eslint src` clean.
  - `packages/provider-adapters`: 79 passed (17 new: rendering with and without a focus, no unfilled variables, no science or age-range wording, three subjects, coverage states, and lesson intent). Build and lint clean.
  - `packages/observability`: 10 passed. `packages/database`: 11 passed (Postgres). `packages/evals`: 7 passed. `packages/test-fixtures`: 13 passed. `apps/renderer`: 54 passed, 2 skipped.
  - `apps/pipeline-worker`: unit and objectives tests pass (16 in `objectives-job.test.ts`, including pinned v2, v3 not_covered, and v3 without a focus). `tsc`, lint and build are clean.
  - `apps/api`:
    - `focus-intent.integration.test.ts`, 7 passed. Covers:
      - the focus in params, `inputVersion` and idempotency key
      - reuse on the same focus
      - no focus text in audit metadata
      - `not_covered` surfaced, and a legacy set shown with no coverage
      - lesson intent recording `model_calls` and `usage_records` rows
      - body text never sent
      - quota 429 before any provider call
      - a reused key rejected without re-billing
      - tenant scoping
    - `lesson-configuration.integration.test.ts`: 16 passed (focus save, reload, keep, clear and audit, plus the database constraint).
    - `lesson-versions.test.ts`: 19 passed (1.9 snapshot; a stored 1.8 snapshot restores unchanged; 1.8 rejects the new audience values).
    - Full suite, run serially against Postgres: 620 of 620 passed.
  - `apps/web`: `vitest run`, 280 passed. `tsc --noEmit` and `eslint .` clean, and `next build` succeeds.
  - E2E (`npx playwright test`):
    - `e2e/focus-prompt.spec.ts`, 2 passed: the focus field and adult or advanced options save, persist across a reload, and clear to `null`; the `not_covered` notice renders and approval stays enabled.
    - `e2e/sound-bed.spec.ts`, 2 passed (regression).
  - `pnpm install --frozen-lockfile --offline --lockfile-only` accepts the lockfile.
- **Screenshots/output:** `apps/api` full suite run serially against Postgres (`vitest run --no-file-parallelism`): 64 files and 620 tests passed. `apps/web` `next build` succeeded. `graphify update .` ran after the code changes.
- **Decisions/assumptions:**
  1. **ADR numbering.** The story names ADR-012, but ST-103 already owns ADR-012, so this is ADR-013. It is marked Accepted on the product decisions recorded in this story (2026-09-25). The product owner confirms it at this review, before merge.
  2. **LessonSpec 1.8 is read in place, not migrated.** `lessonSpecSchema.schemaVersion` is `1.8 | 1.9`, and 1.8 is restricted to its audience values. Stored lesson versions therefore keep byte-identical content, content hashes and render identity (ST-098 parity). The eval baseline fixtures stay on 1.8 on purpose. Versions 1.0-1.7 migrate to the current version (now 1.9), as before.
  3. **Focus enters params only when present** (`focusPromptParam`). An unfocused lesson keeps its pre-story params hash. The prompt-version bump alone still gives it a new input version.
  4. **Worker variables.** The worker fills `{{focus}}` (`none` without one) and `{{audience}}` for every model call from the pinned params. Older prompt versions ignore them, so jobs pinned to v2 or v3 behave as before, and the pinned-v2 test proves it.
  5. **`focusCoverage` lives on the objective set** (`set.focusCoverage`) and is carried when an approved set is cloned to a draft. Teacher edits do not re-judge coverage.
  6. **Where lesson intent lives.** `LessonIntentService` sits in the API, as ST-105 needs, and reuses the worker's model-call repository and quota guard, moved to `@avlp/observability` and re-exported by the worker so no worker import changed.
     - The result is not stored, so a reused idempotency key is rejected with 409 rather than re-billed. This avoids an unmetered duplicate call.
     - It reads the parsed document title and `parsed_sections` headings only.
  7. **The audit never holds the focus.** Audit metadata records `focusSet: boolean`. The existing redaction also masks any `*prompt` key.
  8. **Tolerant reader.** `lessonConfigurationSchema.focusPrompt` defaults an absent key to `null`. A response from a pre-ST-104 API (or an older test stub) would otherwise break the configuration screen, as e2e showed with the ST-103 stub.
  9. **Code review round 1 (story-code-review) raised two findings; both are fixed.**
     - **High: whole-file line-ending churn.** Edits had converted 12 CRLF/mixed files to LF. Each file's original line endings are restored, and `git diff --numstat` now matches `--ignore-cr-at-eol` for every file.
     - **Medium: an unmetered paid call on a same-key race in `LessonIntentService`.** A call that loses the idempotent model-call insert is now recorded and metered under `<key>:concurrent:<recordId>`. A new Postgres test covers it (`focus-intent.integration.test.ts`, 8/8).
     - After the fixes: schemas 383, provider-adapters 79, evals 7, observability 8 (+2 skipped), API `lesson-versions` 19, and web workspace 236 passed; web `tsc` clean.
- **Deviations:**
  1. The ADR is numbered 013, not 012 (see Decisions 1).
  2. The coverage report is at `set.focusCoverage` in `GET /objectives`, not top level.
  3. Moving the model-call repository and quota guard to `@avlp/observability` was a necessary refactor so the API does not duplicate model-call plumbing. The code is unchanged.
  4. `narration-block/v1` and `scene-regeneration/v2` still say "science narrator … aged 10-16". The story names only the four generation prompts, so moving these two is a follow-up.
- **Known risks/follow-up:**
  - Pre-existing failures, identical to those ST-103 recorded and unrelated to this story:
    - pixel-hash snapshots in `scene-library` (`full-lesson-render`, `scene-preview-render-smoke`, `summary-scene-render`) and `design-system` (`video-preview-render-smoke`)
    - `pipeline-worker` document-ingestion integration, which needs the Docling service
    - `pipeline-worker` duration-reconciliation (33 vs 34 s)
    - stale `e2e/lesson-configuration.spec.ts` and `e2e/objectives.spec.ts`, which assert headings the UI no longer has and a toast/notice strict-mode duplicate
  - The mock provider judges focus coverage by keyword overlap. Real coverage quality depends on the model and needs live evaluation (the `objectives-v3-focus-coverage` eval case is named but has no fixture yet).
  - `LessonIntentService` is not wired into the API runtime yet. ST-105 constructs it with the Together provider and a `PostgresGenerationQuotaGuard` limit for `ai.lesson-intent`.
  - The next frontier after approval is ST-105 (it also depends on ST-059, ST-063, ST-066, ST-068 and ST-096, all Done).
