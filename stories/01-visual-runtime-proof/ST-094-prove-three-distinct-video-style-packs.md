---
story_id: ST-094
title: "Prove Three Distinct Video Style Packs"
phase: "01 — Visual Runtime Proof"
status: In Review
priority: must-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2", "E15-US2"]
depends_on: ["ST-010", "ST-011", "ST-012", "ST-013", "ST-016", "ST-022", "ST-023", "ST-024", "ST-084"]
---

# ST-094 — Prove Three Distinct Video Style Packs

## Story

As the product team, we want the same educational content rendered in Essential, Editorial, and Everyday styles, so that we can verify their visual distinction, instructional clarity, and technical feasibility before expanding production style support.

## Outcome

A reproducible development preview and three actual 20–30-second MP4s demonstrate nine authored treatments: hook, definition, and comparison in each of the three styles. A contact sheet, validation results, performance measurements, and implementation decision record provide concrete evidence for the subsequent production stories.

This is the implementation proof recommended by `docs/creative-styles-technical-research.md`. Completing it does not mean all ten scene types support multiple styles or that teachers can select these styles in production.

## Required Reading

- `docs/controlled-rendering-versioning-contract.md` — shared CR-01–CR-08 requirements; apply the style/version/font, resolved-input, timing, and proof-render requirements within this story's development boundary. Record implementation evidence for ST-098; do not wait for ST-098 or widen production contracts here.

- `AGENTS.md` and `STORY_INDEX.md`.
- `docs/video-style-templates-brainstorm.md` — proposals 1–3 and recommended priorities.
- `docs/creative-styles-technical-research.md` — vendor patterns, repository findings, style-pack contract, rendering constraints, and bounded proof.
- `docs/reference/mvp-prd.md` — E11-US2 and E15-US2.
- `docs/reference/epic-technical-implementation-guide.md` — E11, E15, schema compatibility, preview/render contracts, and immutable versioning.
- All current `docs/adr/` decisions, especially ADR-001 and ADR-004.
- `docs/design.md` for the development gallery shell; its application branding does not prescribe video styling.
- Dependency stories and their Dev Agent Records, including known render/font regression limitations.

## Dependencies

ST-010, ST-011, ST-012, ST-013, ST-016, ST-022, ST-023, ST-024, and ST-084.

Do not start implementation until every dependency is **Done** in `STORY_INDEX.md`. All are Done at story creation; recheck when starting.

## Scope and Architecture Boundary

The current PRD specifies one production theme. This story authorizes an isolated development proof, using an explicit proof composition contract and original or appropriately licensed fixture assets. Production configuration, persisted LessonSpec acceptance, and approved lesson snapshots continue to use their existing contracts.

Record the proof boundary and proposed production architecture in an ADR with status **Proposed**, using the next available ADR number. Identify the affected PRD/technical-guide provisions and recommend a versioning/migration approach. Do not label that proposal Accepted or silently widen the production theme enum. If the proof would require a major change outside this boundary, document and isolate it instead of introducing it as an incidental refactor.

## Scope

- [ ] Inspect the actual scene, asset, caption, timing, font, and render consumers before choosing file boundaries.
- [ ] Create one original or licensed, grounded lesson fixture with `hook`, `definition`, and `comparison` scenes, totalling 20–30 seconds.
- [ ] Use the same factual content, scene order, narration recording, captions, and scene durations for all three styles.
- [ ] Prepare style boards showing the intended layouts, typography, palette, imagery, and motion rules; retain them as implementation references.
- [ ] Implement a validated, explicitly versioned proof style-pack/treatment contract and deterministic resolver.
- [ ] Author all nine treatments described below, including real imagery/illustrations where the treatment requires them.
- [ ] Add a development gallery using the existing preview conventions, with style selection, scene navigation/seeking, and visible validation failures.
- [ ] Register the proof composition for actual Remotion rendering, sharing treatment code with the browser preview.
- [ ] Add treatment-aware layout validation, font readiness, safe-area checks, and required-asset validation.
- [ ] Render three complete MP4s and a nine-frame contact sheet; preserve reproducible inputs and rendering commands.
- [ ] Exercise a second subject through the same treatments and run boundary-content fixtures.
- [ ] Write an evaluation report and proposed ADR identifying production follow-up work.

## Treatment Matrix

