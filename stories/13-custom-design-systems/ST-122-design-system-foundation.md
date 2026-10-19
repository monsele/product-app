---
story_id: ST-122
title: User-owned design systems and validated import foundation
phase: "13"
status: Done
priority: must-have
epics: [E11, E13, E21]
prd_user_stories: [E11-US2, E13-US2, E21-US1, E21-US3]
depends_on: [ST-058, ST-097, ST-109]
---

# ST-122 - User-owned design systems and validated import foundation

## Outcome

An authenticated owner can create, revise, publish, archive and retrieve reusable
design systems, and import private fonts, guides, tokens and images through the
background validation pipeline. No video rendering behaviour changes yet.

## Required reading

AGENTS.md; DEVELOPMENT_WORKFLOW.md; docs/bring-your-own-design-system.md;
PRD E11/E13/E21; technical guide E11/E13/E21; ADR-001/008/010/015/017.

## Implementation plan

Add versioned shared schemas first, then additive database tables/migration,
owner storage keys, API service/routes, and pipeline validation. Use revision
locks for writes, idempotent publication/completion, transactional job/outbox
creation, byte checksum verification, scanner rejection, decoded format limits,
and immutable validated storage. Exercise real PostgreSQL migrations, concurrent
writes, cross-owner access, imports, worker retries, and HTTP authentication/CSRF.

## Acceptance and required tests

- Owner-scoped CRUD, revision conflicts, archival, immutable version snapshots
  and deterministic hashes; published snapshots pin validated asset metadata.
- Signed staging uploads for TTF/OTF/WOFF2, PDF/Markdown, bounded JSON, PNG/JPEG;
  upload expiry and metadata mismatches fail safely.
- Completion creates one job/outbox under concurrency; worker validates checksum,
  scanner outcome, actual format/decoded limits, and copies validated bytes into
  a key unreachable by the upload URL. Retried jobs cannot mutate active imports.
- Cross-owner/system/project references fail before signing or job creation.
- API auth and trusted-origin checks; no paid provider calls or source-text logs.
- Schema, validation, PostgreSQL integration and route tests, lint, typecheck,
  affected workspace builds pass.

## Out of scope

Design-system UI, v3 custom renderer, AI extraction, conversational refinement,
moving proofs, project application, live integrations, permanent deletion.

## Dev Agent Record

- Agent: Codex
- Started: 2026-10-18
- Branch: story/st-122-design-system-foundation
- Implementation completed: 2026-10-18; awaiting human review and Done status.
- Files changed:
  - Shared contracts: `packages/schemas/src/design-systems.ts`, its tests and index.
  - Persistence: `packages/database/src/design-system-tables.ts`, database index,
    Drizzle config, migration 0079 SQL/compatibility note and migration journal.
  - Storage: `packages/storage/src/keys.ts` adds owner-scoped staging and
    content-addressed validated import keys.
  - API: `apps/api/src/design-systems.ts`, PostgreSQL/HTTP integration tests,
    controller/DI wiring in app.ts and runtime storage/service configuration.
  - Worker: design-system-validation.ts, design-system-validation-job.ts,
    byte-inspection and PostgreSQL job tests, runtime handler registration.
  - Dependencies: pipeline-worker package.json and pnpm-lock.yaml pin fontkit
    2.0.4 and @types/fontkit 2.0.8. The unmodified Source Sans 3 OTF test fixture
    includes Adobe's SIL OFL license, provenance and checksum.
  - Provider envelope: packages/provider-adapters/src/job-envelope.ts adds only
    malware-scanning capability to design-system.validation.
  - Documentation: ADR-017, proposal status/story links, foundation API reference,
    PRD E11 extension, technical guide E11, this story, ST-123/124/125 and index.
- Migrations: 0079 creates design_systems, design_system_versions and
  design_system_assets, compound owner/system foreign keys and immutable-version/
  terminal-import triggers. Verified against fresh isolated PostgreSQL databases.
  Not applied to the shared development database; no production deployment.
- Public contracts: additive design definition/snapshot version 1.0 and validation
  payload version 1; authenticated `/design-systems` API documented in
  docs/design-system-foundation-api.md. No LessonSpec, NormalizedDocument or
  creative-design manifest reader changes.
