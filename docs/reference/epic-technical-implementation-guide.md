# AI Visual Learning Platform — Epic Technical Implementation Guide

**Document purpose:** Provide an implementation reference that an AI coding agent or engineering team can use to build one epic at a time without having to rediscover the product architecture, data contracts, dependencies, or completion criteria.

**Source basis:**

- `ai_visual_learning_platform_mvp_prd(2).md`
- `ai_visual_learning_platform_mvp_features(2).md`
- `ai_visual_learning_platform_mvp_plan(1).md`

The product requirements, epic boundaries, MVP constraints, and user workflows in this guide come from those source documents. The low-level architecture, API shapes, data-model choices, queue design, error handling, and implementation sequences are recommended engineering decisions added to make the requirements executable.

---

## 1. Product Boundary

The MVP converts one short educational PDF or DOCX into an editable, narrated, motion-graphics lesson.

```text
Source document
    → normalized educational content
    → approved objectives
    → approved outline
    → narration
    → LessonSpec storyboard
    → scene audio and captions
    → browser preview
    → validated 1080p MP4
```

The initial boundary is intentionally narrow:

- Introductory science
- Learners aged 10–16
- English
- One PDF or DOCX per project
- Maximum 20 pages
- 3, 5, or 7 minute lessons
- One visual theme
- Ten scene templates
- Two or three voices
- 1920 × 1080, 30 fps, H.264/AAC output
- Video output first; interactive lessons later

The system is not a free-form text-to-video generator. AI produces validated structured data. Deterministic application code decides layout, animation, storage, rendering, and access control.

---

## 2. Architecture Principles

### 2.1 `LessonSpec` is the central contract

The AI pipeline must never generate arbitrary Remotion code. It generates a versioned `LessonSpec`. The browser preview and server renderer both consume the same specification and scene-template library.

```text
AI planning pipeline ──writes──> LessonSpec
Teacher editor ────────edits───> LessonSpec
Remotion Player ───────reads───> LessonSpec
Render worker ─────────reads───> LessonSpec snapshot
Future web runtime ────reads───> LessonSpec
```

### 2.2 Human approval gates are explicit

The generation pipeline is not one long autonomous operation. The following stages require approval or a deliberate teacher action:

1. Ingestion selection and corrections
2. Learning objectives
3. Lesson outline
4. Narration/storyboard edits
5. Final validation and rendering

### 2.3 Immutable outputs plus editable overlays

Preserve raw outputs for traceability:

- Original upload is immutable.
- Canonical Docling JSON is immutable.
- Normalized parser output is versioned and immutable.
- Teacher corrections are overlays.
- Approved lesson states are snapshots.
- Renders always point to a specific immutable `LessonVersion`.

### 2.4 Expensive work is asynchronous

The API may validate and enqueue work, but must not perform Docling parsing, model generation, TTS, illustration generation, or full video rendering inside an HTTP request.

### 2.5 All jobs are idempotent and resumable

Every job has:

- A deterministic idempotency key
- Input-version references
- Attempt count
- Retry policy
- Heartbeat/lease
- Structured result
- Classified error
- Cost and timing data

### 2.6 Provider integrations are replaceable

Use application-owned interfaces for:

- Authentication
- Object storage
- Language models
- Embeddings
- Text-to-speech
- Image generation
- Malware scanning
- Email

Provider response formats must not leak into the domain model.

### 2.7 Tenant isolation is enforced in the domain layer

Every project-owned query must include the authenticated `owner_user_id`; checking only in the UI or route is insufficient. Storage keys must also be tenant-scoped.

---

## 3. Recommended System Architecture

```text
┌────────────────────────────────────────────────────────────────────┐
│ apps/web — Next.js teacher application                            │
│ Workspace, review screens, editors, Remotion Player               │
└──────────────────────────────┬─────────────────────────────────────┘
                               │ HTTPS, session/JWT
┌──────────────────────────────▼─────────────────────────────────────┐
│ apps/api — TypeScript application API                             │
│ AuthZ, project commands, queries, orchestration, signed URLs      │
└──────────────┬───────────────────┬────────────────────┬────────────┘
               │                   │                    │
       ┌───────▼────────┐  ┌──────▼───────┐   ┌────────▼─────────┐
       │ PostgreSQL      │  │ Redis/BullMQ │   │ S3-compatible    │
       │ domain + audit  │  │ job queues   │   │ private storage  │
       └───────┬────────┘  └───┬─────┬────┘   └────────┬─────────┘
               │               │     │                 │
      ┌────────▼────────┐      │     │        ┌────────▼─────────┐
      │ pgvector         │      │     │        │ CDN/signed media │
      │ optional MVP     │      │     │        │ delivery         │
      └──────────────────┘      │     │        └──────────────────┘
                               │     │
                    ┌──────────▼┐  ┌─▼────────────────────────────┐
                    │ Python     │  │ TypeScript media/AI workers  │
                    │ ingestion  │  │ generation, TTS, assets      │
                    │ Docling    │  │ validation                   │
                    └────────────┘  └──────────────┬───────────────┘
                                                  │
                                     ┌────────────▼───────────────┐
                                     │ Remotion renderer + FFmpeg │
                                     │ isolated render workers     │
                                     └────────────────────────────┘
```

### 3.1 Suggested monorepo

```text
visual-learning/
├── apps/
│   ├── web/
│   ├── api/
│   ├── ingestion-worker/
│   ├── pipeline-worker/
│   └── renderer/
├── packages/
│   ├── auth/
│   ├── db/
│   ├── api-contracts/
│   ├── document-schema/
│   ├── lesson-schema/
│   ├── scene-library/
│   ├── design-system/
│   ├── jobs/
│   ├── storage/
│   ├── provider-adapters/
│   ├── validation/
│   ├── observability/
│   └── evals/
├── prompts/
│   ├── objectives/
│   ├── outline/
│   ├── narration/
│   ├── storyboard/
│   └── grounding/
├── samples/
│   ├── source-documents/
│   ├── normalized-documents/
│   └── expected-lessons/
├── infrastructure/
└── docs/
    ├── adr/
    └── runbooks/
```

### 3.2 Service ownership

| Component        | Owns                                            | Must not own                          |
| ---------------- | ----------------------------------------------- | ------------------------------------- |
| Web              | UI state, forms, local preview controls         | Authorization truth, final validation |
| API              | Domain rules, authZ, orchestration, signed URLs | Heavy parsing/rendering               |
| Ingestion worker | Docling invocation and normalization            | Teacher edits, lesson generation      |
| Pipeline worker  | AI calls, structured outputs, grounding         | Pixel layout or video rendering       |
| Scene library    | Schemas, layout, motion behavior                | Prompt logic or persistence           |
| Renderer         | Immutable version rendering                     | Editing current lesson state          |
| PostgreSQL       | Domain state and metadata                       | Large media blobs                     |
| Object storage   | Documents, figures, audio, video, exports       | Queryable workflow state              |
| Redis/BullMQ     | Short-lived job orchestration                   | Source of truth for completed state   |

---

## 4. Core Contracts

### 4.1 Identifier and time conventions

- Use UUIDv7 or another sortable globally unique ID.
- Store timestamps in UTC.
- Include `created_at`, `updated_at`, and where editable, `revision`.
- Use optimistic concurrency with `revision` or `updated_at`.
- Never expose sequential database IDs in public URLs.
- Use lowercase stable enum values in storage and APIs.

### 4.2 Normalized document

```ts
type SourceRef = {
  documentId: string;
  parsedDocumentVersion: number;
  pageStart: number;
  pageEnd?: number;
  sectionId?: string;
  blockIds: string[];
  figureIds?: string[];
  tableIds?: string[];
};

type NormalizedDocument = {
  schemaVersion: "1.0";
  documentId: string;
  title: string;
  language: "en";
  pageCount: number;
  sections: NormalizedSection[];
  warnings: IngestionWarning[];
};

type NormalizedSection = {
  id: string;
  parentId?: string;
  order: number;
  heading: string;
  level: number;
  pageStart: number;
  pageEnd: number;
  blocks: ContentBlock[];
  figureIds: string[];
  tableIds: string[];
};

type ContentBlock =
  | { id: string; kind: "paragraph"; text: string; page: number }
  | { id: string; kind: "list"; items: string[]; page: number }
  | { id: string; kind: "equation"; latex?: string; text: string; page: number }
  | { id: string; kind: "caption"; text: string; page: number };
```

### 4.3 Lesson specification

Use a discriminated union. Each template owns its input schema.

```ts
type LessonSpec = {
  schemaVersion: "1.0";
  lessonId: string;
  projectId: string;
  title: string;
  subject: string;
  audience: {
    ageBand: "8-10" | "11-13" | "14-16" | "adult-beginner";
    difficulty: "introductory" | "intermediate";
    priorKnowledge: string[];
  };
  targetDurationSeconds: 180 | 300 | 420;
  tone: "friendly" | "academic" | "conversational";
  themeId: "mvp-default";
  objectiveIds: string[];
  voice: {
    providerVoiceId: string;
    speakingRate: number;
  };
  scenes: SceneSpec[];
};

type SceneBase = {
  id: string;
  order: number;
  title?: string;
  narration: string;
  durationSeconds: number;
  onScreenText: string[];
  transition: "cut" | "fade" | "slide";
  assetBindings: SceneAssetBinding[];
  sourceRefs: SourceRef[];
  generatedAdditions: GeneratedAddition[];
};

type SceneSpec =
  | (SceneBase & { template: "hook"; visual: HookVisual })
  | (SceneBase & { template: "definition"; visual: DefinitionVisual })
  | (SceneBase & { template: "process"; visual: ProcessVisual })
  | (SceneBase & { template: "input-process-output"; visual: IpoVisual })
  | (SceneBase & { template: "comparison"; visual: ComparisonVisual })
  | (SceneBase & { template: "cause-effect"; visual: CauseEffectVisual })
  | (SceneBase & { template: "labelled-diagram"; visual: DiagramVisual })
  | (SceneBase & { template: "analogy"; visual: AnalogyVisual })
  | (SceneBase & { template: "worked-example"; visual: WorkedExampleVisual })
  | (SceneBase & { template: "summary"; visual: SummaryVisual });
```

### 4.4 Job envelope

```ts
type JobEnvelope<T> = {
  jobId: string;
  jobType: string;
  projectId: string;
  ownerUserId: string;
  inputVersion: string;
  idempotencyKey: string;
  correlationId: string;
  payload: T;
  requestedAt: string;
};
```

Recommended idempotency key:

```text
{jobType}:{projectId}:{inputVersion}:{optionsHash}
```

### 4.5 API error envelope