| Scene | Essential | Editorial | Everyday |
| --- | --- | --- | --- |
| Hook | Large question with an isolated subject and generous space | Bold headline beside a tightly framed contextual photograph | Short question within a friendly illustrated situation |
| Definition | Central subject with clearly separated term and explanation | Evidence photograph and a concise, structured annotation | Familiar illustrated objects with clearly labelled relationships |
| Comparison | Two isolated subjects; differences emphasised sequentially | Two photographic evidence panels with readable labels and source information | Two illustrated scenarios with a consistent visual vocabulary |

The three styles must differ in composition and image treatment as well as colours and typography. Essential should have restrained reveals, Editorial should use deliberate image/annotation emphasis, and Everyday should use restrained object movement. All required content must remain understandable; decorative movement is not evidence of instructional improvement.

## Technical Implementation Requirements

### Contracts and selection

- Keep semantic `SceneSpec` content separate from its selected design. Do not create nine new semantic scene types.
- Use Zod and strict TypeScript for the proof input contract. Define contracts before consumers, following existing schema ownership conventions; proof exports must not widen production lesson validation.
- Include pack ID/version and a scene-ID-to-treatment-ID/version mapping in proof composition inputs or their immutable fixture manifest.
- Reject unknown pack versions, unknown treatment IDs, unsupported scene-type/treatment combinations, and missing required assets with actionable errors. Never silently select the newest version or substitute another style.
- Register each treatment with its renderer, input constraints, asset-slot rules, and validation metadata. Share primitives without forcing all styles into one layout with colour switches.
- AI generation is unnecessary for this proof. No external input may introduce JSX, executable animation expressions, CSS, or arbitrary layout coordinates.

### Rendering and timing

- Retain the existing 1920×1080, 30 fps profile and pinned Remotion dependency version unless a separately justified change is required.
- Drive animation from Remotion frame time; avoid wall-clock randomness, CSS animation timelines, and frame-order-dependent state.
- Reuse existing timeline/audio rules. Measured narration remains the timing authority under ADR-004; never accelerate or truncate it for a style.
- Use one prepared local narration track per scene, original or licensed, shared across styles. A recorded voice is sufficient; do not invoke paid TTS or image providers automatically.
- Parameterise entrance, explanation/hold, and exit intervals. Test that longer supported durations preserve readable explanation time and valid interval ordering.
- Keep captions visible within shared safe-area constraints, with a tested style-compatible treatment.
- Preview and final render must use the same resolved inputs and treatment code. Export three playable H.264/AAC MP4s, not only stills or static HTML.

### Assets, fonts, and layout

- Use bundled original/licensed assets with provenance and checksums. Editorial must include usable photographs; Everyday must include a coherent illustration family. Do not use unresolved remote URLs or placeholder boxes in final proof output.
- Define required/optional slots, accepted media kinds, fit/crop rules, and useful resolution constraints. Contain-fit diagrams where cropping would remove information.
- Pin font files/weights and wait for readiness before measurement and rendering; avoid environment-dependent fallback fonts.
- Retain fast schema/content-limit checks. Perform actual wrapped-text/container measurement in a browser with loaded fonts; browser-only Remotion measurement APIs cannot run directly in the API's Node context.
- Validate text bounds, image/annotation placement, and caption exclusion regions for each treatment. Include stable explanation frames and relevant motion extrema/boundaries.
- Reject an overfull treatment with a field-specific issue. Do not omit facts, shrink text indefinitely, crop evidence labels, or rewrite narration to make it fit.
- Keep expensive proof measurements/renders in explicit development commands or the existing worker tooling, outside normal request handlers. No new production service is required.

### Compatibility and reproducibility

- Prefer a separate proof composition/resolver and explicit theme injection. Preserve the existing default behaviour if shared primitives must change.
- Verify `mvp-default` fixtures before and after changes. Existing production schemas, configuration choices, and saved lessons remain valid and visually unchanged.
- Record content, asset/font checksums, pack/treatment versions, render-affecting parameters, renderer revision, and environment in the proof manifest/report. Hash the resolved proof inputs for repeatability; do not claim an unversioned pack ID ensures reproduction.
- Do not add database migrations or rewrite existing lesson versions for this story.

## Interfaces and Deliverables

