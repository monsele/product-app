# Varied, coherent visual storytelling for generated videos

## 1. Outcome and scope

Upgrade production generation so each video has one coherent visual identity, with varied compositions, topic-specific imagery, text placement, and narration-led motion.

Preserve approved narration, facts, citations, and audio. Improve the visual explanation through shorter screen text, meaningful illustrations, and multiple timed visual beats.

The reference demonstrates the target: illustrated timelines, highlighted statements, visual comparisons, chapter cards, and diagrams that share a consistent drawing language. Its pink palette is a reference choice, not our new universal default.

The investigation found:
- This lesson selected **Everyday**, despite its default-looking output.
- All eight scenes received their **primary** treatment.
- Twenty-two illustrations were accepted, while some components render asset slots as dots.
- Several components combine new styling with legacy colors and geometry.

## 2. Rendering and composition

**Fix the production rendering gaps first.**

- Make all ten semantic scene types consume the complete resolved palette, typography, and asset bindings.
- Render actual bound images in every supported image slot; eliminate placeholder dots from finished videos.
- Remove the compulsory decorative border from new treatments. Borders, backgrounds, and patterns become deliberate composition choices.
- Display the resolved style’s human-readable name in configuration, preview, and delivery. Show the legacy theme only for genuinely legacy lessons.

**Build real composition alternatives.**

Retain the six existing style identities. Introduce versioned composition implementations rather than multiplying palette-only templates.

Support these eight composition families:
1. Illustration with an asymmetric headline.
2. Large statement with selective word emphasis.
3. Numbered chapter or section introduction.
4. Illustrated timeline or sequence.
5. Object comparison or before/after.
6. Connected cause-and-effect explanation.
7. Annotated hero diagram.
8. Takeaway arrangement or closing question.

Register compatibility with the ten semantic scene types. Each type must have at least two genuinely different arrangements. Variants must change content placement and hierarchy, not merely borders, colors, or spacing.

Keep screen text, diagrams, and captions as native renderer elements. Generated images provide illustration assets, never flattened slides containing essential text.

## 3. Visual planning, imagery, and motion

**Add a bounded visual-planning job between storyboard creation and illustration generation.**

Reuse the existing model-call, quota, metering, and job infrastructure. The planner receives approved scene content, narration, the selected identity, available assets, and the registered composition catalogue.

It proposes composition choices, concise display text, illustration briefs, and visual beats anchored to narration spans. It cannot supply code, coordinates, CSS, or new factual claims. Validate display wording and visual relationships against the approved content.

Replace the unconditional primary-treatment preference with whole-video selection considering content, image availability, text density, and recent compositions. Avoid more than two consecutive uses of the same composition family when compatible alternatives exist. Use a persisted variation seed so separate videos can differ while saved renders remain reproducible.

**Make illustrations consistent and purposeful.**

- Reuse suitable source figures and existing project assets before generating replacements.
- Extend the illustration request beyond its single fixed style to registered flat, ink/sketch, and editorial illustration treatments, selected once per video.
- Include a shared art-direction brief: palette, line treatment, subject depiction, and background handling. Permit appropriate human illustrations.
- Deduplicate requests by concept and treatment. Budget for up to eight unique generated illustrations per five-minute video, capped at twelve per video.
- Keep generated supporting imagery distinct from source evidence. Factual diagrams and relationships remain grounded, native graphics.
- If optional illustration generation fails, use a compatible library asset or authored graphic within the same identity. Resolve and record that choice before freezing the preview.

**Make motion explain the narration.**

Provide four registered motion families: sequential reveal, path/relationship build, emphasis/highlight, and object transformation.

Resolve narration anchors against audio/caption timing after TTS. Reveal and emphasize the element currently discussed; preserve readable holds and caption space. Long scenes receive successive visual beats instead of completing every animation at the beginning.

Use restrained cuts, dissolves, and directional continuity. Transitions must not shorten narration, overlap speech, or alter the established audio timeline.

## 4. Contracts, compatibility, and delivery

- Add a versioned visual-plan contract and **creative-design manifest v2** in the existing parallel design-manifest architecture. Persist composition versions, narration anchors, resolved timing, asset identities, art direction, and variation seed.
- Keep v1 readers and rendering implementations intact. Upgrade through new snapshots and render identities; never rewrite approved historical versions.
- Extend existing design APIs and illustration job payloads to accept the versioned contracts. Reuse existing JSONB storage and `ai.creative_design` metering; no new storage table is required.
- Include visual planning and illustration allowances in brief estimates and run-budget reservations. Fallbacks cannot exceed the approved cap.
- Pin design, assets, timing, fonts, and implementation versions identically in preview and final rendering.
- Record an ADR covering v2 composition planning and permitted automatic asset substitution **before preview approval**. Approved manifests retain strict reproduction behavior.
- Implement sequential stories: rendering repairs; v2 contracts and compositions; visual planning and imagery; timed motion; production integration and acceptance. Update each story’s completion record and index.

The first production proof uses this lesson, reusing its narration and suitable generated assets. Then verify contrasting engineering and financial-literacy lessons. Enable the new path for new videos after these checks pass; historical lessons receive an explicit upgrade path.

## 5. Acceptance and testing

**Visual acceptance**
- This lesson demonstrates at least six distinct composition families across its eight scenes.
- Images are visibly rendered where selected; no placeholder symbols or accidental legacy colors remain.
- No clipped text, unreadable contrast, caption collisions, or decorative framing that obscures content.
- Text placement and imagery differ meaningfully between scenes while the video retains one identity.
- Long scenes change visual focus at relevant narration moments.
- Review the actual rendered videos at desktop and phone playback sizes. Different frame hashes alone do not establish visual quality.

**Engineering and recovery**
- Test every semantic type against all six identities, including both composition alternatives.
- Test narration-anchor resolution, seeking, timing reconciliation, and preview/render parity.
- Test asset reuse, deduplication, missing-image fallback, provider failure, budget exhaustion, retry idempotency, tenant isolation, and usage accounting.
- Prove old snapshots retain their original rendering behavior and new snapshots have distinct cache identities.
- Confirm visual-planning or optional-image failure produces a valid authored fallback without requesting user intervention or weakening grounding.
- Track completion without intervention, fallback frequency, composition distribution, actual image use, latency, and cost.

Completion requires reviewed MP4s for all three proof lessons—not just catalogue entries, screenshots, or passing unit tests.