```json
{
  "error": {
    "code": "SCENE_SCHEMA_INVALID",
    "message": "The comparison scene has too many difference items.",
    "fieldErrors": {
      "visual.differences": "Maximum is 4."
    },
    "retryable": false,
    "correlationId": "..."
  }
}
```

Do not return stack traces, provider payloads, secrets, or raw SQL errors.

---

## 5. Workflow State Machines

### 5.1 Project stage

```text
draft
 → uploading
 → ingesting
 → ingestion_review
 → lesson_configuration
 → objectives_review
 → outline_review
 → narration_storyboard_review
 → audio_generation
 → ready_for_validation
 → ready_to_render
 → rendering
 → completed
```

`failed` is not the only project state. A stage should retain its last successful state and separately expose the latest failed operation. This lets a failed TTS scene be retried without making the entire project unusable.

### 5.2 Job state

```text
queued → running → succeeded
             ├── retry_wait → queued
             ├── failed
             └── cancelled
```

A worker must periodically update `heartbeat_at`. A reaper can requeue jobs whose lease expired.

### 5.3 Approval state

Objectives, outline, narration, and storyboard should use:

```text
draft → approved → superseded
```

An edit to approved data creates a new draft revision; it does not mutate the approved snapshot used by an existing render.

---

## 6. Cross-Cutting Implementation Rules

### 6.1 API rules

- REST endpoints are acceptable for the MVP.
- Commands return `202 Accepted` when work is queued.
- Read APIs return the domain state from PostgreSQL, not the queue.
- All write endpoints accept an idempotency key for costly operations.
- All project endpoints call one shared `assertProjectAccess(userId, projectId)`.
- Use cursor pagination for project lists and job histories.
- Use optimistic concurrency for editors.

### 6.2 Storage keys

```text
users/{userId}/projects/{projectId}/source/{documentId}/original.pdf
users/{userId}/projects/{projectId}/parsed/{version}/docling.json
users/{userId}/projects/{projectId}/parsed/{version}/normalized.json
users/{userId}/projects/{projectId}/assets/{assetId}/original.png
users/{userId}/projects/{projectId}/audio/{sceneId}/{contentHash}.mp3
users/{userId}/projects/{projectId}/renders/{renderJobId}/lesson.mp4
```

Buckets remain private. The API generates short-lived signed URLs after authorization.

### 6.3 Dependency invalidation

Store derived artifacts with the hash/version of their inputs.

Examples:

- Narration edit invalidates that scene's audio, captions, preview cache, validation, and any not-yet-started render.
- Voice change invalidates all scene audio and captions.
- Scene asset change invalidates scene preview and final render, not narration audio.
- Scene reorder invalidates full lesson timeline and render, not per-scene audio.
- Parser correction invalidates unapproved downstream AI drafts; approved content requires an explicit regeneration decision.

### 6.4 Auditability

Audit:

- Authentication-sensitive operations
- Upload/delete/share actions
- Teacher approvals
- AI generations and prompt versions
- Version restores
- Render initiation
- Administrative retries

Do not store passwords, full reset tokens, signed URLs, or unnecessary source content in logs.

### 6.5 Testing pyramid

1. Schema and domain unit tests
2. Database repository integration tests
3. API authorization and idempotency tests
4. Worker contract tests
5. Provider adapter tests with recorded fixtures/mocks
6. Scene visual-regression and render smoke tests
7. End-to-end happy path using a five-page science fixture
8. Prompt evaluation set for grounding, pedagogy, and template selection

---

## 7. Epic Dependency Map

| Epic | Direct prerequisites              |
| ---- | --------------------------------- |
| E1   | Foundation database and web shell |
| E2   | E1                                |
| E3   | E1, E2, storage adapter           |
| E4   | E3, job platform                  |
| E5   | E4                                |
| E6   | E2, E5                            |
| E7   | E5, E6, AI orchestration          |
| E8   | E7                                |
| E9   | E8                                |
| E10  | E9, LessonSpec schema             |
| E11  | LessonSpec schema, design tokens  |
| E12  | E10, E11                          |
| E13  | E3, E11, E12                      |
| E14  | E9, E10, E12                      |
| E15  | E11–E14                           |
| E16  | E7–E15                            |
| E17  | E11, E14–E16                      |
| E18  | E17                               |
| E19  | E4, E7–E10, E12                   |
| E20  | E7–E12                            |
| E21  | Applies from the first epic       |

---

# 8. Epic Implementation Specifications

## E1. Authentication and Access Control

### Required product outcome

Teachers can register, sign in, reset credentials, sign out, and access only resources they own.

### Covered user stories

- **E1-US1:** Create an account
- **E1-US2:** Sign in and sign out
- **E1-US3:** Reset password
- **E1-US4:** Project access isolation

### Owned components

- `apps/web` authentication pages and protected layouts
- `apps/api` session validation and authorization middleware
- `packages/auth` provider-neutral `AuthGateway` and `ProjectAuthorizationService`
- Transactional email adapter for reset links
- Database tables for users and, when self-hosted, sessions and reset-token records

### Persistence model

- `users(id, email_normalized, display_name, status, created_at, updated_at)`
- `auth_identities(user_id, provider, provider_subject)` when using a managed identity provider
- `sessions(id, user_id, expires_at, revoked_at, token_hash)` only for application-managed sessions
- `password_reset_tokens(id, user_id, token_hash, expires_at, used_at)` only for custom credentials
- `audit_events` entries for registration, login failures, reset request, password change, and logout

### API and command surface

- `POST /auth/register` — create account; normalize email; generic conflict response
- `POST /auth/login` and `POST /auth/logout`
- `POST /auth/password-reset/request` — always return a generic success response
- `POST /auth/password-reset/confirm` — consume a single-use token
- `GET /me` — authenticated profile
- Every `/projects/{projectId}/...` route invokes the shared owner check

### Technical workflow

- Normalize email with a documented rule and enforce a unique database index.
- Prefer a managed authentication provider for the MVP, but map provider identities to an application-owned `users` row. The rest of the system must depend on the internal user ID, not the provider ID.
- If credentials are stored by the application, hash passwords with Argon2id, never encrypt them, and rotate session IDs after sign-in or password change.
- Store reset tokens only as hashes. Send the raw token in a one-time HTTPS link; expire it after a short configured period and mark it used transactionally.
- Use secure, HTTP-only, same-site cookies for browser sessions. Add CSRF protection to state-changing cookie-authenticated requests.
- Build `loadOwnedProject(userId, projectId)` as the only supported repository entry point for project-owned commands. Avoid a pattern that loads by project ID and checks ownership later.

### Important design decisions

- Authorization is deny-by-default. A valid identifier does not imply access.
- Return `404` for unauthorized project IDs when revealing existence would leak another user's data.
- Signed storage URLs are issued only after resource ownership is checked.
- Admin access, if later added, must be explicit and audited; do not bypass ownership with hidden UI flags.

### Failure, security, and idempotency behavior

- Login errors remain generic.
- Rate-limit registration, login, and reset requests by account and network signal.
- Revoke active sessions after password reset when the chosen auth provider supports it.
- Never log credentials, raw reset tokens, session cookies, or authorization headers.

### Required tests

- Registration validation, duplicate normalized email, password policy
- Expired, reused, and tampered reset tokens
- Session persistence and logout revocation
- Cross-user access tests for every top-level entity
- Signed URL cannot be created for another user's file

### Recommended AI-agent execution order

- Implement the auth adapter and user mapping before UI forms.
- Add authorization helpers and integration tests before exposing project endpoints.
- Create pages and error states only after the API contract is stable.
- Document environment variables and reset-email development behavior.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E2. Teacher Workspace and Project Management

### Required product outcome

A teacher can create, list, open, duplicate, and delete lesson projects while seeing accurate workflow status.

### Covered user stories

- **E2-US1:** Create a project
- **E2-US2:** View projects
- **E2-US3:** Duplicate a project
- **E2-US4:** Delete a project

### Owned components

- Workspace page with project cards/table, empty state, and status indicators
- Project command/query services
- Project state resolver that combines current stage with active/failed jobs
- Clone service
- Deletion coordinator and storage-cleanup job

### Persistence model

- `projects(id, owner_user_id, title, subject, stage, latest_lesson_version_id, deleted_at, created_at, updated_at, revision)`
- `project_operations(id, project_id, kind, status, error_code, created_at)` for visible long operations
- All project-owned tables include `project_id`; high-risk tables also denormalize `owner_user_id` when useful for storage/job isolation

### API and command surface

- `POST /projects`
- `GET /projects?cursor=&status=`
- `GET /projects/{projectId}`
- `PATCH /projects/{projectId}` for title/metadata
- `POST /projects/{projectId}/duplicate`
- `DELETE /projects/{projectId}`
- `GET /projects/{projectId}/status` or server-sent/polled status query

### Technical workflow

- Create a project in `draft` with the current user as owner and redirect to upload.
- Resolve display status from domain stage and jobs: for example, `ingesting` while an ingestion job runs, `ready for review` when normalized content exists, and `failed` as an operation badge without discarding the prior stage.
- Duplicate in a transaction: create a new project, copy configuration and the selected approved lesson snapshot, and create new ownership-scoped references. Reuse immutable source blobs only through an internal blob-reference record, never a public URL.
- Do not mark copied rendered files as the active output. The duplicate starts as `draft` or an explicit review stage and needs its own render.
- Delete first becomes a soft delete and disappears from normal queries. Cancel queued jobs, mark running jobs as cancellation requested, revoke share links, and enqueue physical cleanup after the retention window.

### Important design decisions

- Keep project stage coarse. Detailed progress belongs to job records.
- Use a `revision` integer for optimistic workspace/editor writes.
- Project title is required and bounded; sanitize for display but do not derive storage paths from it.
- Cloning should copy a consistent snapshot, not rows while edits are in progress.

### Failure, security, and idempotency behavior

- A clone retries safely using an idempotency key.
- If cleanup fails, the project remains soft-deleted and a cleanup job can retry.
- Running render processes may be non-interruptible; mark their outputs orphaned and delete them after completion.
- Workspace queries never return deleted or foreign projects.

### Required tests

- Only owner projects appear
- Status resolution for queued, running, failed, and completed operations
- Duplicate preserves approved data but receives new IDs
- Delete revokes share links and hides project immediately
- Concurrent title update returns a conflict instead of losing edits

### Recommended AI-agent execution order

- Define project enums and transitions centrally.
- Implement repository filters and authorization tests.
- Add clone/delete domain services and cleanup jobs.
- Build workspace UI with polling or query invalidation; do not couple it directly to BullMQ.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E3. Document Upload and Validation

### Required product outcome

A teacher can securely upload one PDF or DOCX per project, with early validation, progress, checksum-based duplicate detection, and retryable failures.

### Covered user stories

- **E3-US1:** Upload PDF or DOCX
- **E3-US2:** Validate file size and page count
- **E3-US3:** Detect duplicate upload

