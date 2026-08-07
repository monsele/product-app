---
story_id: ST-052
title: "Resolve and Display Scene Source Citations"
phase: "04 \u2014 AI Planning and Grounding"
status: Ready
priority: must-have
epics: ["E19"]
prd_user_stories: ["E19-US1"]
depends_on: ["ST-042", "ST-050", "ST-037"]
---

# ST-052 — Resolve and Display Scene Source Citations

## Story

As a teacher, I want to see the exact pages, sections, blocks, figures, and tables supporting each generated scene.

## Outcome

Scene and narration references resolve to real approved-snapshot content and can open the relevant source context from the storyboard.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E19-US1
- `docs/reference/epic-technical-implementation-guide.md` — E19 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-042
- ST-050
- ST-037

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement citation-resolution service from SourceRef to teacher-facing labels and excerpts.
- [ ] Validate document ID, parsed version, section/block/figure/table IDs, and page ranges against the approved source snapshot.
- [ ] Create scene citation read APIs.
- [ ] Add citation panel to scene/storyboard UI with page, section, excerpt, and figure/table links.
- [ ] Support opening the affected source in ingestion review context.
- [ ] Display generated additions separately from source citations.

## Technical Implementation Requirements

- Application code derives page/section labels from stable IDs; the model does not supply trusted display labels.
- Excerpts are bounded and authorized.
- Missing or stale references become validation issues.
- Do not expose entire source documents on public share pages.

## Contracts and Persistence

- Resolved citation DTO.
- Citation resolution error codes.

## Interfaces

- `GET /projects/:id/scenes/:sceneId/citations`.
- Storyboard citation panel and source deep link.

## Acceptance Criteria

- [ ] Every valid SourceRef resolves to the expected source context.
- [ ] Invalid/stale IDs are reported and not silently ignored.
- [ ] Generated additions are visibly distinct.
- [ ] Only the project owner can retrieve source excerpts.
- [ ] Deep linking opens the correct section/block/page context.

## Required Tests

- [ ] Citation resolver tests.
- [ ] Stale/missing reference tests.
- [ ] Authorization/excerpt-bounds tests.
- [ ] Storyboard citation UI test.
- [ ] Source deep-link test.

## Out of Scope

- Automatic factual judgment.
- Public citation exposure.
- PDF page image viewer unless later added.

## Story-Specific Notes

- Technical guide references: E19 and source-package format.

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

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Contracts changed:**
- **Commands/tests run:**
- **Screenshots or representative output:**
- **Decisions and assumptions:**
- **Deviations from story/technical guide:**
- **Known risks or follow-up:**
