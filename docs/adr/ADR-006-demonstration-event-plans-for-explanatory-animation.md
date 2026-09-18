# ADR-006: Demonstration event plans for explanatory animation

## Status

**Proposed** — raised by ST-095 (demonstration-led animation proof). Not
accepted. Nothing in this document changes a production contract; the
production LessonSpec union, lesson configuration and render identity are
unchanged, and remain so until a product owner accepts this decision and the
scope it implies. ST-096 owns the production migration.

## Context

The MVP's scene templates present facts: a definition states a term, a process
lists steps, a summary lists takeaways. Motion is presentational — things enter,
emphasise and leave. That is adequate for a great deal of material and it is
what ST-010 through ST-024 built.

It is not adequate for a whole class of subjects where the explanation *is* a
change: money moving from one place to another, a particle leaving a liquid, a
force acting on an object. Stating "two notes go into savings" over a list is a
different lesson from showing two specific notes leave one tray and arrive in
another while the balances change to match. `docs/video-style-templates-brainstorm.md`
puts it as "make motion explain the subject", and
`docs/creative-styles-technical-research.md` recommends separating appearance
from explanatory behaviour and modelling subjects explicitly.

ST-094 proved the appearance half of that separation: versioned style packs
over identical content, with the semantics unchanged. ST-095 is the behaviour
half, and deliberately holds appearance fixed at `mvp-default` so the two
experiments do not contaminate each other.

The hard part is not the animation. It is letting something outside the
renderer — the AI planner, eventually a teacher — say *what changes* without
letting it say *where anything goes*, and without letting it produce an
animation that is fluent and wrong. A clip that smoothly shows ₦8,000 becoming
₦2,000 while two notes move is worse than no clip at all.

### What already exists

| Surface | Current state |
| --- | --- |
| `packages/schemas/src/index.ts` | `sceneSpecSchema`: ten semantic templates, each with a strict `visual` shape. No object identity, no events, no quantities. |
| `packages/scene-library/src/timing.ts` | `getSceneFrameTiming`: enter/exit frames from `videoTheme.motion`. |
| `packages/scene-library/src/graph-timing.ts` | `narrationRevealFractions`: reveal steps anchored to narration **by cumulative character count**. |
| `packages/scene-library/src/full-lesson.tsx` | Scene sequencing, per-scene audio, caption overlay. |
| ADR-004 | Measured narration duration controls playback; motion never accelerates or clips speech. |

`narrationRevealFractions` is the closest existing thing to narration-anchored
motion, and it is explicitly an estimate: it splits the narration into
sentences and blends their character-count positions with an even spacing. That
is a reasonable heuristic for fading in graph nodes, where being half a second
out costs nothing. It is not adequate for "the note leaves the tray as the
sentence says it does", and the story is explicit that a character-count
estimate may not be reported as alignment.

## Decision (proposed)

### 1. Model the subject as objects and events, not as a motion script

A demonstration scene carries a **plan**: a validated initial state of typed
objects with stable IDs, and an ordered list of events drawn from a closed
allowlist of actions. `transfer`, `introduce`, `advance-period`, `detach`,
`disperse`, `emphasise`, `annotate` — and nothing else, per recipe.

An event says *what happens to which object*. It never says where anything is,
how fast it moves, what curve it follows, or what it looks like. There is no
field in the contract that accepts a coordinate, an easing curve, a duration in
pixels, JSX, CSS or an expression, and the strict schemas reject unknown keys,
so there is no way to smuggle one in.

The renderer owns geometry entirely. It is given a container ID and a stable
slot index and decides the rectangle.

**Alternative rejected: a general animation DSL.** It would cover more subjects
per unit of authoring and is the obvious next thought. It also reintroduces
exactly the problem the semantic scene contract was built to avoid: once a
caller can express arbitrary motion, the renderer can no longer guarantee that
what it draws is legible, on-brand, inside the safe areas, or true. Two
authored recipes with subject-specific rules are the deliberate cost.

### 2. The plan declares its own end state, and validation replays it

Every plan states the container totals and particle phase counts it expects to
end at. The validator replays the whole plan through the same runtime the
renderer uses and refuses the plan if the result disagrees.

This is the part that stops a fluent, wrong clip. Conservation is checked at
every event boundary rather than only at the end, so money cannot be created
and destroyed again in the middle. Source availability is checked at the moment
of each transfer, so money cannot leave a container it is not in. `introduce`
requires a container whose role is `origin` and a human-readable label, so a
deposit cannot appear from nowhere.

Amounts are integer minor units. A float would make the arithmetic approximate,
and "the balances agree throughout" is the entire claim.

### 3. In-transit quantities are represented explicitly

While tokens are moving between two containers they belong to neither
container's settled balance, and are tracked in a separate `inTransitMinor`
bucket. Settled totals plus in-transit is invariant across the clip.

The alternative — attributing them to the destination as soon as the transfer
starts — would show the learner a balance they have no reason to believe yet.
Attributing them to the source until they land would make the movement look
like duplication. Naming the third state is the honest option, and the recipe
draws it on screen.

### 4. Narration timing is measured, and the plan is bound to the audio

An event is anchored to a **beat** — one phrase of narration — and the plan
builder resolves the frame from that beat's measured position. The plan records
the checksum of the recording it was built against; a different recording makes
the plan stale, which is an actionable validation failure rather than a silent
re-anchor.