### Owned components

- Upload UI with drag/drop, progress, and clear limits
- Upload-session API
- Private object-storage adapter
- File metadata validator and malware-scan adapter
- Source-document service

### Persistence model

- `source_documents(id, project_id, owner_user_id, original_name, media_type, size_bytes, page_count, sha256, storage_key, scan_status, status, created_at)`
- `upload_sessions(id, project_id, expected_media_type, max_bytes, expires_at, completed_at)`
- Unique active-source constraint per project
- Tenant-scoped checksum index such as `(owner_user_id, sha256)`; never expose global duplicate existence

### API and command surface

- `POST /projects/{id}/uploads` — create a presigned multipart upload session
- `POST /projects/{id}/uploads/{uploadId}/complete` — verify uploaded object and create `SourceDocument`
- `GET /projects/{id}/source-document`
- `DELETE /projects/{id}/source-document` before downstream approval
- `POST /projects/{id}/source-document/retry-validation`

### Technical workflow

- The client sends file name, size, and MIME hint. The API validates allowed extension and configured size before issuing an upload.
- Upload directly to object storage using a short-lived multipart/presigned session. The key is server-generated and tenant scoped.
- On completion, the API performs a trusted server-side `HEAD`, verifies size and content type, computes or verifies SHA-256, and queues scan/page-count inspection.
- Do not trust browser MIME type or extension. Validate PDF magic bytes and DOCX as a valid ZIP/Open XML package.
- Extract page count before expensive parsing. For DOCX, use a deterministic conversion/inspection policy; because page count can depend on rendering, define the MVP limit as either converted-page count or a documented structural approximation.
- If above 20 pages, reject before ingestion. The optional page-range flow mentioned in the PRD should be treated as a later enhancement unless explicitly included.
- For duplicate content in the same tenant, offer reuse of an existing normalized result only when parser version and source bytes match. Across tenants, process independently or use opaque internal deduplication with no user-visible signal.

### Important design decisions

- One active source document per MVP project.
- Uploaded objects remain quarantined until validation and malware scanning pass.
- Original names are display metadata only.
- Checksum is a content identity, not an authorization mechanism.

### Failure, security, and idempotency behavior

- Abort incomplete multipart uploads after expiry.
- Delete quarantined objects that fail type or malware validation.
- Return explicit user errors for unsupported type, size, page limit, or corrupt file.
- Do not enqueue ingestion until scan and metadata checks succeed.

### Required tests

- PDF/DOCX success paths and progress completion
- Extension spoofing, corrupt ZIP, malformed PDF, oversized object
- Page-count boundary at 20/21
- Duplicate within one project and tenant-safe behavior
- Unauthorized upload completion against another project
- Expired upload session and retry

### Recommended AI-agent execution order

- Implement storage and upload-session contracts first.
- Add server-side completion validation and checksum.
- Persist source metadata and quarantine status.
- Build the UI last, using the storage provider's multipart progress callbacks.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E4. Document Ingestion and Normalization

### Required product outcome

Docling converts a validated source into immutable canonical outputs and an application-owned, provenance-rich normalized document.

### Covered user stories

- **E4-US1:** Parse a supported document
- **E4-US2:** Normalize parser output
- **E4-US3:** Extract figures and tables
- **E4-US4:** Generate ingestion quality report

### Owned components

- Python ingestion worker
- Docling adapter pinned behind an application interface
- Normalizer and schema validator
- Figure/table extraction pipeline
- Ingestion quality rules
- Job status and artifact persistence

### Persistence model

- `ingestion_jobs(id, source_document_id, parser_name, parser_version, normalizer_version, status, attempt, started_at, completed_at, error_code)`
- `parsed_documents(id, source_document_id, version, schema_version, docling_json_key, markdown_key, normalized_json_key, quality_score, status)`
- `parsed_sections`, `content_blocks`, `extracted_figures`, `parsed_tables`, `ingestion_warnings` for queryable review data
- Each block stores page, order, bounding box when available, and parent section

### API and command surface

- `POST /projects/{id}/ingestion-jobs`
- `GET /projects/{id}/ingestion-jobs/latest`
- `GET /projects/{id}/parsed-document`
- `POST /projects/{id}/ingestion-jobs/{jobId}/retry`

### Technical workflow

- The API creates an ingestion job keyed by source checksum, parser version, normalizer version, and selected options.
- The worker downloads the private source using service credentials, invokes Docling, and writes raw Docling JSON and readable Markdown to temporary versioned storage.
- The adapter converts Docling-specific elements into `NormalizedDocument`. It reconstructs hierarchy, assigns stable block IDs, links figures/tables to nearby sections, removes repeated headers/footers, and records provenance.
- Stable IDs should be deterministic within a parser version, for example a hash of document ID, page, block type, order, and normalized content. This keeps teacher overlays attachable across harmless reruns.
- Validate normalized JSON before persistence. Save artifacts first to temporary keys, then commit database records and promote keys so partial results never appear as complete.
- Run quality rules for empty pages, low text density, uncertain OCR, malformed tables, missing captions, duplicate reading order, or very high unknown-block rate.
- Severe problems set `requires_reupload` or `blocked`; recoverable warnings allow review.

### Important design decisions

- Docling output is evidence, not the application contract.
- Do not silently discard unsupported elements. Store a warning and minimal raw representation.
- OCR is allowed only when quality is acceptable; the MVP is optimized for digitally generated files.
- Database rows support review queries; canonical JSON remains the portable snapshot.

### Failure, security, and idempotency behavior

- Classify failures as corrupt source, parser unsupported, resource exhaustion, temporary infrastructure, or schema-normalization defect.
- Retry only temporary errors automatically.
- Keep raw worker logs internal and provide a teacher-safe message.
- Use memory/CPU/time limits because PDFs are untrusted input.

### Required tests

- Golden fixtures for PDF and DOCX
- Heading hierarchy, page references, lists, tables, figures, captions
- Repeated header/footer removal
- Schema compatibility and unknown-block warning
- Idempotent rerun with identical versions
- Worker crash between artifact upload and database commit

### Recommended AI-agent execution order

- Create `document-schema` and fixtures before wiring Docling.
- Implement the adapter with no downstream lesson dependencies.
- Add quality rules and golden tests.
- Only then add the queue handler and review query API.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E5. Ingestion Review

### Required product outcome

Teachers can inspect provenance, select relevant sections, correct extraction errors, and exclude decorative figures without mutating raw parser output.

### Covered user stories

- **E5-US1:** Review extracted structure
- **E5-US2:** Exclude irrelevant sections
- **E5-US3:** Correct extracted text
- **E5-US4:** Remove decorative images

### Owned components

- Hierarchical source viewer
- Section-selection command service
- Block correction editor
- Figure/table preview and inclusion controls
- Effective-document materializer

### Persistence model

- `source_selections(project_id, parsed_document_id, section_id, included, updated_by, updated_at)`
- `content_block_overrides(id, project_id, block_id, replacement_text, status, created_by, created_at)`
- `figure_selections(project_id, figure_id, included)`
- `section_metadata_overrides(section_id, replacement_heading)`
- Optional `effective_source_snapshots` created at approval to freeze generation input

### API and command surface

- `GET /projects/{id}/ingestion-review`
- `PATCH /projects/{id}/source-selections` as a batch command
- `PUT /projects/{id}/blocks/{blockId}/override`
- `DELETE /projects/{id}/blocks/{blockId}/override` to restore original
- `PATCH /projects/{id}/figures/{figureId}`
- `POST /projects/{id}/ingestion-review/approve`

### Technical workflow

- Load the immutable hierarchy with current overlays and warnings.
- Default sections to included except clearly detected references/appendices only when the rule is transparent; do not silently exclude educational content.
- Edits create overlay rows containing the original block reference. The UI displays both corrected text and a restore action.
- Batch section updates in one transaction and reject a state with zero included sections.
- Approval materializes an `EffectiveSourceSnapshot` containing selected blocks, corrected text, included figures/tables, provenance, normalized schema version, and a content hash.
- All downstream AI stages consume the approved snapshot, not live mutable selections.

### Important design decisions

- Use plain structured text editing for the MVP; avoid storing arbitrary HTML.
- Teacher corrections are authoritative content but still linked to original provenance.
- Changing an approved source creates a new draft snapshot and marks downstream unapproved drafts stale.
- Figures remain accessible for audit even when excluded from asset planning.

### Failure, security, and idempotency behavior

- Reject edits against blocks from a different parsed-document version.
- Return conflict on concurrent edits using block revision.
- Warn before replacing an approved source snapshot that has downstream work.
- Large section trees should virtualize the UI rather than loading image bytes eagerly.

### Required tests

- Include/exclude and restore
- At least one selected section
- Text override and original rollback
- Effective snapshot contains corrected text and correct provenance
- Approval invalidation behavior
- Cross-user block/figure manipulation

### Recommended AI-agent execution order

- Implement overlay tables and effective-source builder.
- Write snapshot hash tests.
- Build the review query model.
- Add hierarchical UI, inline warnings, and approval action.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E6. Lesson Configuration

### Required product outcome

The project has a validated, versioned learner and lesson configuration that deterministically controls generation targets.

### Covered user stories

- **E6-US1:** Configure learner profile
- **E6-US2:** Configure lesson duration and tone
- **E6-US3:** Confirm subject and lesson title

### Owned components

- Configuration form
- Configuration domain service
- Duration and narration-budget calculator
- Prompt-variable mapper
- Configuration snapshot/versioning

### Persistence model

- `lesson_configurations(id, project_id, version, age_band, difficulty, subject, lesson_title, target_duration_seconds, tone, visual_theme, include_recall_questions, created_at)`
- Store one current draft and preserve versions referenced by generated artifacts

### API and command surface

- `GET /projects/{id}/lesson-configuration`
- `PUT /projects/{id}/lesson-configuration`
- `POST /projects/{id}/lesson-configuration/approve`
- Optional `POST /projects/{id}/metadata/suggest` for title/subject inference

### Technical workflow

- Require age band, difficulty, subject, title, duration, and tone.
- Map 3/5/7 minutes to 180/300/420 seconds.
- Compute a narration budget using a configurable target speaking rate. Example: `targetWords = durationMinutes × effectiveWordsPerMinute`, with a reserved percentage for pauses and transitions.
- Pass configuration to AI as explicit structured fields, never concatenated unescaped user text.
- At approval, create a configuration version and hash. Objective generation references that immutable version.
- Changes after generation create a new version and mark affected AI stages stale; the UI asks which stages to regenerate.

### Important design decisions

- The MVP theme value is fixed to `mvp-default` even if the field exists for future compatibility.
- Recall questions are a configuration flag but may map to an optional outline/scene item.
- Do not infer learner age from the document without teacher confirmation.
- Bounds and enum options are shared between UI and API from one schema package.

