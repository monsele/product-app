# Demonstration-led animation: proof evaluation (ST-095)

**Written for:** the product owner deciding whether ST-096 should build tester
selection on this runtime, and the engineer who will do it.

## What was built, in one paragraph

A typed, versioned contract for describing *what changes* in a lesson — objects
with stable identities, and events drawn from a closed allowlist of actions —
plus a deterministic runtime that turns a plan and a frame number into the state
of every object, and two authored recipes that draw that state. Money moves
between containers and balances follow it; water particles leave a liquid and
spread out above it. Both are rendered against `mvp-default`, with the same
narration recording, caption cues and scene boundaries as a standard lesson
built from the existing production scene templates, so the two clips differ only
in what the pictures do.

## The evidence

Four MP4s, produced by one command from checked-in inputs:

```
pnpm --filter @avlp/scene-library run render:demonstration-proof
```

They land in `artifacts/st-095/` (git-ignored). Absolute paths for this run,
and the measurements taken while producing them, are in the
[Measurements](#measurements) section.

Reproducing the inputs themselves:

```
pnpm --filter @avlp/scene-library run generate:demonstration-assets
pnpm --filter @avlp/scene-library run generate:demonstration-narration
```

The narration generator needs Windows: it drives the operating system's own
speech API. Everything else is platform-independent. The generated files are
checked in, so a render does not require regenerating them.

## How the timing was obtained

This is the part most likely to be taken on trust, so it is worth being precise.

The story forbids reporting a character-count estimate as alignment. The
existing `narrationRevealFractions` in `graph-timing.ts` is exactly such an
estimate — it splits narration into sentences and blends their cumulative
character positions with an even spacing. It is fine for fading in graph nodes.
It is not adequate for "the note leaves the tray as the sentence says so."

So the audio is built around the boundaries rather than the boundaries being
guessed from the audio:

1. Every phrase is synthesized to **its own WAV file** by the Windows Speech
   API — a local, offline component of the operating system. No paid provider
   is called and nothing leaves the machine.
2. Each phrase's duration is read from the PCM data itself: byte length minus
   header, divided by byte rate.
3. The scene track is assembled by concatenating those phrases with authored
   silences, so a phrase's start is the exact cumulative sample offset of
   everything before it.

A beat boundary is therefore correct by construction. There is no alignment step
that could be approximate.

`demonstrationTimingProvenance` records this in the contract, and the
`method` field is a closed enum with two members —
`measured-phrase-boundaries` and `manual-waveform-alignment`. There is no enum
member for an estimate, so an estimated track cannot be expressed in this
contract at all.

Each plan additionally records the sha256 of the recording it was built
against. Re-cutting the audio makes every plan bound to it stale, which is a
`stale_narration_timing` failure with a correction, not a silent re-anchor.

## What the runtime guarantees, and how it is checked

### The arithmetic cannot be wrong on screen

A plan declares the container totals and particle phase counts it expects to
end at. The validator replays the entire plan through the same runtime the
renderer uses and refuses the plan if the result disagrees. Conservation is
checked at every event boundary, not only at the end, so money cannot be created
and destroyed again in the middle and still pass.

The displayed balances are not authored. `Readout` is handed
`state.ledger.settledByContainer[containerId]` — the same evaluated ledger that
decides where each note is drawn. There is no code path by which a balance and
its notes could disagree, and a test walks every third frame of every savings
scene asserting that the notes visible in a container sum to exactly its
displayed balance.

Amounts are integer minor units. A float would make this approximate.

### In-transit money is named, not hidden

While notes are travelling they belong to neither container's settled balance
and are tracked in `inTransitMinor`. Settled totals plus in-transit is invariant
across the clip. The recipe draws the amount in transit on screen — "₦2,000
moving across" — because the alternative is two balances that briefly do not add
up to the total and no explanation of why.

Attributing in-transit money to the destination early would show a balance the
learner has no reason to believe yet; leaving it in the source until it lands
would make the arrival look like duplication. Naming the third state is the
honest option.

### Frame N does not depend on frame N−1

`evaluateDemonstrationState(plan, frame)` starts from the validated initial
state on every call and replays the events whose windows have opened. It reads
no cache, no previous frame, no wall clock.

Decorative offsets come from a seeded hash of the plan seed and the object ID —
deliberately not of the frame, so they neither shimmer nor vary between renders.

Tested by evaluating the same sampled frames forward, backward, in a seeded
shuffle, and interleaved between two different plans, requiring byte-equal
JSON every time; and at the render level by producing a still, rendering a later
frame, then re-rendering the first and requiring the PNGs to be byte-identical.

### Objects are preserved, not replaced

A token's slot within a container is decided once, when the plan is compiled,
from the set of tokens that ever occupy it — not from current occupancy. The
alternative makes the remaining notes shuffle sideways every time one leaves,
which reads as replacement rather than movement. A test walks the clip asserting
that a settled token never changes slot within a given container.

A water particle keeps its fill, its size and its `substance: "water"` after it
escapes; only a thin outline changes. `substance` is a literal in the contract
and no action can alter it.

### Cause precedes consequence

`disperse` on a particle still in the liquid is an `impossible_transition`: the
particle must have detached first. Two state-changing events touching the same
object within one another's hold window is `conflicting_events`. Every
state-changing event must declare settled inspection frames afterwards, and a
plan that cannot afford them fails rather than overlapping.

## Accuracy review

### Evaporation

Reviewed against OpenStax *Chemistry 2e* §10.3 "Phase Transitions" (evaporation,
vapour pressure, the kinetic-molecular explanation) and OpenStax *Physics* §13.5
"Phase Change and Latent Heat". Both are openly licensed; no text is reproduced.

| Claim in the clip | Status |
| --- | --- |
| Water is made of particles moving at a range of speeds | Correct |
| A fast-moving particle at the surface can escape into the air | Correct |
| The escaped particle is still water; only its position and phase changed | Correct; enforced by the contract's fixed `substance` |
| Evaporation does not require boiling | Correct, and stated explicitly in narration |
| Particle count is conserved | Correct; checked by `expectedFinalState.particlePhases` |
| The particle view is a simplified model | Stated in an authored note **and** burned into the frame asset |

The model's simplifications, stated on screen: the particle count is tiny
against the ~10²⁵ molecules in a real glass; particles are drawn as identical
circles rather than as molecules; no condensation back into the liquid is
modelled, which the recipe enforces by refusing a vapour → liquid `detach`.

One further simplification is visible in the frames rather than stated on
screen, and is recorded here instead: **the liquid is drawn as a fixed lattice,
so a particle that escapes leaves an empty cell behind.** Real water closes up.
The lattice is deliberate — a particle's slot is assigned once, from the set of
regions it ever occupies, so the particles that stay put do not shuffle
sideways every time a neighbour leaves, and object continuity is an acceptance
criterion while lattice realism is not. The trade is worth naming: a viewer may
read the gaps as holes in the water. If a later revision wants the liquid to
close up, it has to solve the shuffle it reintroduces, not just reflow.

### Savings

The figures are illustrative and labelled as such on screen and in narration
("Example figures, used to show how saving works. Not financial advice."). No
rate, product, institution or recommendation appears. The only claims are
arithmetic, and they are the claims the validator checks.

## Clip review

Criteria were fixed before viewing, from the story's "Natural movement"
section: object continuity, cause before consequence, one principal change at
a time, meaningful origins and destinations, restrained easing, inspection time
after each key event, and readable captions with explanatory objects clear of
the caption band.

These are developer judgements against those criteria. They are **not** measured
learning outcomes, and no claim of a learning gain is made anywhere in this
document. The human instructional review is ST-096's, with testers.

### What the review found, and what was done

Seven defects were found by looking at rendered output rather than by reading
the code, two of them only after cutting a finished MP4 into frames rather than
inspecting hold stills. All seven are fixed. They are listed because the fact
that reading the code did not catch them is itself a finding about how this
kind of work has to be checked.

| # | Criterion | Found | Fix |
| --- | --- | --- | --- |
| F1 | Object continuity | A note arrived in the savings tray **visibly larger** than it left the income tray. Notes were sized to their cell, and the savings tray holds fewer notes, so its cells are bigger. The same ₦1,000 note changing size reads as the money changing rather than moving. | One width for the whole scene, taken as the smallest any holder can afford (`uniformTokenWidth`). Costs some empty space in the roomier tray. |
| F2 | Focal clarity | The savings jar sat behind the notes as a watermark, where the frame edge clipped it and its baked-in word "SAVINGS" floated out from behind the notes as a stray label. | The word is gone from the artwork — the region already has a heading — and the jar is now a small icon beside that heading, where it does its one useful job. |
| F3 | Focal clarity | The magnified particle view was framed by a circular magnifier drawn *across* both regions. Its ring cut through the particles and its "MAGNIFIED MODEL" label landed on top of them: the thing meant to say "this is a model" was obscuring the model. | A dashed panel the regions sit inside, with the label in its top-left corner. |
| F4 | Destinations, safe areas | At full dispersion the outermost vapour particles were pushed **off the canvas** — water leaving the picture entirely, which is the opposite of what the scene teaches. Caught by the browser preflight. | Dispersal is clamped inside the vapour region with room for the particle's radius. Spreading is bounded by the space it happens in. |
| F5 | Caption readability | The savings goal readout — label, value, progress bar, goal line — measured ~155px and crossed the caption band. Caught by the browser preflight, not by the arithmetic. | Readouts moved up and the containers tightened. |
| F6 | Focal clarity | In the accumulate scene, the wages tray's "₦2,000 still to come" sat **inside** the frame and travelling notes passed straight through the text; the separate "moving across" line crossed the tray's bottom border. Found by cutting the finished MP4 into frames, not by looking at hold frames. | Both moved onto the region heading row, the one band in a region that objects never occupy. The wages tray is now the same width as the income tray directly below it, so arriving wages read as a straight drop. |
| F7 | Correct meaning | The in-transit amount was drawn against the savings tray whatever its actual destination, so while wages were arriving into **income** the savings tray claimed "₦2,000 arriving" — a false statement about money the learner can watch moving. | The ledger now carries `inTransitByDestination`, and the label can only appear on the container the notes are heading for. A test asserts the breakdown sums to the total and names only real containers. |

One more defect was found by reading the code and is recorded for the same
reason: an `emphasise` event naming a **container or region** validated cleanly
and then drew nothing, because only tokens and particles carried their own
emphasis. An authored beat with no visible effect is worse than a rejected one.
Fixed with `state.emphasisByObjectId`, which covers every object kind, plus a
regression test.

### What the review confirmed

- **Object continuity.** Tokens and particles keep their identity through every
  transfer and phase change; nothing is faded out and replaced. Slots are stable,
  so the remaining notes do not shuffle when one leaves.
- **Cause before consequence.** A particle detaches before it disperses — the
  runtime refuses the reverse — and each week's wages arrive before any of that
  money is saved.
- **One principal change at a time.** Overlapping changes to the same object
  inside its readable hold are a validation failure, not a style choice.
- **Meaningful origins and destinations.** Money comes out of a named origin
  tray that states how much is still to come and says "All paid in" when it is
  empty; particles leave a labelled liquid body for a labelled vapour space.
- **Inspection time.** Every state change is followed by settled frames the
  validator enforces, and the clip cannot be shortened to remove them.

### Reviewing it yourself

The hold frames in `artifacts/st-095/frame-*.png` are the moments the movement
has finished and the resulting state is what the learner is looking at. The
facts each pair must carry are in `savingsFactInventory` and
`evaporationFactInventory`, and the development gallery lists them beside the
player along with the evaluated ledger at the current frame — which is the
quickest way to check that the balance on screen is the balance the runtime
computed.

## Limitations

**L1 — Two subjects, two recipes.** Nothing here generalises to a third subject
for free. A new subject means a new authored recipe with its own actions,
validation rules and accuracy review. That is the deliberate cost of refusing a
general animation DSL, and it is the most important number in this document for
planning purposes.

**L2 — Synthesized speech, not a recorded voice.** The narration is intelligible
and correctly timed, and it proves duration authority, caption correspondence
and beat anchoring. It does not prove the prosody of a professional read. A real
recording would change nothing structural — the pipeline measures whatever audio
it is given.

The synthesizer is the Windows Speech API, so **regenerating the narration is
the one Windows-only step in this proof**; the script now says so and exits with
that message rather than failing on a missing `powershell.exe`. The generated
tracks are committed, so rendering the clips, running every suite and
reproducing the evidence work on any platform.

**L3 — Bundled `data:` media is not a production pattern.** It is used so the
preview, the server render and the Node tests consume byte-identical media with
no path resolution. Production must resolve media through the existing
tenant-scoped asset path. The development route is gated to 404 outside
development for the same reason ST-094's was.

The cost of that choice is a 15.3 MiB generated source file:
`src/demonstration-proof/narration.generated.ts` is 16,020,854 bytes — the six
tracks as base64, about 11 MB of audio before encoding. It is permanent in git
history and is parsed on every typecheck, lint and bundle of the package. The
decision and its alternatives are recorded in ADR-006's consequences rather than
left to be discovered.

**L4 — One motion-energy setting.** `durationFrames` and `holdFrames` are
per-event, so CR-05's calm/balanced/lively axis is expressible, but only one
setting was exercised. ST-097 owns proving that changing it preserves the event
anchors.

**L5 — One machine, one Chromium, one FFmpeg.** Per CR-08, no cross-environment
byte-identity is claimed. The determinism claims are within a fixed environment.

**L6 — No human instructional review yet.** Whether the demonstration approach
actually explains better than the standard one is the question ST-096 exists to
answer with testers. This proof establishes that the demonstration is accurate,
deterministic and reproducible — not that it teaches better.

## Integration contract for ST-096

Everything ST-096 needs is at
`@avlp/scene-library/demonstration-proof`, and the example consumer in
`demonstration-integration.test.ts` uses nothing else. That test deliberately
starts from a tenant-shaped record of its own and never imports a fixture; if it
ever needs to, the contract has a hole.

| Capability | Export | Behaviour |
| --- | --- | --- |
| Recipe catalogue | `listDemonstrationRecipes()` | Stable ID and version, supported object kinds and actions, asset slots with what each must depict, timing floors, subject accuracy rules |
| Support query | `queryDemonstrationSupport(recipeId, profile, version?)` | Pure capability check over a structural profile. Returns `{supported, reasons}`, each reason with a correction. Takes no title, narration or topic, so support cannot be inferred from a keyword. Refuses content the stage cannot lay out (`too_many_for_recipe`) as well as content it is missing |
| Profile builder | `profileInitialState(initialState, durationSeconds)` | Builds the structural profile the query takes: object-kind counts and per-role container/region counts, nothing else |
| Plan builder | `buildDemonstrationPlan(draft, narration)` | Resolves event frames from measured beats, validates, returns an immutable plan or the issues |
| Plan validation | `validateDemonstrationPlan(plan, narration)` | Stale media, unsupported versions, unknown references, wrong-kind references, impossible transitions, conflicts, impossible quantities, declared-total mismatch, and roles the recipe has no place for |
| Shared composition | `DemonstrationComposition`, `DemonstrationRenderComposition`, `DemonstrationSceneAtFrame` | Same resolved plan in browser and server; render mode throws rather than drawing a flagged plan |
| Preflight | `prepareDemonstrationComposition(input)` | The single "is this renderable?" decision, used by the gallery, the tests and the render script |
| Input identity | `hashDemonstrationInput`, `buildDemonstrationManifest` (at `…/demonstration-proof/manifest`) | Content, plan and recipe versions, seeds, audio checksums and timing method, asset checksums, fonts with checksums, theme, output profile, renderer identity, and `approach` |

`approach` is part of the manifest identity on purpose: a demonstration clip and
a standard clip of the same facts must never share a render identity.

### What ST-096 still had to decide, and what it decided

Each open question above was answered in ST-096. ADR-007 records the decisions
in full; this is the short form, added here so a reader of this evaluation is
not left with a list of unresolved questions that are no longer open.

- **Where a plan is persisted.** `demonstration_variants.plan`, as a
  `demonstrationVariantPlanSchema` document, on an additive tenant-owned record
  beside the lesson rather than inside `LessonSpec`. No LessonSpec schema
  version was bumped and no lesson-version snapshot was rewritten.
- **Tenant ownership, authorisation and cohort gating.** Two closed-by-default
  environment switches — one feature flag, one cohort list — re-checked
  server-side on every read and every write. The support query stayed a pure
  capability check and still takes no tenant.
- **Job lifecycle.** The existing `render_jobs` path, with the approach inside
  both the hashed variant identity and the render idempotency key so the two
  halves of a pair cannot collide. An existing completed plain render of the
  same baseline is adopted as the standard half rather than re-rendered.
- **Whether the AI planner may pick a recipe.** It may not. Eligibility is a
  registered binding matched by ordered stable scene IDs and narration
  checksums, and the plan is rebuilt by `buildDemonstrationPlan` against the
  project's own audio. A test asserts the rebuild reproduces the plan proved
  here byte for byte.

### One limitation this evaluation reported that ST-096 had to lift

Limitation L3 said bundled `data:` media is not a production pattern and that
production must resolve media through the tenant-scoped asset path. ST-096 did
that: `demonstrationAudioSrcSchema` and `demonstrationImageSrcSchema` now also
accept a resolved `http(s)` URL, signed at execution time from a verified
storage key, exactly as the standard approach's media already was. The
resolved location is still excluded from content identity.

## Measurements

One machine, one Chromium build, one FFmpeg build. Per CR-08 no cross-environment
byte-identity is claimed, and the caveat below about run-to-run variance matters
more than any single number here.

### The four clips

| Clip | Duration | Frames | Output | ms/frame | Peak RSS |
| --- | ---: | ---: | ---: | ---: | ---: |
| `savings-demonstration.mp4` | 71.06s | 2130 | 5.83 MiB | 99.0 | 764 MiB |
| `savings-standard.mp4` | 71.06s | 2130 | 3.88 MiB | 92.6 | 755 MiB |
| `evaporation-demonstration.mp4` | 63.06s | 1890 | 4.39 MiB | 88.8 | 793 MiB |
| `evaporation-standard.mp4` | 63.06s | 1890 | 3.47 MiB | 88.1 | 797 MiB |

From the most recent run, which is the one `artifacts/st-095/measurements.json`
and `ffprobe.json` describe. Browser layout preflight: 1434 ms for the three
savings scenes, 890 ms for the three evaporation scenes — now covering region
frames as well as objects and readable content.

### FFprobe postflight

All four: `h264` / `aac`, 1920x1080, 30 fps, with an audio stream whose duration
equals the video's to the millisecond. Within each subject the demonstration and
the standard clip have **identical** duration — 71.062s for savings, 63.062s for
evaporation — which is the mechanical half of the AC6 claim that the pair shares
its timeline.

One discrepancy, already flagged by ST-094 for ST-098 and reproduced here: every
clip probes as `yuvj420p` while `renderProfileSchema` in
`apps/renderer/src/contracts.ts` declares `yuv420p`. This is the repository's
normal encoder output — the existing `mvp-default` baseline probes identically —
and `verifyRenderedVideo` never probes `pix_fmt`, so the declared-versus-actual
gap has never surfaced. Out of scope here.

### Render cost: what these numbers do and do not support

**They do not support a claim that the demonstration approach costs more to
render.** The per-frame figures above are dominated by machine contention, not by
the composition. The same four clips rendered three times on this machine, from
identical inputs:

| Clip | Run A | Run B | Run C |
| --- | ---: | ---: | ---: |
| savings demonstration | 99.3 ms/frame | 94.3 | 99.0 |
| savings standard | 93.0 | 127.8 | 92.6 |
| evaporation demonstration | 88.1 | 156.8 | 88.8 |
| evaporation standard | 89.5 | 100.2 | 88.1 |

The spread within a single clip across runs (88.1 → 156.8, a 78% swing) is larger
than any difference between the two approaches in any run, and the ordering
reverses: run B has the *standard* savings clip slower than the demonstration
one, runs A and C have it faster. Run C was taken on a quieter machine and is
much tighter — the approaches land within 7% for savings and within 1% for
evaporation — which is what you would expect if the differences in runs A and B
were contention rather than composition. On this evidence the honest statement is
that **demonstration and standard rendering cost the same order of magnitude per
frame, and this machine cannot resolve a finer difference than that.**

A real capacity answer needs a quiet machine and repeated runs. That is worth
doing before production volume is committed, and it belongs to ST-096/ST-098
rather than here.

Output size is the one measurement that is stable and meaningful: the
demonstration clips are **1.50x** (savings) and **1.27x** (evaporation) the bytes
of their standard counterparts at equal duration and encoder settings, which is
what moving objects cost an inter-frame codec. The two subjects differ because
the savings clip keeps ten labelled notes in motion across the frame while the
evaporation clip moves sixteen small circles inside two panels.

### Output locations

Absolute paths for this run (git-ignored, reproducible from checked-in inputs):

```
D:\Eronmonsele\Documents\SoundMinds\product-app\artifacts\st-095\
  savings-demonstration.mp4          savings-standard.mp4
  evaporation-demonstration.mp4      evaporation-standard.mp4
  savings-demonstration.manifest.json
  evaporation-demonstration.manifest.json
  frame-savings-scene{1,2,3}.png     frame-evaporation-scene{1,2,3}.png
  measurements.json                  ffprobe.json
```

To cut a finished clip into frames for review — which is how the last three
defects in the table above were found:

```
node .claude/skills/inspect-render/watch-video.mjs \
  --file artifacts/st-095/savings-demonstration.mp4 --every 8 \
  --out artifacts/st-095/clip-frames-savings
```

## Commands run

| Command | Result |
| --- | --- |
| `pnpm --filter @avlp/schemas exec tsc --noEmit` | clean |
| `pnpm --filter @avlp/scene-library exec tsc --noEmit` | clean |
| `pnpm --filter @avlp/web exec tsc --noEmit` | clean |
| `pnpm --filter @avlp/schemas run lint` | clean |
| `pnpm --filter @avlp/scene-library run lint` | clean |
| `pnpm --filter @avlp/web run lint` | clean |
| `pnpm --filter @avlp/scene-library exec vitest run src/demonstration-proof/demonstration-{contract,state,timing,integration}.test.ts` | **73 passed** |
| `pnpm --filter @avlp/scene-library exec vitest run src/demonstration-proof/demonstration-layout.test.ts` | **8 passed** (browser geometry preflight at the real 1920x1080 canvas) |
| `pnpm --filter @avlp/scene-library exec vitest run src/demonstration-proof/demonstration-media.test.ts` | **7 passed** (real encodes + FFprobe, browser/server parity, repeat-render determinism) |
| `pnpm --filter @avlp/scene-library run test` (full package) | 290 passed, 3 failed — **the same three suites fail on the stashed base tree** (`full-lesson-render`, `scene-preview-render-smoke`, `summary-scene-render`: rendered-frame hash snapshots, font-hash drift in this environment). Verified by `git stash push -u`, re-running, and popping: base tree 202 passed / 3 failed, same three. |
| `pnpm --filter @avlp/schemas run test` | 312 passed, 2 failed — **the same 2 fail on the branch base** (`visual-role.test.ts` expects 4 asset provenances where the source has 5; `lesson-spec.test.ts` finds the committed JSON schema out of sync). ST-093 debt in files this story does not touch. |
| `npx playwright test e2e/demonstration-proof-preview.spec.ts` | **6 passed** |
| `pnpm --filter @avlp/scene-library run generate:demonstration-assets` | 4 assets, 2.6 KB |
| `pnpm --filter @avlp/scene-library run generate:demonstration-narration` | 6 tracks, 20 phrases, ~11 MB |
| `pnpm --filter @avlp/scene-library run render:demonstration-proof` | 4 MP4s, 2 manifests, 6 hold frames, measurements, ffprobe — all postflight checks passed |
| `pnpm build` | **16/16 tasks successful**. `/demonstration-proof-preview` prerenders as HTTP 404 with a 4.0 KB client chunk — the same size as the comparable `/video-design-preview` — and neither the gallery markup nor any bundled `data:` media appears in the production output. |