- A development-only preview/gallery entry following existing access and environment conventions; no new public production route.
- Registered Remotion proof composition and documented commands for each style.
- Validated local fixtures, their asset/font provenance, and a second-subject fixture.
- Three primary MP4s, a 3×3 contact sheet, and short second-subject render evidence. Place generated binaries in the repository's existing artifact location rather than committing large output files by default; document absolute local paths or durable approved artifact locations in the completion report.
- `docs/creative-styles-proof-evaluation.md`, recording the evidence and recommendations below.
- A proposed ADR covering production schema/design-manifest placement, immutable pack version retention, full scene coverage, and the required scope update.

## Acceptance Criteria

- [ ] **AC1 — Complete proof:** All nine combinations preview and render successfully from one primary lesson fixture. The three complete clips have identical scene content, narration, captions, and duration of 20–30 seconds.
- [ ] **AC2 — Distinct when paused:** Each row of the contact sheet exhibits different composition, imagery/framing, and hierarchy across styles. Each style maintains its visual identity across all three scenes. The report records this comparison with annotated evidence.
- [ ] **AC3 — Meaning preserved and equally clear:** An explicit inventory of the fixture's question, definition, subjects, and comparison facts is visible or appropriately narrated in every version, with no silent omissions or invented evidence.

  Reviewers additionally rate each complete clip for instructional clarity against a criterion agreed before viewing, covering whether the principal subject is identifiable, whether the comparison's basis is apparent, and whether required text is readable for its full interval. Record the ratings per style. A style that retains every fact while explaining the subject less clearly than the others is a recorded finding to repair or document, not a pass. Report this as developer review; do not present it as measured learning outcomes.
- [ ] **AC4 — Valid layout:** Required assets/fonts load, all expected readable content fits, and captions remain unobstructed. Long headings, dense valid comparison content, portrait/landscape media, and missing-asset cases produce correct output or explicit validation failures.
- [ ] **AC5 — Timing and playback:** Complete MP4s pass metadata checks and visual/audio inspection. Entrance/exit intervals remain valid at short and extended supported durations; captions and speech are not clipped or accelerated.
- [ ] **AC6 — Shared rendering:** Selected corresponding browser/server frames match within a documented comparison tolerance established before evaluating the proof. Repeated server frame renders from pinned inputs are stable. Static markup equality alone is insufficient.
- [ ] **AC7 — Compatibility:** Existing `mvp-default` schema fixtures, representative rendered scenes, and a full-lesson regression continue to pass. Any environment-related baseline failures are reproduced and recorded rather than accepted as new regressions.
- [ ] **AC8 — Reuse demonstrated:** The second-subject fixture uses the same nine treatments without subject-specific component forks; representative render evidence and limitations are recorded.
- [ ] **AC9 — Reproducible evidence:** Another developer can run documented commands to regenerate clips/contact sheets from the checked-in inputs. Report duration, wall-clock render time, peak renderer memory, asset bytes, and layout-preflight time under the same environment as an `mvp-default` comparison.
- [ ] **AC10 — Planning handoff:** Evaluation and proposed ADR explain what is proven, unresolved creative/technical issues, and bounded production follow-ups. The story claims a proof, not complete production multi-style support.
- [ ] **AC11 — Distinct in motion:** With audio muted and static frames excluded, a reviewer who has not seen the style boards can attribute short mid-clip excerpts to the correct style using movement alone, across a documented set of excerpts covering entrance, explanation, and exit intervals. The evaluation records the excerpts, the attributions, and any style whose motion signature is indistinguishable from another's.

  Motion distinction must come from each style's declared signature — Essential's restrained reveals, Editorial's deliberate image/annotation emphasis, Everyday's restrained object movement — and not from palette, typography, or imagery differences visible in a single frame. Decorative movement added only to pass this criterion is a defect. If a style cannot be distinguished in motion within its authored intervals, record it as an unresolved creative finding in the evaluation and the proposed ADR rather than loosening the criterion.

## Required Tests and Review

- [ ] Contract tests for valid selection, unknown versions/IDs, cross-type mismatch, missing assets, and rejection of unsupported design instructions.
- [ ] Treatment fixture tests for required fields, long text, content retention, crop policy, and valid timing intervals.
- [ ] Browser layout checks after fonts load, including caption collisions and relevant animation boundaries.
- [ ] Browser interaction test for style selection, scene navigation/seeking, and visible validation errors in the development gallery.
- [ ] Real Remotion frame and MP4 tests across all three styles, with FFprobe checks for codec, frame rate, dimensions, duration, and audio presence.
- [ ] Preview/server frame comparisons and repeated-frame determinism checks under pinned render inputs.
- [ ] Legacy schema and visual regressions, including the existing full-lesson fixture.
- [ ] Review the contact sheet and complete clips; record specific findings for distinction, readability, fidelity, and motion. Run the AC11 muted attribution review and the AC3 clarity ratings against criteria agreed before viewing. Any additional human review is identified as performed or pending, never fabricated.