- Commands and tests run successfully:
  - Affected schemas/storage/provider-adapters/database package tests: 567, 30,
    84 and 12 passing tests respectively. Existing optional storage/database
    integration suites skip without their environment settings.
  - `pnpm --filter @avlp/api exec vitest run --maxWorkers=2`: 684 passed;
    optional integration suites skipped in this broad run.
  - `pnpm --filter @avlp/pipeline-worker exec vitest run --maxWorkers=2`:
    336 passed before the final additional OTF fixture case; optional integration
    suites skipped in this broad run.
  - Final targeted byte-inspection suite: seven passed, including real TTF,
    CFF OTF and WOFF2 decoding, corrupt fonts, decoded-size limits, PDF limits,
    image re-encoding/MIME mismatch, UTF-8 and token-complexity boundaries.
  - With TEST_DATABASE_URL set to the local PostgreSQL server on port 5433,
    design-systems.integration.test.ts: five passed; worker
    design-system-validation-job.integration.test.ts: five passed. Both migrate
    and destroy isolated test databases. Final runs include content-addressed
    keys, failed-job recovery and immutable data checks.
  - Lint and typecheck for api, pipeline-worker, schemas, database, storage and
    provider-adapters passed. A final targeted ESLint pass covers subsequent
    API/test refinements.
  - Dependency/workspace builds passed through Turbo; final API and worker
    TypeScript builds passed after the last source changes.
  - `git -c core.whitespace=cr-at-eol diff --check` passed (existing Windows
    CRLF conventions retained).
- Representative output: foundation API reference includes a versioned draft
  example and endpoint table. Integration evidence demonstrates one version per
  published revision, one job/outbox per completed upload, 401 unauthenticated,
  403 disallowed origin, 404 other owner and 409 stale revision. No UI/screenshots
  apply to this backend foundation.
- Decisions and assumptions:
  - Existing owned projects supply required job context; reusable bytes live
    outside project cleanup prefixes. Owner archival preserves versions/assets.
  - PUT URLs address staging only; validated sanitized bytes use SHA-256 keys,
    preventing a stale attempt from overwriting different accepted content.
  - Rights confirmation is required and timestamped. Reject font metadata that
    explicitly prohibits outline embedding. Imported guides remain private data.
  - Fonts: 5 MB compressed/32 MB decoded tables; other files: 10 MB; guides:
    100 PDF pages or 100,000 UTF-8 characters; bounded image/JSON complexity.
  - Failed/cancelled jobs, rejected files and expired uploads expose fresh-upload
    recovery. No paid generation or interpretation is introduced.
- Deviations: none from this bounded foundation story. The broader proposal is
  intentionally unfinished; ST-123/124/125 require predecessor Done status.
- Known risks/follow-up:
  - First broad API/worker runs under concurrent high worker counts hit existing
    five-second fixture timeouts. Complete reduced-concurrency reruns passed;
    no unrelated timeout or audio code was changed.
  - Production requires the existing configured malware scanner; development
    retains its existing fixture scanner. Object storage was mocked in new
    integration tests; existing storage unit checks pass.
  - System/import lists are bounded to 200 rows; add pagination before UI needs
    larger collections. Published history now has pagination/direct lookup per
    the review corrections below. No permanent deletion or orphan-upload cleanup is introduced;
    retained bytes and historical versions need a separately reviewed policy.
  - ST-123 adds UI/custom renderer/final-font preflight; ST-124 interpretation;
    ST-125 moving proofs/refinement and explicit application. Publishing here
    does not assert renderer support for an instruction or change a video.

### Review corrections — completed 2026-10-19

- Address all three reported findings within ST-122; status remains In Review.
- Fontkit moved into a hidden child process with a five-second deadline and
  explicit V8 heap limits (128 MiB old generation, 16 MiB semi-space setting).
  The selected cmap's lazy collections/ranges are counted before bounded
  coverage allocation; the unsafe fontkit.characterSet expansion is never used.
  Child IPC input/output is validated, diagnostics are suppressed, and decoder
  credentials are limited to OS temporary/runtime paths. Crashes or timeouts
  reject the file without ending the job host. Source and compiled entrypoints
  use the same decoder; production does not require the development TS loader.
- Add validated history query input, GET versions with a decreasing revision
  cursor and GET a version by ID. Existing detail responses gain an additive
  nextBeforeRevision field. Every query retains owner/system scoping and archived
  history remains readable. No snapshot/definition contract version changes.
- Reject nested non-finite token numbers before active import or JSON storage.
- Files: shared design-system schemas/tests; API service/controller/integration
  tests; worker inspection, new font contract/parser/isolation modules and tests;
  ADR-017 and foundation API reference. No migrations or paid provider changes.
- Regression coverage: malicious OTF ranges previously exhausting the host,
  excessive Unicode-valid coverage, parser deadline and healthy subsequent
  inspections; nested numeric overflow and finite JSON round-trip; 201 versions
  across pages, concurrent publication cursor stability, direct/archived reads,
  invalid query bounds, cross-owner/system access and HTTP cache/auth checks.
