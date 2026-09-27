---
story_id: ST-103
title: "Add a Ducked Background Sound Bed and Post-Render Self-Review"
phase: "06 — Audio, Validation, Rendering, and Delivery"
status: Done
priority: should-have
epics: ["E6", "E14", "E15", "E16", "E17"]
prd_user_stories: ["E6-US2", "E15-US2", "E17-US1", "E17-US2"]
depends_on: ["ST-057", "ST-063", "ST-064", "ST-065", "ST-066", "ST-068", "ST-077", "ST-098", "ST-102"]
---

# ST-103 — Add a Ducked Background Sound Bed and Post-Render Self-Review

## Story

As a teacher, I want an optional background music bed that automatically quiets under
narration, and I want the system to inspect every finished video before handing it to me, so
that lessons feel produced rather than bare, and a broken render never reaches my learners.

## Outcome

- **Sound bed.** A lesson can carry one optional sound bed chosen from a curated, licensed
  catalog. Preview and final render play it under the narration and duck it deterministically
  during speech. The choice is pinned to the lesson version, so re-renders are reproducible.
- **Post-render self-review.** Every render runs a deterministic quality review of the
  produced MP4 before the video becomes available. Blocking findings keep the video out of
  delivery and give a typed, actionable reason. Advisory findings, plus a four-frame contact
  sheet, are shown on the render page.

## Why (OpenMontage learnings)

`docs/claude_openmontage-final-consolidated.md` §1.4 adopted OpenMontage's planning,
provenance, visual-QA and motion lessons, and ST-085–ST-090 shipped them. Two OpenMontage
production techniques were not carried over and are still absent:

1. **Music and sound design with ducking.** OpenMontage mixes a music bed under narration
   with ducking and fades. AVLP composes narration only: `packages/scene-library/src/full-lesson.tsx:1070`
   renders one `<Audio>` per scene, and nothing in `apps/renderer/src` references music.
2. **Post-render self-review.** OpenMontage probes the output, samples frames at several
   positions for black or broken frames, analyses audio for silence and clipping, and checks
   subtitles before presenting a video. AVLP's `probeVideo` (`apps/renderer/src/media.ts:123-190`)
   checks only duration (±100 ms) and fps, and `render-lifecycle.ts:84` then marks the render
   `completed`.

The adoption follows AVLP's rules, not OpenMontage's:

- No generative music. Suno-style generation stays deferred, like generated motion (§6).
- The render never fetches content from a provider.
- Deterministic checks are the only blocking authority (§1.3).
- **Licensing:** clean-room implementation only. Do not copy OpenMontage (AGPL-3.0) code,
  schemas or prompts.

## Required Reading

- `AGENTS.md`
- `docs/reference/mvp-prd.md`: E6, E14, E15, E16, E17
- `docs/reference/epic-technical-implementation-guide.md`: E14–E17 and the cross-cutting sections
- `docs/claude_openmontage-final-consolidated.md`: §1.3, §1.4, §6, §7
- `docs/controlled-rendering-versioning-contract.md` and ST-098
- `docs/adr/ADR-004-measured-narration-controls-playback-duration.md`,
  `ADR-005-versioned-style-packs-for-multi-style-video.md`,
  `ADR-008-resolved-creative-design-manifests.md`
- `docs/design.md` (configuration and render screens)

## Dependencies

ST-057, ST-063, ST-064, ST-065, ST-066, ST-068, ST-077, ST-098, ST-102. All are Done.

## Scope

### A. Sound bed

- [x] **Curated catalog.** Add a catalog of 6–10 licensed instrumental tracks, registered
  like the existing asset catalog (ST-057).
  - Each track records: stable `trackId`, title, mood tags, duration, integrated loudness
    (LUFS), checksum, storage key, license id, source URL and required attribution text.
  - Tracks are CC0 or equivalently licensed.
  - Tracks are loudness-normalised once, at registration, not at render time.
  - Tracks loop seamlessly, or are long enough for the 420-second maximum lesson.
