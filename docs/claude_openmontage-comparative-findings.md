---
title: "OpenMontage Comparative Findings and Candidate Stories"
author: Claude (Opus 5)
date: 2026-09-02
status: Research — not yet converted to stories
source: https://github.com/calesthio/OpenMontage @ main (sparse clone of remotion-composer/, pipeline_defs/, schemas/)
---

# OpenMontage Comparative Findings and Candidate Stories

Comparison of `calesthio/OpenMontage` against this repository, written to be converted
into story files under `stories/` using `STORY_TEMPLATE.md`.

**How to use this document.** Part 1 is evidence. Part 2 is a set of candidate stories,
each with frontmatter-ready fields, scope, acceptance criteria, and required tests. Story
IDs are **proposed** (`ST-085`+, since `ST-084` is the current maximum in `STORY_INDEX.md`)
and must be confirmed before any file is created. Part 3 records what was deliberately
rejected, so it is not re-litigated later.

**Evidence grading.** Claims are marked `[verified]` (checked against files in both repos
during this review) or `[judgement]` (design opinion, arguable).

---

## Part 1 — Findings

### 1.1 What OpenMontage is

An agent-first video production system. There is no code orchestrator: an AI coding
assistant reads YAML pipeline manifests plus Markdown "director skills" and calls Python
tools itself. AGPL-3.0, ~55.5k stars, primarily Python with a React/Remotion composition
layer. Relevant subset reviewed: `remotion-composer/` (~8.4k LOC, Remotion 4.0.484),
`pipeline_defs/` (13 YAML manifests), `schemas/` (20 artifact JSON Schemas).

Their orchestration model is **not** applicable here and is not proposed for adoption.
This repository is a product with a real worker (`apps/pipeline-worker/`, 26 job handlers);
moving orchestration into YAML would be a regression. See Part 3.

### 1.2 Theming — we are ahead on discipline, behind on extensibility

`[verified]` Across the ten scene components in `packages/scene-library/src/`:

- `grep -c "videoTheme\." *.tsx` gives 21–34 references per component, ~300 total.
- `grep "#[0-9A-Fa-f]{6}" *.tsx` (excluding fixtures) gives **zero matches**.

No hardcoded colors anywhere in the scene layer. OpenMontage cannot say the same: its
demo props carry per-cut `"backgroundColor": "#0F172A"`, and components accept cut-level
`accentColor` / `color` overrides, so a generated plan can silently defeat the theme.

`[verified]` Token coverage comparison:

| Concern | OpenMontage `ThemeConfig` | Our `videoTheme` |
| --- | --- | --- |
| Colors | 7 + `chartColors[]` | 7, no chart palette |
| Typography | 3 font slots | family + 3 sizes + lineHeight |
| Safe areas | absent | 4 named + `lowerThirdAvoidance` |
| Motion | one `springConfig` | 4 named presets (frames + cubic-bezier) |
| Overflow measurement | absent | `measureSceneContent()` returning `firstOverflowPath` |
| Spacing / radii / lineWidths | absent | present |
| Selectable themes | 4 | **1** (`id: "mvp-default"`) |

`[verified]` The gap is the last row and it is structural:

- Every scene does `import { videoTheme } from "@avlp/design-system/video-theme"` — a
  frozen module singleton resolved at import time.
- `packages/design-system/src/video-theme-provider.tsx` exports `VideoThemeProvider` and
  `useVideoTheme`, but `grep -rn "useVideoTheme" packages/scene-library/` returns nothing.
  The provider is unused, and it hardcodes `value={videoTheme}` with no `theme` prop, so
  it could not inject an alternative theme even if adopted.
- `packages/scene-library/src/layout.ts` (`measureSceneText`, `measureSceneContent`) and
  `timing.ts` (`getSceneFrameTiming`) close over the singleton directly.

`[judgement]` The `id: "mvp-default"` discriminant in the `VideoTheme` type reads as
intent to add more themes. The trap is `layout.ts`: under a second theme with a different
`bodySize`, the measurement functions would report `fits: true` for content that overflows,
because they measure against the default theme's tokens rather than the active one. That
silent-wrongness risk is the main cost of the change, not the import churn.

`[judgement]` One idea worth stealing: OpenMontage themes **motion feel**, not just color.
Their `anime-ghibli` theme uses `damping:18, stiffness:60, transitionDuration:1.0`;
`minimalist-diagram` uses `damping:25, stiffness:150`. Our four named motion presets are
richer per-theme but there is only one set of them.

