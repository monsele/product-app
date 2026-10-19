---
story_id: ST-123
title: Manual design-system authoring and deterministic custom rendering
phase: "13"
status: Done
depends_on: [ST-122]
epics: [E11, E12, E15, E16, E17]
---

# ST-123 - Manual design-system authoring and deterministic custom rendering

Implement step 2 of docs/bring-your-own-design-system.md under ADR-017 after
ST-122 is Done. Read docs/design.md before UI work. Add My Design Systems in the
workspace and design panel, import/revision editing, exact locks and advisory
principles. Add a new manifest release for independent custom identities with
bounded composition/motion controls, pinned fonts and assets, final-font preflight,
and identical browser/server loading. Keep v1/v2 output unchanged. Block missing
glyphs/assets and unsupported locked requirements with actionable errors.

Acceptance: demonstrate two custom systems with visibly different hierarchy,
composition and motion on the same content, readable desktop/phone output,
keyboard/error states, revision conflict recovery, immutable historical render
parity, tenant isolation, schema/render/visual regression tests and MP4 review.

Out of scope: AI interpretation, conversational refinement, proof generation,
automatic project application, live integrations, arbitrary code/coordinates.

## Dev Agent Record

Implemented on `story/st-123-manual-design-systems`, 2026-10-19. ST-122 was
Done before work began. Implementation plan: extend contracts first, reuse the
owner-scoped foundation API, add the authoring screen, implement a separate
custom reader with pinned media and final-font gates, then verify security,
concurrency, compatibility, browser behavior and representative encoded output.

### Result and acceptance evidence

- My Design Systems is available from the workspace and both appearance-panel
  states. It supports creation, import/validation status, manual revision editing,
  exact controls, advisory principles, unsupported-lock reporting and immutable
  publication history, including older-version pagination.
- Stale writes preserve local fields. Explicit recovery loads the latest revision
  for review or discards the local edits. Import refresh retains the revision on
  which unsaved edits were based. Selected fonts/logo remain included as dependencies.
- Definition 1.1 and manifest 3.0 introduce independent custom identities without
  a preset selection. The manifest pins system/font/logo identities, semantic
  hashes, composition versions, presentation settings and beat frames. Definition
  1.0 and the existing v1/v2 manifest readers remain unchanged.
- Browser and server use the same verified-byte FontFace loader. Missing files,
  changed bytes, absent glyphs, changed semantic content, contrast failures,
  unsupported locks and final-font overflow block use with recovery instructions.
  Capture is cancelled on failure, rather than released before the error commits.
- The same opening, definition and native diagram were compiled for Journal and
  Signal. Their hierarchy, arrangements, framing and entrance motion differ beyond
  colour. Six reviewed visual signatures, actual Player/export comparisons,
  repeat-frame checks and explicit entrance-family tests cover the new reader.
- Database tests cover owner isolation, referenced fonts, publication, stale edits,
  archival and unchanged compilation of historical versions. Existing cinema and
  timing regressions remain green.
- Browser tests cover upload, rights confirmation, rejected-import recovery,
  revision conflicts, unsupported locks, keyboard focus, failed reads and layouts
  at 1440, 768, 390 and 640 CSS pixels (the last is the 200-percent-width check).
- Both complete MP4 fixtures were inspected through decoded frames at every
  second, full-size key frames and phone captures. FFprobe confirms 1920×1080,
  H.264, 30 fps, exactly 30 seconds of video and a silent AAC track. Their semantic
  content hashes match. No narration provider was called.

### Files changed

- Schemas: `packages/schemas/src/{custom-design.ts,custom-design.test.ts,design-systems.ts,index.ts}`.
- API verification: `apps/api/src/design-systems.integration.test.ts`.
- Authoring UI: `apps/web/app/workspace/design-systems/{page.tsx,systems-editor.tsx,systems.module.css}`;
  workspace `page.tsx`/`workspace.module.css`; storyboard `creative-design-panel.tsx`/
  `storyboard.module.css`.
- Rendering: `packages/scene-library/src/custom-design.tsx`, its unit/render tests,
  fixture, fixture composition, test entry, browser harness and six PNG signatures
  plus README under `custom-design-snapshots/`; the package `index.ts`.
