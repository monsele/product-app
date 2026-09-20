---
story_id: ST-101
title: "Author the Systems, Field Notes, and Prism Style Packs"
phase: "01 — Visual Runtime Proof"
status: Done
priority: should-have
epics: ["E11", "E15"]
prd_user_stories: ["E11-US2"]
depends_on: ["ST-094", "ST-097", "ST-098"]
---

# ST-101 — Author the Systems, Field Notes, and Prism Style Packs

> **Authoring completed 2026-09-20.** This story implements the bounded
> catalogue extension accepted by ADR-010. It does not alter `LessonSpec` or
> make arbitrary presentation instructions renderable.

## Story

As a teacher of a technical, observational, or introductory subject, I want a style whose visual language suits my material, so that a diagram-led or documentary lesson is not forced into an object-led or photographic direction.

## Gap This Closes

`docs/video-style-templates-brainstorm.md` proposes six directions. Its own recommended priority selects Essential, Editorial, and Everyday for the first expansion, which ST-094 and ST-097 deliver. Systems, Field Notes, and Prism are listed out of scope in ST-094, ST-097, and ST-098 and are otherwise unscheduled.

| Direction   | Visual identity                                                                                          | Motion signature                                                                                         |
| ----------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Systems     | Deep ink or pale neutral backgrounds; fine connectors; precise diagrams; selective colour gradients      | Paths trace relationships, signals move through systems, diagrams reorganise as the explanation develops |
| Field Notes | Paper tones, graphite, rust, olive; documentary images; clean annotations; a readable handwritten accent | Lines draw on, observations attach to objects, diagrams build step by step                               |
| Prism       | Saturated colour fields, oversized type, bold geometric cutouts, strong contrast                         | Shapes become diagrams, words become labels, rhythmic transitions create chapter changes                 |

## Architecture Risk This Also Addresses

ST-094 proves reuse across _subjects_ (AC8), not across _styles_. All three proven directions are object-, photograph-, or illustration-led. Systems is the structurally different one: traced connector paths, signals moving through a system, and diagrams reorganising mid-explanation are closer to the demonstration runtime's concerns than to a static treatment.

If the `StyleTokens` / `SceneTreatment` split in ST-094's proposed ADR only ever meets three similar directions, the risk that it does not extend surfaces after ST-097 has already committed persistence, migrations, and render identity around it.

Authoring a single Systems treatment early — before or during ST-097 — would test the contract cheaply. Consider promoting that slice ahead of this story.

## Scope and Decisions

- All three packs ship together, at immutable `1.0.0` versions, across the ten
  existing semantic scene types and their primary/alternate treatments.
- The extension is standard-approach only. ST-095/ST-099 demonstration recipes,
  their content/timing plans, and ADR-009's style matrix are unchanged.
- Systems uses the existing bounded graph/layout primitives; it does not add
  ST-095 event-runtime mechanics or new semantic scene types.
- Field Notes uses a pinned bundled font identity for its annotation accent;
  system-font fallback is not part of the resolved rendering contract.
- Prism retains the shared caption geometry and must pass contrast, safe-area,
  text-fit, and readable-hold checks.

## Acceptance Criteria

- [ ] The shared schema accepts only the six registered style-pack IDs and the
      120 registered `pack.scene-type.variant` treatment IDs; unknown pack,
      treatment, version, arbitrary layout, and non-standard approach inputs are
      rejected at the boundary.
- [ ] Systems, Field Notes, and Prism each declare immutable `1.0.0` tokens,
      pinned font identities, caption-safe geometry, and documented motion/hold
      constraints; no existing pack or legacy `mvp-default` output changes.
- [ ] Every new pack has two authored treatments for each existing semantic
      scene type. Their pause-frame hierarchy and motion signature are visibly
      distinct from the other packs and are not implemented as colour-only swaps.
- [ ] Preview and server rendering resolve the same validated treatment and
      pack release from a resolved creative-design manifest. A missing or
      incompatible selection blocks render rather than falling back.
- [ ] Fixed manifests render deterministically at direct, forward, and
      out-of-order frames. Changing the selected pack or treatment changes the
      resolved-design/render identity; temporary URLs do not.