Run `lint`, `typecheck`, `test`, and `build` for affected workspaces and the applicable browser/render suites. Record exact commands and outcomes. Do not add broad provider, database, or authorization test work unless implementation changes those surfaces.

## Out of Scope

- Production style picker, saved personal styles, organisation branding controls, or reference-to-style generation.
- Full three-style coverage across all ten scene types; Systems, Field Notes, and Prism implementations.
- Multiple composition variants per style/scene, AI treatment selection, cross-scene object matching, or a general node/animation editor.
- New subject-specific simulation/data contracts such as physically accurate evaporation or quantified money allocation.
- Canva, Photoshop, or Resolve runtime integrations or automatic template import.
- New paid generation, production schema migrations, render-farm changes, and production lesson-version rewrites.

## Implementation Checklist

- [ ] Inspect the repository and dependency records; capture legacy baseline evidence.
- [ ] Write a short implementation plan listing files, contracts, fixtures, tests, and risks.
- [ ] Establish the bounded proof contract and draft architecture decision.
- [ ] Prepare style boards, shared lesson/audio fixtures, and required assets.
- [ ] Implement the resolver, nine treatments, validation, and gallery.
- [ ] Complete actual renders, boundary tests, second-subject checks, and legacy regressions.
- [ ] Record visual findings and measured performance; fix proof defects within scope.
- [ ] Document production follow-ups and update the Dev Agent Record and story index.

## Definition of Done

- [ ] All acceptance criteria and required checks are completed with recorded evidence.
- [ ] The nine treatments and three complete MP4s are reviewable and reproducible.
- [ ] No new production theme, incompatible lesson contract, or unsupported persistence change was introduced.
- [ ] No new rendering, content-loss, caption, asset, or font regression remains in scope.
- [ ] Evaluation report and proposed ADR accurately distinguish demonstrated results from open production decisions.
- [ ] Dev Agent Record includes files, migrations, contracts, commands, output locations, assumptions, deviations, and known risks.
- [ ] Story and `STORY_INDEX.md` are marked Done only after these requirements pass.

## Dev Agent Record

- **Agent:** Claude Opus 5 (Claude Code) via `/next-story`
- **Started:** 2026-09-17
- **Completed:** 2026-09-17
- **Branch/PR:** `feat/st-094-prove-three-distinct-video-style-packs`, branched from `feat/st-093-source-visuals-in-storyboard` @ `fb2f3f3`. No PR opened.

### Files changed

**Contracts — `@avlp/schemas`**

- `packages/schemas/src/style-proof.ts` *(new)* — the whole proof contract: pack/treatment/scene-type enums, `styleProofPackVersion` `1.0.0`, asset-slot contract (accepted media kinds, `contain`/`cover` fit, minimum resolution, required flag, bounded focal labels), `styleProofSelectionSchema` (pack ref plus scene-ID to treatment/version/assetBySlot), `styleProofCompositionPropsSchema`, `styleProofManifestSchema`, the 12 structured issue codes, and `canonicalStyleProofJson` (sorted keys, preserved array order, non-finite rejected).
- `packages/schemas/package.json` — adds the `./style-proof` subpath export **only**. The module is deliberately not re-exported from the package index, so `lessonSpecSchema` / `sceneSpecSchema` / `lessonConfigurationSchema` cannot widen to accept a pack.

**Tokens and fonts — `@avlp/design-system`**

- `packages/design-system/src/style-proof-tokens.ts` *(new)* — three versioned token sets (colour, type scale, spacing, frame inset, image treatment, easing), the declared motion signature per pack, the shared caption region and family, and the 10 pinned font faces with weights and `.woff2` checksums. `videoTheme` is not read, wrapped or modified.
- `packages/design-system/package.json` — `./style-proof-tokens` subpath export; adds `@fontsource/inter@5.3.0`, `@fontsource/source-serif-4@5.3.0`, `@fontsource/nunito@5.3.0`.

**Treatments and runtime — `@avlp/scene-library`**