- Shared cinema extension: `cinema/{beats.tsx,identity.ts,primitives.tsx,frame.tsx}`
  and `compositions/{chart,comparison,connected,detail,headline-led,hero,sequence,takeaway}.tsx`.
  The added behavior is conditional on custom settings; legacy defaults retain
  their prior typography and arrival styles.
- Browser verification: `e2e/design-systems.spec.ts`, `playwright.design-systems.config.ts`,
  `apps/web/next.config.ts`, `eslint.config.mjs`, `.gitignore` and four screenshots
  in `output/playwright/st123-editor-{1440,768,390,640}.png`.
- Documentation: `docs/manual-design-systems.md`, ADR-017 implementation note,
  design-system delivery status, this record and `STORY_INDEX.md`.
- Generated videos, manifests, decoded review sheets and `ffprobe.json` are local
  evidence in ignored `output/st123/`. Pre-existing app processes updated their
  runtime logs during work; those unrelated log changes were preserved.

### Migrations and public contracts

- No migration or backfill. The ST-122 tables and immutable publication API are reused.
- Definition 1.1 adds bounded exact presentation settings. Snapshot container 1.0
  can hold either definition release without rewriting existing bytes.
- Manifest 3.0 / `custom-1.0.0`, `compileCustomDesign`, `CustomDesignScene` and
  associated typed response/media contracts are additive exports. Runtime signed
  URLs are separate from the immutable manifest and its render identity.
- No project-apply, AI interpretation, proof-generation or paid-job API was added.

### Commands and tests

- `pnpm typecheck`: all 16 packages passed.
- `pnpm lint`: all 16 packages passed.
- `pnpm --filter @avlp/schemas test`: 573 tests passed.
- `pnpm --filter @avlp/api exec vitest run src/design-systems.integration.test.ts`:
  seven real-PostgreSQL/authenticated-HTTP tests passed, using an isolated test DB.
- Scene-library tests: `custom-design-render.test.ts` (3), `custom-design.test.ts`
  (4), `cinema/cinema.test.tsx` (21) and `cinema/timing-parity.test.ts` (4) passed.
  The final regression run reads the committed baselines without update mode.
- `pnpm exec playwright test --config playwright.design-systems.config.ts`:
  both browser flows passed; screenshots were reviewed.
- `pnpm exec turbo build --filter=@avlp/api --filter=@avlp/pipeline-worker --filter=@avlp/renderer`:
  all 13 dependency/build tasks passed. Scene-library build and web production
  build also passed. Web builds use `NEXT_BUILD_DIR=.next-design-systems-e2e`.
- MP4 fixture generation used `ST123_RENDER_MP4=true` with the render test.
  Reviewed signatures were generated intentionally, then regression tests ran
  with `ST123_UPDATE_BASELINES=false` and `ST123_RENDER_MP4=false`.
- FFprobe verified the encoded streams; Chromium decoded the videos into review
  contact sheets. Video duration is 30.000 s; the AAC/container tail is 30.059 s.
- `git -c core.whitespace=cr-at-eol diff --check` passed; this repository retains
  CRLF in existing source files. Focused Prettier checks were applied to new code.

### Decisions, assumptions and known risks

- ADR-017 assigns project application to ST-125. This increment exposes the
  compiler/reader and system publication; it does not attach a system to a lesson.
  No further story was started. ST-124 still waits for ST-123 to be reviewed and Done.
- Exact controls are authoritative. Free-text locks remain visibly unsupported
  until expressed using those controls; advisory text is retained for ST-124.
- The entrance vocabulary is fade/settle. Native explanatory diagram construction
  remains registered behavior. Charts retain their accessible registered palette;
  custom chart colours and demonstration mode are not claimed as supported.
- Phone UI was checked in portrait; fine video labels were additionally reviewed
  in fullscreen landscape, consistent with the fixed 16:9 output contract.
- Repeated Chromium captures allow one colour-channel rounding level on fewer
  than 0.01% of pixels. Reviewed block-average signatures permit two channel
  levels; changed geometry/fonts exceed these bounds. No fallback font is allowed.
- The fixture videos contain captions and silence, not generated speech. Existing
  narration/audio handling is unchanged; there were no paid provider calls.
