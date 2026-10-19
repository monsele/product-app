# ADR-017: User-owned design systems and validated imports

- Status: Accepted by product-owner implementation instruction, 2026-10-18
- Stories: ST-122 through ST-125
- Extends: ADR-008, ADR-010, ADR-015
- Proposal: [Bring your own design system](../bring-your-own-design-system.md)

## Decision

Store reusable design systems at owner scope, independently of project presets.
Mutable drafts use optimistic revision checks; published versions are immutable,
content-hashed snapshots. Publishing and applying are separate operations.
Archival prevents further writes without removing historical versions or bytes.

Imports use owner-scoped private storage outside project cleanup prefixes.
An owned project supplies the existing job infrastructure's correlation and
authorization context; imports remain reusable by that owner across projects.
Signed PUTs target staging keys only. Completion atomically queues one validation
job and outbox event. The worker verifies actual bytes and checksum, scans them,
and writes a separate immutable validated object at a content-addressed key.
A stale worker attempt cannot overwrite a different validated content hash.
A still-valid upload URL can
never overwrite a validated object. Only validated assets may enter a version.

Support TTF/OTF/WOFF2, PDF/Markdown guides, bounded JSON tokens, and PNG/JPEG
references/logos. Reject executable uploads, font collections, corrupt files,
oversized decoded fonts/images, and unsafe scanner results. Preserve uploaded
originals privately. Imported text is data, never executable agent instructions.

Drafts distinguish exact locks from advisory creative principles. Interpretation
must report unsupported requirements; unfulfilled locks block application.
The custom renderer will use a new manifest release, independent identities,
registered composition controls, and pinned assets. No arbitrary CSS, coordinates,
or animation code is accepted. Existing manifests and saved videos remain frozen.

## Delivery and compatibility

ST-122 introduces the storage/API/import foundation only. ST-123 adds manual UI
and custom rendering; ST-124 adds paid, metered interpretation; ST-125 adds moving
proofs and application. No foundation API claims a system has been applied to a
video. Later stories must preserve narration, captions, grounding and factual
diagrams, and include system/font/composition identities in render hashes.

Additive tables need no backfill. Original uploads and published versions are
immutable. There is no deletion endpoint in the foundation; retain all referenced
bytes until a separate owner-deletion/retention workflow accounts for saved videos.
Project deletion must not delete owner design systems or their validated assets.

### ST-122 review corrections (completed 2026-10-19)

Font character-map ranges are bounded before expansion. Fontkit runs only in a
separate decoder process with bounded heap and a five-second deadline; decoder
failure rejects the import without terminating the pipeline worker. Reject
non-finite token numbers before serialization. Published history has revision
cursor pagination and direct owner-scoped version lookup, including archived
systems. These corrections preserve definition/snapshot versions and existing
saved bytes; no additional migration is needed.

## Alternatives

- Reusing project presets would prevent cross-project identity and couple asset
  retention to project deletion.
- Rendering directly from signed-upload keys would permit post-validation changes.
- Rewriting v1/v2 manifests would change historical output.
- Treating every imported philosophy as a preset pack would preserve the creative
  restriction this feature is intended to remove.

### PDF parser containment ? 2026-10-19

PDF guide parsing also runs in a separate process with the same five-second
deadline and V8 heap limits as font inspection. Page limits are checked inside
that process; malformed object streams, parser crashes and timeouts reject the
import without terminating the job host. Decoder diagnostics are suppressed,
IPC input/output is validated, and credentials are not passed to the decoder.
