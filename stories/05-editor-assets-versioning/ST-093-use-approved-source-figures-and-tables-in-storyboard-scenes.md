---
story_id: ST-093
title: "Use Approved Source Figures and Tables in Storyboard Scenes"
phase: "05 - Storyboard Editing, Assets, and Versions"
status: Ready
priority: should-have
epics: ["E5", "E13", "E21"]
prd_user_stories: ["E5-US4", "E13-US1", "E21-US2"]
depends_on:
  ["ST-032", "ST-035", "ST-040", "ST-042", "ST-057", "ST-080", "ST-085"]
---

# ST-093 - Use Approved Source Figures and Tables in Storyboard Scenes

## Story

As a teacher, I want to select approved figures and tables extracted from my
source document while editing a storyboard scene, so that the lesson can show
the document's real evidence instead of substituting an invented visual.

## Outcome

The storyboard has a project-scoped `Source visuals` picker. It presents
included source figures as image assets and approved source tables as
deterministically rendered table visuals. A teacher can bind a compatible
source visual to a scene, see its source page and caption/heading, and remove
or replace it. The resulting scene, preview, render, and lesson version retain
provenance to the immutable parsed source and its approved snapshot.

## Required Reading

- `AGENTS.md`
- `docs/design.md` sections 8.5-8.6, 8.9, 10.5, 10.10, 11, and 12
- `docs/adr/ADR-001-typescript-first-mvp-stack.md`
- `docs/adr/ADR-002-citation-history-version-wiring.md`
- `docs/reference/mvp-prd.md` - E5-US4, E13-US1, E21-US2
- `docs/reference/epic-technical-implementation-guide.md` - E5, E13, E21,
  especially the source-figure provenance and asset-binding requirements
- `stories/03-ingestion-configuration/ST-035-extract-and-persist-figures-captions-and-tables.md`
- `stories/03-ingestion-configuration/ST-040-let-teachers-include-or-exclude-extracted-figures.md`
- `stories/04-ai-planning-grounding/ST-042-create-approved-source-snapshots-and-bounded-ai-source-packages.md`
- `stories/05-editor-assets-versioning/ST-057-create-the-approved-reusable-asset-catalog-and-scene-asset-picker.md`
- `stories/05-editor-assets-versioning/ST-085-introduce-visual-role-and-enforce-provenance-at-asset-binding.md`
- `stories/08-product-ui/ST-080-build-the-focus-studio-storyboard-workspace.md`

## Dependencies

- ST-032
- ST-035
- ST-040
- ST-042
- ST-057
- ST-080
- ST-085

Do not start this story until every dependency is marked **Done** in
`STORY_INDEX.md`.

## Scope

- [ ] Add a project-authorized source-visual query that returns only figures
      and tables included in the project's current approved source snapshot.
- [ ] Present a `Source visuals` picker in the storyboard inspector, alongside
      the existing asset choices. It has `Figures` and `Tables` views, search
      by caption/heading, page references, selected state, and an empty state.
- [ ] Let a teacher bind an included source figure to a compatible scene slot;
      retain its existing `source_figure` provenance and immutable figure ID.
- [ ] Let a teacher bind an approved source table as a `source_table` visual
      with one bounded presentation mode: `table`. It may show the table title,
      column labels, and a bounded set of rows; it must not silently turn a
      table into a chart or paraphrase its values.
- [ ] Add deterministic scene-runtime rendering for `source_table` visuals.
      The runtime receives structured, validated table data and never raw
      Docling/provider payloads, arbitrary HTML, pixel coordinates, or
      AI-generated animation code.
- [ ] Preserve the table's source-table ID, parsed-document version, approved
      source-snapshot ID, and page/section provenance in bindings, citations,
      preview manifests, renders, and immutable lesson versions.
- [ ] Support source documents whose successful immutable ingestion artifact is
      reused in another project. The second project must see only its own
      approved snapshot and overlays, while authorized media/table access may
      resolve the referenced immutable artifact.
- [ ] When a source figure or table becomes excluded, stale, unavailable, or
      incompatible with the selected slot, mark the binding invalid and offer
      a replacement action without deleting previous lesson versions.

## Technical Implementation Requirements

- A source visual is eligible only when it is present in the current approved
  source snapshot. Do not expose merely parsed, excluded, superseded, or
  unapproved material through the picker.
- Figures are immutable binary source artifacts. Only inline image bytes
  extracted by Docling may be used; do not fetch external URLs or document
  paths during ingestion or preview.
- Tables are immutable structured source data, not image uploads. Render them
  through a versioned, allowlisted table component with explicit limits for
  columns, rows, cells, text length, and overflow treatment.
- Table binding must validate that the selected table belongs to the project
  snapshot and that the selected scene slot accepts `source_table`. Figure
  binding must validate included status, snapshot membership, slot
  compatibility, and `source_figure` provenance server-side.
- Keep authorization at every query and signed-media boundary. A checksum or
  artifact ID alone never authorizes source-visual access; cross-user reuse or
  enumeration must return the normal not-found response.
- Reused artifacts require project-local authorization through the project's
  reuse reference and approved snapshot. Teacher overlays and approvals are
  never copied from the original project.
- Changing a source-visual binding invalidates only the affected scene preview,
  render, validation result, and unsaved lesson-version state. It does not
  rerun Docling or mutate the parsed artifact.
- Validate all API responses at the shared-schema boundary. Never log source
  text, raw table cells, signed URLs, or raw provider payloads.

## Contracts and Persistence

- Add versioned shared contracts for source-visual picker entries, a
  `source_table` binding/provenance, and bounded table presentation input.