- [x] **Lesson configuration.** Add a `soundBed` choice: `none` or a catalog `trackId`.
  - The default is `none`.
  - Every existing lesson reads as `none`, which keeps ST-098 reproducibility.
  - Add a picker on the configuration screen with a short audition player. Follow the
    pattern of the ST-102 style-pack selector.
- [x] **Pinning.** The resolved track (id and checksum) is pinned into the immutable
  lesson-version presentation snapshot and the render asset manifest. Use the mechanism that
  pins the creative style pack (ADR-008 and the controlled-rendering contract).
- [x] **Composition.** Add a composition-level bed track in the full-lesson Remotion
  composition, used by both preview and render.
  - Bed volume and duck depth are video-theme tokens, not literals.
  - Starting values: bed at 0.12, ducked to 0.04 while narration plays.
  - Ramps are 250 ms, with a 1.5 s fade-in and a 2 s fade-out.
  - Ducking is a pure function of the frame and the narration segment timeline already in
    the composition, so it is deterministic.
- [x] **Attribution.** Where a track's license requires it, add the attribution text to the
  video's exported metadata and the share page.

### B. Post-render self-review

- [x] **Render review.** After the MP4 is produced and before the render is completed,
  run a deterministic review in `apps/renderer` built on the existing ffmpeg and ffprobe
  wrappers (`media.ts`). It checks five things:
  1. **Streams:** exactly one video stream and one audio stream, with the expected codecs,
     resolution and fps. Duration keeps the existing ±100 ms rule.
  2. **Black frames:** any black segment of 1.0 s or longer (`blackdetect`,
     `pix_th=0.05`) is an error.
  3. **Missing narration:** silence (`silencedetect`, -50 dB, 1.0 s or longer) that
     overlaps a manifest narration segment by 1.0 s or more is an error.
  4. **Audio level:** peak at or above -0.1 dBFS is a clipping warning. Integrated loudness
     outside -20 to -12 LUFS is a warning.
  5. **Captions:** the caption track the manifest promises is present and its cue count
     matches. A mismatch is an error.
- [x] **Contact sheet.** Sample frames at 5%, 35%, 65% and 95% of the duration. Store them
  privately under the tenant's key prefix as a contact sheet.
- [x] **Outcome.** Persist a versioned review report per render.
  - If any finding has error severity, the render fails with `RENDER_REVIEW_FAILED` and the
    finding codes. No `rendered_videos` row becomes downloadable or shareable.
  - Warnings are recorded and shown, but never block.
- [x] **Render page.** Show the contact sheet, loudness, and any findings, each with its
  suggested correction.

## Technical Implementation Requirements

- **Composition boundary.** The bed is audio only. It never changes scene timing, and
  ADR-004 still holds: measured narration controls duration.
- **Determinism.** Ducking and the chosen track must give frame-identical audio in preview
  and render for the same lesson version. Extend the ST-098 parity tests.
- **Renders use pinned assets only.** A missing track or a checksum mismatch fails the
  render explicitly. There is no silent fallback to `none`.
- **Review thresholds.** Thresholds are constants in one versioned module. The report
  records `reviewVersion`.
- **Transactions.** Do not hold a database transaction open while ffmpeg runs or storage is
  written. Run the review first, then write the lifecycle.
- **Idempotency.** A retried render job re-runs the review and upserts a report for the same
  render attempt.
- **Logging.** Never log signed URLs or storage credentials. Findings carry codes and
  timestamps, not media.

## Contracts and Persistence

- **Schemas:** add `soundBedTrackIdSchema` and a `soundBed` field to lesson configuration.
  Add the catalog entry schema, a `renderReviewReportSchema` (with `reviewVersion`, findings
  `{ code, severity, atMs?, detail }`, `contactSheet[]` and `loudness`), and a
  render-manifest `soundBed` entry. Bump the render manifest `schemaVersion`; readers must
  accept the previous version.