### 1.3 Asset path resolution

`[verified]` `remotion-composer/src/lib/resolveAsset.ts` (28 lines) normalises four input
shapes — remote URL, `data:`, absolute filesystem path, and `staticFile()` relative path —
including Windows drive letters and stripping the leading slash from `/C:/...` forms
produced by `file://` URLs.

`[verified]` Our `full-lesson.tsx` asset validator accepts signed HTTPS URLs,
`/catalog/*.svg` paths, and a loopback-HTTP dev pattern. There is no local absolute-path
case today.

`[judgement]` This is therefore **not currently a defect** — it is a landmine that only
detonates if the renderer ever reads assets from disk on Windows. Recorded as a
conditional candidate (Story D), not a recommended one.

### 1.4 Stage gates — the real transferable idea

`[verified]` OpenMontage splits every stage gate three ways:

| Layer | Form | Enforcement |
| --- | --- | --- |
| `schemas/artifacts/*.schema.json` | JSON Schema | validator, hard fail |
| `success_criteria` | checkable prose | reviewer, hard gate |
| `review_focus` | fuzzy prose | LLM self-critique, soft |

Example, verbatim, from `pipeline_defs/animated-explainer.yaml`, stage `scene_plan`:

```yaml
review_focus:
  - Full script duration covered with no gaps
  - "Visual variety: no 3+ consecutive scenes of same type"
  - Asset feasibility - every required_asset uses a tool from the production plan
success_criteria:
  - Schema-valid scene_plan with required_assets per scene
  - At least 3 different scene types used
```

`[verified]` We have layer 1 and it is stronger than theirs: `@avlp/schemas` plus the
`superRefine` cross-validation in `full-lesson.tsx`, which checks narration tracks against
timeline segments and caption cues against scene bounds. Their JSON Schemas do not
cross-validate.

`[verified]` We have layer 2 in `STORY_TEMPLATE.md` (Acceptance Criteria, Definition of
Done) and in `apps/pipeline-worker/src/document-validation.ts` and `ingestion-quality.ts`.

`[judgement]` We have essentially **no layer 3 for storyboard structure**. A lesson of ten
consecutive `definition-scene`s is valid Zod and bad pedagogy. `grounding-check-job.ts`
already applies this instinct to factual grounding; the same instinct is absent for
structural and pedagogical quality of the storyboard.

### 1.5 Two smaller manifest ideas

`[verified]` **Capability envelope.** Each stage declares `tools_available`; reaching
outside it is treated as a governance violation. Our analogue would be per-job allowed
adapter lists in `packages/provider-adapters`, so a storyboard job cannot reach a TTS
provider and cost attribution becomes exact by construction.

`[verified]` **Decision log.** `schemas/artifacts/decision_log.schema.json` records every
provider choice with alternatives considered, confidence score, and reasoning. We have
`packages/observability` and audit events; `[judgement]` the missing element is
*alternatives rejected*, which is what makes a model-selection regression diagnosable weeks
later.

`[verified]` **Dependency DAG.** `story-manifest.json` (71 stories, with `depends_on`,
`epics`, `prd_user_stories`) plus `TRACEABILITY_MATRIX.md` already covers what their
manifest dependency wiring does at the planning level. No gap here.

---

## Part 2 — Candidate stories

Ordered by recommended execution. IDs are proposals only.

### Story A — Introduce a Theme Seam for the Video Scene Library

```yaml
story_id: ST-085          # proposed
title: "Introduce a Theme Seam for the Video Scene Library"
phase: "10 — Design System Extensibility"   # proposed; could fold into 01 or 09
status: Draft
priority: should-have
epics: []                 # confirm against docs/reference/mvp-prd.md
prd_user_stories: []
depends_on: ["ST-010", "ST-011", "ST-022"]
```

**Story.** As a maintainer, I want scene components to read the active video theme through
a provider rather than a module singleton, so that a second theme can be introduced without
editing every scene component.

**Outcome.** `VideoThemeProvider` accepts a `theme` prop; all ten scene components and the
layout/timing helpers resolve tokens from the active theme. Rendering under the default
theme is unchanged.

**Required reading.** `AGENTS.md`; `docs/reference/mvp-prd.md`; `docs/design.md`;
`stories/01-visual-runtime-proof/ST-010-create-the-mvp-video-design-system-and-motion-tokens.md`;
`stories/01-visual-runtime-proof/ST-011-implement-the-scene-registry-runtime-contract-and-layout-validation.md`.

