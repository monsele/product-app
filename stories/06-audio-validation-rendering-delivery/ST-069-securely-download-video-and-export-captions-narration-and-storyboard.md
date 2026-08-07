---
story_id: ST-069
title: "Securely Download Video and Export Captions, Narration, and Storyboard"
phase: "06 \u2014 Audio, Validation, Rendering, and Delivery"
status: Ready
priority: must-have
epics: ["E18"]
prd_user_stories: ["E18-US1", "E18-US3"]
depends_on: ["ST-004", "ST-027", "ST-060", "ST-064", "ST-068"]
---

# ST-069 — Securely Download Video and Export Captions, Narration, and Storyboard

## Story

As a teacher, I want to download the completed MP4 and supporting files from the exact approved lesson version.

## Outcome

Authorized export endpoints create short-lived downloads and version-correct SRT/VTT, narration, and storyboard files.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E18-US1, E18-US3
- `docs/reference/epic-technical-implementation-guide.md` — E18 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-004
- ST-027
- ST-060
- ST-064
- ST-068

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Implement completed-render download authorization and signed URL generation.
- [ ] Implement narration text/Markdown export from a selected lesson version.
- [ ] Implement storyboard readable Markdown/JSON export according to product choice.
- [ ] Integrate SRT/VTT export from the selected version’s caption tracks.
- [ ] Create export job only if generation cannot complete promptly; otherwise stream/store safely.
- [ ] Record export metadata and audit download actions.
- [ ] Build download actions and expired-link regeneration behavior.

## Technical Implementation Requirements

- Exports match an immutable selected lesson version.
- Signed URLs are short lived and regenerated after authorization.
- Do not expose private source document or internal storage keys in export files.
- Rendered MP4 is never proxied unnecessarily through application memory.
- Only completed, verified renders are downloadable.

## Contracts and Persistence

- Export type/result.
- Version export manifest.

## Interfaces

- `GET /projects/:id/renders/:renderId/download`.
- `POST/GET /projects/:id/exports` as appropriate.
- Download/export UI.

## Acceptance Criteria

- [ ] The correct verified MP4 downloads through an authorized expiring URL.
- [ ] Expired links can be regenerated.
- [ ] Narration, storyboard, SRT, and VTT match the selected version.
- [ ] Unauthorized users cannot retrieve exports.
- [ ] Files do not disclose private object keys or unrelated project data.

## Required Tests

- [ ] Signed download authorization/expiry tests.
- [ ] Version correctness tests.
- [ ] Golden-file narration/storyboard/caption exports.
- [ ] Cross-user tests.
- [ ] Audit-event test.

## Out of Scope

- Shareable public link.
- Direct external publishing.
- Source document export.

## Story-Specific Notes

- Technical guide references: E18.

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
