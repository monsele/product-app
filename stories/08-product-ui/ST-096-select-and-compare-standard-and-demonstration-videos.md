---
story_id: ST-096
title: "Select and Compare Standard and Demonstration Videos"
phase: "08 — Product UI"
status: Done
priority: must-have
epics: ["E6", "E10", "E11", "E15", "E20"]
prd_user_stories: ["E6-US1", "E15-US2", "E20-US1"]
depends_on: ["ST-041", "ST-050", "ST-060", "ST-063", "ST-064", "ST-065", "ST-066", "ST-068", "ST-077", "ST-079", "ST-084", "ST-095"]
---

# ST-096 — Select and Compare Standard and Demonstration Videos

## Story

As a teacher or tester, I want to choose between the current video approach and an experimental demonstration-led approach, then compare both using the same lesson and narration, so that I can judge whether explanatory movement improves clarity and engagement.

## Outcome

Eligible testers select a video approach during lesson configuration, before storyboard generation. A supported lesson produces real demonstration animation or the existing standard output. After one output is ready, an explicit comparison action creates the alternative as a separate variant. Both remain available with matched scene navigation and saved feedback.

The comparison holds content, narration audio, captions, scene boundaries, and visual style constant. Only the approach to visual explanation changes. Existing lessons continue to behave as standard videos.

## Required Reading

- `docs/controlled-rendering-versioning-contract.md` — shared CR-01–CR-08 requirements for immutable variants, media identity, authorised caching, validation, and job completion. Implement applicable requirements here and record evidence for ST-098; it is a later verification story, not a prerequisite.

- `AGENTS.md`, `STORY_INDEX.md`, and `docs/design.md`.
- `docs/reference/mvp-prd.md` and `docs/reference/epic-technical-implementation-guide.md` — lesson configuration, storyboard generation, visual runtime, preview, validation, rendering, and immutable versions.
- All current ADRs, especially ADR-001, ADR-002, ADR-003, and ADR-004.
- `docs/video-style-templates-brainstorm.md` — Make motion explain the subject.
- `docs/creative-styles-technical-research.md` — distinction between appearance and subject-specific explanation; treat its recommendations as research, not approved production contracts.
- ST-041, ST-050, ST-060, ST-065, ST-068, ST-077, ST-079, ST-084, and ST-087 and their Dev Agent Records.
- `stories/01-visual-runtime-proof/ST-095-build-and-prove-demonstration-led-animation.md`, its completed Dev Agent Record, integration contract, and evaluation report.

## Dependencies and Pilot Boundary

Do not start until all `depends_on` stories are Done in `STORY_INDEX.md`. This story is Blocked by ST-095, which must first deliver and verify the demonstration runtime and both recipes. Change this story and its index entry to Ready when that prerequisite is Done; do not treat a mock renderer as satisfying the dependency.

ST-094 is not a dependency. Use `mvp-default` for both approaches in this experiment so creative-style changes do not confound the comparison. Future style-pack integration is separate.

ST-095 owns the typed event runner, narration timing validation, curated fixtures, and savings/evaporation recipes. This story integrates those proven capabilities into the tester workflow. Consume its versioned recipe support query, plan builder/validator, shared composition, and input identity contract; do not build a second engine or duplicate recipe logic. A selector backed by identical output for both choices does not satisfy this story.

The pilot is restricted to curated, validated savings and evaporation test lessons. It does not promise demonstration generation for arbitrary uploaded content. Record this user-requested experimental expansion, versioning choices, and variant ownership in a new ADR using the next available number; update affected product/technical documentation without claiming unimplemented functionality. Resolve those contracts before implementing their consumers, following repository decision conventions.

## User Experience

### Video approach selector

Place an accessible radio group in the existing lesson configuration flow before storyboard generation. It is separate from visual theme/style and voice settings.

| Value | Label | Description |
| --- | --- | --- |
| `standard` | Standard explanation | Explains the lesson using the current scene templates, text, images, and diagrams. |
| `demonstration` | Demonstration-led explanation · Experimental | Shows the explanation through objects moving, accumulating, splitting, or changing state alongside narration. |

Standard is selected for new lessons by default. Legacy lessons resolve to standard through the compatibility reader. Persist an explicit choice for new configuration revisions.