**Scope.**
- [ ] Add an optional `theme` prop to `VideoThemeProvider` (`packages/design-system/src/video-theme-provider.tsx`), defaulting to `videoTheme`.
- [ ] Replace direct `videoTheme` imports with `useVideoTheme()` in the ten scene components in `packages/scene-library/src/`.
- [ ] Thread the active theme into `layout.ts` (`measureSceneText`, `measureSceneContent`) and `timing.ts` (`getSceneFrameTiming`) as an explicit parameter — these currently close over the singleton and would silently mis-measure under a non-default theme.
- [ ] Ensure `full-lesson.tsx`, `scene-preview.tsx`, `scene-preview-composition.tsx`, and `scene-registry.tsx` mount the provider on both the preview and render paths.

**Technical implementation requirements.**
- No behavioural change under the default theme. This is a refactor story.
- Server-render and Remotion render paths must both resolve the same theme; a provider
  present in preview but absent in render is the primary failure mode to guard against.
- Keep `videoTheme` exported as the default value so non-React callers are unaffected.

**Acceptance criteria.**
- [ ] `grep -rn "import { videoTheme }" packages/scene-library/src/*.tsx` returns no matches for scene components.
- [ ] `grep -rn "#[0-9A-Fa-f]\{6\}" packages/scene-library/src/*.tsx` (excluding fixtures) still returns zero matches.
- [ ] Rendering the full-lesson fixture with no explicit theme produces output identical to the pre-change baseline.
- [ ] Rendering with an injected test theme whose `bodySize` is materially larger causes `measureSceneContent` to report `fits: false` with a populated `firstOverflowPath`.

**Required tests.**
- [ ] Unit — `measureSceneContent` and `measureSceneText` against an injected non-default theme.
- [ ] Unit — `getSceneFrameTiming` honours an injected theme's motion presets.
- [ ] Render parity — existing `full-lesson-render-parity.test.ts` and `full-lesson-render.test.ts` pass unchanged.
- [ ] UI/render — `scene-preview-render-smoke.test.ts` passes with the provider mounted.

**Out of scope.** Authoring a second theme. Any user-facing theme picker. Chart tokens
(Story B).

---

### Story B — Add Chart and Data-Visualisation Tokens to the Video Theme

```yaml
story_id: ST-086          # proposed
title: "Add Chart and Data-Visualisation Tokens to the Video Theme"
phase: "10 — Design System Extensibility"   # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: ["ST-085"]
```

**Story.** As a lesson author, I want data-bearing scenes to draw from a defined, accessible
categorical palette, so that charted content is legible and consistent across a lesson.

**Outcome.** `VideoTheme` gains `chartColors: readonly string[]`, validated for contrast
against `colors.background`, available to any future data scene.

**Scope.**
- [ ] Add `chartColors` to the `VideoTheme` type and `videoTheme` value in `packages/design-system/src/video-theme.ts`.
- [ ] Document ordering and intended use in `docs/design.md`.

**Technical implementation requirements.**
- Palette must be validated rather than picked by eye. Follow the contrast method in the
  `dataviz` skill; each entry must clear the contrast floor against `colors.background`
  and remain distinguishable under common colour-vision deficiencies.
- Ordering is semantic: index 0 is the primary series.

**Acceptance criteria.**
- [ ] `videoTheme.chartColors` contains at least 6 entries.
- [ ] Every entry passes the documented contrast threshold against `colors.background`.
- [ ] `video-theme.test.ts` fails if a future edit introduces a failing colour.

**Required tests.**
- [ ] Unit — contrast assertion over every `chartColors` entry.

**Out of scope.** Building chart scene components. This story ships tokens only. Note:
without a consuming scene this is speculative — defer until a data-bearing scene type is
actually planned.

---

### Story C — Add a Structural Quality Review Layer to the Storyboard Job

```yaml
story_id: ST-087          # proposed
title: "Add a Structural Quality Review Layer to the Storyboard Job"
phase: "04 — AI Planning and Grounding"     # proposed; extends existing phase
status: Draft
priority: must-have
epics: []                 # confirm — likely the storyboard/planning epic
prd_user_stories: []
depends_on: []            # confirm the storyboard-job story ID from STORY_INDEX.md
```

**Story.** As a teacher, I want a generated storyboard checked for structural and
pedagogical quality and not only for schema validity, so that a lesson which is technically
well-formed but monotonous or incomplete is caught before narration and rendering spend.

