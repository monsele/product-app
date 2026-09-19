# ADR-007 — Comparison variants for the demonstration-led video pilot

- Status: Accepted
- Date: 2026-09-19
- Story: ST-096 — Select and Compare Standard and Demonstration Videos
- Supersedes: nothing. Extends ADR-006 (demonstration event plans) into production.
- Related: ADR-004 (measured narration controls playback duration), ADR-005 (versioned style packs), `docs/controlled-rendering-versioning-contract.md`

## Context

ST-095 proved that a lesson can be explained by objects that move, accumulate, split and change state, and that the animation can be anchored to measured narration without retiming the speech. It proved this in isolation: a separate schema subpath, a separate Remotion root, a development-only gallery, and media bundled as `data:` URIs. Nothing in production changed, which is what made its "no production behaviour moved" claim checkable.

The product owner asked for the next step: let an invited tester **choose** the approach for a lesson, produce both videos from the same approved content, and say which explains better. That requires the proven runtime to reach real tenant data, real storage, the real render worker, and the real delivery screens — without letting an experiment become a second, parallel product.

Four things had to be decided.

1. Where the second video lives, given that lesson versions are immutable and a comparison must not become the project's current state.
2. What makes the two videos two different things to the cache, when their lesson, narration and captions are identical by construction.
3. How the demonstration runtime reaches tenant-owned media, when ST-095's contract only admitted bundled `data:` URIs.
4. How a curated pilot subject becomes a project a tester can actually open.

## Decision

### 1. A comparison is an additive record beside the lesson, never a lesson state

Three new tenant-owned tables: `demonstration_comparisons`, `demonstration_variants`, `demonstration_feedback`. A comparison references an immutable `lesson_versions` row as its baseline and copies that row's content hash. Two variant rows hang off it, one per approach.

Creating or retrying a comparison writes only to these tables and to `render_jobs`. It never updates `lesson_specs`, `lesson_versions`, `projects.current_lesson_version_id`, or an existing render. Restoring a version, editing a storyboard, or rendering again all continue to behave exactly as they did; a completed pair simply stops describing the current lesson and says so.

**Alternative rejected:** emulating a comparison by restoring the alternative into the project's current state and rendering it. This is what the story explicitly forbids, and for good reason — it would make "compare two approaches" indistinguishable from "replace my lesson with the experiment", and there would be no honest way back.

**Alternative rejected:** a `videoApproach` discriminator inside `LessonSpec`. ST-095 deliberately kept demonstration plans out of `sceneSpecSchema` so the AI could not emit one through a production path. Putting them back in would undo that, and would force a LessonSpec schema version bump for an experiment that may not ship.

### 2. The approach is part of render identity

`demonstrationVariantIdentityInputSchema` is the one shape hashed for a variant, and `approach` is inside it alongside the baseline version and hash, the narration checksums, the caption hash, the resolved plan hash, the theme, the renderer version and the output profile. Signed URLs, request tokens and timestamps are not in it.

The same separation is pushed down into the job layer: `renderIdempotencyKey` gained an optional `variant`, and when present the approach, the comparison and the plan hash join the hashed options. With `variant` absent the key is byte-identical to the one it has always produced, so every render queued before this story keeps its identity.

This matters because the two halves of a pair are *designed* to differ in exactly one input. A content hash that did not include the approach would give them the same key, and the second request would be served the first one's video — a defect that looks like success.

**Consequence:** a comparison's standard variant has a different key from the project's ordinary render of the same version. To avoid paying twice for identical bytes, creating a comparison **adopts** an existing completed plain render of the same baseline as the standard variant rather than queuing a new one. Only a render that belongs to no comparison is adoptable; a render that is already a comparison's evidence is never re-pointed.

### 3. Demonstration media resolves through the tenant-scoped path

ST-095's own record listed bundled `data:` media as limitation L3 and said production must resolve media through the existing tenant-scoped asset path. This ADR does that:

- `demonstrationAudioSrcSchema` and `demonstrationImageSrcSchema` now accept a resolved `http(s)` URL as well as a bundled data URI. The renderer signs each object at execution time, exactly as `hydrateProductionComposition` already does for the standard approach.
- The resolved location is never part of content identity. The variant plan stores storage keys and checksums; the URL is produced at render time and discarded.
- A variant's artwork lives under `users/<user>/projects/<project>/demonstration/assets/…`, a **new** key namespace rather than the teacher-upload `assets/` one. The upload path is restricted to raster formats because an uploaded SVG is executable content; widening it to admit the pilot's authored vector artwork would loosen a restriction that exists for an unrelated reason. These bytes are written by the server from its own bundle and are verified by checksum before the render references them.

