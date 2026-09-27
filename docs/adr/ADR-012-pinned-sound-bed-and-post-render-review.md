# ADR-012 — Pinned background sound bed and deterministic post-render review

- Status: Accepted
- Date: 2026-09-26
- Story: ST-103 — Add a Ducked Background Sound Bed and Post-Render Self-Review
- Extends: ADR-004 (measured narration), ADR-008 (resolved creative-design manifests)
- Related: `docs/controlled-rendering-versioning-contract.md` (CR-02, CR-03, CR-06, CR-07)

## Context

ST-103 adds two things that change what a render produces and whether it is
delivered:

- an optional background music bed that ducks under narration;
- a deterministic quality review of every produced MP4.

CR-02 requires any change to the render manifest's shape to be decided and
recorded in an ADR before production consumers change. Two decisions were also
needed where a literal reading of the story could not work with the platform's
real media.

## Decision

### 1. The bed is presentation, pinned by identity

- A lesson configuration names `none` or a catalog `trackId`.
  `lesson_configurations.sound_bed_track_id` is null for `none` and for every
  pre-existing row.
- Saving a lesson version resolves the track against `sound_bed_tracks` and
  pins its identity into the immutable snapshot as `soundBed`. The pinned fields
  are track ID, checksum, checksum-addressed storage key, duration, loop flag,
  loudness, peak, license and attribution. A snapshot with no bed stores
  `soundBed: null`. Snapshots saved before ST-103 have no key; they are never
  rewritten, and `readPinnedSoundBed` reads them as no bed.
- `LessonSpec` is unchanged. The bed is not lesson content (ADR-008).

### 2. Render manifest version 2

- The production render manifest's `schemaVersion` becomes `2`. Version 2
  carries a required `soundBed` entry: the pinned bed, or `null`.
- Readers accept `1` and `2`. A version-1 manifest may not carry `soundBed` and
  renders without a bed.
- The render **asset manifest** keeps `schemaVersion: 1` and gains an optional
  `soundBed` entry (`trackId`, `checksumSha256`, `storageKey`, `contentType`).
  The entry is present exactly when the manifest pins a bed, and the envelope
  schema rejects any disagreement between the two. With no bed, the asset
  manifest is byte-identical to its pre-ST-103 form.
- Both entries are inside the hashed render identity (CR-06). The renderer
  implementation version is bumped to
  `st-103-remotion-4.0.507-sound-bed-render-review-v1` (CR-03).

### 3. Catalog media lives outside every tenant

- Tracks are platform media, stored at
  `catalog/sound-beds/<trackId>/<sha256>.wav`.
- The API and the renderer reach them only through a second storage client
  confined to that prefix. Tenant-scoped clients stay confined to `users/`, so
  neither client can reach the other's data.
- The renderer verifies presence and checksum before rendering. A missing track
  fails with `SOUND_BED_UNAVAILABLE` and a changed one with
  `SOUND_BED_CHECKSUM_MISMATCH`. There is no fallback to no bed.
- Audition URLs are signed per authenticated request with a 5-minute expiry.

### 4. Deterministic ducking from the composition's own timeline

- Bed gain is `soundBedVolumeAtFrame`, a pure function of the frame, the
  lesson length, and the narration segments.
- The narration segments are the composition's caption cues, which are aligned
  to the measured narration (ADR-004). Cues closer than two ramps are merged.
- Levels and times are video-theme tokens: bed 0.12, ducked 0.04, 250 ms ramps,
  1.5 s fade-in, 2 s fade-out. A ramp *ends* on a segment's first frame, so every
  narrated frame is fully ducked.
- Looping uses one `Sequence` per repeat on a frame boundary; catalog loops last
  a whole number of frames.
- Preview and render use the same composition, so their audio is identical.
  The ST-098 parity suite asserts this, and asserts byte-identical no-bed
  output against a baseline captured before the change.

### 5. Comparison variants are narration-only

A demonstration comparison (ADR-007) must differ only in its visual
explanation, and the demonstration composition has no bed track. Both halves of
a comparison are therefore rendered with `soundBed: null`, whatever the version
pinned. This is a deterministic, documented policy, not a fallback.