- `src/style-proof/registry.ts` *(new)* — the nine treatments as data: ID, version, pack, scene type, motion signature, asset slots, content limits, description.
- `src/style-proof/resolver.ts` *(new)* — deterministic resolution; rejects unknown pack, unknown or unsupported-version treatment, cross-pack treatment, scene-type mismatch, missing required asset, wrong media kind, below-minimum resolution, and binds to undeclared slots — each with a field path and an actionable correction. Never picks the newest version, never substitutes.
- `src/style-proof/motion.ts` *(new)* — interval model (entrance/explain/hold/exit, always ordered; a longer scene extends explanation only) and the three frame-driven motion signatures. Pure functions of frame.
- `src/style-proof/validation.ts` *(new)* — fast checks plus the `data-proof-*` attribute contract and the caption exclusion/reserve geometry the browser preflight measures against.
- `src/style-proof/primitives.tsx` *(new)* — `ProofImage` (slot fit and focal policy, raster-only tonal treatment), `ProofText` (fit box with descender reserve), `ProofCaption`, `ProofLabel`, `formatSourceLine`.
- `src/style-proof/treatments/{essential,editorial,everyday}.tsx` *(new)* — the nine authored treatments; plus `treatments/index.tsx` and `treatments/types.ts`.
- `src/style-proof/fonts.tsx` *(new)* — eagerly-bundled pinned stylesheets, `delayRender` gate, and a hard failure when a pinned face is unavailable.
- `src/style-proof/composition.tsx` *(new)* — `prepareStyleProofComposition`, the clip composition (sequences, audio, captions), `StyleProofStill`, timeline helpers. Render mode throws on any blocking issue.
- `src/style-proof/fixtures.ts` *(new)* — the 28s conduction fixture, the 24s leaf fixture, the explicit fact inventory, and eight boundary fixtures.
- `src/style-proof/manifest.ts` *(new)* — `hashStyleProofInput` and `buildStyleProofManifest`.
- `src/style-proof/preview-player.tsx` *(new)* — the Remotion `Player` wrapper, mirroring `FullLessonPreviewPlayer` so the web app does not depend on Remotion directly.
- `src/style-proof/remotion-root.tsx` *(new)* — a **separate** Remotion root registering six proof compositions. The production root and the render worker's bundle are untouched.
- `src/style-proof/layout-harness.tsx` and `harness-server.ts` *(new)* — the browser measurement harness and its static server, which serves the bundle's font files (the parity comparison needs them).
- `src/style-proof/assets.generated.ts` and `narration.generated.ts` *(new, generated)* — 23 bundled assets (~1.5 MB decoded) and 6 narration beds (~0.4 MB).
- `src/style-proof/index.ts` *(new)* — the browser-safe `./style-proof` subpath surface; also not re-exported from the package index. `manifest.js` is deliberately excluded from it (it imports `node:crypto`) and is exported at `./style-proof/manifest` instead.
- `scripts/generate-style-proof-assets.mjs`, `generate-style-proof-narration.mjs`, `render-style-proof.mjs`, `analyse-style-proof-motion.mjs` *(new)*.
- `packages/scene-library/package.json` — `./style-proof` export, the three font dependencies, `pngjs` and `ffprobe-static` dev dependencies, four new scripts.
- `packages/scene-library/vitest.config.ts` — `fileParallelism: false` plus raised timeouts (see Deviations).

**Development gallery**

- `apps/web/app/style-proof-preview/page.tsx` *(new)* — server component; calls `notFound()` outside development so the proof gallery is not a public production route.
- `apps/web/app/style-proof-preview/gallery-loader.tsx` *(new)* — dynamic import of the gallery inside a production-dead branch, keeping the bundled media out of the production client bundle.
- `apps/web/app/style-proof-preview/gallery.tsx` *(new)* — the gallery itself, in a Studio Daylight shell per `docs/design.md` §10.14 (`PageContainer`, `Notice`, design-system `Button` selectors): style, subject and boundary selection, scene navigation and seeking, resolved-treatment readout, visible validation failures, and the registered-treatment list.
- `e2e/style-proof-preview.spec.ts` *(new)* — six browser interaction tests.
- `packages/scene-library/src/style-proof/style-proof-media.test.ts` *(new)* — automated MP4 encoding checks: codec, dimensions, pixel format, frame rate, duration and audio presence per pack, plus a blocked-preflight encode.
- `playwright.config.ts` — `webServer.timeout` raised from the 60s default to 180s.

**Docs and config**