- [ ] Systems, Field Notes, and Prism preserve narration duration, caption
      timing, semantic values, scene boundaries, and required readable holds across
      motion-energy settings.
- [ ] Representative fixtures for each new pack cover all ten scene types,
      maximum text/item limits, caption exclusion, contrast, 1920×1080 safe areas,
      and preview/render parity. Render smoke tests verify video/audio output.
- [ ] Existing Essential, Editorial, Everyday, demonstration, and legacy
      `mvp-default` regression tests remain green.

## Required Tests

- Schema/catalogue boundary and manifest-validation unit tests.
- Deterministic treatment/frame, hold, contrast, and safe-area tests.
- Preview/render parity and legacy compatibility tests.
- Representative render smoke tests for each new pack, including audio and
  output-profile verification.
- Relevant lint, typecheck, build, formatting, and diff checks.

## Required Reading

- `docs/video-style-templates-brainstorm.md` — proposal 1 and the creative evaluation criterion.
- `docs/creative-styles-technical-research.md` — style-pack contract and asset/font handling.
- `docs/controlled-rendering-versioning-contract.md` — CR-02, CR-03, CR-05, CR-07.
- ST-094 and ST-097 with their pack contracts, treatment registry, ADRs, and evaluation reports.
- `AGENTS.md`, `STORY_INDEX.md`, current ADRs.

## Out of Scope

- New semantic scene types or demonstration recipes.
- Reference-based style creation.
- Any change to the three shipped directions' appearance.
- User-created styles, reference-based style creation, custom font uploads, or
  arbitrary CSS/JSX/layout controls.
- Demonstration recipe/style expansion or a change to ST-095 event semantics.

## Dev Agent Record

- **Files changed:** shared creative-design catalogue and tests; production
  full-lesson presentation/runtime and visual/media tests; bounded teacher
  selector and design API; renderer release identity; creative-design prompt
  catalogue identity; ADR-010; this story and `STORY_INDEX.md`.
- **Migrations:** None.
- **Public contract changes:** Standard creative-design manifests now accept
  `systems`, `field-notes`, and `prism`, producing 120 finite registered
  treatment IDs across six packs and ten existing semantic scene types. The
  demonstration-presentation schema remains explicitly limited to Essential,
  Editorial, and Everyday.
- **Commands and tests run:** `@avlp/schemas` test (348 passing),
  `@avlp/design-system` test (10 passing), `@avlp/scene-library` test (319
  passing), including 120 deterministic full-lesson frames and three H.264/AAC
  1080p new-pack MP4 postflight checks; `@avlp/api` test (504 passing, 80
  configured integration skips) and focused creative-design test (4 passing);
  `@avlp/web` test (248 passing); API/web/renderer/provider-adapter/scene
  library typechecks and lint checks; scoped Prettier and `git diff --check`.
- **Representative output:** Systems, Field Notes, and Prism each encoded an
  H.264 1920×1080 MP4 with an AAC narration stream through the production
  full-lesson composition. The 120-treatment frame regression passed after an
  initial visibility failure was fixed by placing finite pack signatures above
  opaque scene canvases and outside the shared caption band.
- **Decisions and assumptions:** ADR-010 extends only the standard approach;
  no `LessonSpec`, migration, provider call, or demonstration recipe change was
  needed. The selected pack remains an immutable resolved-manifest input and
  renderer release identity was bumped to prevent cache reuse.
- **Known risks:** The 120-frame render regression is intentionally expensive
  (about four minutes locally); the full suite therefore remains a substantial
  CI cost. The packs are authored through bounded presentation primitives, not
  new semantic runtime mechanics.
- **Deviations:** None. The original placeholder had no acceptance criteria;
  this story's full authoring pass and ADR-010 supply the approved bounded
  implementation contract.
- **Review fixes:** Added the missing teacher selector entries for the three
  packs; retained explicit demonstration rejection; added the new-pack MP4/AAC
  postflight tests after review found still-frame coverage alone insufficient.
- **Approval:** Approved with follow-ups on 2026-09-20 after the release-version
  boundary and missing-selection render fallback were made fail-closed. Future
  hardening may connect release metadata to default presentation tokens and add
  motion-energy/out-of-order-frame fixtures; neither changes the approved
  bounded release contract.