### Failure, security, and idempotency behavior

- Reject unsupported duration/tone/age values server-side.
- Warn when title/on-screen text exceeds display-safe limits.
- Do not automatically regenerate paid operations after a configuration edit.
- Preserve previous approved configuration for existing lesson versions/renders.

### Required tests

- All enum and required-field validation
- Word-budget calculation
- Configuration version/hash stability
- Staleness graph after each field changes
- Prompt variables exactly match approved configuration

### Recommended AI-agent execution order

- Add shared schema and duration-budget service.
- Persist versioned configuration.
- Implement API and concurrency behavior.
- Build form using the shared schema and explicit regeneration messaging.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E7. Learning Objective Generation

### Required product outcome

The system proposes measurable, age-appropriate objectives grounded in the approved source; the teacher can edit and approve them.

### Covered user stories

- **E7-US1:** Generate learning objectives
- **E7-US2:** Edit and approve objectives

### Owned components

- Objective-generation prompt and structured schema
- Source-package builder
- AI model adapter and call logger
- Grounding verifier
- Objective editor and approval service

### Persistence model

- `learning_objective_sets(id, project_id, source_snapshot_id, configuration_version, prompt_version, status, model_call_id, created_at)`
- `learning_objectives(id, set_id, order, statement, source_refs_json, generated, revision)`
- Optional fields from the feature list: key concepts, prerequisite knowledge, vocabulary, misconceptions, and candidate assessment questions

### API and command surface

- `POST /projects/{id}/objective-generations`
- `GET /projects/{id}/objectives/current`
- `PATCH /projects/{id}/objectives/{objectiveId}`
- `POST /projects/{id}/objectives/reorder`
- `POST /projects/{id}/objectives/approve`
- `POST /projects/{id}/objectives/regenerate`

### Technical workflow

- Build a bounded source package from the approved effective-source snapshot. Include block IDs and page/section metadata in machine-readable delimiters.
- Ask the model for JSON conforming to a strict schema: objective statement, measurable verb, source block IDs, concepts, and confidence. Set a bounded objective count, for example 3–6.
- Validate JSON and ensure every referenced block exists in the source package.
- Run a grounding pass: lexical/semantic support, citation existence, and optional second model judge. Unsupported objectives are rejected or marked `needs_review`, never silently accepted.
- Persist raw provider response securely for debugging only if policy allows, plus normalized output, prompt version, model/version, tokens, latency, and estimated cost.
- Teacher edits create revisions. Added objectives can use source references selected by the teacher; an objective without support receives a validation warning.
- Approval creates an immutable objective-set snapshot. Outline generation reads only that snapshot.

### Important design decisions

- Objectives should be measurable outcomes, not topic labels.
- RAG here is a bounded source-grounding mechanism, not a general knowledge search system. For documents under 20 pages, hierarchical section/block retrieval can be simpler and safer than a large vector pipeline.
- Do not let model-provided page numbers be authoritative; resolve block IDs to pages in application code.
- Regeneration creates a new candidate set and keeps the approved set until the teacher approves a replacement.

### Failure, security, and idempotency behavior

- Retry provider timeouts and rate limits with backoff.
- Repair invalid JSON at most a bounded number of times; log schema failures.
- Reject unknown citations and excessive objective counts.
- Never lose teacher-approved content when generating new suggestions.

### Required tests

- Structured-output schema
- Invalid/missing source block IDs
- Objective count and measurable-verb rules
- Teacher CRUD/reorder and approval
- Regeneration preserves approved set
- Evaluation fixtures for faithfulness and age appropriateness

### Recommended AI-agent execution order

- Define schemas and source-package format.
- Implement provider adapter, call logging, and grounding validation.
- Add job handler and persistence.
- Build editor/approval UI and prompt eval cases.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E8. Lesson Outline Generation

### Required product outcome

The system creates an editable instructional sequence tied to approved objectives and source references.

### Covered user stories

- **E8-US1:** Generate lesson outline
- **E8-US2:** Edit and approve outline

### Owned components

- Outline-planning prompt
- Duration allocator
- Objective-coverage mapper
- Outline editor with ordering
- Approval and versioning service

### Persistence model

- `lesson_outline_sets(id, project_id, objective_set_id, configuration_version, status, prompt_version)`
- `lesson_outline_items(id, set_id, order, kind, title, description, estimated_seconds, source_refs_json)`
- `outline_objective_links(outline_item_id, objective_id)`
- `kind` values: `hook`, `concept`, `example`, `analogy`, `summary`, `recall_question`

### API and command surface

- `POST /projects/{id}/outline-generations`
- `GET /projects/{id}/outline/current`
- `POST /projects/{id}/outline/items`
- `PATCH /projects/{id}/outline/items/{itemId}`
- `DELETE /projects/{id}/outline/items/{itemId}`
- `POST /projects/{id}/outline/reorder`
- `POST /projects/{id}/outline/approve`

### Technical workflow

- Provide approved objectives, configuration, and only the source packages needed to support them.
- Generate a structured sequence with an opening hook, concept progression, examples, summary, and optional recall question.
- Require every non-decorative item to map to one or more objectives and source blocks. The hook may be a generated framing device but must be labelled if not directly sourced.
- Allocate estimated seconds so the total fits the lesson target after reserving time for opening/closing transitions.
- Run deterministic coverage checks: each approved objective must have at least one outline link; no item may cite unknown source blocks.
- Teacher edits and reordering update a draft. Approval freezes the set used by narration.

### Important design decisions

- Outline items describe pedagogical purpose, not exact scene layout.
- Analogies and hooks are permitted generated additions but must not introduce contradictory factual claims.
- Do not force one outline item to equal one scene; narration/storyboard may split an item.
- Duration is a budget that later stages refine using actual audio.

### Failure, security, and idempotency behavior

- Block approval if any objective is uncovered.
- Warn if sequence lacks hook or summary.
- Reject total estimates far outside configured tolerance.
- Provider regeneration does not overwrite manual edits without an explicit replacement action.

### Required tests

- Objective coverage
- Duration allocation and tolerance
- Add/edit/delete/reorder with links
- Generated additions labelled
- Approval snapshot and downstream reference

### Recommended AI-agent execution order

- Build outline domain model and coverage validator.
- Implement planner schema/prompt and job.
- Add editor with objective-link controls.
- Create eval fixtures for logical concept order.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E9. Narration Generation

### Required product outcome

Each approved outline item becomes spoken, age-appropriate narration that fits the duration and remains source-grounded.

### Covered user stories

- **E9-US1:** Generate narration
- **E9-US2:** Edit or regenerate narration

### Owned components

- Narration prompt and schema
- Word/time budget service
- Block-level generation endpoints
- Narration editor and revision history
- Grounding and safety checks
- Dependency invalidation service

### Persistence model

- `narration_sets(id, project_id, outline_set_id, status, prompt_version)`
- `narration_blocks(id, set_id, outline_item_id, order, text, target_seconds, estimated_words, source_refs_json, revision)`
- `narration_operations(id, block_id, operation, instruction, model_call_id)` for simplify/shorten/expand/regenerate

### API and command surface

- `POST /projects/{id}/narration-generations`
- `GET /projects/{id}/narration/current`
- `PATCH /projects/{id}/narration/blocks/{blockId}`
- `POST /projects/{id}/narration/blocks/{blockId}/transform` with `shorten|simplify|expand|regenerate`
- `POST /projects/{id}/narration/approve`

### Technical workflow

- Calculate a target word range per outline item from its time budget and configured speaking rate.
- Generate spoken prose: short sentences, one idea at a time, explicit transitions, no long copied source passages, and no visual coordinates.
- Output text plus sentence records and source block IDs supporting each claim group.
- Validate total word count, sentence length, age-level heuristics, citation existence, and unsupported named facts/numbers.
- Teacher direct edits are authoritative but trigger a grounding recheck. Transform operations send only the selected block, its source package, approved objective/outline context, and neighboring narration for continuity.
- Save each block revision. On change, mark only dependent scene plans/audio/captions/previews/renders stale.

### Important design decisions

- Narration blocks are independent generation units for retry and editing.
- The source text may be paraphrased; long verbatim extraction is discouraged.
- Visual direction belongs in storyboard fields, not speech text.
- Actual TTS duration later supersedes estimated narration time.

### Failure, security, and idempotency behavior

- Do not partially overwrite a block if the model response fails validation.
- Bound transform attempts and input size.
- Show a warning rather than fabricating a citation for a teacher-added unsupported claim.
- Preserve previous revision for rollback.

### Required tests

- Word/time budget
- Block-level transform leaves other blocks unchanged
- Source references survive supported edits or are rechecked
- Invalid output rollback
- Dependency invalidation scope
- Evaluation for clarity, age level, unsupported claims

### Recommended AI-agent execution order

- Implement narration schemas and estimator.
- Add block generator/transformer with source packages.
- Implement revision and invalidation logic.
- Build editor and evaluation cases before TTS integration.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E10. Storyboard Generation

### Required product outcome

Approved narration is converted into a validated, ordered `LessonSpec` using only supported scene templates.

### Covered user stories

- **E10-US1:** Generate storyboard
- **E10-US2:** Regenerate one scene plan

### Owned components

- Storyboard planner prompt
- Scene splitter and duration allocator
- Template registry and schemas
- `LessonSpec` validator
- Scene-level regeneration service
- Storyboard persistence

### Persistence model

- `lesson_specs(id, project_id, schema_version, based_on_narration_set_id, status, revision, json_key_or_jsonb, content_hash)`
- `scenes(id, lesson_spec_id, stable_scene_id, order, template, duration_seconds, narration_block_ids, scene_json, revision)`
- `scene_source_references`, `scene_asset_requirements`, and generated-addition metadata may be normalized for queries

### API and command surface

- `POST /projects/{id}/storyboard-generations`
- `GET /projects/{id}/lesson-spec/current`
- `POST /projects/{id}/scenes/{sceneId}/regenerate`
- `POST /projects/{id}/storyboard/approve`

### Technical workflow

- Split narration into scene-sized units using sentence boundaries, outline purpose, and target scene duration. Avoid scenes so short that transitions dominate or so long that visual attention stagnates.
- Give the model the supported template catalog, each template's semantic purpose, hard input limits, neighboring scene summaries, source references, and required output schema.
- The model chooses template and semantic content, not coordinates, fonts, or arbitrary code.
- Validate each scene through the discriminated union schema and template-specific limits. Resolve source block IDs to canonical citations.
- Run deterministic timeline validation and adjust allocations within tolerance. Do not truncate narration to make a scene fit.
- Scene regeneration uses the current scene, neighboring context, underlying narration, objectives, and supported templates. It creates a new scene revision while preserving all other scene IDs and edits.
- Persist canonical `LessonSpec` JSON and a content hash.