- **Migration:**
  - a `sound_bed_tracks` catalog table, seeded
  - a `sound_bed_track_id` column on lesson configurations
  - a `render_review_reports` table (`render_job_id` unique, tenant columns)
  - render error code `RENDER_REVIEW_FAILED`
- **LessonSpec is unchanged.** The bed is presentation, not lesson content (ADR-008).

## Interfaces

- `GET /sound-beds` returns the catalog, including a signed short-lived audition URL.
- `PUT /projects/:projectId/configuration` accepts `soundBed`.
- `GET /projects/:projectId/renders/:renderId` includes the review report and contact-sheet URLs.
- UI: the configuration screen gets the sound-bed picker. The render page gets the review
  summary.

## Acceptance Criteria

- [x] A lesson with `soundBed = none`, and every lesson created before this story, renders
  byte-identical audio to before.
- [x] A lesson with a chosen track plays the bed in preview and render. The bed ducks during
  every narration segment, within one frame of the segment boundary.
- [x] Changing the track after a lesson version is saved does not change that version's
  re-render.
- [x] A render whose manifest track is missing, or whose checksum mismatches, fails
  explicitly. It does not render silently without the bed.
- [x] A render containing a black segment of 1 s or more, a silent narration span, or a
  missing caption track fails with `RENDER_REVIEW_FAILED`. The render page shows the failing
  timestamp and a correction.
- [x] Clipping and loudness findings appear as warnings and do not block delivery.
- [x] A passing render shows a four-frame contact sheet and loudness on the render page.
- [x] Review reports, contact sheets and audition URLs are isolated per tenant. Cross-tenant
  requests are rejected.

## Required Tests

- [x] **Unit:**
  - the duck envelope at segment edges, ramps and fades
  - review threshold classification, including boundary values for each check
  - catalog schema validation
- [x] **Integration:**
  - render fixture with a bed → passing review report
  - fixtures with a black gap, silent narration and a missing caption → `RENDER_REVIEW_FAILED`,
    with no downloadable video
  - retried job produces one report
- [x] **Render parity (ST-098):** preview and render audio agree with the bed on. Output
  with the bed off is unchanged from the baseline.
- [x] **Authorization and failure:** cross-tenant report access, a missing track and a
  checksum mismatch.
- [x] **UI:** picker, audition, persistence on reload, and the render review panel.
  Hydrated browser test.

## Out of Scope

- Generated music, sound effects and per-scene music changes.
- Teacher-uploaded music.
- Automatic track selection. ST-107 does this for the prompt-to-video flow.
- Model-graded visual review of frames.
- Changes to scene timing or captions.
- Stock or generated B-roll.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test and build commands pass for the affected workspaces.
- [x] Documentation and migrations are complete, including track license records.
- [x] A licensing review confirms no OpenMontage code or derivative is included.
- [x] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done.

## Dev Agent Record

