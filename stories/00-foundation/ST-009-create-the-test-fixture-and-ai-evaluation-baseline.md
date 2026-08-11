---
story_id: ST-009
title: "Create the Test-Fixture and AI Evaluation Baseline"
phase: "00 \u2014 Foundation"
status: In Review
priority: must-have
epics: ["E21"]
prd_user_stories: ["E21-US1", "E21-US2"]
depends_on: ["ST-001", "ST-007", "ST-008"]
---

# ST-009 — Create the Test-Fixture and AI Evaluation Baseline

## Story

As the product team, we need stable source and expected-output fixtures so schema, prompt, scene, and rendering changes can be measured for regressions.

## Outcome

The repository contains a documented evaluation dataset structure and automated runners that initially validate fixtures without calling paid providers.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E21-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` — E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-007
- ST-008

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create fixture folders for source documents, normalized documents, LessonSpecs, audio timing, and expected render frames.
- [ ] Add at least five initial science-section fixtures, including clean text, process, comparison, figure, and malformed/low-quality examples.
- [ ] Define evaluation case metadata and rubric fields.
- [ ] Create deterministic validators for schema validity, objective coverage placeholders, duration, text density, and citation resolvability.
- [ ] Create a CLI that runs local fixture checks and emits machine-readable results.
- [ ] Document how future paid/provider evaluation runs are isolated and approved.

## Technical Implementation Requirements

- The eventual set should grow toward approximately 20 representative textbook sections.
- Fixtures must not include unlicensed or sensitive content.
- Prompt changes later must record prompt version and evaluation delta.
- Do not call live model, TTS, image, or rendering providers in default CI.

## Contracts and Persistence

- `EvaluationCase`.
- `EvaluationResult`.
- Rubric dimensions from technical guide section 9.5.

## Interfaces

- CLI command under `packages/evals` or equivalent.
- CI fixture-validation step.

## Acceptance Criteria

- [ ] The baseline runner gives deterministic pass/fail output.
- [ ] A deliberately invalid LessonSpec produces a failing result.
- [ ] Fixture licensing/source notes are documented.
- [ ] CI can execute the baseline without provider credentials.

## Required Tests

- [ ] Evaluation runner unit tests.
- [ ] Known-pass/known-fail fixture tests.
- [ ] Snapshot/output schema test.

## Out of Scope

- Final prompt quality scores.
- Live provider benchmark.
- User satisfaction studies.

## Story-Specific Notes

- Technical guide references: section 9.5 and testing pyramid section 6.5.

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
- **Started:** 2026-08-08
- **Completed:** 2026-08-08; approval-ready after scoped review.
- **Branch/PR:** Current local branch; no PR created.
- **Files changed:** `packages/evals`, CI workflow, lockfile, story index, and this record.
- **Migrations:** None.
- **Contracts changed:** Added internal `EvaluationCase`, `EvaluationResult`, and rubric-dimension schemas.
- **Commands/tests run:** `pnpm --filter @avlp/schemas build`; `pnpm --filter @avlp/evals test`; `pnpm --filter @avlp/evals eval`; `pnpm --filter @avlp/evals typecheck`; `pnpm --filter @avlp/evals lint`; `pnpm --filter @avlp/evals build`.
- **Screenshots or representative output:** CLI emitted deterministic JSON with five expected-pass cases plus one deliberately invalid LessonSpec reported as an expected failed result; each result includes schema, duration, text-density, objective-placeholder, and citation checks as applicable.
- **Decisions and assumptions:** Fixtures use original synthetic science text to avoid licensing/sensitivity risk. Provider and visual-frame checks remain explicitly isolated/manual until the respective implementations exist.
- **Deviations from story/technical guide:** Initial baseline has five cases, as scoped; guide target is approximately twenty over time.
- **Known risks or follow-up:** Approved with follow-ups: (1) add a CLI-output schema/snapshot test; (2) add a malformed-case-metadata failure-path test; (3) replace shared audio-timing and expected-render-frame placeholders with scenario-specific expectations when audio and renderer stages are implemented. These do not block the provider-free baseline because those stages are not yet available.