Expose the experimental choice only to the configured pilot cohort. For an eligible tester with unsupported content, show it disabled with a specific reason and a link/action to open a supported test lesson. Server-side eligibility is authoritative; UI hiding alone is insufficient.

Support must be based on a registered recipe and validated source/content requirements, not a subject/title keyword. Recheck after narration/storyboard preparation and edits. A failed eligibility check must never silently change the chosen approach to standard.

### Create comparison version

After a supported, validated output exists, show **Create comparison version**. Identify which alternative will be produced, that approved narration/audio will be reused, and any render usage before the explicit action.

Create the alternative from the exact immutable baseline snapshot. Do not replace the current project configuration, storyboard, approved lesson, or first output. If the opposite variant already exists for the same baseline, open it instead of generating it again.

Show both approaches with clear labels, independent generation/progress/failure states, and matched scene navigation. Switching approaches preserves the selected baseline scene and relative playhead position. Only one player may emit audio at a time. Show both rendered output links when ready.

### Feedback

Provide optional 1–5 ratings for clarity, engagement, and narration synchronisation for each approach, plus a preference of Standard / Demonstration / No preference and an optional comment. Define scale endpoints, allow feedback to be updated, and persist it against the exact comparison and output versions. Treat responses as qualitative pilot evidence, not proof of learning gains.

Follow the existing Studio Daylight configuration and Focus Studio preview conventions, with keyboard access, visible focus, readable labels, and useful empty/error/retry states.

## Scope

- [x] Inspect configuration, generation, immutable lesson snapshots, audio/caption identity, preview, render manifests, and current project-state assumptions.
- [x] Define versioned approach, eligibility, comparison, variant, and feedback contracts before their consumers.
- [x] Persist approach selection and implement the pilot cohort/recipe eligibility rules in UI and API.
- [x] Make ST-095's source-grounded savings and evaporation fixtures available as tenant-owned test lessons through the existing source-review, configuration, and versioning workflow, preserving their asset provenance and timing identities.
- [x] Integrate ST-095's versioned demonstration runtime and recipes without changing their verified instructional behaviour.
- [x] Route standard through the existing path and demonstration through its registered supported recipe.
- [x] Create immutable paired variants with reusable audio/captions and isolated asynchronous generation/render jobs.
- [x] Provide comparison previews, matching navigation, failure/retry handling, and persisted feedback.
- [x] Verify actual output differences, legacy compatibility, timing, tenant isolation, and idempotency.
- [x] Document the pilot, ADR, migrations, contracts, and representative outputs.

## Demonstration Integration Contract

The savings and evaporation recipes are implemented and verified in ST-095. Invoke its support query before enabling generation and revalidate the exact source, narration, audio, and cue identities when building each variant. Persist the resolved plan and recipe version returned by the foundation; never regenerate the plan implicitly during playback.

Use ST-095's equivalent standard fixtures as the starting point for controlled test lessons. Eligibility remains restricted to validated pilot inputs. A changed narration or unsupported lesson must produce the foundation's actionable validation response, not a guessed recipe selected from a title.

### Timing and natural movement

- Preserve ST-095's stable object IDs, validated event timings, authored motion, and frame-derived state during preview/render integration.
- Preserve phrase-timing provenance. An edited narration or replaced audio invalidates the plan; do not silently replace verified timing with character-count estimates.
- Respect ADR-004: do not accelerate, trim, or resynthesise narration to force an animation to fit. Reject an invalid timing plan with an actionable issue.
- Reuse the existing Remotion/FFmpeg, asset, caption, validation, and job infrastructure. No paid provider call is necessary for the curated proof.

## Contracts and Persistence

### Approach configuration

Define `videoApproach: "standard" | "demonstration"` in the versioned configuration contract. Unknown explicit values are errors. Old snapshots without the field read as standard without rewriting their immutable stored JSON. Persist the effective approach in all new variant snapshots and render inputs.

Audit configuration invalidation rules: an approach-only change invalidates the affected visual plan and derived output, not approved source facts or reusable audio. Changes to narration invalidate its timing plan. Preserve approved historical outputs.

### Comparison and variant identity