- **Agent:** Claude Opus 5.5
- **Started:** 2026-09-26
- **Completed:** 2026-09-27 (implemented 2026-09-26; approved 2026-09-27)
- **Status:** Done. Approved by the product owner on 2026-09-27.
- **Branch/PR:** `feat/st-103-sound-bed-and-render-review` (local; not pushed, no PR).
- **Files changed:**
  - **Contracts:**
    - `packages/schemas/src/sound-bed.ts` (new): track ID and choice schemas, catalog entry, pinned bed, catalog response, `renderReviewReportSchema`, `renderReviewSummarySchema`, `readPinnedSoundBed`/`readSoundBedChoice`.
    - `packages/schemas/src/index.ts`: `soundBed` on configuration and input; four new render error codes; `review` on the render status response; `soundBed` on the preview manifest; `credits` on public playback and version exports.
    - `packages/storage/src/keys.ts`: `renderReviewFrame`.
    - `packages/design-system/src/video-theme.ts`: `audio.soundBed` tokens (0.12 / 0.04 / 250 ms / 1.5 s / 2 s).
  - **Persistence:** `packages/database/src/schema.ts`; migration `0067_sound_bed_and_render_review` (+ `.compatibility.md`, journal entry).
  - **Catalog:**
    - `apps/api/sound-beds/generate-tracks.mjs` (deterministic clean-room synthesiser).
    - `tracks/*.wav` (6 tracks), `catalog.json`, `LICENSES.md` (license records).
    - `apps/api/src/sound-bed-registration.ts` and the `sound-beds:register` script.
  - **Composition:**
    - `packages/scene-library/src/sound-bed.tsx` (new): `soundBedVolumeAtFrame`, `narrationSegmentsFromCaptions`, `SoundBedTrack`.
    - `full-lesson.tsx`: optional `soundBed` prop and composition-level bed track.
  - **Renderer:**
    - New: `render-review.ts` (`FfmpegRenderInspector`, `classifyRenderReview`, `silenceFloorDb`) and `render-review-thresholds.ts` (versioned constants).
    - Changed:
      - `contracts.ts`: manifest v1|v2, asset-manifest `soundBed`, implementation version bump.
      - `fixture.ts`: signs the pinned bed.
      - `render-worker.ts`: bed preflight, review before upload, re-review on reuse, report persistence, `RENDER_REVIEW_FAILED`.
      - `render-lifecycle.ts`: `recordReview` upsert.
      - `runtime.ts`: catalog-scoped storage client.
  - **API:**
    - `sound-beds.ts` (new): catalog service and tenant-scoped preview resolution.
    - `app.ts`: `GET /sound-beds`.
    - `lesson-configuration.ts`: `soundBed` save/read, active-catalog check.
    - `lesson-versions.ts`: pins the bed into the snapshot.
    - `renders.ts`: manifest v2 pin, comparison variants narration-only, `review` in the detail response with tenant-checked signed frames, new error messages.
    - `preview-manifest.ts`: configured bed.
    - `share-links.ts`, `exports.ts`: attribution credits.
    - `runtime.ts`: wiring.
  - **Web:**
    - `configuration/sound-bed-selector.tsx` (new picker with audition) and its wiring in `configuration-workspace.tsx` and `lesson-configuration-input.ts`.
    - `render/render-review-panel.tsx` (new), mounted in `render-panel.tsx`.
    - `preview/preview-player.tsx`: bed prop.
    - `share/[token]/page.tsx` + css: credits.
  - **Docs:**
    - `docs/adr/ADR-012-pinned-sound-bed-and-post-render-review.md` (new).
    - `docs/controlled-rendering-versioning-contract.md`: CR-02 and CR-07 notes.
    - `.claude/skills/run-app/SKILL.md`: registration step.
  - **Tests:**
    - `e2e/sound-bed.spec.ts` (hydrated), `e2e/workspace-mock-api.mjs` (reviewed-render route).
    - New or updated tests listed below.
- **Migrations:** `0067_sound_bed_and_render_review.sql`. It adds:
  - `sound_bed_tracks`, seeded with 6 CC0 tracks, with status/checksum/license checks;
  - nullable `lesson_configurations.sound_bed_track_id` with a restrict foreign key;
  - `render_review_reports`, unique on `render_job_id`, with tenant columns and an outcome check.

  Applied to the local database. Render error codes are API-level; no database enum changed.
- **Public contract changes:**
  - `LessonConfiguration.soundBed` (`none` | track ID). `LessonConfigurationInput.soundBed` is optional: omitted keeps the stored value.
  - `RenderStatusResponse.review` (nullable).
  - Error codes: `RENDER_REVIEW_FAILED`, `RENDER_REVIEW_UNAVAILABLE`, `SOUND_BED_UNAVAILABLE`, `SOUND_BED_CHECKSUM_MISMATCH`.
  - `GET /sound-beds`.
  - `PreviewManifest.soundBed` (optional).
  - `PublicPlayback.credits` (defaults to `[]`).
  - Version-export `credits`, present only when attribution is owed.
  - Render manifest `schemaVersion` 2 with a required `soundBed`; readers accept 1. Asset manifest gains an optional `soundBed`.
  - Renderer implementation version `st-103-remotion-4.0.507-sound-bed-render-review-v1`.
  - `LessonSpec` is unchanged.
