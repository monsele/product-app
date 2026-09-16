# Audio-first storyboard repair ? 2026-09-10

Branch: `fix/audio-first-storyboard`.

## Scope and decisions

Product-owner requested repair of timing deadlocks, unstyled storyboard controls,
and dull presentation. Related completed stories: ST-084 and ST-080. Follow-up
policy is recorded in ADR-004. Preserve the existing Focus Studio layout and
teal/amber video identity, with brighter accents. No new dependencies or migrations.

## Files changed

- `packages/schemas/src/index.ts`: ceiling reconciliation, 1000ms rounding allowance,
  validation ruleset 4; no public payload shape changes.
- `packages/schemas/src/duration-reconciliation.test.ts`: no-clipping regression.
- `apps/api/src/lesson-validation.ts` and its test: advisory target drift with ready
  audio, regression for large deviations and missing audio.
- `apps/pipeline-worker/src/scene-audio-job.ts`: actionable timing status copy.
- Storyboard `scene-audio-panel.tsx`: existing button styles, timing guidance,
  in-flight label and boundary validation of status responses.
- Storyboard `scene-detail-panel.tsx` and `storyboard.module.css`: inspector
  transitions, reduced-motion support, consistent controls, focus indicators,
  selected-scene emphasis and stage colour.
- `packages/design-system/src/video-theme.ts`: brighter teal/amber lesson accents.
- Storyboard `scene-audio-panel.playwright.test.tsx`: rendered CSS, keyboard focus,
  minimum action size and narrow-screen checks with screenshots.

## Validation

Passed:

- Dependency/API/worker builds: `pnpm exec turbo build --filter=@avlp/api... --filter=@avlp/pipeline-worker... --filter=@avlp/web^...` (13 packages).
- `pnpm --filter @avlp/web build` and web typecheck.
- Affected workspace lint (14 packages including dependencies).
- Schemas duration reconciliation: 11 tests.
- API validation and render authorization: 44 tests.
- Worker audio and Together adapter: 20 tests, with fixture provider responses.
- Video-theme contrast and layout: 5 tests.
- Audio UI helpers: 3 tests; storyboard browser shells: 4 tests.
- New rendered audio-control browser check: 1 test (375px and 1280px).

Representative audio-control screenshots: `.runtime-logs/audio-first/audio-375.png`
and `audio-1280.png`. These render the real component and CSS in isolation, using
system-font fallback; they do not demonstrate a live authenticated project.
Initial browser checks needed a Playwright Chromium installation, then passed.
The added browser test exposed a missing React import under the test JSX runtime;
that import was corrected. Final targeted lint and web typecheck passed after changes. `git diff --check` passed.

## Risks and limits

No paid provider calls or existing project mutations were performed. Docker was
unavailable, so the live database/provider/render workflow has not been verified.
Previously generated audio is preserved. The existing scene maximum is 60 seconds;
longer narration remains blocked with a scene-specific audio-fit error.
No story is newly marked Done based on these limited checks.
