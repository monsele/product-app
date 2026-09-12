# ADR-004: Measured narration controls playback duration

## Status

Accepted ? product-owner instruction, 2026-09-10.

## Context

ST-084 reconciles visuals to measured audio, but still rejects a lesson whose
summed duration leaves a narrow band around the original target. Natural TTS
prosody is not bounded by that planning tolerance. Retrying synthesis cannot
reliably solve this. Rounding measured seconds to the nearest integer also
allows the final fraction of a second of speech to be clipped.

## Decision

The configured target continues to guide narration writing and storyboard
planning. When every scene has ready audio with a positive finite duration,
preflight reports target drift as information, without requiring acknowledgement.
Missing audio retains blocking validation. Scene/audio fit, captions, grounding,
assets and other quality checks remain independently enforced.

Reconciliation rounds measured durations upward to whole seconds within the
existing 3?60 second scene contract. Remotion preview and render continue to use
those persisted durations. Audio is not accelerated to fit a target. Existing
immutable lesson versions are not rewritten. Validation ruleset 4 invalidates
older validation results. The rounding allowance is now 1000ms.

## Consequences

This supersedes ST-084's requirement that the final total remain in the target
band. It refines the PRD's approximate target and total-duration checks: teachers
still see the actual duration, but natural speech is the timing authority.
No database migration or LessonSpec shape change is required.

The 60-second scene maximum remains a hard runtime limit; longer narration must
be split or shortened. Removing that bound requires a separate versioned scene
contract change. Provider outages, invalid audio and caption alignment failures
still require their own recovery; this decision does not hide them.