**Outcome.** `storyboard-job` emits a structured storyboard review alongside the storyboard.
Hard violations block; soft findings are recorded and surfaced without blocking.

**Required reading.** `AGENTS.md`; `docs/reference/mvp-prd.md`;
`docs/reference/epic-technical-implementation-guide.md`; `docs/video-quality-strategy.md`;
`apps/pipeline-worker/src/grounding-check-job.ts`; `apps/pipeline-worker/src/ingestion-quality.ts`.

**Scope.**
- [ ] Define a `storyboard_review` artifact schema in `packages/schemas` with per-check id, severity (`blocking` or `advisory`), outcome, and human-readable detail.
- [ ] Implement deterministic checks in `apps/pipeline-worker/`, following the existing `ingestion-quality.ts` pattern.
- [ ] Persist the review and expose it on the storyboard read path so the editor UI can display advisory findings.

**Candidate checks** — final list to be agreed during story authoring:

| Check | Severity | Rationale |
| --- | --- | --- |
| No 3+ consecutive scenes of the same type | advisory | Monotony; valid Zod, bad pedagogy |
| Every learning objective addressed by at least one scene | blocking | Incomplete lesson |
| Every scene's text passes `measureSceneContent` without overflow | blocking | Guaranteed visual defect |
| Total duration within the configured target band | advisory | Drift from author intent |
| Analogy scenes reference source material | advisory | Overlaps `grounding-check-job` — confirm ownership before duplicating |

**Technical implementation requirements.**
- Checks are deterministic and unit-testable. No model call is required for the checks in
  this story.
- Severity is data, not code — a check's severity must be changeable without redeploying
  the logic that decides whether to block.
- Advisory findings must never fail the job.

**Acceptance criteria.**
- [ ] A storyboard with 3+ consecutive same-type scenes produces an advisory finding and still completes.
- [ ] A storyboard missing coverage for a declared objective produces a blocking finding and the job fails with an actionable error.
- [ ] A storyboard whose scene text overflows the layout budget produces a blocking finding.
- [ ] The review is persisted and readable through the existing storyboard read path.
- [ ] Audit and observability events are emitted per the conventions in `packages/observability`.

**Required tests.**
- [ ] Unit — one test per check, positive and negative.
- [ ] Integration — storyboard job end to end, blocking and advisory paths.
- [ ] Failure — blocking finding surfaces a typed API error, not a generic 500.

**Out of scope.** Auto-repair of a failing storyboard. Model-graded (non-deterministic)
checks. UI presentation beyond making the review readable.

---

### Story D — Harden Asset Path Resolution for Local Filesystem Sources (conditional)

```yaml
story_id: ST-088          # proposed
title: "Harden Asset Path Resolution for Local Filesystem Sources"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: []
```

**Trigger condition.** Only write this story if the renderer gains a path that reads assets
from the local filesystem. Today all asset sources are signed HTTPS, `/catalog/*.svg`, or
the loopback-HTTP dev pattern, so there is no live defect.

**Story.** As an operator, I want asset paths resolved correctly regardless of platform, so
that a render does not fail or silently drop an asset on Windows.

**Scope.**
- [ ] Extend the asset resolver to handle absolute filesystem paths, `file://` URLs, and Windows drive-letter forms including the `/C:/...` shape.
- [ ] Extend the `full-lesson.tsx` asset validator's accepted-source union to match.

**Acceptance criteria.**
- [ ] Windows drive-letter paths, POSIX absolute paths, `file://` URLs, HTTPS URLs, and catalog-relative paths each resolve to a loadable source.
- [ ] An unrecognised source shape is rejected with a typed validation error, not silently passed through.

**Required tests.**
- [ ] Unit — table-driven over every accepted and rejected source shape.

**Reference.** `remotion-composer/src/lib/resolveAsset.ts` in OpenMontage solves exactly
this in 28 lines and can be read as prior art. Note the AGPL-3.0 licence: read for
approach, do not copy verbatim.

---

### Story E — Constrain Provider Adapters per Pipeline Job

```yaml
story_id: ST-089          # proposed
title: "Constrain Provider Adapters per Pipeline Job"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: should-have
epics: []
prd_user_stories: []
depends_on: []            # confirm against provider-adapters stories in STORY_INDEX.md
```

**Story.** As an operator, I want each pipeline job restricted to the provider adapters it
legitimately needs, so that an incorrect or malicious call path cannot incur cost in an
unrelated capability and cost attribution is exact by construction.