Add additive tenant/project-owned comparison and variant records, or an equivalent explicit model established in the ADR. Do not emulate a comparison by restoring an alternative into the project's current lesson state.

Record baseline lesson-version ID/hash, source snapshot, scene correspondence, narration/audio/caption identities, fixed style identity, approach, recipe/event-plan versions, render manifest/output identity, and lifecycle state. Reuse immutable media references inside the authorised project scope; signed URLs are delivery credentials, not stable asset identities.

Enforce uniqueness for a baseline and experiment/recipe version, with one variant per approach. Standard and demonstration must have different cache/idempotency identities even when their narration is identical. Include all render-affecting inputs in validation and render hashes.

Compare hashes before generation, on completion, and when presenting a controlled pair. If baseline content, audio, captions, style, or scene timing no longer match, do not present the pair as equivalent. Keep completed historical pairs viewable; current edits require a new comparison baseline rather than mutating the old pair.

### API and jobs

Extend existing configuration endpoints and add bounded commands/queries for eligibility, creating/loading a comparison, requesting/retrying a variant, and saving feedback. Settle exact routes in the implementation plan using existing API conventions.

All operations require project ownership/cohort checks as applicable. Both referenced variants and the baseline must belong to the same authorised scope. Validate again in workers. Feature-flag changes prevent new experimental jobs while preserving authorised access to completed outputs; document how already queued work is handled.

Use the existing outbox/background-job, metering, and correlation patterns. Repeated clicks or concurrent requests reuse the same active/completed variant. Completion uses compare-and-set or equivalent checks so obsolete jobs cannot overwrite a newer baseline or variant. Do not hold database transactions open across provider/storage calls.

Feedback records include comparison/output IDs, tester identity, bounded ratings/preference/comment, timestamps, and revision semantics. Keep free-text comments out of routine logs and expose them only within authorised scope. Reuse existing project deletion/retention behaviour for the new records.

## Acceptance Criteria

- [x] **AC1 — Selection:** An eligible tester can select either approach before generation; selection survives reload. Existing lessons and non-pilot users retain standard behaviour.
- [x] **AC2 — Eligibility:** Unsupported lessons show a useful reason. Direct API attempts and stale selections are rejected. No silent fallback occurs.
- [x] **AC3 — Real demonstration:** Both pilot subjects render meaningful object/state changes aligned to their narration, with validated amounts/scientific explanation. Standard retains its current scene behaviour.
- [x] **AC4 — Controlled pair:** Both variants share exact approved content, audio, captions, style, and scene boundaries. The UI identifies the approach on each preview/output and makes the difference observable.
- [x] **AC5 — Isolation:** Creating or retrying a comparison does not modify the baseline, current storyboard, original render, or approved versions. Changing the current lesson does not mutate a historical pair.
- [x] **AC6 — Playback:** Scene selection and relative playhead position transfer between variants, seeking gives correct animation state, and simultaneous speech from both players cannot occur.
- [x] **AC7 — Lifecycle:** Queued, running, complete, stale/incompatible, and failed states are truthful. Retrying one variant preserves the other; repeated/concurrent requests produce no duplicate authoritative variant or incorrect cache reuse.
- [x] **AC8 — Feedback:** Ratings, preference, and comments survive reload, attach to the exact pair/output versions, and can be updated without cross-project access.
- [x] **AC9 — Compatibility:** Legacy configuration, LessonSpec, snapshots, standard preview/render, and version restore remain supported through an explicit compatibility path. Database migration tests include existing rows.
- [x] **AC10 — Evidence:** Record two controlled pairs (savings and evaporation), actual playable MP4s, preview screenshots, synchronisation/accuracy review, and relevant test results. A selector mock-up or static markup comparison is not completion.

## Required Tests

