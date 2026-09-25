---
story_id: ST-103
title: "Add a Ducked Background Sound Bed and Post-Render Self-Review"
phase: "06 — Audio, Validation, Rendering, and Delivery"
status: Draft
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

- [ ] **Curated catalog.** Add a catalog of 6–10 licensed instrumental tracks, registered
  like the existing asset catalog (ST-057).
  - Each track records: stable `trackId`, title, mood tags, duration, integrated loudness
    (LUFS), checksum, storage key, license id, source URL and required attribution text.
  - Tracks are CC0 or equivalently licensed.
  - Tracks are loudness-normalised once, at registration, not at render time.
  - Tracks loop seamlessly, or are long enough for the 420-second maximum lesson.
- [ ] **Lesson configuration.** Add a `soundBed` choice: `none` or a catalog `trackId`.
  - The default is `none`.
  - Every existing lesson reads as `none`, which keeps ST-098 reproducibility.
  - Add a picker on the configuration screen with a short audition player. Follow the
    pattern of the ST-102 style-pack selector.
- [ ] **Pinning.** The resolved track (id and checksum) is pinned into the immutable
  lesson-version presentation snapshot and the render asset manifest. Use the mechanism that
  pins the creative style pack (ADR-008 and the controlled-rendering contract).
- [ ] **Composition.** Add a composition-level bed track in the full-lesson Remotion
  composition, used by both preview and render.
  - Bed volume and duck depth are video-theme tokens, not literals.
  - Starting values: bed at 0.12, ducked to 0.04 while narration plays.
  - Ramps are 250 ms, with a 1.5 s fade-in and a 2 s fade-out.
  - Ducking is a pure function of the frame and the narration segment timeline already in
    the composition, so it is deterministic.
- [ ] **Attribution.** Where a track's license requires it, add the attribution text to the
  video's exported metadata and the share page.

### B. Post-render self-review

- [ ] **Render review.** After the MP4 is produced and before the render is completed,
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
- [ ] **Contact sheet.** Sample frames at 5%, 35%, 65% and 95% of the duration. Store them
  privately under the tenant's key prefix as a contact sheet.
- [ ] **Outcome.** Persist a versioned review report per render.
  - If any finding has error severity, the render fails with `RENDER_REVIEW_FAILED` and the
    finding codes. No `rendered_videos` row becomes downloadable or shareable.
  - Warnings are recorded and shown, but never block.
- [ ] **Render page.** Show the contact sheet, loudness, and any findings, each with its
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

- [ ] A lesson with `soundBed = none`, and every lesson created before this story, renders
  byte-identical audio to before.
- [ ] A lesson with a chosen track plays the bed in preview and render. The bed ducks during
  every narration segment, within one frame of the segment boundary.
- [ ] Changing the track after a lesson version is saved does not change that version's
  re-render.
- [ ] A render whose manifest track is missing, or whose checksum mismatches, fails
  explicitly. It does not render silently without the bed.
- [ ] A render containing a black segment of 1 s or more, a silent narration span, or a
  missing caption track fails with `RENDER_REVIEW_FAILED`. The render page shows the failing
  timestamp and a correction.
- [ ] Clipping and loudness findings appear as warnings and do not block delivery.
- [ ] A passing render shows a four-frame contact sheet and loudness on the render page.
- [ ] Review reports, contact sheets and audition URLs are isolated per tenant. Cross-tenant
  requests are rejected.

## Required Tests

- [ ] **Unit:**
  - the duck envelope at segment edges, ramps and fades
  - review threshold classification, including boundary values for each check
  - catalog schema validation
- [ ] **Integration:**
  - render fixture with a bed → passing review report
  - fixtures with a black gap, silent narration and a missing caption → `RENDER_REVIEW_FAILED`,
    with no downloadable video
  - retried job produces one report
- [ ] **Render parity (ST-098):** preview and render audio agree with the bed on. Output
  with the bed off is unchanged from the baseline.
- [ ] **Authorization and failure:** cross-tenant report access, a missing track and a
  checksum mismatch.
- [ ] **UI:** picker, audition, persistence on reload, and the render review panel.
  Hydrated browser test.

## Out of Scope

- Generated music, sound effects and per-scene music changes.
- Teacher-uploaded music.
- Automatic track selection. ST-107 does this for the prompt-to-video flow.
- Model-graded visual review of frames.
- Changes to scene timing or captions.
- Stock or generated B-roll.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test and build commands pass for the affected workspaces.
- [ ] Documentation and migrations are complete, including track license records.
- [ ] A licensing review confirms no OpenMontage code or derivative is included.
- [ ] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
