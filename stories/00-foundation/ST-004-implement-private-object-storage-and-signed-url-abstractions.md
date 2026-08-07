---
story_id: ST-004
title: "Implement Private Object Storage and Signed-URL Abstractions"
phase: "00 \u2014 Foundation"
status: Ready
priority: must-have
epics: ["E3", "E13", "E17", "E18", "E21"]
prd_user_stories: ["E3-US1", "E13-US2", "E17-US1", "E18-US1", "E21-US3"]
depends_on: ["ST-001", "ST-002"]
---

# ST-004 — Implement Private Object Storage and Signed-URL Abstractions

## Story

As the system, I need private object storage behind an application-owned interface so source documents and media are never public by default.

## Outcome

Applications can upload, read metadata, generate short-lived authorized URLs, and delete objects without depending on one storage provider.

## Required Reading

- `AGENTS.md`
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/reference/mvp-prd.md` — E3-US1, E13-US2, E17-US1, E18-US1, E21-US3
- `docs/reference/epic-technical-implementation-guide.md` — E3, E13, E17, E18, E21 plus applicable cross-cutting sections
- `docs/reference/mvp-features.md` and `docs/reference/mvp-plan.md` for MVP constraints

## Dependencies

- ST-001
- ST-002

Do not start this story until every dependency is marked **Done** in `STORY_INDEX.md`.

## Scope

- [ ] Create an S3-compatible storage adapter interface and local-development implementation.
- [ ] Implement tenant-scoped storage key builders using user, project, entity, and version IDs.
- [ ] Implement presigned upload and download URL generation.
- [ ] Implement object metadata, existence, checksum, and deletion methods.
- [ ] Define MIME-type and content-length constraints accepted by signed upload requests.
- [ ] Add lifecycle/retention configuration hooks.
- [ ] Document local object storage setup.

## Technical Implementation Requirements

- Buckets are private.
- Signed URLs are created only after application authorization.
- Storage keys never contain user-controlled path traversal fragments.
- Do not persist signed URLs; persist stable object keys.
- Support the key conventions in technical guide section 6.2.

## Contracts and Persistence

- `ObjectStorage` interface.
- `StorageObjectRef`.
- `SignedUploadRequest` and `SignedDownloadRequest`.
- Storage key builder.

## Interfaces

- No public HTTP product endpoint in this story; expose package methods and adapter tests.
- Local development can use an S3-compatible service or deterministic mock.

## Acceptance Criteria

- [ ] Objects are private unless accessed through an authorized signed URL.
- [ ] The adapter rejects keys outside the configured bucket/prefix.
- [ ] Signed URLs expire and are not stored in logs.
- [ ] Checksums and metadata can be retrieved after upload.

## Required Tests

- [ ] Adapter contract tests.
- [ ] Path traversal tests.
- [ ] Signed URL expiry configuration test.
- [ ] Unauthorized key-prefix test.

## Out of Scope

- Document upload workflow.
- Asset UI.
- Render download endpoint.

## Story-Specific Notes

- Technical guide references: architecture principle 2.6, section 6.2, and E21.

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