- [x] Shared schema and compatibility tests: missing legacy field, explicit standard/demonstration, invalid values, unsupported recipes, and malformed event plans.
- [x] API/database tests: persistence, stale revisions, cohort/ownership checks, cross-tenant baseline/variant/feedback access, migration compatibility, and immutable baseline preservation.
- [x] Job tests: concurrent creation, repeat requests, retry isolation, stale completion rejection, approach-sensitive cache keys, and no automatic audio/provider regeneration.
- [x] Runtime integration tests: pass through recipe precondition/timing errors, preserve cue/audio identity, and verify deterministic seeking and correct final state through the actual preview/render adapters. Reuse ST-095's conservation and recipe tests rather than duplicating the engine suite.
- [x] Browser tests: radio group accessibility, reload, unsupported explanation, comparison action, progress/retry, matched navigation, single audible player, and feedback persistence.
- [x] Actual Remotion/MP4 verification for both subjects and approaches, caption/audio checks, and standard visual regression. Inspect differences in complete clips, not just first frames.
- [x] Affected workspace lint, typecheck, tests, build, applicable database integration tests, and browser/render suites; record exact commands and outcomes.

## Out of Scope

- Broad demonstration support for arbitrary lessons or unrestricted AI-generated animation.
- Full scientific simulation, a general node editor, and an open-ended animation vocabulary.
- New demonstration engine or recipe implementations; these belong to ST-095. Fix any foundation defect in its owning implementation rather than bypassing its contract in this workflow.
- New creative styles, personalisation, or mixing styles between members of a controlled pair.
- Automatic generation of both approaches for every lesson, paid provider integration, and silent source/audio regeneration.
- Statistical experimentation infrastructure, public comparison sharing, or claims of measured learning improvement.

## Implementation Checklist

- [x] Inspect existing code and write a plan with files, versioned contracts, migrations, ADR/scope changes, and tests.
- [x] Establish baseline/variant ownership and backward compatibility before implementation.
- [x] Implement contracts and persistence, then eligibility/configuration and adapters to ST-095's completed runtime.
- [x] Integrate immutable variants, background rendering, paired preview, and feedback.
- [x] Run integration and real-media checks; inspect the two controlled pairs.
- [x] Update documentation, Dev Agent Record, and story index.

## Definition of Done

- [x] Every acceptance criterion and required test is satisfied with reproducible evidence.
- [x] Both pilot subjects can be compared through the actual tester workflow.
- [x] No unresolved tenant-isolation, baseline mutation, duplicate-job, false fallback, timing, or standard-regression defect remains.
- [x] Migrations, contract/version changes, experiment eligibility, and architecture decisions are documented.
- [x] Dev Agent Record is complete; story and index are marked Done only after verification.

## Dev Agent Record

- **Agent:** Claude Opus 5 (Claude Code) via `/next-story`
- **Started:** 2026-09-18
- **Completed:** 2026-09-19
- **Branch/PR:** `feat/st-096-select-and-compare-standard-and-demonstration-videos`, branched from `feat/st-095-demonstration-led-animation` @ `cfd90c0`. No PR opened.

### Status reconciliation before starting

`STORY_INDEX.md` said `Ready`; this file still said `Blocked`. The story's own "Dependencies and Pilot Boundary" section instructs that both flip to Ready once ST-095 is Done, and ST-095's commit updated only the index row. All twelve `depends_on` stories are Done, so both were reconciled to `In Progress` together.

### Files changed

**Contracts — `@avlp/schemas`**

- `src/demonstration-pilot.ts` *(new)*, exported at `@avlp/schemas/demonstration-pilot` and deliberately **not** from the package index: eligibility with its reason codes, the resolved variant plan, `demonstrationVariantIdentityInputSchema` (the one shape hashed for a variant, with `approach` inside it), comparison/variant views, and the feedback contract with its documented scale endpoints.
- `src/index.ts` — `videoApproachValues` / `videoApproachSchema` / `defaultVideoApproach` / `readVideoApproach`, and `videoApproach` on `lessonConfigurationSchema` (required) and `lessonConfigurationInputSchema` (optional, so a client that predates this story leaves the stored value alone).
- `src/demonstration-proof.ts` — `demonstrationAudioSrcSchema` and `demonstrationImageSrcSchema` replace the two inline `data:`-only regexes, so a resolved `http(s)` URL is admissible. This closes ST-095's own limitation L3; nothing else in that module changed.
- `package.json` — the `./demonstration-pilot` subpath export.

**Runtime binding — `@avlp/scene-library`**

