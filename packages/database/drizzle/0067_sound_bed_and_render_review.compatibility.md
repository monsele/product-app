# 0067 sound bed and render review compatibility

Additive only. No existing row changes meaning, and nothing is backfilled.

## `sound_bed_tracks` (new, seeded)

- A platform-owned catalog shared by every tenant, so it has no project or
  owner columns. The six seeded rows come from
  `apps/api/sound-beds/catalog.json`; their license records are in
  `apps/api/sound-beds/LICENSES.md`.
- `storage_key` is checksum-addressed (`catalog/sound-beds/<trackId>/<sha256>.wav`)
  and unique. A row's bytes are never replaced. A changed track gets a new
  `track_id`, and retiring one sets `status = 'retired'`.
- The seed only records metadata. The bytes are uploaded separately by
  `pnpm --filter @avlp/api sound-beds:register`. A render whose pinned object
  is absent fails with `SOUND_BED_UNAVAILABLE`; it does not fall back to no bed.

## `lesson_configurations.sound_bed_track_id`

- New nullable `text` column, with a foreign key to `sound_bed_tracks` that
  restricts deletion.
- Every pre-existing row reads back `null`, which the API reports as
  `soundBed: "none"`. That is exactly what those lessons already were.
- `lesson_versions.snapshot` JSON written before this migration has no
  `soundBed` key. It is not rewritten; `readPinnedSoundBed` reads the absent key
  as "no bed", so historical versions re-render with byte-identical audio.

## `render_review_reports` (new)

- One row per `render_jobs.id` (unique). A retried job upserts it.
- It has tenant columns (`owner_user_id`, `project_id`) and every read filters on
  both. It follows `rendered_videos`/`render_thumbnails`: it has a foreign key to
  its render job and no project foreign key.
- Renders completed before this migration have no report, and the API returns
  `review: null` for them.

## Render error codes

`RENDER_REVIEW_FAILED`, `RENDER_REVIEW_UNAVAILABLE`, `SOUND_BED_UNAVAILABLE`
and `SOUND_BED_CHECKSUM_MISMATCH` are new values of the API-level
`renderErrorCodeSchema`. `render_jobs.error_code` and the generic job's error
metadata are free `text`/`jsonb`, so no database enum changes.

## Deployment order

1. Apply the migration.
2. Run `sound-beds:register` against the environment's bucket.
3. Deploy the renderer (new implementation version
   `st-103-remotion-4.0.507-sound-bed-render-review-v1`), then the API and web.
   The API and renderer versions must match, as with every earlier renderer
   release.