### Important design decisions

- Scene IDs stay stable across ordinary edits; regenerated content increments revision.
- Only the ten MVP templates are accepted.
- Optional sound effects are metadata and should default off or to an approved catalog.
- Storyboards may reuse source figures but cannot assume an asset exists until E13 resolves it.

### Failure, security, and idempotency behavior

- Reject unknown templates, missing required visual fields, excessive text/items, invalid citations, or impossible duration.
- Retry malformed model output only a bounded number of times.
- Do not save a half-valid storyboard as current; optionally store failed candidate output for diagnostics.
- Mark missing assets as requirements, not silent omissions.

### Required tests

- Every template discriminator and schema
- Unknown template rejection
- Scene duration total
- Scene regeneration isolation
- Citation resolution
- Golden LessonSpec fixtures and schema migration tests

### Recommended AI-agent execution order

- Implement `lesson-schema` and template registry before prompt code.
- Create a hand-authored sample LessonSpec and validate it.
- Implement planner and scene regeneration.
- Add persistence and approval after schema tests pass.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E11. Visual Scene Template Library

### Required product outcome

Ten deterministic, reusable Remotion scene components render validated structured input consistently in preview and final output.

### Covered user stories

- **E11-US1:** Render a scene from structured input
- **E11-US2:** Apply consistent visual theme

### Owned components

- `packages/scene-library` template registry
- Remotion compositions and shared timeline helpers
- Video design tokens and motion presets
- Responsive 16:9 layout primitives
- Visual regression and render smoke-test harness

### Persistence model

- No mutable domain data is required. Persist `template_id` and `template_version` in each scene/version.
- Optional registry metadata: display name, description, schema version, preview thumbnail, supported asset slots, maximum item/text limits

### API and command surface

- Internal `getTemplateDefinition(templateId)`
- Internal `validateScene(scene)`
- Internal React component resolver used by web preview and renderer
- Optional API `GET /scene-templates` for editor metadata

### Technical workflow

- Implement in order: hook, definition, process, input–process–output, comparison, cause/effect, labelled diagram, analogy, worked example, summary.
- Each definition exports a Zod schema, default data factory, editor metadata, validator, duration guidance, and Remotion component.
- Use composition coordinates in a 1920×1080 logical canvas and enforce title, caption, and action-safe areas.
- Calculate layout from semantic items. The model never supplies `x`, `y`, CSS, JSX, animation frames, or font sizes.
- Use frame-based deterministic animation with Remotion timing helpers. Avoid wall-clock timers, random values without a seed, remote layout shifts, and browser-only APIs unavailable in the renderer.
- Load fonts and static assets deterministically. Bundle approved icons/SVGs or fetch versioned assets before render.
- Create representative fixture scenes at minimum, maximum, and edge-case content lengths. Capture visual-regression frames and run a short render smoke test.

### Important design decisions

- One visual theme uses shared typography, spacing, palette, line weights, caption rules, and motion timing.
- Template input limits are product constraints, not only UI hints.
- SVG and React primitives are preferred. Motion Canvas can be isolated for specialized diagrams later, not required for every scene.
- Transitions come from a small controlled preset set.

### Failure, security, and idempotency behavior

- Invalid scene data renders an editor-safe error component in development/preview but blocks production rendering.
- Missing assets use an explicit placeholder only in preview; validation blocks final rendering.
- Text measurement must detect overflow and return a validation issue rather than clipping silently.
- Renderer and browser must use the same library version.

### Required tests

- Schema unit tests and max limits
- Frame snapshots at key animation moments
- Long text, missing asset, and maximum item fixtures
- 30 fps deterministic render smoke tests
- Preview/renderer parity
- Accessibility contrast and caption-safe-area checks

### Recommended AI-agent execution order

- Build shared primitives and tokens first.
- Implement one template end-to-end with fixtures and tests.
- Replicate the template contract for the remaining nine.
- Do not change the `LessonSpec` shape inside a template task without an explicit schema migration.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E12. Storyboard Editor

### Required product outcome

Teachers can navigate, reorder, add, duplicate, delete, edit, switch templates, and regenerate scenes without losing unrelated work.

### Covered user stories

- **E12-US1:** View and navigate scenes
- **E12-US2:** Reorder scenes
- **E12-US3:** Add, duplicate, and delete scenes
- **E12-US4:** Edit scene content

### Owned components

- Scene list/timeline
- Schema-driven scene inspector
- Scene command APIs
- Autosave or explicit-save coordinator
- Template migration service
- Incremental validation and dependency invalidation

### Persistence model

- Current editable `LessonSpec` draft with `revision`
- Per-scene revision and `last_modified_by`
- Optional `draft_operations` for autosave diagnostics
- Do not create a full immutable lesson version on every keystroke; create versions at milestones

### API and command surface

- `POST /projects/{id}/scenes`
- `PATCH /projects/{id}/scenes/{sceneId}` with expected revision
- `POST /projects/{id}/scenes/reorder`
- `POST /projects/{id}/scenes/{sceneId}/duplicate`
- `DELETE /projects/{id}/scenes/{sceneId}`
- `POST /projects/{id}/scenes/{sceneId}/change-template`
- `POST /projects/{id}/scenes/{sceneId}/regenerate`

### Technical workflow

- Load a lightweight scene summary list; fetch full scene JSON and media only for the selected scene.
- Use schema metadata from the template registry to render forms. Validate client-side for speed and server-side for authority.
- Reorder by sending the complete ordered scene-ID list or fractional ordering keys; validate that the list contains every current scene exactly once.
- Add scenes from a template default factory. Duplicate with a new stable ID and copied asset references.
- Delete after confirmation and require at least one scene.
- Template switching runs a migration function. Preserve compatible base fields and semantic fields; report fields that will be reset before applying.
- Save commands return the new revision and invalidation summary. Keep the selected scene stable after save.
- Regeneration creates a candidate diff so the teacher can accept or discard it.

### Important design decisions

- Prefer explicit save for complex scene forms or debounced autosave with visible status and conflict handling.
- Do not render every scene with a live Remotion Player in the list; use thumbnails/static summaries.
- Scene-level commands own duration recalculation and validation.
- Teacher edits always win over stale model responses.

### Failure, security, and idempotency behavior

- Return `409 EDIT_CONFLICT` on stale revisions and provide latest data for merge/reload.
- Prevent deletion/reorder while a conflicting operation is committing.
- Keep a local unsaved draft if preview or network calls fail.
- Do not auto-accept regenerated content.

### Required tests

- CRUD and reorder invariants
- Template switch compatible/incompatible mapping
- Optimistic concurrency
- Only affected derived artifacts invalidated
- Large storyboard UI performance
- Keyboard navigation and non-color status indicators

### Recommended AI-agent execution order

- Implement scene command service and invariants.
- Expose template editor metadata.
- Build list and inspector separately.
- Add regeneration diff/accept flow and incremental validation.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E13. Asset Management

### Required product outcome

Scenes resolve required visual assets from an approved catalog, source figures, teacher uploads, or limited AI generation with clear provenance.

### Covered user stories

- **E13-US1:** Select reusable assets
- **E13-US2:** Upload replacement asset
- **E13-US3:** Generate limited illustration

### Owned components

- Asset catalog and search
- Project asset library
- Image upload/validation/thumbnail service
- Scene asset-binding editor
- Limited illustration generation worker
- Asset provenance and moderation

### Persistence model

- `assets(id, owner_user_id nullable, project_id nullable, kind, source, storage_key, media_type, width, height, sha256, status, provenance_json, created_at)`
- `asset_catalog_entries(asset_id, tags, license, allowed_uses)`
- `scene_asset_bindings(scene_id, slot_name, asset_id, crop_json, order)`
- `asset_generation_jobs(id, scene_id, prompt_version, status, provider_call_id)`

### API and command surface

- `GET /assets/catalog?query=&tags=`
- `GET /projects/{id}/assets`
- `POST /projects/{id}/assets/uploads` and completion endpoint
- `PUT /projects/{id}/scenes/{sceneId}/asset-bindings/{slot}`
- `POST /projects/{id}/scenes/{sceneId}/illustration-generations`
- `POST /projects/{id}/assets/{assetId}/accept|reject`

### Technical workflow

- Each template declares named asset slots, accepted media types, aspect expectations, and whether an asset is required.
- Asset planning first attempts text/shapes, approved SVG/icon catalog, or included source figure. AI illustration is a fallback for approved use cases.
- Validate uploads by magic bytes, size, decoded dimensions, and pixel count; strip unsafe metadata and re-encode when appropriate.
- Generate thumbnails and optional normalized renditions without overwriting the original.
- Store license/provenance: catalog source, source-document page/figure, teacher upload, or AI-generated provider/prompt version.
- AI generation runs asynchronously, is scene-scoped, moderated, and produces a candidate asset. Teacher acceptance updates the binding.
- Changing a binding invalidates only scene preview/full render and validation.

### Important design decisions

- SVG uploads require sanitization or conversion; never render arbitrary active SVG/HTML.
- Teacher assets are private by default.
- Generated assets are visibly marked as AI-generated.
- Do not use unrestricted web image search in the MVP without a licensing and provenance system.

### Failure, security, and idempotency behavior

- Missing required slots become blocking validation issues.
- Failed illustration generation does not block editing other scenes.
- Reject decompression bombs and extreme dimensions.
- Deleting a referenced asset should be blocked or require rebinding.

### Required tests

- Catalog search and slot compatibility
- Upload spoofing/dimension/size validation
- SVG sanitization
- Source figure provenance
- AI candidate accept/reject/regenerate
- Binding invalidation and unauthorized asset access

### Recommended AI-agent execution order

- Define asset and slot contracts with the scene library.
- Implement safe upload/thumbnail pipeline.
- Add catalog and bindings.
- Add image generation only after provenance, moderation, and cost metering exist.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E14. Voice-Over and Caption Generation

### Required product outcome

The lesson uses a selected English voice, scene-level audio, accurate timing metadata, pronunciation overrides, and exportable captions.

### Covered user stories

- **E14-US1:** Choose a voice
- **E14-US2:** Generate scene audio
- **E14-US3:** Generate captions

### Owned components

- TTS provider adapter and voice catalog
- Voice-preview UI
- Scene audio generation worker
- Audio metadata extractor
- Caption alignment/segmentation service
- SRT/VTT exporters
- Pronunciation dictionary

### Persistence model

- `voice_configurations(project_id, lesson_spec_revision, provider, voice_id, speaking_rate, pronunciation_profile_id)`
- `pronunciation_entries(id, project_id, phrase, replacement_or_phoneme)`
- `scene_audio(id, scene_id, narration_revision, voice_config_hash, storage_key, duration_ms, status, content_hash)`
- `caption_tracks(id, scene_audio_id, format_version, language)`
- `caption_cues(id, track_id, start_ms, end_ms, text, words_json)`

