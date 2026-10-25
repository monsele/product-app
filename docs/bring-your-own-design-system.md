# My Design System: bring your own visual identity and creative philosophy

- Status: **Implementation started — ST-122 foundation and ST-123 manual authoring approved and Done; ST-124 In Review**
- Planned: 2026-10-17
- Documented: 2026-10-18
- Implementation: ST-122 through ST-125; see the delivery sequence below.

## Purpose and agreed direction

Let users bring their own design language when designing videos. A reusable
design system captures fonts, assets, rules, and examples, with meaningful
control over composition and motion.

The product owner selected:

- **Custom design systems:** own fonts, assets, principles, and meaningful
  layout/motion control through an expanded validated renderer.
- **Both starting paths:** import an established system or develop a personal
  style from references and plain language.
- **Locks plus guidance:** lock exact essentials while leaving room for
  interpretation of creative principles.
- **Files and text first:** introduce live integrations later.

Implementation was authorized on 2026-10-18. Architecture is recorded in
[ADR-017](adr/ADR-017-user-owned-design-systems.md). Delivery is tracked as
ST-122 through ST-125 in STORY_INDEX.md. This document does not mark those
stories complete; the repository review and dependency gates still apply.

## Research and sources

Research was conducted on 2026-10-17. Product capabilities and documentation may
change; verify them again when implementation starts.

| Workflow | Observed approach | Implication for this feature |
| --- | --- | --- |
| Claude Code project instructions | Project instructions and referenced guidelines provide persistent design context. Instructions guide generation but are not enforced configuration. | Preserve user direction across projects and validate rules that must be exact. |
| Reusable brand skills | Brand documents, tokens, voice rules, principles, examples, and prohibited patterns become reusable guidance. | Capture the reasoning behind the design alongside its visual values. |
| Claude Design imports | Documents, fonts, logos, design files, and codebases can provide source material for a reusable design system. Users review and test the result. | Separate extraction, user review, proof generation, and reuse. |
| Claude Code with Remotion | Actual font files and assets accompany animation instructions; fonts can be loaded before frames render. | Fonts must become pinned rendering assets rather than names in a prompt. |

Sources:

- [Claude Code: project instructions and memory](https://code.claude.com/docs/en/memory)
- [Anthropic: encode the brand as a skill](https://academy.claude.com/use-cases/brand-guidelines-skill)
- [Community example: persistent design tokens, principles, components, and references](https://github.com/jaredhhawk/claude-design-system)
- [Claude Design: set up a design system](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design)
- [Remotion: prompting videos with coding agents](https://www.remotion.dev/docs/ai/coding-agents)
- [Remotion: load local or remote fonts](https://www.remotion.dev/docs/fonts-api/load-font)
- [Claude Motion: getting started](https://support.claude.com/en/articles/17454997-get-started-with-claude-motion)

Claude Motion's official guide documents editable code-based animations and
MP4 export. It does not establish a dedicated custom-font or design-system
import workflow. Do not assume Claude Design's import capabilities also apply
to Motion. The community example demonstrates an approach, not its prevalence
or adoption across users.

## User experience

Add **My Design Systems**, accessible from the workspace and a video's design
panel.

1. **Create from materials or an idea.** Accept PDF/Markdown guides,
   plain-language instructions, PNG/JPEG reference images, logos, font files,
   and design-token JSON. Users can start without a formal brand guide.
2. **Review the interpretation.** Present an editable brief covering typography,
   colour roles, composition, imagery, diagrams, and motion. Distinguish supplied
   rules from inferred suggestions and identify conflicting or unsupported
   requirements.
3. **Lock essentials; guide the rest.** Users can lock exact fonts, colours,
   assets, and supported presentation rules. Creative principles remain editable
   guidance.
4. **Preview a short moving proof.** Use representative opening, explanation,
   and diagram/chart scenes. Use the current lesson's content when available;
   otherwise use clearly labelled sample content.
5. **Refine conversationally.** Requests such as “more editorial,” “less dense,”
   or “reveal relationships before labels” produce reviewable changes.
6. **Save and reuse.** Save an immutable system version, apply it to a video
   draft, and explicitly approve the resulting design. Updating a system never
   changes existing videos automatically.

Example philosophy:

> Use our serif headings and warm backgrounds. Make explanations feel like an
> annotated field journal. Reveal diagrams progressively. Avoid decorative icons
> and bouncing motion.

Every interpreted rule should show whether it is applied, advisory, or
unsupported. A moving proof must demonstrate hierarchy, composition, and motion;
a static palette alone cannot establish that a philosophy was understood.

## Architecture and creative control

Build on the separation between visual identity and composition in
[ADR-015](adr/ADR-015-v2-composition-planning-and-pre-approval-asset-substitution.md).
A new ADR must extend the restrictions on user-created systems recorded in
[ADR-008](adr/ADR-008-resolved-creative-design-manifests.md) and
[ADR-010](adr/ADR-010-expand-versioned-style-packs.md).

- **Independent identities:** custom systems do not require selection of one
  of the six existing packs. Existing packs remain optional starting points.
- **Meaningful composition control:** add validated settings for alignment,
  density, text/image emphasis, split versus stacked arrangements, image framing,
  strokes, and corner treatment. The renderer calculates geometry.
- **Motion direction:** support preferred and prohibited registered motion
  families, entrance/exit intensity, stagger, and readable holds. Preserve
  narration timing and caption space.
- **Philosophy-aware planning:** pass approved principles and references to
  composition selection and illustration planning. Preserve educational content
  and factual diagrams.
- **Honest limits:** keep unsupported concepts visible. A locked requirement
  that cannot be fulfilled blocks application; an advisory preference may be
  approximated with an explanation.

### Contracts, persistence, and APIs

Introduce shared versioned contracts for design-system drafts, published
versions, asset/font references, interpreted rules, and capability reports.
Update shared schemas before their consumers. Add tenant-owned persistence and
APIs for upload, interpretation, editing, proof generation, publishing, and
applying a version. Exact API shapes and migrations belong in the implementation
stories after reinspection of the current repository.

Use a new creative-design manifest release for custom identities and resolved
presentation settings. Preserve existing manifest readers and historical
rendering. Pin the system version, font bytes, assets, composition versions, and
resolved settings in render identity. Keep presentation separate from the
semantic LessonSpec contract.

Import processing and AI interpretation run as retryable, idempotent background
jobs with correlation and usage records. Paid interpretation and proof generation
require explicit action and existing quota/metering controls. Validate external
data at the boundary, keep storage private, and enforce tenant isolation for
records and asset access. Imported guides are design data, never executable
agent instructions.

## Delivery sequence

Create bounded stories with explicit dependencies and acceptance criteria:

1. **[ST-122: Foundation](../stories/13-custom-design-systems/ST-122-design-system-foundation.md):**
   shared contracts, ADR, tenant-owned storage, and validated font/asset ingestion.
2. **[ST-123: Manual authoring](../stories/13-custom-design-systems/ST-123-manual-design-systems.md):**
   design-system editing and deterministic custom rendering independent of presets.
3. **[ST-124: Interpretation and planning](../stories/13-custom-design-systems/ST-124-design-system-interpretation.md):**
   guide/reference interpretation, philosophy-aware planning, and capability reporting.
4. **[ST-125: Proof and reuse](../stories/13-custom-design-systems/ST-125-design-system-proofs-and-application.md):**
   moving proofs, conversational refinement, reusable versions, and application.

Follow the repository workflow one story at a time. Do not start a story until
its dependencies are Done. Record migrations, public contract changes,
validation evidence, decisions, risks, and deviations in each story's completion
record.

## Validation and acceptance

- Two custom systems applied to the same lesson produce visibly different
  hierarchy, composition, and motion, beyond changes to colour.
- A creator can start from a formal guide or from references and plain language.
- Custom fonts match between preview and export. Missing fonts or glyphs produce
  actionable errors.
- Locks survive regeneration; conflicting rules cannot be silently discarded.
- Unsupported requirements are surfaced before approval, with a distinction
  between applied rules and advisory interpretation.
- Long text, diagrams, charts, and captions remain readable at desktop and phone
  sizes. Preserve factual accuracy, safe areas, and narration timing.
- Old videos remain reproducible after system edits or archival. Updating a
  system requires explicit application to an existing project.
- Verify tenant isolation, stale-edit conflicts, retry behaviour, and paid-job
  idempotency with appropriate authorization and failure-path tests.
- Review representative rendered MP4s. Creators must recognise their intended
  philosophy; schema validity or distinct frame hashes alone do not establish
  visual quality.

## Release defaults and deferred capabilities

The following are proposed defaults, distinct from the product-owner choices
recorded above:

- Private systems reusable across the owner's projects; organisation-wide
  publishing comes later.
- Standard-video support first. Demonstration-mode support requires a separate
  compatibility increment.
- Support validated TTF, OTF, and WOFF2 uploads. Missing fonts require user
  resolution rather than silent substitution.
- Defer live Figma/website imports, executable component uploads, and entirely
  bespoke generated animation code.

## Risks and preparation before implementation

- The rendering vocabulary may be too narrow to express a requested philosophy.
  Use representative reference systems to assess capability gaps before defining
  the implementation stories; report unsupported rules honestly.
- Custom fonts change text measurements and glyph coverage. Use final pinned
  fonts in preflight, preview, and rendering.
- Inferred visual rules can conflict with explicit guidance. Expose the conflict
  for review before saving or applying a system.
- Imported assets need validation, clear usage-rights expectations, and a retention
  policy that preserves assets required by immutable saved videos.
- Reinspect current ADRs, schemas, planner, renderer, and existing job/storage
  workflows when the work is scheduled. This proposal does not freeze their
  implementation details.

Success means a creator can bring their own design language, inspect how the
platform interpreted it, and produce a recognisably personal video without being
forced into a predefined pack.
