# ADR-014: Narration pauses are advisory

- Status: Accepted by product-owner instruction, 2026-09-29
- Supersedes: ADR-012 section 6 and ST-103's silent-narration blocking rule

## Context

A finished 207-second lesson was discarded because seven detected narration
pauses lasted 1.04–1.22 seconds. Amplitude detection inside a caption span cannot
distinguish intentional pacing, estimated caption timing, quiet speech, or missing
speech. This is application-generated audio, not a user validation failure.

## Decision

`NARRATION_SILENT` is always a warning. The video is delivered with timestamped
notes, without acknowledgement, narration regeneration, or a new lesson version.
Review policy becomes `render-review-v2`; API and worker use a new render
implementation identity so a failed v1 attempt is not reused. Stored historical
reports remain unchanged. A new render of the same approved lesson version uses
the new policy; retrying an old immutable job does not substitute implementations.

Inspect supported generated PCM narration before rendering and show advisory
pause timestamps in the existing storyboard Audio panel. Inspection must not
rewrite audio, charge for another provider call, or make audio readiness depend
on a heuristic. Other formats retain post-render detection. Users may listen,
leave the pause, or explicitly regenerate narration using the existing controls.

Grounding remains a pre-render concern. Model judgments and stale checks are
advisory; missing or invalid citations remain deterministic errors. The Sources
panel must distinguish stale results and expose the reasons for flagged claims.
When a model returns `supported` together with unsupported spans, normalize the
contradiction to `needs_review`. Display historical contradictory results the
same way without rewriting stored checks. Scene summaries count that scene's
claims, rather than repeating lesson-wide totals.
Do not infer factual validity from amplitude, silence, or a render review.

## Consequences

No database migration, LessonSpec, or NormalizedDocument change is required.
Older audio is not regenerated automatically. A v1 failed render cannot be
recovered from storage: the old worker discarded its MP4 before upload. Start a
new render from its approved lesson version after API and worker are updated.
Unusable media and deterministic stream/caption integrity failures keep their
existing checks. Broader automatic narration rewriting requires separate work;
blindly trimming every pause would change intended pacing and caption alignment.
