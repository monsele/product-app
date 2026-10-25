---
story_id: ST-120
title: Immediate editing and partial preview
status: Done
depends_on: [ST-119]
epics: [E11, E15, E16]
---
# ST-120 - Immediate editing and partial preview

## Implementation plan
Use shared readiness contracts to show a compact preparation summary with grouped
scene tasks, explicit capped preparation authorization and contextual navigation.
Enable draft preview independently of media/validation. Mask stale media, isolate
unavailable scenes, refresh authorized URLs, buffer timing updates during playback,
and retain unsaved scene fields and focus across background refresh.

## Acceptance
- Feature-flagged partial preview and preparation summary; render validation unchanged.
- Actual task counts and actionable states, validation details secondary.
- No paid work on page open; estimate must be explicitly accepted.
- No stale narration/captions, no missing evidence presented as completed work.
- Background refresh preserves scene selection, draft fields and focus.
- Keyboard/mobile/200% zoom verification and representative screenshots.

## Design worksheet
Storyboard and preview routes; goal: edit available work immediately. Focus Studio;
canvas remains dominant. Compact status above canvas, native Details disclosure,
visible labels and polite status announcements. Preparation authorization is inline
and explicit. Source/content actions open the affected inspector. Narrow screens
wrap controls with 44px targets; no animation required. Existing signed media only.

## Dev Agent Record
Completed 2026-10-18 on story/st-120-immediate-editing. Production web build passed (19 static pages plus dynamic routes).
- Files: preparation summary/readiness hook, storyboard/preview integration, draft merge helper, partial-preview projection, preview player refresh/boundaries, media manifest freshness guard, tests and browser fixture.
- Migrations: none. Public contracts: existing readiness/estimate/start/stop consumed; no LessonSpec or NormalizedDocument change.
- Commands: web lint and typecheck passed; all 395 web tests passed. API preview-manifest tests 12 passed and API build passed. Scene-library build/lint passed; preview/render visual and audio parity tests plus timeline tests (12) passed; text-overflow tests (4) passed.
- Browser: playwright test e2e/storyboard-recovery.spec.ts passed against a running Next app and controlled API fixture. Checked immediate Preview, zero paid commands on open, preserved narration/focus on background refresh, partial-lesson scene navigation, mobile, keyboard disclosure, 200% zoom and axe (no preparation-region violations).
- Screenshots: .runtime-logs/recovery/storyboard-preparing.png, storyboard-1440.png, storyboard-375.png, storyboard-200-percent.png. Inspected representative desktop/mobile captures. These are controlled fixtures, not evidence of production-provider recovery.
- Decisions: show technical details behind disclosures; native buttons/details; explicit capped authorization. Three-way form merging preserves local fields and requires review for concurrent same-field edits. Pause before replacing stale narration; timing-only changes wait for pause/end and retain scene-relative position. Preview-only placeholders never enter saved lessons or renders.
- Risks: full generation/edit wake-ups, shared prompt-to-video allowance and live backend release gate remain ST-121. Corrupt persisted documents that fail the storyboard boundary still require investigation; valid drafts and runtime scene failures are isolated in preview.
- Deviation: fixed an existing unused-variable test expression in scene-library to unblock that workspace lint. No behavior change; its four tests pass. The shared storyboard CSS and unrelated scene-list test were left untouched.