Timing provenance is a required field with a closed enum of methods
(`measured-phrase-boundaries`, `manual-waveform-alignment`). There is no enum
member for an estimate, so an estimated track cannot be expressed in this
contract at all. `narrationRevealFractions` stays where it is and is not used
by demonstration scenes.

ADR-004 is unchanged and remains authoritative: measured audio sets the scene
length. A plan that cannot finish inside it, with its declared readable holds,
fails — the narration is never sped up, shortened or re-cut to make room.

### 5. Frame N is derived, never accumulated

`evaluateDemonstrationState(plan, frame)` starts from the validated initial
state every call and replays the events whose windows have opened. It reads no
cache, no previous frame and no wall clock. Decorative offsets come from a
seeded hash of the plan seed and the object ID — not of the frame, so they do
not shimmer and they reproduce across renders.

The cost is recomputing up to sixty events per frame, which is negligible, and
the benefit is that backward scrubbing, repeated renders and out-of-order
distributed rendering agree by construction rather than by care.

### 6. The proof is isolated, exactly as ST-094's was

Three additive subpath exports, none reachable from its package's index:
`@avlp/schemas/demonstration-proof`, `@avlp/scene-library/demonstration-proof`
and `@avlp/scene-library/demonstration-proof/manifest`. A separate Remotion
root, a development-only route that 404s in production, and bundled `data:`
media.

`lessonSpecSchema` is untouched, `lessonConfigurationSchema` still accepts only
`mvp-default`, and the production render worker's bundle and
`renderImplementationVersion` are unchanged. The standard side of the
comparison is the real `FullLessonComposition`, not a reimplementation, and its
scenes pass the production `validateScene`.

## Consequences

### Accepted now

- Two subjects are covered by two authored recipes. A third subject is a third
  recipe with its own accuracy review; this does not generalise for free, and
  that limit is the honest headline of the proof.
- Bundled `data:` media does not survive contact with production. It is used
  here so preview, render and tests consume byte-identical bytes; production
  must resolve media through the existing tenant-scoped asset path.
- **That choice puts a 15.3 MiB generated TypeScript file in the repository.**
  `packages/scene-library/src/demonstration-proof/narration.generated.ts` is
  16,020,854 bytes — six narration tracks as base64 WAV, about 11 MB of audio
  before encoding. The story asks to avoid committing large binaries by
  default, so this is a deliberate exception rather than an oversight, and the
  figure is recorded here so it is weighed rather than discovered: it is
  permanent in git history and `tsc`, `eslint` and the bundler parse it on
  every pass over the package. It buys the byte-identity guarantee above, which
  is what makes the browser/server parity comparison evidence about the recipes
  rather than about two media pipelines. ST-096 removes it by resolving media
  through the asset path; if the file becomes a problem before then, the
  narrower fix is to keep the WAVs as binary assets the bundler inlines, rather
  than as a source module.
- Narration is locally synthesized speech, not a recorded voice. It proves
  timing, duration authority, caption correspondence and word content; it does
  not prove prosody.

### Owned by ST-096, not decided here

- Where a plan is persisted, and under what schema version. This proof's plans
  are fixtures; a production plan needs a home, a migration and a place in the
  lesson version history.
- How approach selection reaches a render: an approach-sensitive render
  identity (a demonstration and a standard clip of the same facts must never
  share one), tenant-owned comparison variants, and job lifecycle.
- Whether the AI planner may choose a recipe, and under what grounding
  requirements. The support query here is a pure capability check and
  deliberately takes no tenant, no authorisation and no title.
- Whether `readout` should become a first-class production concept, since a
  displayed number derived from validated state is useful well beyond these two
  recipes.

### Open questions

- Should demonstration plans live inside `sceneSpecSchema` as an eleventh
  template, or beside a scene as a separate versioned record? The second keeps
  the ten existing templates stable and lets a plan version independently, but
  splits a scene's meaning across two records.
- What does a demonstration clip cost to render? **Unresolved.** The measured
  per-frame figures in `docs/demonstration-animation-proof-evaluation.md` do
  not separate the two approaches: the run-to-run spread on the one machine
  used (88 → 157 ms/frame for the same clip from identical inputs) is larger
  than any difference between demonstration and standard, and the ordering
  reverses between runs — in one recorded run the *standard* savings clip was
  the slower of the pair. The only stable measurement is output size, where the
  demonstration clips are 1.50x (savings) and 1.27x (evaporation) their standard
  counterparts at equal duration and encoder settings. A capacity answer needs a
  quiet machine and repeated runs, and it needs one before rollout, but this
  proof does not supply it and nothing here should be read as saying the
  approach costs more per frame.
- Motion energy (CR-05) is expressible in this model — `durationFrames` and
  `holdFrames` are per-event — but only one setting was exercised. ST-097 owns
  proving that calm/balanced/lively preserve the event anchors.

## References

- `docs/controlled-rendering-versioning-contract.md` — CR-01, CR-02, CR-04,
  CR-05, CR-06, CR-07, CR-08
- ADR-004 — measured narration controls playback duration
- ADR-005 — versioned style packs (the appearance half of the same separation)
- `docs/demonstration-animation-proof-evaluation.md` — the evidence
- `stories/01-visual-runtime-proof/ST-095-build-and-prove-demonstration-led-animation.md`
