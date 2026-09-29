# Visual storytelling (cinema-reel) — implementation handoff

Source plan: [docs/cinema-reel.md](../../docs/cinema-reel.md). Architecture: [ADR-015](../../docs/adr/ADR-015-v2-composition-planning-and-pre-approval-asset-substitution.md).
Stories: ST-108 and ST-109 In Progress; ST-110, ST-111 and ST-112 Ready. STORY_INDEX.md is **not yet updated**.

Nothing is committed. Branch `feat/st-107-video-brief-budget-self-repair` also holds unrelated staged ST-048/ST-103 work. Ask the user before committing or branching.

## Resume here (as of 2026-09-29)
- **Steps 1–5 are done.** Start at **step 6** (ST-110 visual planning job) under "Next steps" below. Build it and test it against the mock provider. Ask the user before any real, paid provider call.
- **Waiting on the user:**
  - Whether to refresh the three stale v1 pixel-hash snapshots (`summary-scene-render`, `scene-preview-render-smoke`, `full-lesson-render`). HEAD produces the identical hashes, so they are not regressions.
  - Whether to drop the 10 leftover `avlp_test_*` databases in the local Postgres.
- **Known unrelated failures:** web `cross-screen-quality.playwright.test.tsx`, 5 cases ("React is not defined": auth, password reset and project board).
- **Local environment:** Docker containers all exited mid-session. Only `product-app-postgres-1` was restarted; Redis and MinIO are still stopped (start them for `run-app`).
- **Review tools:**
  - `node .claude/skills/inspect-render/shoot-cinema.mjs` checks 708 renders, including the 24px phone floor and broken words.
  - `render-cinema-mp4.mjs --pack <id>` renders the photosynthesis MP4.
  - `watch-video.mjs --file <mp4> --every 2 --out <dir>` cuts it into frames.
- **Integration tests:** run them with `TEST_DATABASE_URL=<DATABASE_URL from .env>` and `--hookTimeout=180000`.

## Key decision
The v1 manifest ("1.0") and v1 scene components stay **frozen**, so approved videos render exactly as before. All new work is a parallel v2 manifest ("2.0"), read through `anyCreativeDesignManifestSchema`. It is stored in the same columns, so no migration is needed.

## Done
- **`packages/schemas/src/creative-design-v2.ts`**: the v2 contract.
  - Catalogue: 10 compositions in 8 families.
  - Eligibility rules.
  - Grounded display wording: no new words or numbers.
  - Seeded whole-video selection: never 3 of a family in a row.
  - Beats, plus `resolveCinemaBeatFrames` from caption cues.
  - Also: `planCinemaDesign`, `validateCreativeDesignManifestV2`, `carryForwardCinemaDesign`, `visualPlanProposalSchema`, `creativeDesignStyleLabel`, `legacyStyleLabel`, `creativeDesignAssetIds`, `cinemaArtDirectionBrief`.
  - Tests: `creative-design-v2.test.ts`, 20 passing.
- **`packages/schemas/src/index.ts`**: re-exports v2; `previewManifestSchema.creativeDesign` accepts any manifest.
- **`packages/scene-library/src/cinema/`**: the v2 renderer.
  - `identity.ts` (tokens per pack), `text-fit.ts`, `beats.tsx`, `primitives.tsx`, `content.ts`, `frame.tsx`, `cinema-scene.tsx`.
  - `compositions/`: headline-led, sequence, comparison, connected, hero, takeaway, detail.
- **`full-lesson.tsx`** and **`scene-preview.tsx`**: render `CinemaScene` for v2 and pass per-scene caption cues (`sceneCaptionCues`). The v1 path is unchanged.
- **`packages/scene-library/src/cinema-render.test.ts`**: Remotion stills for all 6 packs. Passes in about 210 s.
- **Harness `.claude/skills/inspect-render/shoot-cinema.mjs`**: covers identity × fixture × composition. The last run was 708 pass / 0 fail.
  - Options: `--only <template>`, `--pack`, `--shots all|review|none`, `--min-font 24`.
  - Also fails on text below the 24px phone floor (~10.5px on a landscape phone) and words wrapped mid-word; writes `smallest-text.tsv` per run.