### API and command surface

- `GET /voices` and `GET /voices/{id}/preview`
- `PUT /projects/{id}/voice-configuration`
- `POST /projects/{id}/audio-generations`
- `POST /projects/{id}/scenes/{sceneId}/audio-generation`
- `GET /projects/{id}/audio-status`
- `GET /projects/{id}/captions.srt|vtt`

### Technical workflow

- Expose only two or three approved voices through the internal catalog, regardless of the provider's full list.
- Compute an audio cache key from normalized narration text, voice ID, speaking rate, pronunciation profile, provider version, and audio settings.
- Generate per scene. If cached audio with the same key exists for this tenant/policy, reuse it.
- Prefer TTS output that includes word or sentence timestamps. If unavailable, run forced alignment against the generated audio and narration.
- Inspect actual duration with an audio tool, store it, and compare with scene duration. Add configured lead-in/out padding.
- Segment captions by punctuation, timing, character count, and maximum lines. Keep captions within visual safe areas.
- When narration, voice, speed, or pronunciation changes, mark affected audio/captions stale. Voice-wide changes affect all scenes.
- Do not automatically stretch audio to hide a duration mismatch; offer narration adjustment, speaking-rate change within safe bounds, or scene-duration change.

### Important design decisions

- Audio is immutable and content-addressed.
- Captions derive from approved narration, not speech-to-text unless used only for alignment verification.
- Sentence timing is required; word timing is preferred.
- Music and sound effects are optional and should not complicate MVP speech clarity.

### Failure, security, and idempotency behavior

- Retry provider rate limits/timeouts independently per scene.
- Classify pronunciation/provider rejection separately from infrastructure failure.
- Keep previously valid audio active until replacement succeeds.
- Block final render for missing/stale required audio or captions.

### Required tests

- Voice catalog restriction
- Cache key and invalidation
- Per-scene retry
- Timestamp monotonicity and duration bounds
- Caption line/reading-speed rules
- SRT/VTT correctness and special-character escaping

### Recommended AI-agent execution order

- Create TTS interface and fixture provider.
- Implement audio records/cache/invalidation.
- Add timestamp normalization and captions.
- Build voice/pronunciation UI and export tests.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E15. Scene and Lesson Preview

### Required product outcome

Teachers can preview one scene or the complete lesson in the browser with the same templates, audio, captions, and timeline used by the renderer.

### Covered user stories

- **E15-US1:** Preview one scene
- **E15-US2:** Preview full lesson

### Owned components

- Remotion Player scene composition
- Full lesson composition/timeline assembler
- Preview data endpoint
- Asset/audio signed-URL resolver
- Preview cache and scene navigation
- Actionable preview error boundary

### Persistence model

- Preview is derived and usually does not need a permanent row.
- Optional `preview_artifacts(scene_id, input_hash, thumbnail_key, status)` for cached thumbnails or low-resolution clips
- Store `preview_input_hash` to indicate freshness

### API and command surface

- `GET /projects/{id}/preview-manifest?sceneId=`
- `POST /projects/{id}/scenes/{sceneId}/preview-artifacts` only if server-generated proxies are needed
- Standard lesson/storyboard APIs provide edit navigation

### Technical workflow

- Build a preview manifest from the current draft: scene JSON, template versions, media URLs, caption cues, dimensions, fps, and staleness flags.
- Use short-lived signed URLs or an authenticated media proxy. Refresh expired URLs without reloading editor state.
- Scene preview mounts only the selected scene plus optional preceding/following transition context.
- Full preview assembles scene frame ranges from actual scene durations. Support play, pause, seek, and navigate by scene.
- Lower-quality mode changes preview resolution/media renditions, not timing semantics.
- On save, recompute the input hash and reload only affected composition props.
- Preview must show stale audio/assets clearly instead of pretending the result is final.

### Important design decisions

- Preview and render import the same scene-library package and `LessonSpec` schema.
- Browser preview is not evidence that server rendering will succeed; E16/E17 still run preflight and smoke checks.
- Do not upload a full MP4 for every edit.
- Use thumbnails in the scene list and one active player.

### Failure, security, and idempotency behavior

- Catch template/asset/audio errors and identify the affected scene.
- Signed URL expiry is recoverable.
- Unsupported browser media codecs receive a clear message or alternate rendition.
- Do not allow a preview error in one scene to make the entire editor inaccessible.

### Required tests

- Scene and full timeline frame calculation
- Seek/scene navigation
- Caption/audio synchronization
- Expired media URL refresh
- Stale indicator behavior
- Preview/renderer fixture parity

### Recommended AI-agent execution order

- Create shared composition resolver.
- Implement preview manifest and media authorization.
- Build scene player before full timeline.
- Add parity fixtures and error boundaries.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E16. Quality Validation

### Required product outcome

A deterministic validation system identifies blocking errors and warnings before rendering and guides the teacher directly to fixes.

### Covered user stories

- **E16-US1:** Validate lesson before render
- **E16-US2:** Resolve validation issues

### Owned components

- Validation rules engine
- Template-specific validators
- Objective-coverage and grounding checks
- Audio/caption/duration checks
- Layout preflight
- Validation UI and deep links

### Persistence model

- `validation_runs(id, project_id, lesson_spec_revision, status, started_at, completed_at, ruleset_version)`
- `validation_issues(id, run_id, severity, code, scope_type, scope_id, field_path, message, details_json, acknowledged_at)`
- Severity: `error` blocks render; `warning` may be acknowledged; `info` is advisory

### API and command surface

- `POST /projects/{id}/validation-runs`
- `GET /projects/{id}/validation-runs/latest`
- `POST /projects/{id}/validation-issues/{issueId}/acknowledge` for allowed warnings
- `GET /projects/{id}/render-readiness`

### Technical workflow

- Run fast incremental validators after edits and a complete authoritative validation before render.
- Rules cover objective coverage, source grounding, supported template/schema, per-template text/item limits, required assets, audio/captions presence and freshness, narration-to-audio/scene fit, total duration, and frame-safe layout.
- Template layout preflight should execute measurement/layout logic using the final fonts and assets. A render smoke frame may be generated for risky templates.
- Every issue uses a stable code and points to project, scene, asset, or field path. The UI deep-links to the editor location.
- Validation stores the exact lesson-spec hash and ruleset version. Render initiation accepts only a successful run for the same hash.
- Rerun only affected rules after ordinary edits, but invalidate render readiness whenever the hash changes.

### Important design decisions

- Prefer deterministic rules for blocking behavior. Model-based quality judges may add warnings but should not be the sole authority for renderability.
- Acknowledgement is allowed only for designated warnings, never missing audio/assets or schema failure.
- Grounding results distinguish teacher-generated additions from unsupported model claims.
- Validation is a versioned product subsystem.

### Failure, security, and idempotency behavior

- If validation infrastructure fails, rendering remains blocked with a retryable system error.
- Do not silently downgrade a rule because data is missing.
- Prevent stale successful runs from authorizing a changed lesson.
- Classify and aggregate repeated scene issues for understandable UI.

### Required tests

- Each rule with pass/fail fixtures
- Severity and acknowledgement policy
- Deep-link scope/field path
- Stale hash rejection
- Incremental-rule dependency mapping
- Complete five-page lesson validation end-to-end

### Recommended AI-agent execution order

- Define issue codes and ruleset interface.
- Implement deterministic rules and fixtures.
- Add run persistence/hash gating.
- Build UI grouping and deep links, then optional model-based review.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E17. Video Rendering

### Required product outcome

A validated immutable lesson version renders as a secure 1080p MP4 with progress, retry, metadata, and thumbnail.

### Covered user stories

- **E17-US1:** Start render
- **E17-US2:** View render progress and failure
- **E17-US3:** Produce thumbnail

### Owned components

- Render command service
- Lesson-version snapshot loader
- Isolated Remotion/FFmpeg worker
- Render job state machine and progress events
- Output verifier and thumbnail extractor
- Storage uploader

### Persistence model

- `render_jobs(id, project_id, lesson_version_id, validation_run_id, idempotency_key, status, progress, attempt, worker_id, error_code, started_at, completed_at)`
- `rendered_videos(id, render_job_id, storage_key, duration_ms, size_bytes, width, height, fps, video_codec, audio_codec, checksum)`
- `thumbnails(id, rendered_video_id, storage_key, timestamp_ms, width, height)`

### API and command surface

- `POST /projects/{id}/renders`
- `GET /projects/{id}/renders`
- `GET /projects/{id}/renders/{renderId}`
- `POST /projects/{id}/renders/{renderId}/retry`
- `POST /projects/{id}/renders/{renderId}/cancel` where technically possible

### Technical workflow

- On render request, verify ownership, a current successful validation run, and no blocking issues. Create or reuse an immutable `LessonVersion` snapshot.
- Generate an idempotency key from lesson-version ID and render profile. Return the existing active/completed job for duplicate requests.
- Worker prefetches all media, verifies checksums, resolves the exact scene-library/template version, and creates a local isolated working directory.
- Render at 1920×1080, 30 fps. Encode H.264 video and AAC audio using a documented profile.
- Report coarse progress from rendered frames/scenes. Persist heartbeat and progress with throttling.
- Verify output with FFprobe: duration, streams, dimensions, fps, codecs, nonzero size, and optionally decode sample frames.
- Upload to a temporary key, verify, promote to final key, create metadata, and generate a thumbnail from a valid representative frame.
- Thumbnail failure is non-blocking and may retry separately.

### Important design decisions

- Never render the mutable current draft; render a version snapshot.
- Renderer dependencies and fonts are containerized and pinned.
- Use horizontally scalable workers with resource limits; do not run full renders in serverless request handlers.
- Intermediate files are ephemeral and cleaned after success/failure.

### Failure, security, and idempotency behavior

- Retry transient storage/worker failures; do not endlessly retry deterministic scene errors.
- Retain internal logs by render ID and expose a safe classified message.
- On worker death, the lease expires and a retry can resume from the job, not necessarily partial frames unless checkpointing is deliberately implemented.
- Cancellation is best effort; orphan outputs are deleted.

### Required tests

- Validation/hash gate
- Idempotent duplicate render request
- Successful codec/dimension verification
- Worker crash/retry and stale lease
- Missing asset deterministic failure
- Thumbnail failure does not fail video
- End-to-end render fixture

### Recommended AI-agent execution order

- Implement immutable version loading and render state machine.
- Create a local renderer CLI with sample LessonSpec.
- Wrap it in the queue worker and progress reporting.
- Add output verification, upload promotion, and operational runbook.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E18. Export and Sharing

