# ADR-011 — Design snapshots do not require render readiness

- Status: Accepted
- Date: 2026-09-22
- Extends: ADR-008

## Context

The creative-design Apply action had run the complete lesson preflight before
writing a resolved design snapshot. Consequently, an unfinished asset, audio,
caption, or other render dependency in any other scene prevented a teacher
from saving a valid layout or presentation change for the scene they were
editing.

## Decision

1. Apply continues to validate the current lesson revision, the resolved
   design manifest, treatment compatibility, teacher locks, bounded settings,
   and owned logo asset identity atomically before creating an immutable
   snapshot.
2. Apply does not run render-readiness validation. Missing planned visuals,
   generated media, captions, and other non-design lesson dependencies do not
   prevent a teacher from saving a presentation decision.
3. Approval and render initiation remain gated by the existing full-lesson
   validation service. A saved design snapshot is therefore never evidence
   that a lesson is ready to render.

## Consequences

- A teacher can choose a compatible alternative layout or save design settings
  for one scene while unrelated scenes are still incomplete.
- Render safety, asset ownership, grounding, captions, narration, and media
  readiness are unchanged at their existing approval/render boundary.
- Snapshots remain immutable and retain the exact lesson revision and resolved
  design hash used when the teacher applied the change.