- **MP4 review script**: `.claude/skills/inspect-render/render-cinema-mp4.mjs [--pack <id>] [--seconds 12]` renders the photosynthesis lesson at 12 s scenes to `.runtime-logs/cinema-<pack>.mp4` (scene 4 at 36 s is `connected`).
  - It uses `planCinemaDesign({packId, scenes, seed:"0123456789abcdef"})`, synthetic per-sentence captions, and `renderMedia`.
  - The Everyday MP4 was reviewed: beats land on their caption sentences.

## Next steps (in order)
1. ~~**Connected composition legibility.**~~ Done. `connected.tsx` has `grownRects` and `exitPoint` as specified, plus `edgeEnds`. When the centre-to-centre line would cross another node (IPO fan-in), an edge instead leaves from the side facing its target. Harness 708/0; Everyday MP4 frames reviewed.
2. ~~Review the other identities' screenshots and MP4s, including readability at phone size.~~ Done. All six MP4s were re-rendered and their settled frames reviewed at 844px phone width (contact sheets built from `.runtime-logs/frames-<pack>/`). Harness 708/0; the smallest text anywhere is 24px, and only dense fixtures go below 26px. Fixes:
   - Number badges: the numeral is now `max(26, size * 0.5)`, and every caller sizes its badge at 48–56px (it was 14–23px).
   - Type floors raised to 24px: all `fitText` minimums, `detailFontSize`, and the fixed 22–24px labels (which now use 26px).
   - `comparison-split`: side panels narrow (400 → 340 → 300px) until dense paired points fit at 24px. It is the only eligible composition for maximum-density comparisons.
   - `headerHeight` no longer caps at `maxLines`. An unfittable headline reserves the lines it actually wraps to.
   - `hero-indexed`: markers that share an anchor cluster in rows of four (56px step), growing toward the picture's centre.
   - `fitText` accepts a size only if the longest word clears a 1.12× margin. This stops mid-word breaks ("Evaporatio/n", "Photosynthesi/s") in the serif and narrow columns.
   - Field Notes ring emphasis is an `inline-block` with line-height 1.1, so it no longer touches the kicker.
   - `sequence`: timelines with three or fewer stops use labels up to 48px, 480px wide.
   - Open design finding (not fixed): in the text-only `comparison-split`, the side panels are large, mostly empty cards holding just the subject name.
3. ~~**Scene-library cinema unit tests.**~~ Done. `src/cinema/cinema.test.tsx` has 13 tests, all passing:
   - text-fit: largest fit, height budget, no mid-word breaks, monotone wrapping, group sizing;
   - identity contrast: the defaults, plus 120 seeded preflight-valid palettes × 6 identities. Muted text ≥ 4.5:1 on both background and surface; onAccent ≥ 4.5:1; accent text ≥ 3:1, because it is only ever used for large text;
   - beat timeline: earliest start wins, reveal, active item, provider required;
   - seek parity: every photosynthesis scene in Everyday and Prism, played frame by frame versus seeked out of order, with monotonic reveals and everything landed by the end;
   - picture resolution: render throws on a missing pinned or bound picture; preview falls back.
   - Mutation-checked: reverting the muted-on-surface guard or the word margin fails the matching test.
   - `mutedText` now guards against the surface too. The default palettes are unchanged.
   - Checks: schemas typecheck, lint and 420 tests pass; scene-library typecheck and lint pass. Scene-library tests: 351 pass, including `creative-design-render` (v1) and `cinema-render` (v2). 3 fail, and the same 3 fail at HEAD 9eaedfd in a clean worktree: `summary-scene-render`, `scene-preview-render-smoke` and `full-lesson-render`. They are stale pixel-hash snapshots, and HEAD and the working tree produce identical hashes, so the v1 output is unchanged. Refreshing those baselines needs the user's sign-off.
   - Also found: at HEAD, schemas `tsc` reports type errors in `creative-design-pack-look.test.ts`. The working tree does not.