### Required product outcome

Teachers can securely download the completed video and supporting files or create a revocable view-only lesson link.

### Covered user stories

- **E18-US1:** Download video
- **E18-US2:** Share lesson link
- **E18-US3:** Export supporting files

### Owned components

- Download authorization service
- Share-token service and public playback page
- Caption/narration/storyboard export builders
- Signed media URL or CDN token integration
- Revocation and access audit

### Persistence model

- `share_links(id, project_id, rendered_video_id, token_hash, status, expires_at nullable, created_by, revoked_at)`
- `export_jobs(id, lesson_version_id, type, status, storage_key, content_hash)` when export generation is asynchronous
- `share_access_events` with privacy-conscious metadata if analytics are needed

### API and command surface

- `POST /projects/{id}/share-links`
- `DELETE /projects/{id}/share-links/{shareId}`
- `GET /share/{rawToken}` public resolver
- `GET /projects/{id}/renders/{renderId}/download-url`
- `GET /projects/{id}/exports/captions?format=srt|vtt`
- `GET /projects/{id}/exports/narration`
- `GET /projects/{id}/exports/storyboard`

### Technical workflow

- For authenticated downloads, verify ownership and issue a short-lived signed URL with safe content-disposition and filename.
- Create a high-entropy share token, store only its hash, and return the raw token once in the URL.
- The public resolver checks hash, status, expiry, and revocation, then returns only title, thumbnail, and playback access for the selected render.
- Do not expose source documents, citations containing private extracted text, editor APIs, internal asset lists, or user profile details on the share page.
- Exports always reference a specific approved `LessonVersion`. Generate narration Markdown/text, readable storyboard Markdown/JSON, and SRT/VTT from that version.
- Revocation takes effect at the application layer immediately; media URLs issued to the share page should be short lived.

### Important design decisions

- Share links are view-only capabilities, not project membership.
- Use random opaque tokens, never project IDs as secrets.
- Rendered outputs remain attached to their original versions.
- Direct LMS/YouTube publication is outside the MVP.

### Failure, security, and idempotency behavior

- Expired/revoked/unknown tokens return a generic unavailable page.
- Regenerate expired signed URLs after reauthorization.
- Do not reuse a revoked token.
- Export failure must not affect the completed render.

### Required tests

- Owner-only downloads
- Share create/view/revoke/expire
- Public response data minimization
- Token hashing and brute-force resistance/rate limiting
- Exports match approved version
- SRT/VTT and safe filename behavior

### Recommended AI-agent execution order

- Implement version-bound export services.
- Add signed download endpoint.
- Implement hashed share tokens and minimal public DTO.
- Build playback page and revocation tests.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E19. Source Grounding and Citations

### Required product outcome

Objectives, narration, and scenes remain traceable to exact source blocks, while generated additions are explicitly identified and edits can be rechecked.

### Covered user stories

- **E19-US1:** View scene source references
- **E19-US2:** Preserve citation through edits

### Owned components

- Provenance model shared across document and lesson schemas
- Source-reference resolver
- Citation viewer/deep-link UI
- Grounding checker
- Edit/regeneration citation policy
- Citation history in versions

### Persistence model

- `source_references(id, project_id, parsed_document_version, page_start, page_end, section_id, block_ids_json, figure_ids_json, table_ids_json)`
- Join tables from objective/narration/scene entities to source references, or embedded immutable refs plus query indexes
- `generated_additions(id, scope_type, scope_id, kind, explanation)`
- `grounding_checks(id, scope_type, scope_id, content_hash, status, score, unsupported_spans_json, checker_version)`

### API and command surface

- `GET /projects/{id}/source-references/{refId}`
- `GET /projects/{id}/scenes/{sceneId}/citations`
- `POST /projects/{id}/grounding-checks` or internal worker command
- `DELETE/PUT` citation links only through authorized editor commands

### Technical workflow

- Models cite block IDs from an application-created source package. They do not invent page numbers.
- The API resolves IDs to page/section/figure metadata and stores canonical references.
- The citation viewer opens the effective source text in context and can optionally display the original extraction/correction provenance.
- Generated hooks, analogies, examples, and framing that are not in the source receive a `generatedAddition` record. This is allowed only when it does not present unsupported source facts.
- Teacher edits keep existing citations initially but mark grounding `needs_recheck`. The checker compares changed claims with cited blocks and highlights unsupported spans.
- Regeneration replaces references from the new validated model output.
- Lesson versions snapshot citations and grounding status.

### Important design decisions

- Provenance is block-based; page numbers are derived display metadata.
- Embedding similarity can retrieve candidates but is not proof of support.
- Grounding checks should combine deterministic citation validity, semantic support, and teacher review.
- Do not silently attach the nearest paragraph to an unsupported claim.

### Failure, security, and idempotency behavior

- Unknown/deleted block references are errors.
- If a parser version changes, migrate references by stable block mapping or require review.
- Low-confidence support becomes a warning/error according to the content type.
- Keep sensitive source excerpts behind project authorization.

### Required tests

- Block-to-page/section resolution
- Generated additions display
- Teacher edit recheck
- Regeneration replaces refs
- Version snapshot preserves citation history
- Cross-tenant source-reference access

### Recommended AI-agent execution order

- Define `SourceRef` once in shared schemas.
- Build resolver and citation APIs before AI stages.
- Implement viewer and generated-addition labels.
- Add grounding checks and unsupported-span fixtures.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E20. Basic Version History

### Required product outcome

Major lesson states can be saved, viewed, rendered, and restored without deleting history.

### Covered user stories

- **E20-US1:** Save lesson version
- **E20-US2:** Restore previous version

### Owned components

- Lesson snapshot serializer
- Milestone version-creation service
- Version browser
- Restore command
- Version-to-render references
- Retention policy

### Persistence model

- `lesson_versions(id, project_id, version_number, parent_version_id, reason, created_by, created_at, lesson_spec_json_or_key, source_snapshot_id, configuration_version, objective_set_id, outline_set_id, narration_set_id, content_hash)`
- Optional `version_labels` or notes
- Renders reference `lesson_version_id` with a foreign key

### API and command surface

- `POST /projects/{id}/versions`
- `GET /projects/{id}/versions`
- `GET /projects/{id}/versions/{versionId}`
- `POST /projects/{id}/versions/{versionId}/restore`

### Technical workflow

- Create versions at approval milestones, before rendering, before restore, and optionally on an explicit Save Version action.
- Serialize all approved objectives, outline, narration, storyboard, citations, asset bindings, voice configuration, and relevant schema/template versions.
- Use canonical JSON serialization and a content hash to avoid duplicate snapshots.
- Old versions are read-only.
- Restore does not move a pointer backward or mutate history. It clones the chosen snapshot into a new current draft/version with `parent_version_id` pointing to the restored source.
- Warn about unsaved draft changes before restore. Existing renders remain linked to their original versions.

### Important design decisions

- Do not version every keystroke.
- Snapshot storage is preferable to reconstructing from a long event stream for the MVP.
- Version schema migrations must be explicit and testable.
- Source document and normalized parser artifacts have their own versions referenced by lesson versions.

### Failure, security, and idempotency behavior

- Reject restore of a foreign or incompatible/corrupt version.
- If a historic template version is no longer executable, show metadata and require migration before preview/render.
- Create the new snapshot transactionally before switching current pointers.
- Retention cleanup must not delete objects referenced by any version/render.

### Required tests

- Milestone and explicit version creation
- Duplicate content hash behavior
- Read-only old versions
- Restore creates a new version
- Renders remain linked
- Schema migration fixtures

### Recommended AI-agent execution order

- Define complete snapshot contract.
- Implement canonical serializer/hash.
- Add create/list/restore service and tests.
- Build version browser with metadata before visual diffs.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

## E21. Observability, Security, and Cost Controls

### Required product outcome

Every workflow is supportable, secure, measurable, rate-limited, and bounded by MVP cost limits.

### Covered user stories

- **E21-US1:** Track processing jobs
- **E21-US2:** Enforce cost limits
- **E21-US3:** Secure uploaded content

### Owned components

- Structured logging and correlation middleware
- Metrics/tracing/error tracking
- Job dashboard/internal runbooks
- Usage and provider-call metering
- Rate-limit/quota service
- Secrets and storage security
- Retention/cleanup and incident controls

### Persistence model

- `jobs` or job mirror records with IDs, status, retries, timings, errors, correlation IDs
- `provider_calls(id, project_id, operation, provider, model_or_voice, input_units, output_units, estimated_cost, latency_ms, status)`
- `usage_records(id, user_id, project_id, metric, quantity, cost, occurred_at)`
- `quota_policies` and `quota_counters`
- `audit_events`
- `security_scan_results`

### API and command surface

- Internal operational endpoints protected by admin controls, or direct observability tools
- `GET /projects/{id}/usage` where user-visible usage is desired
- Rate-limit headers and machine-readable quota errors
- Administrative retry/cancel commands must be authenticated and audited

### Technical workflow

- Create a correlation ID at the edge and propagate through API commands, database records, queue jobs, provider calls, and render logs.
- Use structured logs with stable event names and identifiers. Redact source text by default; log hashes/lengths rather than full prompts where possible.
- Emit metrics for uploads, ingestion success, stage conversion, AI schema failures, TTS failures, render time/failure, queue latency, storage, tokens, generated seconds, and cost.
- Enforce hard product limits before jobs: page count, duration, scene count, upload size, regeneration frequency, concurrent renders, and per-user/project budget.
- Require explicit user action for paid generation and rendering. Reuse content-addressed audio/assets/previews.
- Keep secrets in a server-side secrets manager and use least-privilege service identities.
- Encrypt in transit, use private storage, validate/scans uploads, and define deletion/retention jobs.
- Alert on critical failure rates, stuck queues, excessive spend, repeated authorization failures, and storage growth.

### Important design decisions

- Observability is implemented with the first job, not added at the end.
- PostgreSQL is the source of truth for user-visible job status; observability systems are diagnostic.
- Cost data is attached to the operation and project.
- Operational admin access must not require user credentials or expose private content unnecessarily.

### Failure, security, and idempotency behavior

- Metrics/logging failure should not usually fail product operations, but cost-meter persistence for paid operations may be required before execution.
- Rate-limit errors state when retry is allowed without revealing system internals.
- Cleanup jobs are idempotent and retain tombstones/audit evidence as policy requires.
- Security incidents have a documented token/session/share-link revocation path.

### Required tests

- Correlation propagation across API→queue→worker
- Redaction tests
- Quota boundaries and concurrent operation limits
- Usage/cost aggregation
- Stuck-job detection/reaper
- Deletion/retention and signed URL expiry
- Security checklist and tenant-isolation suite

### Recommended AI-agent execution order