- Final commands/results:
  - `pnpm --filter @avlp/schemas test`: 568 passed, including page-input bounds.
  - `pnpm --filter @avlp/pipeline-worker exec vitest run --maxWorkers=2`:
    344 passed; existing optional integration tests skip in this broad run.
    The 14 byte-inspection tests include all font/token regressions described above.
  - With TEST_DATABASE_URL pointing to the local PostgreSQL server on port 5433,
    API design-systems.integration.test.ts: six passed; worker
    design-system-validation-job.integration.test.ts: five passed. These execute
    migration 0079 in isolated databases and destroy them afterward.
  - API app/auth/creative-design-route/lesson-versions regressions: 32 passed.
  - Affected API/worker typechecks, API/worker/schema lint, schema build and
    API/worker builds passed. Final targeted ESLint checks and compiled-worker
    build passed after the decoder refinements.
  - Compiled Node smoke inspection accepted the real OTF, rejected the original
    forged-range reproduction, then accepted another real OTF in the same host.
    This verifies the production JS child entrypoint without the TS loader.
  - `git -c core.whitespace=cr-at-eol diff --check` passed.
- Re-review result: all three reported findings are addressed with regression
  evidence. Existing scope boundaries and immutable bytes/versions are preserved;
  no new migration or architectural deviation. The bounded font adapter depends
  on pinned fontkit 2.0.4 internals, so future decoder upgrades must rerun these
  real-font and malformed-font fixtures. Human review/Done status remains pending.

### Final review correction ? PDF containment, 2026-10-19

- Review found that PDFDocument.load ran in the job host before the page-count
  limit. A bounded-size PDF containing millions of array elements reproduced
  an uncatchable V8 heap exhaustion in a separate reproduction process.
- Move PDF parsing into a hidden child process with a five-second deadline,
  128 MiB old-generation/16 MiB semi-space V8 settings, validated IPC, suppressed
  diagnostics and no provider/storage/database credentials. Invalid PDFs,
  excessive page counts, child crashes and timeouts use IMPORT_FORMAT_INVALID.
- Files: new design-system-pdf-contract.ts, design-system-pdf-parser.ts and
  design-system-pdf-isolation.ts; existing asset inspector and its unit/job
  integration tests; ADR-017 and this record. No migration or public API changes.
- Regression evidence: a compressed object stream under 10 KB that expands to
  four million array elements is rejected; a subsequent valid PDF succeeds.
  Tests also cover the deadline, malformed guides, normal PDFs and 101 pages.
  PostgreSQL job coverage verifies rejection, no validated copy and idempotent
  retry. Compiled JS is checked separately from source execution.
- Implementation remains within ST-122. Human approval/Done is reserved by
  DEVELOPMENT_WORKFLOW.md; the wider ST-123?125 feature remains pending.

- Final validation: focused byte-inspection suite 16 passed; PostgreSQL API suite
  six passed and import-job suite five passed; worker lint, typecheck and build
  passed; changed TypeScript formatting and scoped Git whitespace checks passed.
  Compiled Node smoke accepted a valid PDF, rejected a 7,939-byte compressed
  expansion attack, then accepted the valid PDF again without a TS loader.
- Acceptance review:

  | Criterion | Status | Evidence |
  | --- | --- | --- |
  | Owner CRUD, revisions, archive, immutable hashes | met | API PostgreSQL tests |
  | Signed uploads and bounded format validation | met | API, inspector and decoder regressions |
  | Single job/outbox, scan/checksum, immutable copies | met | Concurrent API and import-job tests |
  | Cross-owner/system/project isolation | met | API and worker forged-context tests |
  | Auth/origin, no paid calls or source logs | met | HTTP tests and source inspection |
  | Required automated checks | met | Recorded focused, integration, lint/type/build results |

- Technical deviations: none found; PDF containment follows ADR-017's import
  safety architecture. Review conclusion: approval-ready for the ST-122 scope.
  Existing storage mocks, bounded collection lists, retention follow-up and
  parser dependency risks above remain applicable. Runtime logs/screenshots
  changed by concurrent local activity were preserved and are outside this work.

- Full worker regression: 346 passed, 69 optional integration cases skipped
  without environment configuration. The affected five-case PostgreSQL import
  suite was run separately and passed, as recorded above.

### Human approval ? 2026-10-19

- Product owner approved ST-122 after the final code review.
- Status: Done. Acceptance criteria and recorded validation evidence accepted.
- ST-123 is now Ready; implementation has not started.
