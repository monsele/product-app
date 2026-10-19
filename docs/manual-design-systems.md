# Manual design systems — ST-123

`/workspace/design-systems` is the owner’s reusable design library, reached from
the workspace and both states of the storyboard appearance panel. The editor
uses the existing authenticated, origin-checked foundation API. No additional
database migration, paid operation, project application or interpretation job
is introduced. ADR-017 assigns application and moving proof generation to ST-125.

## Editor worksheet

- Goal: save an owner’s exact visual controls and creative guidance for reuse.
- Primary action: Save revision. Continuation: Publish saved revision.
- Mode: Studio Daylight; variance 5, motion 3, density 6.
- Hierarchy: library/navigation, current revision, philosophy, typography/colour,
  presentation, motion, rules, import processing, immutable publication history.
- Desktop: library beside one form column. Tablet/phone: library above the form;
  controls become one column on phones. No drag-only or hover-only controls.
- Loading uses the existing Onion Skin components. Empty, unavailable, archived,
  rejected-import, unsaved, conflict and successful-save states use domain data.
- Native labels, fieldsets, buttons and disclosures support keyboard navigation;
  live status/error regions announce operations. Focus uses the shared tokens.
- Importing requires a project owned by the same user and explicit file-rights
  confirmation. The project supplies job correlation, not ownership of reusable
  bytes. Files remain private and use the ST-122 validation job.
- No decorative imagery is required. Evidence includes desktop, tablet, phone
  and 200-percent-width screenshots plus the representative render fixtures.

Import status refresh changes the import list only, retaining the original
revision for unsaved edits. On 409, local fields remain intact. The user can
discard/reload, or explicitly load the latest revision while retaining local
fields for review before saving. Navigation between systems warns about unsaved
edits; browser unload also preserves that opportunity.

## Contracts and capabilities

Definition `1.0` stays readable and unchanged. Definition `1.1` adds strict,
bounded `presentation` controls: colour roles, two validated font references,
an optional validated logo, alignment, compact/spacious type hierarchy,
text/image emphasis, comparison split/stacked arrangement, image framing,
stroke/corners, entrance family/intensity, stagger and readable hold.
Fonts and logo must occur in the definition’s asset references. Exact colour,
font, asset and presentation values are controls, not natural-language promises.

Validated JSON tokens can explicitly populate the supported presentation object
as unsaved edits. PDFs, Markdown and reference images remain imported materials;
manual authoring does not interpret them. No uploaded code, CSS, coordinates,
arbitrary font family or animation is accepted.

Free-text principles remain advisory. A free-text **locked** instruction is
reported as unsupported and blocks compilation, with a request to express it
using supported exact controls or change its enforcement. Publication alone does
not claim that such a requirement is implemented. Conflicting motion settings,
unavailable logos/fonts and insufficient contrast fail validation.

`compileCustomDesign` compiles an immutable published snapshot and explicit
lesson content into manifest `3.0` / renderer `custom-1.0.0`. The manifest has no
pack dependency. It pins the system version/hash, font byte hashes and character
coverage, logo byte hash, semantic content hashes, registered compositions and
versions, presentation settings and resolved beat frames. Optional caption cues
are supplied at compilation, never looked up from a mutable draft at playback.
Hash the complete manifest with `designSystemContentHash` for render identity.
Do not store signed media URLs in it.

The custom reader is a separate exported `CustomDesignScene` entry point. The
v1/v2 production union, planner and default dispatch remain unchanged. ST-125
must connect explicit application, immutable lesson snapshots and existing
project media authorization to this reader; opening this library grants no
application or paid-work authority.

## Rendering and failure behavior

`CustomDesignScene` consumes the pinned manifest, its exact scene and duration,
runtime font/logo URLs keyed by asset ID, and existing resolved lesson assets.
`loadCustomDesignFonts` verifies SHA-256 bytes, loads the actual faces through
FontFace, and decodes the pinned logo before capture. Browser Player and server
Chromium execute this same implementation. Synthetic font styles are disabled.
No font, logo or missing scene is silently substituted.

The manual entrance vocabulary is fade/settle; preference/prohibition refers to
entrances. Semantic diagram construction and explanatory emphasis remain native
to their registered compositions. Stagger is bounded and clamped to preserve the
requested final readable hold. Unsupported comparison arrangements fail instead
of switching a locked choice. Narration duration and the caption band are fixed.

Preflight checks each rendered text node against its computed, pinned font,
including nested labels, numeric badges and table cells. Heading and body fonts
need cover only the text assigned to them; unrendered narration is not a scene
glyph requirement. Text using an unpinned font blocks capture. Missing-glyph
checks use the browser's transformed characters for CSS casing, including
inherited transformations, inline word context and language-specific casing.
Temporary text selection is restored before capture, including its direction;
Player selection restrictions are restored as well. Errors identify codepoints,
not lesson text. Final-font text bounds must fit the
canvas, caption safe area, allocated table/hero area and any clipping ancestors.
An overflowing font/layout requires shorter content, compact density, or another
composition/font.
Old manifests and archived system versions retain their pinned identities.

The chart panel retains the existing accessible chart palette and pattern
redundancy; custom body fonts apply to chart labels. Arbitrary chart-palette
overrides and demonstration-mode custom systems are not supported here.

## Verification entry points

```powershell
pnpm --filter @avlp/schemas exec vitest run src/custom-design.test.ts src/design-systems.test.ts src/creative-design-v2.test.ts
pnpm --filter @avlp/api exec vitest run src/design-systems.integration.test.ts
pnpm --filter @avlp/scene-library build
pnpm --filter @avlp/scene-library exec vitest run src/custom-design.test.ts src/custom-design-render.test.ts src/cinema/cinema.test.tsx src/cinema/timing-parity.test.ts
pnpm exec playwright test --config playwright.design-systems.config.ts
```

Database integration requires `TEST_DATABASE_URL` pointing to the local test
server; it creates and destroys its own isolated database. Render tests use a
licensed fixture font and native diagrams, with no provider calls. They write
frames, phone captures, manifests and MP4s under `output/st123/`. The example
videos have captions and intentionally contain no generated narration audio.
MP4 encoding is opt-in for repeat test runs: set `ST123_RENDER_MP4=true` when
regenerating the fixtures. Normal runs compare six committed, reviewed visual
signatures as well as Player/export output. Updating those signatures requires
`ST123_UPDATE_BASELINES=true` and another review of the full-size captures.
The encoded fixtures have a silent AAC stream; video duration is exactly 30
seconds and the AAC container tail is approximately 59 ms.
The browser tests use port 3100 and `.next-design-systems-e2e`, isolating their
cache from the ordinary development server. `NEXT_BUILD_DIR` changes only the
Next.js build directory; its normal default remains `.next`.
