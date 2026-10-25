# Design-system interpretation (ST-124)

My Design Systems can interpret a formal guide or an idea with optional validated
materials. The owner explicitly authorizes a paid operation. No educational
source snapshot is required or sent to this operation.

The result is a proposal, tied to the saved input revision. It contains a brief,
rules, exact supplied quotations or inferred provenance, conflicts, unsupported
requirements and capability reports. Acceptance saves a new design-system draft;
publication remains a separate action. Project application, moving proofs and
conversational refinement belong to ST-125.

## API

All routes require the authenticated owner; mutations require the trusted origin.
Reads use `private, no-store`.

- `POST /design-systems/:id/interpretations`: `projectId`, `expectedRevision`,
  `request` (1–10,000 characters), `assetIds` (up to twelve unique validated
  imports) and `paidActionConfirmed: true`. Returns `{id, jobId}` with HTTP 202.
- `GET /design-systems/:id/interpretations`: latest twenty request identifiers.
- `GET /design-systems/:id/interpretations/:interpretationId`: job state,
  revision, stale flag, accepted revision, safe error code and proposal.
- `POST /design-systems/:id/interpretations/:interpretationId/accept`:
  `expectedRevision`. A succeeded proposal saves once, with optimistic revision
  checks. Duplicate acceptance returns its original accepted revision. A stale
  or archived system cannot be overwritten.

An owned project supplies job correlation and usage context. Imports and reusable
systems remain owner-scoped. Identical system/revision/request/material/prompt/
model inputs return their original request, including after a failure; revise
the request or saved draft before asking for another interpretation.

## Input and renderer boundaries

Only immutable validated bytes are read, through owner/system/asset/hash keys.
Checksums are verified again. Markdown and token JSON are bounded text data.
PDF.js extracts at most 70,000 characters in an isolated process, within five
seconds and a 256 MB old-space heap for interpretation (ordinary import inspection
retains its 128 MB limit). PDFs without readable text need a text PDF, Markdown
or a description. This increment does not perform OCR.

At most four references/logos are decoded with pixel limits, downscaled to fit
1024 × 1024, and sent as private JPEG data, never signed URLs. Individual encoded
references are limited to 1 MB. The provider's multimodal request attaches them
in source order. Font IDs identify validated uploads; glyph arrays are not sent.

Imported content is never agent authority. Provider output is strict, bounded
JSON. Supplied quotations must occur verbatim in their cited text source. Image
observations are inferred. Existing philosophy, rules and exact presentation
settings stay authoritative. Suggested controls are review data only. All free
text locks remain unsupported until resolved with registered exact controls;
the existing custom compiler blocks them. No code, CSS or geometry is accepted
as a renderer contract. LessonSpec, narration, captions and diagrams are untouched.

## Paid dispatch and recovery

Requests reserve at most two concurrent operations and twenty requests per hour
per owner, serialized across origin projects. The worker also applies the existing
generation quota guard immediately before calling the approved provider/model.
The existing conservative estimate is $1.08 per request; output is capped at
8,000 tokens. Provider retries are disabled for this operation.

Migration `0080_design_system_interpretations` adds an owner-scoped input snapshot,
dispatch receipt, proposal and accepted revision. No backfill is required.
Job/outbox creation is atomic. A conditional dispatch claim prevents concurrent
calls. A durable usage reservation precedes dispatch; a confirmed response,
actual token/cost metadata and the provider receipt are saved in one transaction.
Finalization and job retries reuse that receipt. Invalid output is still metered.

Only an explicit rate-limit rejection retries dispatch (up to the job's three
attempts). Unconfirmed transport/process failures retain an upper-bound usage
reservation for reconciliation and stop automatic redispatch. An operator should
reconcile that reservation against provider billing. This is intentionally
conservative: the provider offers no exactly-once completion receipt covering
an interrupted connection. No database transaction spans a provider/storage call.
Interpretation output and reference bytes are redacted from adapter logs.

## Approved planning context

Only an immutable, owner-scoped published system can supply planning guidance.
`visual-plan@v2` accepts an optional `designSystemVersionId` in job params. The
loader verifies the saved content hash and blocks unsupported locks. Philosophy,
principles and reference hashes travel beside unchanged approved scene content;
existing grounding, composition eligibility and motion validation still apply.
The illustration job has the same optional version pin and bounded style-only
guidance. Jobs without a pin keep their previous prompt/output behavior.

ST-125 must attach those explicit pins as part of project application and include
them in its design/illustration request identity. ST-124 does not automatically
attach a reusable system to any video or alter an existing saved manifest.

## Verification and sources

PostgreSQL integration tests cover ownership, request/accept idempotency, quota
reservations, stale edits, duplicate worker delivery, confirmed-receipt reuse,
rate limits, ambiguous transport failure and actual usage persistence. Prompt
fixtures cover formal guides, inspiration, conflicting locks, unsupported motion,
prompt injection and quotation provenance. They are deterministic guardrail
evaluations; they do not claim a live model quality score. No paid provider calls
were made during development.

PDF extraction follows the [PDF.js Node text extraction example](https://github.com/mozilla/pdf.js/blob/master/examples/node/getinfo.mjs).
The configured model's vision support is documented in [Together's Kimi K3 guide](https://www.together.ai/blog/kimi-k3-guide).
The pinned `pdfjs-dist` release requires Node 22.13 or newer; the repository
engine minimum is updated accordingly.
