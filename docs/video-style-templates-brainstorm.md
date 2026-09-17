# Video Style Templates and User Personalisation

Date: 2026-09-17  
Status: Brainstorm / proposal. This document does not change approved MVP scope or architecture.

## Context

The current project explicitly fixes video output to `mvp-default`, with one navy/teal palette, Atkinson Hyperlegible typography, and shared motion presets. The hook and definition scenes also import that theme directly.

The app's interface design guide is separate from this video theme. Changing the interface branding alone would leave the videos looking largely the same.

Relevant sources:

- [Video theme](../packages/design-system/src/video-theme.ts)
- [Video theme provider](../packages/design-system/src/video-theme-provider.tsx)
- [Hook scene](../packages/scene-library/src/hook-scene.tsx)
- [Definition scene](../packages/scene-library/src/definition-scene.tsx)
- [Product design guide](design.md)
- [MVP PRD](reference/mvp-prd.md)
- [Technical implementation guide](reference/epic-technical-implementation-guide.md)

## Creative recommendation

Build distinct art directions, each with its own composition, imagery, typography, and movement. Swapping colours would only address a small part of the repetition.

The following are original concepts taking broad creative cues from the user's references: Apple, Diary of a CEO, Stripe, and PiggyVest.

## 1. Six preconfigured design directions

| Direction | Visual identity | Motion signature | Strongest use |
| --- | --- | --- | --- |
| **Essential** | Warm white, ink black, a restrained accent; large typography; isolated objects; generous space. The premium restraint sought in an Apple-inspired direction. | Objects assemble, separate, and transform smoothly. Slow, deliberate reveals with a clear focal point. | Science concepts, product explanations, foundational lessons. |
| **Editorial** | Charcoal, ivory, restrained amber; bold headlines; photographic crops; annotated evidence. A documentary direction informed by the Diary of a CEO reference. | Phrase-by-phrase emphasis, purposeful cuts, gentle image pushes, underlines timed to narration. | History, economics, biographies, persuasive explanations. |
| **Systems** | Deep ink or pale neutral backgrounds; fine connectors; precise diagrams; selective colour gradients. A direction for the technical sophistication associated with Stripe. | Paths trace relationships, signals move through systems, diagrams reorganise as the explanation develops. | Technology, processes, cause and effect, business models. |
| **Everyday** | Cobalt, mint, cream; friendly geometric illustration; relatable objects; clear numerals. A direction for the approachable financial storytelling in the PiggyVest reference. | Tokens accumulate, groups form, objects move between containers, restrained spring motion marks milestones. | Financial literacy, practical maths, everyday explanations. |
| **Field Notes** | Paper tones, graphite, rust, olive; documentary images; clean annotations; a readable handwritten accent. | Lines draw on, observations attach to objects, diagrams build step by step. | Biology, geography, discovery, worked explanations. |
| **Prism** | Saturated colour fields, oversized type, bold geometric cutouts, strong contrast. | Shapes become diagrams, words become labels, rhythmic transitions create chapter changes. | Short introductions, revision, younger audiences, memorable recaps. |

Each direction needs its own signature scene treatments. For example, a comparison could become:

- **Essential:** two isolated objects, with their differences revealed one at a time.
- **Editorial:** two photographic panels with evidence annotations.
- **Systems:** two pathways showing where inputs and outcomes diverge.
- **Everyday:** two familiar scenarios illustrated side by side.

That makes the difference visible even before animation starts.

## 2. Make motion explain the subject

A beautifully styled video can still feel repetitive if every scene follows "heading appears → paragraph fades in → next slide."

Design around what changes during the explanation.

Take a lesson about saving money:

- In **Essential**, one coin divides into spending and saving allocations; the saved portion gradually builds a reserve.
- In **Editorial**, a question opens the story, an everyday purchase provides context, and an annotated comparison reveals the trade-off.
- In **Systems**, income flows through a branching diagram into expenses, savings, and a growing balance.
- In **Everyday**, money moves between illustrated envelopes, and a goal fills as deposits arrive.