- Test compilation has its own port/build directory, avoiding the running app’s
  cache. Next-generated `next-env.d.ts`/`tsconfig.json` changes are not product changes
  and are restored after verification.
- No architecture deviation. Keeping v3 as a separate reader until explicit
  application is connected follows the ADR-017 delivery boundary.

### Review corrections — 2026-10-19

- Fixed final-font layout preflight to measure every rendered text node,
  including native table cells, nested labels and numeric badges. Text must fit
  the canvas/caption safe area, allocated table/hero region and clipping
  ancestors. A schema-valid table that previously passed while overflowing now
  blocks capture with an actionable correction.
- Glyph coverage now follows each text node's computed pinned font. Heading
  fonts need not cover body-only characters; unrendered narration is no longer
  checked as scene display text. Missing glyphs and unpinned rendered fonts still
  block capture. A failed final-font gate returns without releasing capture.
- Files changed for these corrections: scene-library `custom-design.tsx`,
  `custom-design.test.ts`, `custom-design-render.test.ts` and
  `custom-design.browser-harness.tsx`; `docs/manual-design-systems.md`; this record.
  No migration or persisted schema/manifest change. The glyph helper accepts an
  optional font asset ID (default body); a rendered-text helper is exported;
  the font loader no longer accepts unrendered scene text.
- Added real-Chromium checks with loaded Source Sans and Inter bytes: fitting
  tables, table overflow within/below the canvas, distinct heading/body coverage,
  nested text, missing glyphs and unpinned fonts. Existing visual signatures were
  compared without update mode; no new MP4 encoding or provider call was needed.
- Validation: scene-library build, typecheck, lint and focused Prettier checks
  passed. The custom render/unit and existing cinema/timing suites passed
  (35 tests), including Player/export parity and all six visual baselines.
- The review's database rerun could not connect to PostgreSQL on port 5433;
  seven integration cases did not execute. These corrections do not change API,
  storage or ownership code. That environment limitation remains recorded rather
  than claiming a fresh database pass.
- Decisions/risks/deviations: use actual DOM font assignment and final-font
  geometry; no change to frozen v1/v2 components or unrelated work. No new
  architectural deviation. Status remains In Review, matching STORY_INDEX.md.

### CSS casing review correction — 2026-10-19

- Plan: validate browser-transformed text against its assigned pinned font,
  add uppercase/capitalize regressions, then rerun custom and legacy rendering
  checks. Inspected the custom gate and registered composition casing first.
- Glyph preflight now reads Chromium's transformed selection text when CSS
  text-transform applies. This preserves inherited casing, language-specific
  rules and word context across inline nodes without duplicating browser casing
  algorithms. Temporary user-select overrides and the original selection,
  including backwards direction, are restored in finally blocks before capture.
- Added a loaded-font Chromium regression for uppercase, lowercase, capitalize,
  nested-span word context, Turkish dotted I, missing transformed glyphs, allowed
  transformed-only coverage and selection preservation after failures/successes.
  Existing visual baselines were compared without regeneration.
- Files changed: scene-library `custom-design.tsx` and
  `custom-design-render.test.ts`, `docs/manual-design-systems.md`, this record.
  No migration, persisted/public contract change or architecture deviation.
- Validation: scene-library build, lint, typecheck and focused Prettier passed.
  Custom render/unit and cinema/timing regression suites passed (36 tests),
  including all six visual signatures and Player/export parity. No paid call or
  new MP4 encoding. Database verification remains subject to the previously
  recorded unavailable PostgreSQL environment; no API/storage code changed.
- Status remains In Review, aligned with STORY_INDEX.md. Frozen v1/v2 components
  and unrelated changes were preserved.

### Human approval — 2026-10-19

- Product owner explicitly approved the story after the final code review.
- Status: Done. Approval accepts the recorded implementation and review evidence,
  including the outstanding database verification limitation: the seven integration
  cases could not be rerun in the current environment. This is an accepted
  completion exception, not a claim that those cases passed in the final review.
- The final review found no new code defects; 41 focused tests passed. Earlier
  successful database evidence remains recorded above.
- ST-124 is now Ready. Its implementation has not started.