- **Commands/tests** (local Postgres 5433 and MinIO via `docker compose`; `TEST_DATABASE_URL`, `NODE_ENV=test`):
  - `pnpm --filter @avlp/database db:migrate`: applied.
  - `pnpm --filter @avlp/api sound-beds:register`: 6 uploaded with S3-verified SHA-256; the second run reported 6 already present.
  - `node apps/api/sound-beds/generate-tracks.mjs`: regenerated bytes match the committed checksums.
  - `pnpm turbo lint`: all workspaces pass.
  - `pnpm turbo typecheck build`: pass, 32 tasks (after the one-line compare-page fix in Deviations).
  - `packages/schemas`: 371/371, including `sound-bed.test.ts` (catalog schema validation, pinning, legacy reads, report outcome rule).
  - `packages/storage`: 30 passed, 3 skipped.
  - `packages/database`: 11/11.
  - `apps/renderer`: 51/51.
    - `render-review.test.ts` (18): boundary values for every check.
    - `render-review.integration.test.ts` (4):
      - real ffmpeg fixtures: black gap and silent narration fail at the correct timestamps;
      - the bed-aware floor detects narration lost under a bed, which the -50 dB floor misses;
      - a real Remotion render with the Morning Pad bed passes review with a 4-frame contact sheet.
    - `render-worker.test.ts` (18):
      - a blocked video is never uploaded, `complete` is not called, and the report is recorded;
      - warnings do not block;
      - a retry re-reviews into the same report;
      - missing bed, no catalog store, and checksum mismatch each fail explicitly.
    - `render-lifecycle.integration.test.ts` (2): one upserted row; cross-tenant or cancelled jobs refused.
    - `contracts.test.ts`: v1/v2 manifest rules.
  - `apps/api`, run sequentially (`--no-file-parallelism`): 607/607. ST-103 tests cover:
    - configuration: default none, round trip, omitted keeps value, unknown or retired track rejected, stored retired track kept;
    - version pinning, including after a configuration change;
    - legacy snapshot reads as no bed;
    - manifest v2 pin, legacy/none, comparison variants;
    - review detail with signed in-tenant frames, and an out-of-tenant frame refused;
    - cross-tenant detail returns 404;
    - `GET /sound-beds` returns 401 without a session and is not cached;
    - catalog listing, retired track hidden, tenant-scoped preview resolution;
    - share and export credits.
  - `packages/scene-library`:
    - `sound-bed.test.tsx` (13): duck envelope at segment edges, ramps, overlap, fades and purity.
    - `full-lesson-audio-parity.test.ts` (2), ST-098 parity, real Remotion WAV renders:
      - no bed: output is byte-identical to sha256 `1240a0719124…e425`, captured from the pre-ST-103 bundle at commit c889f32, for both compositions;
      - with a bed: preview and render give identical bytes, and every narrated frame (60–119) is at the ducked ratio within 6%.
  - `apps/web`:
    - vitest: 272 passed, including the render-review panel, share credits, and configuration input.
    - `npx playwright test e2e/sound-bed.spec.ts` on the hydrated Next app: 2/2. It covers picker, audition playback, save, reload persistence, and the blocked review panel with a timestamp, correction, loudness and four contact frames.
- **Code-review fixes** (after the first `story-code-review` pass):
  - **M1:** a worker test now proves a verified pinned bed reaches the rendered composition. It is signed by the catalog store only, with a 480-frame loop.
  - **M2:** added a preview-manifest test (bed included; omitted for none). The player mapping was extracted as `previewSoundBedProps`, with tests.
  - **L1:** the render detail no longer shows a superseded job's review, because the report must match the current `jobId`; tested.
  - **L2:** the preview bed track forwards `onAudioError`, so an expired signed bed URL renews like narration.
  - **Second pass:** the three required failure fixtures (black gap, silent narration, missing caption track) now each run through the worker with a production manifest. Each fails `RENDER_REVIEW_FAILED` with its finding code, `complete` is never called, no `lesson.mp4` is stored, and one failed report is recorded. `render-worker.test.ts`: 22/22.
  - Re-run after the fixes: lint, typecheck and build 48/48; renderer 52 (with DB); ST-103 API suites 58/58; scene-library bed and parity 15/15; e2e `sound-bed.spec.ts` 2/2.