**Outcome.** Each job handler in `apps/pipeline-worker/src/` resolves adapters through a
declared allow-list. A call outside the envelope fails fast and is audited.

**Scope.**
- [ ] Declare a per-job adapter allow-list in `packages/provider-adapters`.
- [ ] Enforce at adapter resolution time, not at call sites.
- [ ] Emit an audit event on violation.

**Acceptance criteria.**
- [ ] A job requesting an adapter outside its envelope fails with a typed error before any external call is made.
- [ ] The envelope is declared in one place per job and is discoverable by reading that declaration alone.
- [ ] Violations appear in the audit stream with job id and requested adapter.

**Required tests.**
- [ ] Unit — allowed and denied resolution per job.
- [ ] Integration — no external call is issued on a denied resolution.

**Out of scope.** Cost caps and budget enforcement. Runtime reconfiguration of envelopes.

---

### Story F — Record Rejected Alternatives in Provider Selection Decisions

```yaml
story_id: ST-090          # proposed
title: "Record Rejected Alternatives in Provider Selection Decisions"
phase: "09 — Provider Readiness"            # proposed
status: Draft
priority: could-have
epics: []
prd_user_stories: []
depends_on: ["ST-089"]    # proposed ordering; not a hard technical dependency
```

**Story.** As an operator debugging output quality, I want each provider selection to record
the alternatives that were considered and rejected, so that a change in model choice is
diagnosable after the fact.

**Outcome.** Selection decisions carry the chosen adapter, the rejected candidates, and the
reason each was rejected.

**Scope.**
- [ ] Extend the decision/audit event shape in `packages/observability` with `alternatives_rejected`.
- [ ] Populate it at the selection site.

**Acceptance criteria.**
- [ ] Every provider selection event carries at least the chosen adapter and the rejection reason for each considered alternative.
- [ ] Existing consumers of the event shape continue to work (additive change only).

**Required tests.**
- [ ] Unit — event shape and population.
- [ ] Integration — event reaches the audit sink with alternatives populated.

**Out of scope.** A scoring model. Any UI for browsing decisions.

---

## Part 3 — Considered and rejected

| Idea | Why rejected |
| --- | --- |
| YAML pipeline manifests replacing worker code | Their manifests exist because there is no orchestrator. We have `apps/pipeline-worker/` with 26 typed handlers. Moving orchestration into YAML trades type safety for nothing. |
| Markdown "director skills" driving runtime behaviour | Same reason. Appropriate for an agent-operated repo, not for a product runtime. |
| Governance rules as prose (e.g. "silent swap is a CRITICAL violation") | A workaround for having no type system. We have one — encode the constraint (Story E). |
| Their `orchestration:` block (`budget_default_usd`, `max_send_backs`, `max_wall_time_minutes`) | Belongs in per-tenant configuration in the database, not a checked-in file. |
| Their flat `Cut` interface (~50 optional fields, `type?: string`, `chartData?: any[]`) | Strictly worse than our discriminated `sceneSpecSchema`. It exists so an LLM can emit props loosely. |
| A generic single-composition renderer | Our semantically named pedagogical scenes plus `scene-registry.tsx` are the correct model for this domain. |
| Adopting a pipeline dependency-DAG manifest | Already covered by `story-manifest.json` and `TRACEABILITY_MATRIX.md`. |

---

## Open questions for the author

1. Is a second video theme actually planned? Story A is a refactor with no user-visible
   outcome; if there is no second theme on the roadmap, defer it and keep the singleton.
2. Story B without a consuming data scene is speculative. Is a chart or data-bearing scene
   type planned for the scene library?
3. Story C's analogy-grounding check may overlap `grounding-check-job.ts`. Confirm which
   component owns pedagogical grounding before implementing.
4. Phase placement: Stories A and B do not fit any existing phase directory. Either open
   `stories/10-design-system-extensibility/` or fold them into `01-visual-runtime-proof`.
5. Confirm `epics` and `prd_user_stories` for every candidate against
   `docs/reference/mvp-prd.md` before generating story files.

## Provenance

Reviewed at `main` of `calesthio/OpenMontage` (last pushed 2026-08-22) via sparse clone
limited to `remotion-composer/`, `pipeline_defs/`, and `schemas/`. The upstream project is
AGPL-3.0; findings here describe approach and prior art. Do not copy source verbatim into
this repository without a licence review.