### 6. The post-render review

Every render is reviewed before its video can become available. The review runs
the renderer's pinned ffprobe/ffmpeg with no database transaction open. Its
thresholds live in one module (`render-review-thresholds.ts`, version
`render-review-v1`) that the report records.

- **Streams and duration:** exactly one video and one audio stream, the
  1080p/30 fps H.264/AAC profile, and the existing ±100 ms duration rule.
- **Black frames:** `blackdetect` semantics, with a pixel black at or below 5% of
  the luma range and a picture black when at least 98% of its pixels are. The
  renderer's bundled ffmpeg has no `blackdetect` filter, so the review decodes
  area-averaged luma at 160×90 and applies the same rule per frame in Node. A
  run of 1.0 s or more is an error.
- **Missing narration:** `silencedetect` for at least 1.0 s, overlapping a
  narration span by at least 1.0 s.
  - **Deviation from a literal -50 dB floor.** With a bed, the ducked bed is
    still playing where narration went missing, so a fixed -50 dB floor would
    never detect the loss. When a bed is pinned, the floor rises to the bed's
    own ceiling under narration: its registered sample peak plus the ducked gain
    in dB, plus 1.5 dB margin. With no bed, the floor is exactly -50 dB. An
    integration test shows the raised floor detects missing narration under a
    bed and the plain floor does not.
- **Audio level:** a sample peak at or above -0.1 dBFS gives a clipping warning.
  Integrated loudness (`loudnorm` analysis) outside -20 to -12 LUFS gives a
  warning. Warnings never block delivery.
- **Captions:** captions are burned into the picture by the composition. The
  MP4 has no subtitle stream, and counting on-screen captions would need OCR.
  The review therefore compares the caption cues the rendered composition
  actually received against the cue count the manifest promises. Every narrated
  scene must carry at least one cue. A mismatch or a missing track is an error.
- **Contact sheet:** four PNG frames at 5%, 35%, 65% and 95% of the duration,
  clamped inside the last picture frame, stored privately under the tenant's
  render prefix.
- **Outcome:**
  - The report is upserted, one row per render job, keyed by `render_job_id`.
    Contact frames are written to storage first, and the database write is a
    short transaction.
  - Any error finding fails the job terminally with `RENDER_REVIEW_FAILED` and
    the finding codes. The MP4 is reviewed *before* upload, so a failing video
    never reaches storage and no `rendered_videos` row is created.
  - A retried job that reuses a stored video downloads it, verifies its
    checksum, re-reviews it, and upserts the same report.
  - A review that cannot run fails with the retryable
    `RENDER_REVIEW_UNAVAILABLE`. An unreviewed video is never delivered.

### 7. Catalog content and licensing

- The six seeded tracks are original works synthesised by
  `apps/api/sound-beds/generate-tracks.mjs` and dedicated to CC0-1.0. No
  generated-music provider and no third-party recording is used.
- Loudness is normalised once, when the tracks are authored. The generator is
  deterministic and refuses to change a registered checksum.
- ST-103 adopts OpenMontage's *technique* only. No OpenMontage (AGPL-3.0) code,
  schema, prompt or asset was used.

## Consequences

- Existing lesson versions re-render with byte-identical audio, and their new
  renders gain a review. Renders queued under the previous implementation
  version fail explicitly as unavailable, as with every earlier renderer
  release.
- The review adds a few ffmpeg decode passes per render. They take seconds for
  a 420-second lesson, run in the background render job, and are not metered
  separately (they make no provider calls).
- Adding a licensed track that needs credit only requires a non-null
  `attribution_text`. The share page and storyboard exports already show it.

## Alternatives rejected

- **Resolve the configured bed at render time:** changing the track would change
  old versions' re-renders (CR-01, CR-02).
- **Copy catalog bytes into each tenant prefix:** duplicates storage for shared
  media with no isolation benefit. A read-only catalog client gives the same
  guarantee.
- **Fixed -50 dB silence floor with a bed:** cannot detect lost narration under
  a bed, so it would silently pass the defect this check exists to catch.
- **Mux a subtitle stream to make captions probeable:** changes delivered output
  and captions, which ST-103 lists out of scope.
