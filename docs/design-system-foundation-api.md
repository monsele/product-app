# Design-system foundation API (ST-122)

Apply migration `0079_design_systems` before starting API/worker code that uses
this API. Imports require the existing pipeline worker and outbox dispatcher.
The foundation does not change video rendering; UI and custom-manifest support
are assigned to ST-123. Interpretation and project application follow later.

## Owner scope and revisions

All routes require the normal `avlp_session` cookie. Mutations use the existing
trusted-origin check. Reads are private/no-store. A system belongs to its owner
across projects; another owner receives 404. No storage key is client-selected.

| Method | Route                                           | Input / result                                                                                   |
| ------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| GET    | `/design-systems`                               | Owner's headers, newest first, maximum 200                                                       |
| POST   | `/design-systems`                               | `{ "name": "Field journal" }` creates revision 1                                                 |
| GET    | `/design-systems/:id`                           | Draft, import status, and immutable versions                                                     |
| PUT    | `/design-systems/:id`                           | `{ expectedRevision, name, definition }` increments revision                                     |
| POST   | `/design-systems/:id/versions`                  | `{ expectedRevision }` publishes the exact revision; repeat returns the same version             |
| GET    | `/design-systems/:id/versions`                  | `{ versions, nextBeforeRevision }`; query `limit` (1–200, default 50), optional `beforeRevision` |
| GET    | `/design-systems/:id/versions/:versionId`       | Owner-scoped immutable version lookup, including archived systems                                |
| POST   | `/design-systems/:id/archive`                   | `{ expectedRevision }` prevents new writes, retaining history                                    |
| POST   | `/design-systems/:id/uploads`                   | Creates a five-minute signed staging PUT                                                         |
| POST   | `/design-systems/:id/uploads/:assetId/complete` | Queues validation once; responds 202                                                             |
| GET    | `/design-systems/:id/assets/:assetId/download`  | Five-minute signed attachment download for validated bytes only                                  |

An edit or archive on a stale revision returns 409 `edit_conflict`.
Publishing has no video application side effect. Published versions retain the
name, definition, asset identities, validated hashes and inspection metadata.
Draft changes and archival do not rewrite them.

System detail retains its existing `versions` array (up to 200) and adds
`nextBeforeRevision`. When non-null, pass it to the versions endpoint to fetch
the next page; repeat until null. Pages use strictly decreasing source revisions,
so new publications do not shift older records across page boundaries. Direct
version lookup remains available regardless of the number of newer versions.

## Definition version 1.0

```json
{
  "schemaVersion": "1.0",
  "philosophy": "Explain through annotated diagrams before decoration.",
  "rules": [
    {
      "id": "calm-motion",
      "category": "motion",
      "instruction": "Reveal relationships progressively; avoid bouncing.",
      "enforcement": "locked",
      "origin": "supplied"
    }
  ],
  "assetIds": []
}
```

Categories: typography, colour, composition, imagery, diagrams, motion.
Enforcement is locked or guidance; origin is supplied or inferred. Rule IDs and
asset references are unique. Rules remain source instructions at this stage;
publishing does not claim they are renderable or have been applied. ST-123/124
introduce renderer capability reporting and block unsupported locks at application.

## Imports and recovery

Upload input: `{ projectId, kind, mediaType, originalName, sizeBytes, sha256,
rightsConfirmed: true }`. The project must be owned and active; it supplies the
existing job infrastructure's project context. Reusable bytes are outside its
cleanup prefix. Rights confirmation is timestamped on the immutable import.

Supported kind/media pairs:

- font: `font/ttf`, `font/otf`, `font/woff2` (maximum 5 MB).
- guide: `application/pdf`, `text/markdown`.
- tokens: `application/json`.
- reference/logo: `image/png`, `image/jpeg`.

All files are limited to 10 MB; Markdown/JSON to 100,000 characters; PDFs to
100 pages. Font tables are limited to 32 MB decoded, images to 20 million pixels
and 8,000 pixels per side, and JSON to eight nesting levels and 10,000 nodes.
Token numbers must be finite; overflowing values such as `1e400` are rejected
before they can become null during JSON persistence. Font character-map ranges
are checked before coverage allocation, with a maximum of 200,000 characters.
Font parsing runs in a separate Node process with a 128 MiB old-generation heap
cap, 16 MiB semi-space setting and five-second wall-clock deadline. Parser output
is validated over IPC; crashes/timeouts reject the import and leave the job host
usable. The child receives no database, storage or provider credentials.
Image metadata is stripped by re-encoding. Font collections and fonts explicitly
prohibiting outline embedding are rejected. Originals remain private staging data;
validated copies have distinct keys containing their actual-byte checksums.

Use every returned PUT header. Completion verifies upload metadata, then atomically
creates one `design-system.validation` job and outbox record. The worker rechecks
actual bytes, scans for malware, inspects the format and saves a validated copy.
No paid AI/provider work is initiated. Production retains the existing requirement
for a configured malware scanner; local development uses the existing fixture.

The system detail response includes each import's `status`, `rejectionCode`,
`jobId`, and available `validationJob` state/attempts. Scanner/storage outages
use the standard three-attempt job retry policy. A terminally failed/cancelled
job reports `recovery: "upload_again"`; rejected/expired imports require a fresh
upload. Only active imports can be downloaded or enter a published version.

No permanent deletion API is introduced. Originals and validated bytes remain
retained; owner deletion and orphan-upload cleanup need a separately reviewed
retention workflow that protects historical videos.