- `docs/creative-styles-proof-evaluation.md` *(new)*; `docs/adr/ADR-005-versioned-style-packs-for-multi-style-video.md` *(new, **Proposed**)*.
- `eslint.config.mjs` — adds `document` and `requestAnimationFrame` to the shared browser globals.
- `.gitignore` — `artifacts/`.

### Migrations

None. No database migration, no schema version bump, no lesson-version rewrite.

### Public contract changes

Three **additive subpath exports**, none reachable from its package's index:
`@avlp/schemas/style-proof`, `@avlp/design-system/style-proof-tokens` and
`@avlp/scene-library/style-proof`. No production contract changed:
`lessonSpecSchema` is untouched, `lesson-spec-v1.schema.json` was not
regenerated, `videoTheme.id` is still the literal `mvp-default`, and
`renderImplementationVersion` in `apps/renderer/src/contracts.ts` is unchanged.
Contract tests assert that the production theme and lesson configuration still
reject a proof pack.

### Commands and tests run

| Command | Result |
| --- | --- |
| `pnpm -r run typecheck` | green, all workspaces |
| `pnpm --filter @avlp/{schemas,design-system,scene-library,web} run lint` | green |
| `pnpm -r run lint` | 1 failure: `apps/pipeline-worker` `no-ex-assign` — **reproduced on the stashed base tree**, pre-existing |
| `pnpm --filter @avlp/scene-library exec vitest run src/style-proof/` | **76 passed** (52 contract, 10 browser layout, 10 render/parity, 4 motion) |
| `pnpm --filter @avlp/scene-library run test` (full) | 185 passed, **3 failed** — the same three snapshot suites that fail on the stashed base tree (font-hash drift in this environment) |
| `pnpm --filter @avlp/schemas run test` | 312 passed, 2 failed — **same 2 on the base tree**, pre-existing |
| `pnpm --filter @avlp/design-system run test` | 8 passed, 1 failed — pre-existing snapshot |
| `pnpm --filter @avlp/renderer run test` | 17 passed |
| `pnpm --filter @avlp/test-fixtures run test` | 13 passed |
| `pnpm --filter @avlp/scene-library run render:style-proof` | 3 primary MP4s, second-subject MP4, contact sheet, 9 frames, manifests, ffprobe, measurements |
| `pnpm --filter @avlp/scene-library run analyse:style-proof-motion` | 27 muted excerpt clips, descriptors, blind key |
| `npx playwright test e2e/style-proof-preview.spec.ts` | **6 passed** from a cold `.next` cache |
| `vitest run src/style-proof/style-proof-media.test.ts` | **4 passed** |
| `pnpm --filter @avlp/web run build` | green; `/style-proof-preview` chunk 4.0 KB (was 2.64 MB), route prerenders as HTTP 404 with no gallery content |
| `npx playwright test e2e/video-design-preview.spec.ts` | 1 passed, 2 failed — **same 2 on the stashed base tree**, pre-existing |

Every pre-existing failure above was verified by `git stash`-ing this branch's
changes and re-running the same command on the same machine.

### Screenshots and representative output

Absolute local paths for this run (git-ignored, reproducible from checked-in
inputs via the commands above):

- `D:\Eronmonsele\Documents\SoundMinds\product-app\artifacts\st-094\contact-sheet.png` — the 3x3 sheet (rows = scene, columns = style), 640 KB
- `...\artifacts\st-094\conduction-{essential,editorial,everyday}.mp4` — 28.05s each, h264/aac 1920x1080@30; 1.70 / 9.11 / 2.38 MiB
- `...\artifacts\st-094\leaf-everyday.mp4` — 24.04s second-subject evidence
- `...\artifacts\st-094\frame-<pack>-<scene>.png` — the nine full-size hold frames
- `...\artifacts\st-094\excerpts\excerpt-NN.mp4` — 27 muted 1.5s excerpts whose IDs do not name their pack; mapping in `excerpt-key.json`
- `...\artifacts\st-094\{measurements,ffprobe,excerpts,excerpt-key}.json` and `conduction-<pack>.manifest.json`

Measured cost over the same 840 frames: Essential 84.6 ms/frame, Editorial 97.1,
Everyday 79.8, against an `mvp-default` baseline of 78.2 — 2–24% more per frame.
Editorial's output is 6.5x the baseline's bytes at equal duration. Browser
layout preflight: 379–549 ms for a three-scene lesson.

### Decisions and assumptions

