---
story_id: ST-037
title: "Build the Ingestion Review Document Viewer"
phase: "03 \u2014 Ingestion and Lesson Configuration"
status: Ready
priority: must-have
epics: ["E5"]
prd_user_stories: ["E5-US1"]
depends_on: ["ST-027", "ST-034", "ST-035", "ST-036"]
---

# ST-037 — Build the Ingestion Review Document Viewer

## Story

As a teacher, I want to inspect detected sections, text, figures, tables, pages, and warnings before AI uses the source.

## Outcome

An owner-authorized hierarchical viewer presents the normalized document and contextual warnings without exposing raw storage keys.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E5-US1
- `docs/reference/epic-technical-implementation-guide.md` — E5 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-027
- ST-034
- ST-035
- ST-036

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement parsed-document read APIs optimized for hierarchical review.
- [ ] Display document title, page count, section tree, expandable content blocks, page references, figures, tables, and warnings.
- [ ] Generate authorized short-lived figure preview URLs.
- [ ] Support navigation from a warning to the affected item.
- [ ] Handle empty sections, unsupported blocks, loading, and stale-version states.
- [ ] Keep large review payloads bounded through lazy section loading if necessary.

## Technical Implementation Requirements

- The viewer shows normalized content, not raw Docling provider structures.
- Display the parsed version being reviewed.
- No edit behavior is implemented in this story.
- Accessibility: keyboard navigation, visible labels, and status not based on color alone.

## Contracts and Persistence

- Review document/section DTOs.
- Warning-to-item locator.

## Interfaces

- `GET /projects/:id/parsed-document`.
- `GET /projects/:id/parsed-document/sections/:sectionId` if lazy.
- Ingestion review route.

## Acceptance Criteria

- [ ] The section hierarchy and page references match normalized data.
- [ ] Figures and tables are viewable only by the owner.
- [ ] Warnings navigate to the affected content.
- [ ] Refresh preserves the current parsed version and route state.
- [ ] Cross-user access fails.

## Required Tests

- [ ] API authorization tests.
- [ ] Hierarchy UI tests.
- [ ] Figure signed-URL test.
- [ ] Warning navigation Playwright test.
- [ ] Large-section loading test.

## Out of Scope

- Section selection/editing.
- Source PDF side-by-side viewer unless later added.
- AI generation.

## Story-Specific Notes

- Technical guide references: E5.

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