**Consequence:** the production Remotion bundle now contains the demonstration composition, because the render worker must be able to select it. It does **not** contain ST-095's fixtures or its fifteen megabytes of bundled narration — `composition.tsx` imports neither, and the production root's placeholder props are deliberately empty.

### 4. Eligibility is a registered binding, never a keyword

`demonstrationPilotBindings` registers, per curated subject: the recipe for each scene, the semantic model of its content, the authored events with their beat anchors, and the checksum of the narration recording those beats were measured from.

A lesson resolves to a binding by its **ordered stable scene IDs**, and each scene's stored audio checksum must equal the registered one. A lesson called "Savings" that is not the curated savings lesson resolves to nothing. A reordered, truncated or extended lesson resolves to nothing.

The plan is then **rebuilt** by ST-095's `buildDemonstrationPlan` against the project's own narration, not copied. When the narration is the registered recording the rebuild reproduces the proven plan exactly, and a test asserts that byte-for-byte. When it is not, the build fails with ST-095's actionable issues rather than animating against audio it was never timed to (ADR-004).

### 5. Curated subjects become real projects

`POST /projects/demonstration-test-lessons` seeds one of the two subjects as an ordinary project: source document, parser artifact, parsed document, sections and blocks, approved snapshot, configuration, objectives, outline, narration, storyboard, scenes, scene audio and captions — in the same tables, under the same contracts.

It does **not** run ingestion, AI generation or text-to-speech. The narration is ST-095's measured recording, the facts are authored rather than extracted, and re-running a paid provider to reproduce content we already have would be exactly the unmetered spend the repository rules forbid. Each `model_calls` row records `provider: "none"`, zero units and zero cost, which is what actually happened.

Everything downstream of the seed is the real product: the deterministic validation engine, the production render worker, the pilot API.

### 6. The renderer's implementation version is bumped

`renderImplementationVersion` moves from `st-024-remotion-4.0.507-scene-library-v1` to `st-096-remotion-4.0.507-scene-library-v1`, because two things behind it changed what a manifest renders to:

- A demonstration composition joined the bundle.
- **The production compositions now resolve their duration from the props being rendered.** They previously reported the `durationInFrames` literal declared on the `<Composition>` element — derived from the checked-in preview fixture — for every lesson, so a lesson of any other length rendered to the fixture's duration and then passed its own duration check, because that check compared against the same wrong number. ST-096 cannot claim a controlled pair without fixing this: AC4 says both approaches share their scene boundaries, and two clips truncated to an unrelated fixture's length share nothing worth comparing.

Per CR-03, a changed renderer produces a new immutable release rather than reusing the previous identity. Stored outputs made under `st-024` are unchanged and remain downloadable.

## Consequences

**Good.**

- The experiment is reversible. Turning `DEMONSTRATION_PILOT_ENABLED` off stops new experimental work while completed comparisons stay readable; removing the feature means dropping three additive tables and one column whose every existing row already says `standard`.
- Legacy behaviour is preserved by construction, not by care: absence of `videoApproach` *means* standard, so no snapshot is rewritten and no migration backfills anything.
- A demonstration-configured lesson cannot be rendered through the ordinary endpoint at all. It is refused with an explanation rather than producing standard visuals under a demonstration label.

**Costs and limits.**

- **Two subjects, and nothing generalises for free.** A third pilot subject needs a third authored binding with its own recipe, accuracy review and measured narration. This is ADR-006's deliberate trade and it is unchanged.
- **The seeding path writes records the pipeline would have produced, rather than driving the pipeline.** That is stated here, in the seeder's own documentation, and in ST-096's completion record, because a reader who assumed otherwise would draw the wrong conclusion about what the pilot proves.
- **The curated lessons are about 70 seconds long, against a 180-second minimum configurable duration.** ST-084's reconciliation makes this an informational validation note rather than a blocking error once measured audio exists, so the lessons validate — but a reviewer should know the pair is shorter than any lesson a teacher could configure from scratch.
- **The API process loads ST-095's generated narration module when the pilot is enabled**, which is roughly fifteen megabytes of base64 audio. It is loaded once, lazily, behind the cohort flag, so a server with the pilot off never pays for it.
- **Render capacity is unresolved**, as it was in ADR-006. Nothing in this story measured it on quiet hardware.

## Open questions

- Whether the demonstration approach explains better than the standard one. That is the pilot's question, to be answered from tester feedback, and nothing here claims an answer.
- Whether comparison variants should eventually become first-class lesson outputs with their own share links and exports. Deliberately out of scope: a pilot that produced publicly shareable artefacts would be much harder to withdraw.
- How motion energy (CR-05) interacts with a controlled pair. ST-097 owns it; this story freezes appearance at `mvp-default` for both halves so the comparison isolates explanation.