- `src/demonstration-proof/pilot-bindings.ts` *(new)* — the registered bindings for the two curated subjects, resolution by **ordered narration checksums**, and `buildDemonstrationPilotPlans`, which rebuilds each plan through ST-095's `buildDemonstrationPlan` rather than copying one. No state evaluation, validation rule or geometry lives here.
- `src/scene-preview-composition.tsx` — registers `DemonstrationRuntimeRender` on the production root, and adds `calculateMetadata` to both production compositions (see Deviations).
- `src/demonstration-proof/index.ts` — exports the bindings.

**Database — `@avlp/database`**

- `src/schema.ts` — `video_approach` enum and column on `lesson_configurations`; `demonstration_comparisons`, `demonstration_variants`, `demonstration_feedback`; five new audit event values.
- `drizzle/0060_demonstration_pilot.sql` + `.compatibility.md`, `drizzle/0061_demonstration_pilot_audit_events.sql` + `.compatibility.md`, journal entries.

**API — `@avlp/api`**

- `src/demonstration-pilot.ts` *(new)* — eligibility, comparison create/load, variant request/retry, feedback, the cohort interface and its environment reader, and the adoption of an existing completed render as the standard half.
- `src/demonstration-test-lessons.ts` *(new)* — seeds a curated subject as a real project, including a genuine one-page PDF source.
- `src/renders.ts` — `approach` and the optional comparison block in the immutable manifest; `renderIdempotencyKey` gains an optional `variant` (absent ⇒ byte-identical to the previous key); a demonstration-configured lesson is refused at the ordinary endpoint.
- `src/lesson-configuration.ts` — reads and persists `videoApproach`.
- `src/app.ts` — the pilot routes, a top-level `demonstration-test-lessons` controller, and closed-by-default fallbacks.
- `src/runtime.ts` — wiring, and the lazy one-time load of the generated narration module behind the cohort flag.

**Renderer — `@avlp/renderer`**

- `src/contracts.ts` — `approach`, `comparison` and an opaque `demonstration` on the manifest, with refusals in both directions (a demonstration render without a plan, a standard render carrying one); `renderImplementationVersion` bumped.
- `src/fixture.ts` — `hydrateDemonstrationComposition`, signing tenant media at execution time exactly as the standard path does, and refusing a plan timed against different audio.
- `src/media.ts` — the engine selects the demonstration composition when the request carries one.
- `src/render-worker.ts` — the branch, plus `verifyDemonstrationAssets` applying the same tenant-prefix, presence and checksum checks to a variant's own artwork.

**Storage — `@avlp/storage`**

- `src/keys.ts` — `demonstrationAsset`, a separate namespace inside the project prefix (see Decisions).

**Configuration — `@avlp/config`**

- `src/index.ts` — `DEMONSTRATION_PILOT_ENABLED` and `DEMONSTRATION_PILOT_USER_IDS`, both closed by default.

**Web — `@avlp/web`**

- `configuration/video-approach-selector.tsx` *(new)* and its Playwright spec *(new)*.
- `configuration/configuration-workspace.tsx`, `lesson-configuration-input.ts` — the approach in form state, the eligibility fetch, and the "open a supported test lesson" action.
- `compare/page.tsx`, `compare/comparison-workspace.tsx` *(new)* — paired players, matched navigation, single audible player, retry, feedback.
- `render/render-panel.tsx` — a link to the comparison screen.

**Docs**

- `docs/adr/ADR-007-demonstration-pilot-comparison-variants.md` *(new, Proposed)*
- `docs/demonstration-pilot.md` *(new)* — what the pilot is, how to enable it, what a tester does, and its limitations.
- `docs/demonstration-pilot-comparison-evidence.md` *(new)* — the measurements below, in full.
- `docs/demonstration-animation-proof-evaluation.md` — ST-095's four open questions answered, and its L3 marked as lifted.

### Migrations

`0060_demonstration_pilot` (enum + column + three tables + indexes and foreign keys), `0061_demonstration_pilot_audit_events` (five additive enum values), and `0062_demonstration_feedback_output_identity` (additive immutable output identity on feedback), each with a compatibility note.

Applied forward against a database already holding **11 projects, 2 lesson configurations, 3 lesson versions and 2 render jobs**. Both pre-existing configurations read `standard` afterwards. Nothing was backfilled and no immutable snapshot was rewritten, because absence of the field *means* standard.