- Extend the validated preview/render manifest only as needed to carry a
  source-table visual and its snapshot provenance.
- A migration is expected only if table bindings cannot be represented in the
  existing versioned `LessonSpec`/scene-binding payload. Do not duplicate the
  immutable table or figure content into mutable project rows.
- Existing `source_figure` bindings and previously saved lesson versions remain
  readable and renderable.

## Interfaces

- `GET /projects/:projectId/source-visuals` - project-authorized, approved
  figure and table candidates with bounded metadata and preview access.
- Existing scene asset-binding command, extended to accept validated
  `source_table` bindings where a slot supports them.
- `/workspace/[projectId]/storyboard` - `Source visuals` picker in the scene
  inspector and deterministic table preview in the selected scene.
- Preview and render manifest services - resolve approved source figures and
  table visuals for the current project, including authorized reused artifacts.

## Acceptance Criteria

- [ ] A teacher can open the storyboard picker and see only figures included in
      their current approved source snapshot, with a thumbnail, caption when
      available, and page reference.
- [ ] A teacher can see approved tables with their section heading, page
      reference, column labels, row count, and a bounded preview; no raw
      provider payload is exposed.
- [ ] Binding a figure or table updates the selected scene preview and labels
      it as source-derived with its provenance available from the inspector.
- [ ] A bound table renders deterministically in preview and final render using
      the approved table values; no AI call, chart inference, or Docling rerun
      occurs when binding it.
- [ ] A table cannot be bound to an incompatible slot, and an excluded figure
      cannot be selected or bound, even if a client submits its ID directly.
- [ ] A project using a same-owner reused ingestion artifact can select its own
      approved figures and tables without exposing review overlays, snapshots,
      files, or source-visual existence from another project or teacher.
- [ ] If a source approval changes after binding, the affected scene is marked
      stale with a direct replacement action; earlier immutable lesson versions
      remain reproducible.
- [ ] The picker is keyboard accessible, responsive at desktop/tablet/mobile
      widths and 200% zoom, announces selection/loading/error states, and does
      not conceal the active scene preview.

## Required Tests

- [ ] Shared-schema tests for `source_table` bindings, bounded table visual
      input, legacy figure bindings, and invalid provenance/slot combinations.
- [ ] API integration tests for snapshot membership, excluded figures,
      incompatible slots, cross-tenant non-disclosure, and same-owner reused
      artifact access with project-local overlays.
- [ ] API tests proving a binding change invalidates only the affected scene
      derivatives and creates no Docling job or mutable parsed-artifact write.
- [ ] Runtime tests for deterministic table rendering, column/row overflow,
      empty tables, text escaping, and malformed table payload rejection.
- [ ] Preview and render manifest tests for figure/table provenance and
      authorization, including a reused artifact in a second project.
- [ ] Web tests for picker filtering, selection, keyboard navigation, empty,
      loading, failure, stale, and replacement states.
- [ ] Playwright screenshots of the source-visual picker and selected table at
      desktop, tablet, mobile, and 200% zoom.
- [ ] Affected schema, API, web, runtime, worker, and renderer lint,
      typecheck, test, and build commands.

## Out of Scope

- OCR, image generation, chart inference, or semantic transformation of a
  source table.
- Extracting external/linked document images that Docling did not return as
  inline bytes.
- Teacher editing of immutable figure pixels or table values.
- Automatic insertion of a figure or table into scenes without teacher action.
- New visual templates, free-form table layout design, or arbitrary animation
  code.
- Cross-teacher or global ingestion-artifact reuse.

## Implementation Checklist

- [ ] Inspect current asset picker, scene binding, source snapshots, reuse
      authorization, preview manifest, render manifest, and scene runtime.
- [ ] Write a short implementation plan naming contract, persistence, API,
      UI, runtime, migration, test, and accessibility work.
- [ ] Update shared schemas before API, web, preview, renderer, and runtime
      consumers.
- [ ] Implement only the scoped source-visual selection and deterministic
      table-rendering behavior.
- [ ] Verify authorization, tenant isolation, snapshot membership, stale-state,
      idempotency, and no-Docling-rerun behavior.
- [ ] Run automated and visual tests.
- [ ] Update this Dev Agent Record and `STORY_INDEX.md` when complete.

## Definition of Done

- [ ] Every acceptance criterion and required test passes.
- [ ] Figures and tables can be selected only from the current approved source
      snapshot and preserve immutable provenance through preview and render.
- [ ] Reused ingestion artifacts remain private and project-local review
      overlays/approvals remain isolated.
- [ ] Source tables render deterministically within documented bounded limits.
- [ ] No unauthorized media/table access, raw source-data logging, provider
      call, Docling rerun, or mutable parser-artifact write occurs.
- [ ] Contracts, migrations (if needed), API, web, runtime, and renderer
      compatibility are documented.
- [ ] Dev Agent Record is complete and this story plus `STORY_INDEX.md` are
      marked Done.

## Dev Agent Record

- **Agent:** Unassigned
- **Started:** Not started
- **Completed:** Not started
- **Branch/PR:** Not started
- **Files changed:** Not started
- **Migrations:** Not started
- **Contracts changed:** Not started
- **Commands/tests run:** Not started
- **Screenshots or representative output:** Not started
- **Decisions and assumptions:** Source figures are immutable Docling-extracted
  binary artifacts. Source tables remain immutable structured data and are
  rendered by an allowlisted deterministic component rather than converted to
  a generated image or chart.
- **Known risks:** Current source-figure asset resolution, preview manifests,
  and render manifests must be audited together for reused-artifact access;
  resolving only the storyboard picker would leave a later preview/render
  failure.
- **Deviations from story or technical guide:** None.