- Add correlation, job records, and metrics with the first async epic.
- Implement quota checks as shared command guards.
- Add provider-call metering to every adapter.
- Create dashboards/runbooks and automated security/retention tests.

### Epic completion gate

The epic is complete only when its domain rules, database migration, API behavior, authorization, asynchronous behavior where applicable, UI states, observability, and automated tests are implemented. A happy-path UI without failure recovery or cross-user access tests is not complete.

---

# 9. AI Pipeline Engineering Standard

## 9.1 Model-call lifecycle

Every generation operation follows the same lifecycle:

```text
authorize
 → verify approved input versions
 → enforce quota
 → build bounded source/context package
 → persist job and idempotency key
 → call provider through adapter
 → validate structured output
 → resolve citations
 → run deterministic checks
 → optionally run quality judge
 → persist candidate
 → record model/cost/latency metadata
 → notify/poll UI
```

### Required model-call metadata

- Operation type
- Prompt template ID and version
- Provider and model identifier
- Input version/hash
- Input/output token or unit counts
- Latency
- Retry count
- Estimated cost
- Structured-output validation result
- Safety/grounding result
- Correlation ID

Do not make a model call directly from a React component or route handler.

## 9.2 Prompt repository

Store prompts as versioned files with:

- Purpose
- Input schema
- Output schema
- Allowed source context
- Template catalog version
- Examples
- Known failure modes
- Evaluation cases
- Changelog

A prompt change is a behavior change and must run the relevant evaluation set.

## 9.3 Source-package format

Use explicit machine-readable boundaries:

```json
{
  "sourceSnapshotId": "...",
  "sections": [
    {
      "sectionId": "sec-...",
      "heading": "Photosynthesis",
      "blocks": [
        {
          "blockId": "blk-...",
          "page": 4,
          "kind": "paragraph",
          "text": "..."
        }
      ]
    }
  ]
}
```

The model returns block IDs. Application code derives page and section labels.

## 9.4 Retrieval strategy

For the MVP's maximum 20-page document:

1. Build a hierarchy-aware index of sections and blocks.
2. Use objective/outline links to narrow later source packages.
3. Use lexical search and embeddings only when the relevant blocks do not fit safely.
4. Never let retrieved chunks lose their stable IDs and page provenance.
5. Treat retrieval as candidate selection, not proof of factual support.

## 9.5 Evaluation set

Start with approximately 20 representative textbook sections and expected review notes. Include:

- Clean PDF
- DOCX
- Figure-heavy section
- Table
- Process explanation
- Comparison
- Cause/effect
- Labelled diagram
- Numerical example
- Common misconception
- Poorly parsed input
- Source with irrelevant references/exercises

Score:

- Factual faithfulness
- Objective coverage
- Age appropriateness
- Narration clarity
- Scene-template suitability
- Visual variety
- Unsupported claims
- Duration
- Text density
- Caption alignment
- Asset consistency

Block release when a prompt/template/schema change causes unacceptable regression.

---

# 10. Database and Transaction Guidance

## 10.1 Recommended consistency boundaries

Use one transaction for:

- Project creation
- Source upload completion metadata
- Approval snapshot creation
- Reorder commands
- Version restore pointer changes
- Render job idempotency creation
- Share-link revocation

Do not keep a database transaction open while calling object storage, AI, TTS, or rendering.

Use an outbox pattern when a database state change must reliably enqueue a job:

```text
transaction:
  insert domain record
  insert outbox event
commit

dispatcher:
  publish outbox event to BullMQ
  mark outbox event dispatched
```

## 10.2 Deletion

Recommended MVP deletion:

1. Set `projects.deleted_at`.
2. Revoke share links.
3. Reject new commands.
4. Request cancellation for active jobs.
5. Enqueue object cleanup after retention delay.
6. Delete project-owned rows/objects according to policy.
7. Retain minimal audit/tombstone records where required.

## 10.3 JSON versus normalized rows

Use both deliberately:

- Normalized rows for lists, permissions, status, ordering, source lookup, and queries.
- Versioned JSON/JSONB snapshots for portable `NormalizedDocument` and `LessonSpec`.
- Do not use one giant JSON document as the only source of truth for job and access-control state.

---

# 11. Frontend Architecture

## 11.1 Route structure

```text
/app
  /projects
  /projects/[projectId]/upload
  /projects/[projectId]/ingestion-review
  /projects/[projectId]/configure
  /projects/[projectId]/objectives
  /projects/[projectId]/outline
  /projects/[projectId]/narration
  /projects/[projectId]/storyboard
  /projects/[projectId]/preview
  /projects/[projectId]/render
  /projects/[projectId]/versions
/share/[token]
```

## 11.2 Server state

Use React Query for API state:

- Query keys include project ID and relevant version/revision.
- Commands invalidate only affected queries.
- Long jobs poll with adaptive intervals or use server-sent events where worthwhile.
- The UI never assumes a job succeeded because a browser request was sent.
- Editor local state is separated from persisted state and shows saving/saved/conflict.

## 11.3 Schema-driven forms

Template schemas should provide:

- Field type
- Label/help text
- Required status
- Min/max length
- Item limits
- Asset-slot constraints
- Migration behavior

The API revalidates the exact same domain schema.

---

# 12. Deployment Topology

A practical MVP deployment can use:

- One Next.js web deployment
- One TypeScript API deployment
- One Python ingestion worker pool
- One TypeScript AI/media worker pool
- One dedicated render worker pool with FFmpeg/Chromium
- Managed PostgreSQL
- Managed Redis
- Private S3-compatible object storage
- CDN for approved media delivery
- Central logging/error tracking/metrics

Scale workers independently:

- Ingestion: CPU/memory sensitive
- AI/TTS: network/provider-rate sensitive
- Rendering: CPU-intensive and potentially high memory
- API: latency-sensitive but light

Do not co-locate untrusted document parsing or rendering with the public API process in production.

---

# 13. Environment and Configuration

Use validated server-side configuration. At minimum:

```text
DATABASE_URL
REDIS_URL
OBJECT_STORAGE_ENDPOINT
OBJECT_STORAGE_BUCKET
OBJECT_STORAGE_ACCESS_KEY / workload identity
AUTH_PROVIDER_*
EMAIL_PROVIDER_*
LLM_PROVIDER_*
TTS_PROVIDER_*
IMAGE_PROVIDER_*             # optional until E13
MALWARE_SCANNER_*
SIGNED_URL_TTL_SECONDS
MAX_UPLOAD_BYTES
MAX_SOURCE_PAGES=20
MAX_SCENES
MAX_REGENERATIONS_PER_HOUR
RENDER_CONCURRENCY
RENDER_TIMEOUT_SECONDS
PROMPT_VERSION_*
SCENE_LIBRARY_VERSION
```

Never expose provider secrets through `NEXT_PUBLIC_*`.

---

# 14. Definition of Done for an AI Coding Agent

When assigned one epic, the agent should produce:

1. **Scope statement:** exact user stories and out-of-scope behavior.
2. **Contract changes:** schemas, enums, API DTOs, events, and version implications.
3. **Migration:** forward migration and rollback/compatibility notes.
4. **Domain implementation:** authorization, validation, state transitions, idempotency.
5. **Worker implementation:** if asynchronous, including retries and classified errors.
6. **UI:** loading, empty, success, error, retry, stale, and conflict states.
7. **Observability:** correlation IDs, structured events, metrics, and cost records.
8. **Security:** ownership checks and data exposure review.
9. **Tests:** unit, integration, authorization, failure, and end-to-end fixture coverage.
10. **Documentation:** environment variables, runbook, ADR if a major decision changed.
11. **No unrelated refactor:** preserve existing contracts unless the task explicitly includes a migration.
12. **Evidence:** commands/tests run and representative outputs/screenshots where applicable.

### Agent task template

```text
Implement Epic E__ / User Story E__-US__.

Read:
- docs/epic-technical-implementation-guide.md
- packages/<relevant-schema>
- current ADRs and migrations

Constraints:
- Preserve tenant isolation.
- Use existing provider and queue abstractions.
- Do not call paid providers from HTTP handlers.
- Do not mutate immutable parser or lesson-version snapshots.
- Use idempotency for costly/retryable commands.
- Add correlation, usage, and error metadata.
- Update shared schemas before consumers.
- Add automated authorization and failure-path tests.

Deliver:
- schema/migration
- domain service
- API/worker
- UI states
- tests
- documentation
```

---

# 15. Recommended Delivery Sequence

The product documents recommend foundation first, then a manual visual pipeline, AI planning, teacher editing, audio/delivery, and hardening. The executable sequence is:

```text
A. Cross-cutting foundation
   E21 baseline + shared schemas + storage + queue + observability

B. Teacher and source workflow
   E1 → E2 → E3 → E4 → E5 → E6

C. Visual contract before autonomous generation
   LessonSpec schema → hand-authored fixture → E11 → E15 scene preview

D. AI planning
   E19 provenance foundation → E7 → E8 → E9 → E10

E. Teacher control
   E12 → E13 → E20

F. Audio and completion
   E14 → E15 full preview → E16 → E17 → E18

G. Hardening
   Full E21 controls, prompt evals, visual regressions, retry/recovery,
   security review, cost tests, and five-page science end-to-end validation
```

The first product proof remains:

> One well-parsed five-page science chapter becomes a coherent, editable, visually useful three-minute lesson, with source citations and a successful 1080p render.

---

# 16. Final Architecture Acceptance Checklist

Before calling the MVP technically complete, verify:

- [ ] Every project-owned query is tenant scoped.
- [ ] Original documents and parser outputs are immutable.
- [ ] Teacher corrections are overlays and included in an approved source snapshot.
- [ ] All AI outputs use strict versioned schemas.
- [ ] `LessonSpec` is shared by editor, preview, and renderer.
- [ ] The AI cannot emit arbitrary animation code or coordinates.
- [ ] The ten templates have input limits and visual regression tests.
- [ ] Scene-level regeneration preserves all other teacher edits.
- [ ] Narration changes invalidate only dependent artifacts.
- [ ] Audio is generated and retried per scene.
- [ ] Captions have valid monotonic timings and exports.
- [ ] Validation is tied to the exact lesson hash.
- [ ] Rendering uses an immutable `LessonVersion`.
- [ ] Render requests are idempotent.
- [ ] Outputs are verified before being marked complete.
- [ ] Share links are opaque, revocable, and expose minimal data.
- [ ] Citations resolve to real source blocks and pages.
- [ ] Generated additions are labelled.
- [ ] Version restore creates a new version.
- [ ] Logs, metrics, errors, and costs correlate across jobs.
- [ ] Page, duration, scene, regeneration, and render limits are enforced.
- [ ] The complete five-page science fixture passes upload-to-download end to end.