### Public contract changes

- `lessonConfigurationSchema` gains a required `videoApproach`; `lessonConfigurationInputSchema` gains an optional one. Legacy stored shapes are read through `readVideoApproach`, which treats absence as standard and an unknown value as an error.
- New additive subpath `@avlp/schemas/demonstration-pilot`.
- `@avlp/schemas/demonstration-proof`'s two media `src` fields widened to admit a resolved URL.
- The renderer's production manifest gains `approach`, optional `comparison` and optional `demonstration`.
- `renderImplementationVersion` → `st-096-remotion-4.0.507-scene-library-v1`.
- A new storage key namespace, `…/demonstration/assets/<slug>.<ext>`.

No LessonSpec schema version was bumped.

### Commands and tests run

| Command | Result |
| --- | --- |
| `tsc --noEmit` across `@avlp/{schemas,database,scene-library,storage,config,api,renderer,web}` | **all clean** |
| `lint` across `@avlp/{schemas,database,scene-library,storage,config,renderer,web}` | **all clean** |
| `pnpm --filter @avlp/api run lint` | 2 errors, both pre-existing in `illustration-generation.ts`, untouched by this story |
| `pnpm --filter @avlp/api run test` | **496 passed**, 79 skipped (integration, no `TEST_DATABASE_URL`), 0 failed |
| `pnpm --filter @avlp/renderer run test` | **17 passed** |
| `pnpm --filter @avlp/web run test` | **242 passed** (49 files) |
| `vitest run packages/schemas/src/demonstration-pilot.test.ts` | **21 passed** |
| `vitest run .../demonstration-proof/demonstration-pilot.test.ts` | **12 passed** |
| `vitest run apps/api/src/demonstration-pilot.test.ts` | **12 passed** |
| `vitest run .../video-approach-selector.playwright.test.tsx` | **5 passed** (real Chromium) |
| `pnpm --filter @avlp/schemas run test` | **335 passed** |
| `pnpm --filter @avlp/scene-library run test` | 314 passed, **3 failed** — pre-existing |
| `pnpm build` | **16/16 tasks successful** |
| `db:migrate` against a populated database | applied forward cleanly |

**Every failure above was verified pre-existing, not assumed.** Each was re-run with only the relevant file reverted to its base (`cfd90c0`) version and failed identically:

- `scene-library`: `full-lesson-render`, `scene-preview-render-smoke` (rendered-frame hash snapshots; re-run with the base `scene-preview-composition.tsx` and still failing) and `summary-scene-render` (which does not route through any file this story touches). These are the same three ST-095 recorded, with font-hash drift in this environment.

### Screenshots and representative output

A full end-to-end run through the **running product** — API, outbox dispatcher, production render worker, Postgres and MinIO — driven over HTTP. Both subjects were seeded as real projects, versioned, validated, compared and rendered.

| Subject | Approach | Duration | Bytes | Output sha256 (16) | Variant identity (12) |
| --- | --- | ---: | ---: | --- | --- |
| Savings | standard | 71.062 s | 4,198,462 | `767667ed4f903dbf` | `03c9593a8f2d` |
| Savings | demonstration | 71.062 s | 6,053,540 | `0bac2c52ada89863` | `e837a7a0376a` |
| Evaporation | standard | 63.062 s | 3,743,726 | `ddcb5b89e39ace4f` | `b6142619d3a7` |
| Evaporation | demonstration | 63.062 s | 4,641,442 | `e1f4099b35ea3d13` | `c194703d8e49` |

FFprobe on all four: `h264`/`aac`, 1920×1080, 30 fps. Within each pair the duration is identical to the millisecond and matches ST-095's own renders of the same subjects, because the narration recording and its measured beats are the same objects rather than equivalent ones. The clips differ (different checksums, 1.44× and 1.24× bytes), and the two halves have different render identities although their lesson version, narration and captions are identical by construction.

Artifacts (git-ignored, reproducible; absolute root `D:/Eronmonsele/Documents/SoundMinds/product-app`):

- `artifacts/st-096/{savings,evaporation}-{standard,demonstration}.mp4`
- `artifacts/st-096/frame-{standard,demonstration}-{8,18,30,45,62}s.png`
- `artifacts/st-096/frame-evap-{standard,demonstration}-{25,55}s.png`