The factual content stays consistent. The visual storytelling changes.

For science, the same principle applies: evaporation should visibly move water into vapour; a feedback loop should visibly return an effect to its cause.

## 3. Give each style a family of compositions

The ten existing scene types—hook, definition, process, comparison, and so on—are useful teaching structures. Keep those, then give each style several compatible visual treatments.

A hook could use:

- One question filling the frame.
- An object with an unexpected property.
- A contrast between two outcomes.

A process could use a connected path, a transforming object, or a staged assembly.

The selection should follow the lesson's meaning and nearby scenes. Avoid repeating the same composition consecutively, while preserving enough continuity that the video feels intentional.

Vary the rhythm: an energetic opening, quieter explanatory sections, clear pauses for important diagrams, and a concise recap. Constant movement makes everything compete for attention.

## 4. Let users personalise at three levels

### Level one: Make it mine

This should be simple enough to finish in a minute:

| Control | User choice |
| --- | --- |
| Base style | Essential, Editorial, Systems, etc. |
| Colours | Suggested palette or their own brand colours |
| Typography | A small selection of tested font pairings |
| Branding | Logo, opening title, closing identity |
| Motion energy | Calm, balanced, lively |
| Imagery | Photography, illustration, diagrams, or a compatible mix |
| Captions | A few readable, tested treatments |

Motion energy should adjust movement and emphasis without silently making narration faster or cutting reading time.

Users should see these choices applied to their own sample scene, rather than only a polished generic demo.

### Level two: Saved personal styles

A teacher, school, or business can save a reusable style:

> My biology lessons: paper background, forest-green accents, diagram-led visuals, gentle motion, school logo on the closing frame.

The useful feature is consistency across future videos. Organisations could later lock a few brand settings while allowing teachers to choose compatible compositions.

Saved styles should have versions, so updating a school's colours does not change previously approved videos.

### Level three: Describe your style

Let users write something like:

> Make it feel like a calm documentary: warm paper, dark green, photographic evidence, and occasional handwritten annotations.

The system translates that into supported design choices and shows a preview:

> Field Notes · warm paper · forest accents · photographic imagery · calm motion

This fits the existing architecture: AI selects validated design settings and scene treatments; the renderer controls layout and animation.

## 5. Two further personalisation ideas

### More like this feedback

Show three short treatments of the same scene. Users select the closest one, then refine with plain-language actions:

- More visual explanation.
- Less text.
- Calmer movement.
- Stronger contrast.
- More photographic.

People often recognise their taste more easily than they can describe it.

### Reference-to-style matching

Later, users could supply a logo, brand guide, or reference images. The platform extracts a proposed palette and broad visual characteristics, then maps them to supported styles. Show users which characteristics were captured and let them adjust the result.

Position this as "create a style from your references," with an editable preview, rather than promise an exact recreation of any reference video.

## 6. Recommended priorities

For the first expansion, choose **Essential, Editorial, and Everyday**. They create a strong contrast between restrained, documentary, and friendly illustrated storytelling.

Start the creative exploration with the same 20–30 seconds of lesson content in all three directions. Include a hook, an explanation, and a comparison. This would reveal whether the styles truly feel different, including when handling actual educational content.

Then build:

1. Those three complete style packs across the existing scene types.
2. A few composition variants for the most frequently used scenes.
3. Simple personalisation and saved styles.
4. Narration-aligned visual emphasis and smarter composition selection.
5. Reference-based style creation later.

The current PRD deliberately specifies one theme, so implementation would need an explicit scope update and a versioned design approach. Existing approved videos should retain their original appearance. Any major architecture change requires an ADR under the repository rules.

## Creative evaluation criterion

Pause any two styles on the same lesson, then play them. They should look distinct when paused and feel distinct in motion—while making the subject equally clear.

This document records a creative and product brainstorm. No video templates or application behaviour are implemented by this proposal.
