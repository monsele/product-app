# 0071 illustration library compatibility

Additive only. No existing row changes meaning, and nothing is backfilled or
seeded.

## `illustration_library_entries` (new, empty)

- A platform-owned catalogue shared by every tenant, following the ST-103
  `sound_bed_tracks` pattern, so it has no project or owner columns. Only the
  operator script `pnpm --filter @avlp/api illustration-library:generate`
  writes it, from the checked-in `apps/api/illustration-library/concepts.json`.
  No API route, job or lesson flow inserts or updates a row.
- One row per illustration key (`<treatment>:<normalised concept>`) and surface
  (`light` or `dark`), unique. A row is claimed as `generating` before its paid
  provider call, so a re-run or a crashed run never pays twice for a completed
  picture. It becomes `active` only after moderation passes; a moderation
  rejection is recorded as `rejected` and is never retried. `failed` rows (a
  provider error) are retried by the next run.
- `storage_key` is checksum-addressed per row
  (`catalog/illustrations/<treatment>/<surface>/<entry id>/<sha256>.png`) and
  unique. A row's bytes are never replaced; retiring one sets
  `status = 'retired'`.
- With the table empty, every v2 design plans and renders exactly as before.

## How lessons use it

- Before preview approval only (ADR-015 §6), a v2 scene whose picture is over
  budget, rejected by moderation or failed on its final attempt may take a
  matching `active` entry. The bytes are **copied into the lesson's project**
  as an ordinary active `project_assets` row (provenance `ai_generated`, since
  the library picture was generated), and the manifest pins it as
  `imagery.hero` with `origin: "library"`. `origin: "library"` was already part
  of the v2 manifest schema (ST-109); no manifest or snapshot changes shape.
- Renders, previews and lesson-version snapshots resolve that hero through
  `project_assets` exactly like a generated one, so retiring or deleting a
  library row never changes an existing draft or version.
- No `project_assets.provenance` value is added.

## Storage

API and pipeline workers read library bytes through a second storage client
confined to `catalog/illustrations` (read only in practice); tenant data stays
behind the `users/` client, and the library client cannot reach it.

## Deployment order

1. Apply the migration.
2. Deploy API and workers. With no rows, nothing changes.
3. Price a batch with `illustration-library:generate --dry-run`, then run it
   with `--max` against the environment's bucket after approval.