4. ~~**ST-108 remainder.**~~ Done. There is now one source of style names: `creativeDesignPackNames` / `creativeDesignStyleLabel`.
   - Configuration: selector labels come from `creativeDesignPackNames`. The Automatic option's key is `automatic`, not `mvp-default`. `stylePackLabels` in `lib/one-shot.ts` is now an alias of `creativeDesignPackNames` (used by the storyboard panel and one-shot).
   - Preview: the subtitle shows "<Style> style" (`data-testid="preview-style-label"`) in place of "Focus Studio Theater".
   - Delivery:
     - `renderStatusResponseSchema.styleLabel` is new and optional.
     - `PostgresRenderService.response()` left-joins `lesson_versions` and reads only `snapshot->'creativeDesign'->'manifest'->'pack'->>'id'`. An unknown or missing id reads as "Legacy default theme".
     - The render panel shows it on each history row and in a "Visual style" tile on the latest video.
     - The JSON path was checked read-only against the dev database: the latest render resolves to `everyday`, and older versions to legacy.
   - Comparison: `comparisonStyleLabel` shows "Legacy default theme" or the pack name, where it used to show "MVP default" or the raw id.
   - Tests: `renders.test.ts` 17/17, including the new style-label test. Web vitest: 350 pass. The 5 failures are all in `cross-screen-quality.playwright.test.tsx`: the auth, password-reset and project-board cases fail with "React is not defined". Those components are untouched by this work, and every case for the touched screens passes.
   - Note for step 5: `renders.ts` parses the snapshot with the v1-only `creativeDesignManifestSchema`, so a v2 version drops its logo and pinned hero assets. The render would then stop, because the pinned picture is missing.