- **Screenshots/output:**
  - Catalog loudness is -20.0 LUFS for every track; peaks -5.7 to -8.4 dBFS (`LICENSES.md`).
  - Real render with bed: no error findings. Contact frames at 5/35/65/95% of the measured 6.06 s duration, each 480×270.
- **Decisions/assumptions (all recorded in ADR-012):**
  - The catalog lives under a platform `catalog/sound-beds/` prefix, reached through a second storage client confined to that prefix.
  - Audition URLs are signed per authenticated request and expire in 300 s.
  - Tracks are original, deterministically synthesised CC0 works: 16 s seamless loops (480 frames), loudness-normalised once at authoring.
  - Narration segments for ducking and the silence check are the composition's caption cues, which are aligned to measured narration. Cues closer than 2 × 250 ms are merged. Each duck ramp ends on the segment's first frame.
  - Looping is explicit (one `Sequence` per repeat).
  - Comparison variants render without a bed on both halves.
  - Remotion's bundled ffmpeg lacks `blackdetect` and raw muxers. Black detection therefore applies blackdetect's documented thresholds to 160×90 area-averaged luma in Node, and PCM is read from a piped WAV.
  - The review runs *before* upload, so a blocked MP4 never reaches storage and no `rendered_videos` row exists. A reused video is downloaded, checksum-verified and re-reviewed.
  - A review that cannot run fails with the retryable `RENDER_REVIEW_UNAVAILABLE`; nothing is delivered unreviewed.
  - Logs carry finding codes and outcome only.
  - "Exported metadata" attribution is implemented as `credits` in the storyboard export (JSON and Markdown) and on the share page. The MP4 container is not modified.
- **Deviations:**
  1. **Silence floor with a bed.** With a pinned bed, the floor rises from -50 dB to the bed's ducked ceiling plus 1.5 dB. Otherwise missing narration under a bed is undetectable; an integration test proves it. Without a bed, the floor is exactly -50 dB.
  2. **Caption check.** Captions are burned in, so the check compares rendered-composition cues against the manifest promise and per-scene coverage rather than probing a subtitle stream.
  3. **Comparison variants** are narration-only (ADR-012 §5).
  4. **Out-of-story build fix.** A one-line fix outside this story unblocked the web build: `compare/comparison-workspace.tsx` imported `./comparison-style.js`, which Next's webpack cannot resolve. It failed identically on the base commit. The import is now extensionless.
  5. **Stale fixtures.** Two test fixtures that ST-102 left without `creativeStylePack` (`schemas/demonstration-pilot.test.ts`, `web/lesson-configuration-input.test.ts`) were updated along with `soundBed`. Both failed before this story.
- **Known risks/follow-up:**
  - Pre-existing failures, verified identical on the base commit (not caused by this story):
    - pixel-hash snapshots: `design-system` video-preview-render-smoke; `scene-library` full-lesson-render, scene-preview-render-smoke, summary-scene-render;
    - `pipeline-worker` document-ingestion integration, which needs the Docling service;
    - `pipeline-worker` duration-reconciliation (already noted in ST-102).
  - The API suite times out on app boot under full file-parallelism on this machine. It passes sequentially.
  - The older e2e configuration specs are stale: the mock API lacks `voice-configuration`. `e2e/sound-bed.spec.ts` stubs those calls itself.
  - Renders queued under the previous implementation version fail explicitly as unavailable after deploy (CR-03).
  - Deployment must run `sound-beds:register` before any lesson with a bed renders.
  - A licensing review found no OpenMontage code or derivative; see `LICENSES.md` and ADR-012 §7.
