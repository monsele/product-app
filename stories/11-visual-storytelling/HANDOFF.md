# Visual storytelling (cinema-reel) — implementation handoff

Source plan: [docs/cinema-reel.md](../../docs/cinema-reel.md). Architecture: [ADR-015](../../docs/adr/ADR-015-v2-composition-planning-and-pre-approval-asset-substitution.md).
Stories: ST-108 and ST-109 In Progress; ST-110, ST-111 and ST-112 Ready. STORY_INDEX.md is **not yet updated**.

Steps 1–5 were committed by the user (852af5d, branch `feat/st-107-video-brief-budget-self-repair`). Steps 6–8 are **uncommitted**. Ask the user before committing or branching.

## Resume here (as of 2026-09-29)
- **Steps 1–8 are done.** Start at **step 9** (ST-112 production integration) under "Next steps" below. Test against the mock provider. Ask the user before any real, paid provider call.
- **Decisions (2026-09-29):**
  - The leftover `avlp_test_*` databases were dropped (10). Only `postgres` and `visual_learning` remain.
  - The `creative-design.interpret` envelope entry is kept.
  - **v1 pixel snapshots** (`summary-scene-render`, `scene-preview-render-smoke`, `full-lesson-render`): not a regression. On this Windows machine, the baseline commit `cb5bfdc` (where they were recorded) and HEAD render all 20 hashes identically; the committed values differ from both. So the baselines were recorded in another environment, almost certainly Linux CI (`ubuntu-latest`, Playwright Chromium), and font/antialiasing rendering differs on Windows. **Do not refresh them on Windows**: that would make CI fail. Treat these 3 as expected local failures; refresh only on Linux/CI if CI ever fails them. (`gh` is not installed here, so CI status was not checked.)
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
6. ~~**ST-110 — visual planning job.**~~ Done.
   - **Grounding (schemas):** `groundVisualPlanProposal(proposal, scenes)` in `creative-design-v2.ts` drops, never applies (AC2): unknown or repeated scenes, ineligible compositions, ungrounded headline/kicker/emphasis, beats whose target or sentence/phrase the scene lacks, and illustration briefs carrying colour codes, CSS, markup, code, URLs, coordinates, fonts or asking for writing in the picture (AC1). Plain subject colours ("a green leaf") and people are allowed. Returns authored `dropped` reasons (no model text). Idempotent. A composition list may end up empty; the whole-video selection then chooses freely.
   - **Prompt** `visual-plan@v1` (kind `creative-design`), registered in `repositoryPrompts`. Input: identity (style name + art direction), the catalogue, and per scene the numbered narration, approved content, `hasPicture` and `eligibleCompositions` with each one's `beatTargets`. No source text.
   - **Job** `apps/pipeline-worker/src/visual-plan-job.ts`: `createVisualPlanJobHandler`, jobType `creative-design.visual-plan`, payloadVersion 2, `ai.creative_design`, params `{ draftId, draftRevision }`. Registered in `runtime.ts` (quota 20/h).
     - Tenant-scoped reads; the draft must be v2 and still at `draftRevision`, checked *before* the provider call.
     - Deterministic check: grounded plan must name a scene and build a valid manifest; dropped fields become `VISUAL_PLAN_FIELD_DROPPED` warnings (max 20 + a count). One corrective round.
     - Persist: re-plans with the draft's pack, settings, preset, seed and art direction, keeping fitting locks and pinned heroes; writes revision+1 under an optimistic revision check. `plan.source = "model"` with the model-call id.
     - **Authored fallback (AC3):** any provider, quota, structured-output or grounding failure keeps the current draft if it validates, else re-plans an authored design; the job **succeeds** with `{ visualPlan: "authored", fallbackReason }`. Retryable failures retry first; the fallback runs on the final attempt (`maxAttempts`, default 3, must match the enqueue `deliveryOptions`). Not recovered: malformed payload, draft not found (incl. another tenant's), v1 draft.
     - A draft that moved on returns `superseded`, or `alreadyApplied` when it was this job's own earlier write; redelivery never calls the provider again.
   - **Envelope fix:** `pipelineJobAdapterEnvelopes` had no entry for `creative-design.visual-plan` **nor the existing `creative-design.interpret`**, so both failed with `PROVIDER_ENVELOPE_VIOLATION` before any call. Both added. The interpret fix changes existing behaviour (the "describe a style" request can now actually run); tell the user.
   - **Dynamic mock:** routes "video art director" to a grounded plan built from the input (varies families, anchors item beats), for `run-app`.
   - **Tests:** schemas 438 pass (+6 ST-110 grounding cases). Worker `visual-plan-job.test.ts` (5, incl. mock → zero drops) and `visual-plan-job.integration.test.ts` (10, Postgres): model plan applied + metered once + no source text sent; idempotent redelivery; fallback after provider failure, unusable plan and malformed output (each metered once as failed); quota exhaustion before any call; retryable → retry then fallback on final attempt; re-plan of an invalid kept draft; teacher edit never overwritten; other tenant cannot read/write. Mutation-checked: removing the pre-call revision check fails the idempotency and superseded tests. Worker 292 pass; provider-adapters 84 pass; typecheck and lint clean.
   - **Not yet done (belongs to step 9):** nothing enqueues this job. The one-shot `visual_plan` step must create the job with params `{ draftId, draftRevision }`, prompt `visual-plan`/`v1` and outbox `deliveryOptions.maxAttempts` = the handler's `maxAttempts`. No `creativeDesignSnapshots` row is written: snapshots are created on apply, as before.
7. ~~**ST-110 — illustrations.**~~ Done.
   - **AC5 finding:** in the cinema renderer a pinned `imagery.hero` wins over the scene's own picture, including a labelled-diagram's grounding-critical base. The hero-slot rule moved from `scene-library/src/cinema/content.ts` into schemas as `cinemaHeroSlotBinding` (the renderer now imports it), plus `cinemaSceneHasEvidencePicture`. `validateCreativeDesignManifestV2` now refuses any non-`source_figure` hero on an evidence scene.
   - **Schemas** (`creative-design-v2.ts`, "Presentation illustrations"): `cinemaIllustrationBudget` (ceil(8 × duration / 300), min 1, cap 12; with the allowed 180/300/420 s targets that is 5/8/12), `cinemaIllustrationKey` (treatment + concept without stop words, plurals folded), `cinemaIllustrationPrompt` (brief + `cinemaArtDirectionBrief`, never lesson text; people per art direction), `cinemaIllustrationJobPayloadSchema` (payload v2: candidateId, draftId, sceneIds, key, brief, artDirection, palette), and pure `planCinemaIllustrations` → `{ generate, reuse, motif }`. Order: scene's own picture → reuse of a picture already generated for the same key in the project → generate within budget (picture-led compositions first, then scene order) → authored motif (`over_budget`, `evidence_picture`, `no_people`). Scenes whose composition shows no picture cost nothing. `requested` keys (queued/generating/failed) are never requested again.
   - **Provider contract:** `IllustrationRequest.style` also accepts `cinema-flat | cinema-ink-sketch | cinema-editorial`.
   - **Worker** (`illustration-generation-job.ts`): the claim → generate → moderate → store → meter core is shared (`generateCandidateIllustration`); v1 behaviour unchanged (its tests pass). New `createCinemaIllustrationJobHandler` (jobType `illustration.generate`, **payloadVersion 2**, registered in `runtime.ts` with the same image provider). On success the asset is `active`, the candidate `accepted`, and in the same transaction the hero is pinned (`origin: "generated"`) on every planned scene that still has that key and no hero, only if the manifest still validates; draft row locked `for update`, revision+1. On moderation rejection or final-attempt failure: `{ fallback: "motif" }`, job succeeds (retryable errors retry first, `maxAttempts` default 3). Usage keyed by candidate → metered once.
   - **API** (`IllustrationGenerationService.queueCinemaIllustrations`): reads the current draft storyboard's v2 design; pins reusable pictures now (draft revision+1); queues one candidate (slot `cinema-hero`, idempotencyKey `cinema-hero:<key>`, promptVersion `cinema-illustration-v1`) + job (payloadVersion 2) + outbox event (`illustration.generation.requested.v2`, maxAttempts 3) per new key; returns `{ queued, reused, motif, budget, skipped? }`. v1 design → `skipped: "design_v1"`. Not yet called by anything (step 9). Hero candidates appear in the existing contact sheet (queued ones count as pending for the one-shot runner; bound ones show as "already in use").
   - **Library assets:** there is no library of reusable illustrations in the codebase, so the "library" rung is not implemented; the fallback goes straight to the authored motif.
   - **Tests:** schemas +7 (budget, dedupe key, planning/reuse, budget priority, own picture + no-people, AC5 plan + validator, prompt) → 445 pass. Worker `cinema-illustration-job.integration.test.ts` (6, Postgres): generate + pin on both scenes + asset active + one usage + prompt from brief only; redelivery idempotent; binds only scenes still wanting the key; moderation rejection → motif, no storage write; retryable → retry, final attempt → motif; other tenant refused. API `cinema-illustrations.integration.test.ts` (5, Postgres): one job per concept across scenes; replay queues nothing; budget respected incl. earlier failed/queued pictures; reuse pins an existing picture; v1 design skipped. The seeded lessons moved into `cinema-lesson.fixture.ts` in both apps (the visual-plan and API v2 tests use them; both still pass).
8. ~~**ST-111 — parity and pinned timing.**~~ Done.
   - **Parity bug found and fixed:** the full-lesson preview player converted caption ms → frames as `round(ms × fps / 1000)`, the render API as `round(ms / 1000 × fps)`. They disagree by one frame at 137 cue boundaries per 10 minutes (e.g. 2050 ms → 62 vs 61), moving both the caption and any beat anchored to it. There is now one canonical `captionMsToFrame` (schemas) with the **render's** arithmetic, so approved videos re-render identically; the render API, the preview player and the scene-preview input all use it.
   - **Schemas:** `captionMsToFrame`, `cinemaSceneDurationInFrames`, `cinemaCaptionsSha256`, `cinemaTimingSchema` (`cinema-timing-v1`, fps 30, per scene `{ captionsSha256, beatFrames }`), `resolveCinemaTiming({ manifest, scenes, captionsBySceneId })`.
   - **Pinned in the lesson version:** `loadState` loads each scene's captions (`apps/api/src/scene-captions.ts` → `loadSceneCaptionsMs`, same selection as render: latest ready audio, then its latest ready track, cues by position; tenant-scoped). `buildLessonVersionSnapshot` adds `cinemaTiming` only for a v2 design whose every scene has captions. v1 snapshots gain no key, so their hashes are unchanged.
   - **Render:** `assertPinnedCaptionsUnchanged` (renders.ts) refuses (409) a version whose current captions no longer hash to the pinned ones ("Save a new version, then render it"). The renderer (`apps/renderer/src/fixture.ts`) passes `snapshot.cinemaTiming` into the composition; `fullLessonCompositionPropsSchema.cinemaTiming` is validated (v2 only, beat counts must match); `CinemaScene` draws the pinned frames via `cinemaSceneBeatFrames`, re-resolving only when absent or mismatched. So a saved version's motion survives later resolver changes.
   - **Tests:** `scene-library/src/cinema/timing-parity.test.ts` (4): version, render path (absolute frames → `sceneCaptionCues`) and scene-preview path resolve identical frames on half-frame caption times; mutation-checked (the old preview rounding fails it); pinned frames win; props validation. Schemas +1 (pinned timing, proportional fallback, hash sensitivity) → 446. API: `lesson-versions.test.ts` +2 (v2 pins; nothing pinned without captions or for v1), `renders.test.ts` +3 (pinned check), `scene-captions.integration.test.ts` (2, Postgres: latest ready audio/track, cue order, tenant). API 617 pass; worker 292; renderer 55; web 351 (the 5 known `cross-screen-quality` failures only). AC1–AC4 were already covered by ST-109/ST-111 tests in `creative-design-v2.test.ts` and `cinema.test.tsx`.
   - **Behaviour change to know:** rendering a v2 version after its narration audio or captions were regenerated now fails with a clear 409 instead of animating against different speech. v1 versions and versions saved before captions existed are unaffected.
9. **ST-112:**
   - add a `visual_plan` step to the one-shot runner between storyboard and illustrations;
   - for a v2 design, the illustrations step calls `queueCinemaIllustrations` (passing `requestKey`, `oneShotRunId`) instead of `generateMissing`; the budget reservation must cover `cinemaIllustrationBudget(targetDurationSeconds)` images;
   - add estimate items in `one-shot-budget.ts`;
   - enable the flag.
   - The proof MP4s (the investigated lesson, an engineering lesson and a financial-literacy lesson) use **paid provider calls**, so ask the user first.
10. **Bookkeeping:** update the Dev Agent Records and STORY_INDEX.md, then run `graphify update .`.