5. ~~**API, worker and web support for v2.**~~ Done.
   - **Preview** (`preview-manifest.ts`): parses either release. Asset resolution is now `resolveAssets()`. The v2 hero pictures (`creativeDesignAssetIds` without the logo) resolve in a second pass after the snapshot, and only when present, so v1 previews run exactly the same queries as before.
   - **Render** (`renders.ts`): parses either release; logo and hero ids join `assetIds`. Media are attributed to scenes through `designSceneByAssetId` (a hero to its scene, the logo to the first scene). The renderer's `hydrateProductionComposition` (`apps/renderer/src/fixture.ts`) now expects `creativeDesignAssetIds`; before, it expected only the logo, so a v2 render would have failed with "assets do not match".
   - **Snapshot** (`lesson-versions.ts`): `versions.creativeDesign` is the manifest's own `manifestVersion`, and v2 adds `versions.compositionRelease`. v1 snapshots are byte-identical, so their content hashes don't change. `sceneLibrary` stays "mvp-v1" because `assertRestorable` requires it.
   - **Carry-forward, a real bug fix:** `packages/database/src/creative-design-carry-forward.ts` parsed only v1. A v2 design therefore looked absent and was replanned as v1 on *every* storyboard edit (all four callers: `storyboard.ts` ×2, `one-shot-gateway.ts`, `duration-reconciliation.ts`).
     - It now takes full `SceneSpec`s keyed by `stableSceneId` (all callers updated) and carries v2 with `carryForwardCinemaDesign`.
     - If even that replan fails, it falls back to v1 with the same pack, never to legacy.
     - New test: `creative-design-carry-forward.test.ts` (4). Reverting to v1 parsing fails two of them.
   - **Planner/validator bug fix (schemas):** an untitled scene's authored fallback headline ("How it happens" and so on) failed `validateCreativeDesignManifestV2`. The validator now accepts exactly `defaultHeadline(scene)`, and model wording is still grounded. Regression tests are in `creative-design-v2.test.ts`.
   - **Design service** (`creative-design.ts`):
     - `parseStoredCreativeDesignManifest` returns either release. `getDraft`, `createOrUpdateDraft` (v2 bodies go through `creativeDesignDraftV2InputSchema`) and `apply` validate v2 with `validateCreativeDesignManifestV2`, using full scene specs from the new `sceneSpecs()`.
     - Draft persistence is shared (`persistDraft`).
     - `alternatives` on a v2 draft lists `eligibleCinemaCompositions`; `treatmentId` carries the composition id.
     - `plan` keeps a v2 draft v2 when switching pack: new pack defaults, same seed.
     - New `upgrade` (`POST /projects/:id/creative-design/upgrade`, `creativeDesignUpgradeInputSchema`): re-plans the v1 draft as v2 with the same pack, settings and preset and a fresh seed. It never applies, and it's idempotent on v2.
     - Presets and natural-language describe are still v1-only; a v2 manifest is rejected by the preset schema.
   - **Storyboard job:** `CREATIVE_DESIGN_V2_DEFAULT` (worker env, default false) is wired through `runtime.ts` into `persistLessonStoryboard`. When on, a chosen pack is planned with `planCinemaDesign` and a seed from sha256(projectId:storyboardId); a suggested pack tries v2 and falls back to the v1 suggestion.
   - **Demonstration pilot:** accepts v2 baselines; it reads only pack and settings.
   - **Web panel:** accepts either release. v2 alternatives set `compositionId`, and the scene line shows the composition label (`selectedLayoutName`). A "Try the new compositions" button upgrades v1 drafts.
   - **Tests:**
     - New API integration test `creative-design-v2.integration.test.ts` (3): upgrade, alternatives, apply, idempotent re-upgrade, stale-revision 409, pack switch, locked edit and refusal.
     - Run it with `TEST_DATABASE_URL=<DATABASE_URL>` and `--hookTimeout=180000`; migrations exceed the 10 s default. `createTestDatabase` uses a throwaway `avlp_test_*` database.
     - Plus preview v2 hero, route upgrade, storyboard-job flag, config env and panel unit tests.
     - First-run API failures in unrelated route tests were cold-start timeouts that pass on rerun.
   - **Environment note:** 10 `avlp_test_*` databases were left in the local Postgres, some probably from timed-out runs. They were not dropped, because not all could be attributed to this session. All Docker containers had exited (code 255) mid-session; only `product-app-postgres-1` was restarted.
6. **ST-110 — visual planning job:**
   - prompt `prompts/visual-plan/v1`;
   - job `creative-design.visual-plan` via `createModelCallGenerationHandler`, with operationType `ai.creative_design` (model it on `creative-design-job.ts`);
   - validate proposals with `visualPlanProposalSchema` and `planCinemaDesign`;
   - authored fallback.
7. **ST-110 — illustrations:**
   - payload v2: art direction plus treatment (flat, ink-sketch or editorial), built on `cinemaArtDirectionBrief`, with people allowed;
   - dedupe by concept and treatment;
   - budget of 8 per 5 minutes, capped at 12;
   - reuse source figures first; fall back to the library or a motif;
   - bind results to `imagery.hero`.
8. **ST-111:** preview and render parity tests; persist resolved timing in the lesson-version snapshot.
9. **ST-112:**
   - add a `visual_plan` step to the one-shot runner between storyboard and illustrations;
   - add estimate items in `one-shot-budget.ts`;
   - enable the flag.
   - The proof MP4s (the investigated lesson, an engineering lesson and a financial-literacy lesson) use **paid provider calls**, so ask the user first.
10. **Bookkeeping:** update the Dev Agent Records and STORY_INDEX.md, then run `graphify update .`.
