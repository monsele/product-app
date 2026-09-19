# The demonstration-led video pilot

Status: experimental, invite-only. Delivered by ST-096 on the runtime ST-095 proved.

This document describes what the pilot is, what it can and cannot do, how to turn it on, and what a tester actually does. It describes the implementation as built; where something is a limitation it is named as one rather than left to be discovered.

## What it is

A teacher's lesson is normally explained by the scene templates: text, diagrams, images, callouts. The demonstration-led approach explains the same lesson by showing objects **move, accumulate, split and change state** alongside the same narration — notes leaving an income tray and landing in a savings jar, water particles detaching from a surface and dispersing.

The pilot exists to answer one question with testers: does explanatory movement help? To make that question answerable, both videos are produced from the same approved lesson version, with the **same narration recording, the same caption cues, the same scene boundaries and the same `mvp-default` appearance**. Only the way the pictures explain the lesson differs.

## What it is not

- **It is not available for arbitrary lessons.** Two curated subjects are registered — savings and evaporation. A lesson that is not one of them resolves to no recipe, and the selector says so.
- **It does not generate animation from a prompt.** Each subject has an authored binding: a registered recipe, a semantic model of the content, and events anchored to named narration beats. There is no open-ended animation vocabulary.
- **It does not retime narration.** If a scene's narration recording is not the one the animation was measured against, the plan is refused with a reason. Speech is never accelerated, trimmed or resynthesised to make an animation fit (ADR-004).
- **It is not evidence of learning gains.** Ratings and preferences are qualitative pilot evidence. No claim beyond that is made anywhere.

## Turning it on

Two environment variables on the API, both closed by default:

| Variable | Meaning |
| --- | --- |
| `DEMONSTRATION_PILOT_ENABLED` | `true` allows **new** experimental work. Setting it back to `false` stops new comparisons and variants while leaving completed ones readable to the testers who produced them. |
| `DEMONSTRATION_PILOT_USER_IDS` | Comma-separated user IDs in the cohort. Only these accounts see the experimental option at all. |

An API started with neither set reports the experiment as invisible and unselectable, with a reason. Both checks run server-side on every read **and** every write: hiding the radio button is not authorisation.

Already-queued work is unaffected by turning the flag off — a render that is in flight completes and attaches to its variant, because the flag gates the API's command handlers, not the worker. Turning the flag off therefore drains rather than cancels.

## What a tester does

1. **Open a supported lesson.** If the tester's own lesson is unsupported, the configuration screen offers a direct action to create one of the curated subjects as a real project. It is an ordinary project: it appears in the workspace, has a source document, a storyboard, narration audio and captions, and can be previewed, validated and rendered like any other.

2. **Choose the approach.** A radio group in lesson configuration, separate from the visual theme and the narrator voice, offers *Standard explanation* and *Demonstration-led explanation · Experimental*. Standard is the default for new lessons; lessons created before the pilot read as standard without their stored configuration being rewritten.

3. **Run preflight.** The deterministic validation engine runs unchanged. The curated lessons run about seventy seconds against the 180-second minimum configurable duration, which ST-084's reconciliation reports as an informational note once measured audio exists, not a blocking error.

4. **Produce the first video.** A lesson set to the demonstration approach cannot be rendered through the ordinary "render" button — that path has no resolved plan, and producing standard visuals under a demonstration label would be a silent substitution. The tester is told to create a comparison instead.

5. **Create the comparison.** From *Compare video approaches* on the delivery screen. The action states which approach will be produced, that the approved narration and captions are reused exactly as they are, and that a render will be spent. If the project already has a completed render of the same lesson version, that render is **adopted** as the standard half rather than re-rendered.

6. **Compare.** Both videos appear side by side with clear labels and independent progress, failure and retry states. Scene buttons seek both players together; switching which one you are listening to preserves the scene and position. Only the focused player is unmuted.

7. **Respond.** Optional 1–5 ratings for clarity, engagement and narration synchronisation on each approach, an overall preference, and an optional comment. Responses can be updated and are attached to the exact comparison and variant versions they were given about. Comments are tenant data: they are never written to logs.

## What "controlled" means, and when a pair stops being one

A comparison records the baseline lesson version's ID and content hash, the source snapshot, the per-scene audio checksums and durations, the caption hash, the scene correspondence and the fixed theme.

If the lesson is edited afterwards, the pair **stays viewable** — it is a record of that version — but the screen stops presenting it as a like-for-like comparison and says why. Comparing the current lesson requires a new comparison from a new baseline; an old pair is never mutated to catch up.

## Identity, caching and cost

The two halves of a pair differ in exactly one input, so their render identities must differ in exactly one input too. The approach is inside the hashed variant identity and inside the render job's idempotency key, alongside the baseline version and hash, narration checksums, caption hash, resolved plan hash, theme, renderer version and output profile. Signed URLs, request tokens and timestamps are excluded — a credential refresh must not invalidate a render.

Repeated clicks and concurrent requests reuse the active or completed variant rather than queuing a second one. Retrying one variant leaves the other untouched. No AI, TTS or image-provider call happens during any of this: the narration already exists and is reused byte-identically.

## Known limitations

- **Two subjects.** A third needs a third authored binding with its own recipe, accuracy review and measured narration. This is the deliberate cost of refusing a general animation DSL (ADR-006).
- **Seeded rather than ingested.** The curated test lessons are written directly into the same tables the pipeline writes, with the same contracts and content hashes, but the ingestion, AI-generation and text-to-speech stages are not re-run. The narration is ST-095's measured recording and the facts are authored, so re-running a paid provider would spend money to reproduce content that already exists. Each `model_calls` row records `provider: "none"` and a zero cost.
- **Synthesized speech.** The narration is local Windows Speech API output, as in ST-095. It proves duration authority, beat anchoring and caption correspondence; it does not prove the prosody of a professional read.
- **Short lessons.** Roughly seventy seconds each, against a 180-second minimum configurable duration.
- **Render capacity is unmeasured.** ST-095 could not separate the two approaches' per-frame cost on its hardware, and nothing here improved on that.
- **No sharing or export of a variant.** A comparison variant has no share link and no caption/narration export of its own. This is deliberate: a pilot that produced publicly shareable artefacts would be much harder to withdraw.

## Where the pieces live

| Concern | Location |
| --- | --- |
| Approach on the configuration contract | `packages/schemas/src/index.ts` (`videoApproachSchema`, `readVideoApproach`) |
| Comparison, variant, eligibility and feedback contracts | `packages/schemas/src/demonstration-pilot.ts` |
| Registered bindings and plan rebuilding | `packages/scene-library/src/demonstration-proof/pilot-bindings.ts` |
| Runtime, recipes, validation, state | ST-095's `demonstration-proof` module, unchanged in behaviour |
| Eligibility, comparisons, variants, feedback | `apps/api/src/demonstration-pilot.ts` |
| Curated test lessons | `apps/api/src/demonstration-test-lessons.ts` |
| Approach-aware render manifest | `apps/api/src/renders.ts` |
| Demonstration rendering | `apps/renderer/src/fixture.ts`, `media.ts`, `render-worker.ts` |
| Production composition | `packages/scene-library/src/scene-preview-composition.tsx` |
| Selector and comparison screens | `apps/web/app/workspace/[projectId]/configuration/`, `.../compare/` |
| Architecture decision | `docs/adr/ADR-007-demonstration-pilot-comparison-variants.md` |