Frame review, at matching timestamps: at 30 s both savings clips carry the same scene title and the same caption; the standard one shows a three-step process list while the demonstration shows eight notes in the income tray, two in flight, and readouts at ₦8,000 / ₦0 with "₦2,000 arriving" — in-transit money attributed to neither container. At 62 s the demonstration shows Week 3 with six notes in savings reading ₦6,000 against a 60%-filled ₦10,000 goal: the arithmetic is visible and correct. The evaporation demonstration at 55 s shows particles dispersed above the water inside the magnified-model frame, with the "still water" accuracy note.

Behaviours verified against the running system, with results in `docs/demonstration-pilot-comparison-evidence.md`: recipe-backed eligibility against minted scene IDs; a demonstration-configured lesson refused at the ordinary render endpoint with **409** and no standard output; three repeat creates and three repeat variant requests leaving exactly one comparison, two variants and two render jobs; the baseline's snapshot md5 and content hash byte-identical before and after; feedback saved, reloaded, stale-rejected with **409** and updated; cross-tenant reads **404**; a non-cohort account's catalogue probe **404**.

### Review follow-up — 2026-09-19

- Configuration saving now rechecks the effective demonstration selection through the authoritative pilot eligibility service. A direct or stale unsupported selection receives a 409 and is not persisted.
- Retrying a comparison variant now invokes the existing render retry operation instead of asking the idempotent start path for the same failed render again.
- Comparisons persist a canonical hash of their audio and caption render inputs plus the renderer implementation version. A completed standard render is adopted only when those identities match, and a later mismatch is shown as `stale` rather than a controlled pair.
- The production full-lesson Remotion test now selects a lesson one second longer than the checked-in fixture and asserts its independently calculated frame duration.
- `pnpm --filter @avlp/api typecheck`, `pnpm --filter @avlp/scene-library typecheck`, `pnpm --filter @avlp/schemas test` (335 passing), and the focused pilot API suite passed. The Postgres-backed configuration integration suite was skipped because `TEST_DATABASE_URL` was not configured.

### Post-review remediation - 2026-09-19

- Fresh variant requests now require current cohort membership and rebuild the registered plan from the immutable baseline before queueing. Changed narration, captions, scene correspondence, or demonstration-plan identity receives an actionable `409`; retries continue to use their original immutable render manifest after the cohort check.
- The renderer rejects a demonstration plan whose persisted captions differ from the production render manifest before it signs media or spends render capacity.
- Feedback is available only once both controlled outputs are ready. Migration `0062` stores each rated variant's immutable render-job ID, rendered-video ID, and checksum, so later retries cannot re-attribute a saved judgement.
- Verification: focused API pilot suite (**13 passed**), schema pilot suite (**22 passed**), renderer contracts (**4 passed**), database unit suite (**8 passed; 3 integration tests skipped without a test database**), and typechecks/lint for touched packages. API lint still reports the two pre-existing unused-variable errors in `illustration-generation`.
- **Approval:** Repository owner explicitly approved ST-096 on 2026-09-19, accepting the recorded verification limitations and follow-up risks. Status is `Done`.

### Decisions and assumptions

- **A comparison is an additive record beside the lesson.** Three tenant-owned tables referencing an immutable baseline. Nothing in the pilot writes to `lesson_specs`, `lesson_versions`, `projects` or an existing render, which is what makes AC5 checkable rather than asserted.
- **The approach is inside render identity.** Both in the hashed variant identity and in the job idempotency key. Two halves of a pair are designed to differ in exactly one input; a hash that omitted it would serve one the other's video, and that failure looks like success.
- **An existing completed plain render is adopted as the standard half** rather than re-rendered. That is how "do not modify the original output" and "do not duplicate billed work" hold simultaneously.
- **Bindings match on ordered narration checksums, not scene IDs.** Forced by `scenes.stable_scene_id` being globally unique — two projects of the same curated subject cannot share one — but it is also the better rule: the measured beats belong to those exact audio bytes, so the checksum is the thing worth matching.
- **Plans are rebuilt, not copied.** `demonstration-pilot.test.ts` asserts the rebuild reproduces ST-095's proven plan byte for byte, so the extra strictness costs nothing in fidelity while making drifted narration fail loudly.
- **Pilot artwork lives in its own key namespace.** The teacher-upload path excludes SVG because an uploaded SVG is executable content; widening it for server-written authored artwork would loosen a restriction that exists for an unrelated reason.
- **A demonstration-configured lesson is refused at the ordinary render endpoint** rather than falling back. An awkward error beats a wrong video under a right label.
- **Seeding writes the records the pipeline would have produced; it does not re-run the pipeline.** The narration is ST-095's measured take and the facts are authored, so a provider call would spend money to reproduce what already exists. Each `model_calls` row says `provider: "none"`, zero units, zero cost.

