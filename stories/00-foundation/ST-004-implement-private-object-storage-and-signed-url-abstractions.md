---
story_id: ST-004
title: "Implement Private Object Storage and Signed-URL Abstractions"
phase: "00 \u2014 Foundation"
status: Done
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

- [x] Create an S3-compatible storage adapter interface and local-development implementation.
- [x] Implement tenant-scoped storage key builders using user, project, entity, and version IDs.
- [x] Implement presigned upload and download URL generation.
- [x] Implement object metadata, existence, checksum, and deletion methods.
- [x] Define MIME-type and content-length constraints accepted by signed upload requests.
- [x] Add lifecycle/retention configuration hooks.
- [x] Document local object storage setup.

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

- [x] Objects are private unless accessed through an authorized signed URL.
- [x] The adapter rejects keys outside the configured bucket/prefix.
- [x] Signed URLs expire and are not stored in logs.
- [x] Checksums and metadata can be retrieved after upload.

## Required Tests

- [x] Adapter contract tests.
- [x] Path traversal tests.
- [x] Signed URL expiry configuration test.
- [x] Unauthorized key-prefix test.

## Out of Scope

- Document upload workflow.
- Asset UI.
- Render download endpoint.

## Story-Specific Notes

- Technical guide references: architecture principle 2.6, section 6.2, and E21.

## Implementation Checklist

- [x] Inspect the current repository and related completed stories.
- [x] Write a short implementation plan listing files, contracts, migrations, tests, and risks.
- [x] Implement only this story's scope.
- [x] Add or update schemas before changing consumers.
- [x] Add authorization, validation, error, retry, concurrency, and idempotency behavior where applicable.
- [x] Add structured logs, correlation, audit, and usage records where applicable.
- [x] Run the required automated tests and affected workspace quality commands.
- [x] Self-review the diff for scope creep, insecure access, stale data races, and unbounded provider calls.
- [x] Update documentation and this story's Dev Agent Record.

## Definition of Done

- [x] Every acceptance criterion is implemented and verified.
- [x] Every required test is implemented and passing.
- [x] `lint`, `typecheck`, `test`, and `build` pass for all affected workspaces.
- [x] Database migrations and compatibility notes are complete where applicable.
- [x] Public schemas, events, and endpoints are documented.
- [x] No unresolved tenant-isolation, security, idempotency, concurrency, data-loss, or cost-control defect remains in this scope.
- [x] No out-of-scope feature or unrelated refactor was added.
- [x] The Dev Agent Record is complete.
- [x] This story and `STORY_INDEX.md` are marked **Done**.

## Dev Agent Record

- **Agent:** Codex
- **Started:** 2026-08-07
- **Completed:** 2026-08-07
- **Branch/PR:** `main` (the worktree already contained uncommitted ST-001–ST-003 changes, so no branch switch or publication was performed)
- **Files changed:** `.github/workflows/ci.yml`, `packages/storage/package.json`, `packages/storage/README.md`, `packages/storage/src/index.ts`, `packages/storage/src/contracts.ts`, `packages/storage/src/keys.ts`, `packages/storage/src/keys.test.ts`, `packages/storage/src/s3-compatible.ts`, `packages/storage/src/s3-compatible.test.ts`, `packages/storage/src/s3-compatible.integration.test.ts`, `packages/config/src/index.ts`, `packages/config/src/index.test.ts`, `docker-compose.yml`, `pnpm-lock.yaml`, `STORY_INDEX.md`, and this story record.
- **Migrations:** None.
- **Contracts changed:** Added `ObjectStorage`, `StorageObjectRef`, signed upload/download request and result contracts, object metadata/checksum and explicit full-replacement lifecycle contracts, validated storage-key builders, the async privacy-verifying S3-compatible adapter factory, and validated `OBJECT_STORAGE_*`, secure-endpoint opt-in, signed-URL TTL, and upload-size configuration.
- **Commands/tests run:** `pnpm --filter @avlp/storage add ...`; focused storage/config lint, typecheck, test, and build commands; live `pnpm --filter @avlp/storage test:integration` against Compose MinIO; `pnpm exec turbo run test --filter=@avlp/storage --force` with the CI storage environment; `docker compose config --quiet`; `pnpm run ci`; `pnpm format:check`; `git diff --check`. All passed. Storage unit suite: 19 tests passed; CI-equivalent storage suite: 22 tests passed, including 3 live MinIO tests; config suite: 8 tests passed; repository CI: all lint/typecheck/test/build tasks passed across 12 workspaces.
- **Screenshots or representative output:** Unit tests verify private ACLs, bucket ACL/policy rejection, tenant-prefix rejection, traversal rejection, MIME/length limits, SHA-256 metadata mapping, existence/deletion, TTL bounds, and explicit lifecycle replacement. The live MinIO contract performed an actual presigned upload and trusted `HEAD`, verified checksum/metadata, rejected an altered MIME header, unsigned private access, and an expired signed URL, then deleted the object and test bucket.
- **Decisions and assumptions:** MinIO is the local S3-compatible implementation; the bucket initializer explicitly disables anonymous access. The async factory fails closed for insecure endpoints unless a caller explicitly supplies a non-production runtime environment and a loopback endpoint; the shared storage configuration applies the same production and loopback rules. The factory verifies bucket ACL/policy privacy before signing. Stable keys begin at `users/` and are generated only from validated UUIDv7 tenant/entity IDs and fixed filenames/extensions. Authorization remains an application-service responsibility before requesting a signed URL; ST-004 intentionally exposes no HTTP endpoint. `replaceLifecycleConfiguration` requires a complete desired rule set and is reserved for one serialized infrastructure reconciler; deletion workflows define final retention periods later.
- **Deviations from story/technical guide:** None. The story was marked `Done` after human approval.
- **Known risks or follow-up:** Production infrastructure must still enforce encryption at rest, least-privilege credentials, CORS, and approved retention periods. Bucket ACL/policy privacy and TLS endpoint posture are now checked before signed access; the live MinIO contract runs in CI. Application-level owner/project authorization remains scheduled for ST-027 and upload completion validation/malware scanning for ST-030/ST-031.