- **Isolation over integration.** Separate contract subpath, separate tokens, separate treatment registry, separate Remotion root, separate development route. The production render bundle and render identity are byte-unchanged, which is what makes the AC7 claim checkable rather than asserted.
- **Bundled `data:` URIs for proof media.** Chosen so preview, server render and Node tests consume byte-identical media with no path resolution and no static-file server — the precondition for the AC6 comparison to mean anything. Explicitly recorded as *not* a production pattern.
- **Contain-fit wherever artwork carries meaning to its edges**; `cover` only for Editorial's photographic frames, which carry no burned-in text. Asserted by test.
- **Captions are not style-variable.** Geometry and family are shared across packs and match `videoTheme.safeAreas.caption`; only the plate colour is tinted. Legibility is not a creative decision.
- **Comparison tolerances were registered before evaluation** and left as registered afterwards, in either direction.

### Deviations from the story or technical guide

1. **No licensed photographs.** The repository has none and there is no sourcing route, so Editorial's image slots carry original seeded raster imagery. Crop policy, framing, minimum-resolution rejection, tonal treatment, annotation anchoring, decode verification and compression cost are genuinely exercised; photographic quality is not proven. Recorded as limitation L1 and finding F1 in the evaluation, and as an open question in ADR-005.
2. **Synthetic narration, not a recorded voice.** Original seeded formant-shaped beds at the authored durations, shared byte-identically across styles. No paid TTS was called. This proves duration authority, caption alignment and audio presence; it cannot prove prosody or intelligibility. Limitation L2.
3. **The AC11 blind human attribution review is pending, not performed.** The 27 muted excerpts and the blind key are generated and ready. Mechanical motion-only evidence is provided and is labelled throughout as supporting evidence, not as the human judgement.
4. **AC3 clarity ratings are developer review**, against a criterion fixed before viewing, and are reported as such — not as measured learning outcomes.
5. **`fileParallelism: false` in `@avlp/scene-library`.** Adding four browser-heavy suites made the package's parallel run oversubscribe the machine and fail four unrelated suites on timeout; they passed in isolation. Serialising restores exactly the base tree's failure set, at the cost of a ~6-minute suite.
6. **The shared eslint config gained `document` and `requestAnimationFrame` globals** — needed by browser-measured layout code, and the narrowest change that makes it lint cleanly.
7. **`playwright.config.ts` `webServer.timeout` raised to 180s** — a shared-config change outside this story's package boundary, made because the 60s default fails a cold start of the existing app for every spec, not only this one.

### Known risks and follow-up

- **A `node:crypto` leak into the client bundle was found and fixed late.** `manifest.ts` hashes resolved inputs with `node:crypto` and was re-exported from the `style-proof` index, so the development gallery's client bundle failed to compile and the route returned 500. The manifest is now off the browser-safe surface (its own `./style-proof/manifest` subpath) and Node-side callers import it directly. Worth noting for review: this was invisible to every package test, because they all run in Node. Any future addition to that index needs the same care.
- **The proof's bundled-media approach does not survive contact with a production bundler.** Importing the fixtures statically put 2.64 MB into the route's client chunk (against 4 KB for the comparable `/video-design-preview`) and prerendered a publicly reachable route into the production build. The route now calls `notFound()` outside development and loads the gallery through a dynamic import inside a production-dead branch: `next build` emits a 4.0 KB chunk and a genuine HTTP 404 with no gallery content. That fixes the exposure, but it is the clearest evidence that limitation L3 is real — production must resolve media through the existing tenant-scoped asset path rather than embedding it.
- The gallery still costs ~13s to compile on first request in `next dev`. Playwright's shared `webServer` readiness timeout was 60s, too low for a cold `next dev` start of this app for *every* spec, and is now 180s.
- Editorial's evidence imagery cannot currently carry the comparison's visual claim (finding F1). Editorial should not be judged production-ready on this proof.
- Only one motion-energy setting was exercised (L4); CR-05's calm/balanced/lively axis is expressible but untested across settings.
- Nine of thirty combinations exist (L5). Systems, Field Notes and Prism are ST-101; full scene coverage is ST-100.
- All measurements come from one machine, one Chromium build and one FFmpeg build (L6). Per CR-08, no cross-environment byte-identity is claimed.
- Three snapshot suites in `@avlp/scene-library`, two in `@avlp/schemas`, one in `@avlp/design-system` and one `apps/pipeline-worker` lint error fail on the base tree and remain failing; refreshing them is independent work.