### Deviations from the story or technical guide

1. **The production compositions did not resolve their own duration, and now do.** `selectComposition` returned the `durationInFrames` literal declared on the `<Composition>` element — derived from the checked-in preview fixture — for *every* lesson, so a lesson of any other length rendered to the fixture's duration and then passed its own duration check, because that check compared against the same wrong number. AC4 is unsatisfiable without fixing it: two clips truncated to an unrelated fixture's length share nothing worth comparing. `calculateMetadata` was added to both production compositions and `renderImplementationVersion` bumped alongside, per CR-03. This is a pre-existing production defect fixed inside this story rather than an unrelated refactor, but it is a change to standard rendering and a reviewer should see it as one.
2. **The curated source is a generated one-page PDF, not an uploaded document.** The fact inventory is the source for these lessons. It is written as real PDF bytes rather than text labelled `application/pdf`, but no ingestion ran over it.
3. **Seeded scenes carry source citations the ST-095 fixtures did not.** Every lesson scene must cite a source block, and those fixtures never passed through the production grounding contract. The citations point at the seeded fact blocks, which is where the statements actually come from; the contract was not relaxed.
4. **The test-lesson routes are top-level, not under `/projects`.** The project-authorization hook claims every `/projects/<segment>` URL and treats a non-UUID segment as an inaccessible project. Creating a pilot lesson has no project to authorise against — that is its purpose.
5. **`videoApproach` is seeded as `demonstration` for a curated test lesson.** It is what a tester opens the project to try. The selector still offers both and the server still re-checks eligibility before generating anything.
6. **No human instructional review.** Whether demonstration explains better is the pilot's question and needs testers. Nothing here claims an answer.

### Known risks and follow-up

- **The curated lessons run ~70 s and ~63 s against a 180-second minimum configurable duration.** ST-084's reconciliation makes the mismatch an informational validation note once measured audio exists, so they validate — but the pair is shorter than any lesson a teacher could configure from scratch, and a reviewer should know that before generalising from it.
- **Two subjects, and nothing generalises for free.** A third needs a third authored binding with its own recipe and accuracy review. ADR-006's trade, unchanged.
- **Render capacity is still unresolved.** ST-095 could not separate the two approaches' per-frame cost on this hardware and this story did not improve on that. The byte ratios (1.44× and 1.24×) are the stable measurement.
- **The API loads ST-095's ~15 MB generated narration module when the pilot is enabled.** Loaded once, lazily, behind the cohort flag; a server with the pilot off never pays for it. Moving that media out of a bundled module remains open.
- **A comparison variant has no share link and no exports of its own.** Deliberate — a pilot producing publicly shareable artefacts would be much harder to withdraw — but it means a tester cannot send someone the demonstration clip without downloading it.
- **Only one render runs at a time per project** (`RENDER_CONCURRENCY`), so producing a pair is sequential. Correct, but slower than a tester may expect.
- **Three `@avlp/scene-library` tests still fail in this environment because of font-hash drift.** They were verified against the base files; refreshing that environment-sensitive expectation is independent work.
- **During verification a `git worktree remove --force` followed symlinks this session had created into the real `node_modules`, deleting dependency contents and `packages/config`'s tracked sources.** Everything was restored — `packages/config` from git, dependencies by a clean `pnpm install`, the one lost edit re-applied — and the full build and suites were re-run afterwards to confirm. Recorded because the recovery is part of the honest history of this run, not because anything remains broken.
