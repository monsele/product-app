# Product Brand and Interface Design Guide

## 1. Purpose

This document is the visual design contract for the AI Visual Learning Platform.
Use it when designing, implementing, reviewing, or testing any user-facing
screen. It expands `docs/ui-design-brief.md` into an operational system for the
current MVP routes.

Product requirements, accepted ADRs, and an assigned story remain authoritative
for behavior and scope. This guide governs presentation and interaction. It must
not be used to invent features, remove acceptance criteria, or change route
structure silently.

## 2. Design read

The product is a desktop-first authoring environment for teachers who need to
turn written teaching material into clear, editable visual lessons. Its visual
language is luminous, creative, calm, and motion-aware. It should feel more like
a focused creative studio than a generic SaaS dashboard.

The interface has two deliberately related modes:

1. **Studio Daylight** for authentication, project management, document review,
   configuration, writing, and delivery.
2. **Focus Studio** for storyboard editing, scene preview, and public playback.

Each route uses one mode for the whole page. Do not alternate light and dark
sections within a working screen.

### Design dials

| Surface                     | Design variance | Motion intensity | Visual density |
| --------------------------- | --------------: | ---------------: | -------------: |
| Marketing and onboarding    |               8 |                8 |              3 |
| Teacher workspace           |               5 |                4 |              6 |
| Review and writing screens  |               4 |                3 |              6 |
| Storyboard editor           |               6 |                5 |              7 |
| Lesson preview and playback |               7 |                6 |              4 |

Higher motion settings do not authorize decorative animation. Every animation
must explain hierarchy, progress, feedback, or a state transition.

## 3. Inspiration and originality

The main visual reference is
[HowDo by Sleeko Studio](https://www.behance.net/gallery/253434761/Best-AI-App-Motion-Explainer-Video-HowDo-by-Sleeko).

Borrow these principles:

- A narrative that moves from confusion to clarity.
- Airy off-white canvases with controlled violet atmosphere.
- Confident grotesk typography and short, direct statements.
- Rounded surfaces that feel tactile without becoming toy-like.
- Real product previews as the center of the composition.
- Motion that transforms one meaningful state into the next.
- A clear primary action and a visible next step.

A secondary dashboard reference supplied by the product owner adds the working
board metaphor used by project-management and information-heavy screens. Borrow
its structural ideas, not its literal decoration:

- A dark ink frame around a calm off-white working canvas.
- An asymmetric main board with a narrower contextual information rail.
- One visually featured record, supported by quieter records and truthful
  compact summaries.
- Soft semantic pastel surfaces for meaning, not arbitrary decoration.
- A visible workflow path only when the connected items belong to the same
  project or process.

Do not copy its emojis, oversized black header, floating tool dock, decorative
dotted paths, overlapping cards, or rotated records. Icon-only actions require
accessible names and tooltips. The bottom tool dock is appropriate only inside
the storyboard editor when every tool has a real editing function.

Do not copy the HowDo logo, wordmark, illustrations, photography, exact screens,
motion sequences, or proprietary assets. Do not use Sharp Grotesk without an
appropriate license. The platform needs an original identity built from the
principles above.

## 4. Brand foundation

### 4.1 Brand idea

**Complex material becomes clear, teachable motion.**

The product should make teachers feel capable and in control. AI accelerates the
work, but the teacher remains the author and final decision-maker.

### 4.2 Brand promise

Turn teaching material into an editable visual lesson without requiring
animation or video-production expertise.

### 4.3 Brand principles

#### Clarity is the product

Each screen has one primary job. The next action is obvious, status is visible,
and explanations use plain language.

#### Transformation should be visible

The product is a pipeline from source document to lesson. Show how source
sections become objectives, how objectives become an outline, and how the
outline becomes scenes. Preserve the user's mental model across transitions.

#### Teachers stay in control

AI suggestions must look editable and reversible. Approved content, generated
content, teacher edits, and source-grounded content must remain distinguishable.

#### Creativity needs calm structure

Expressive color and motion belong around onboarding, progress, previews, and
results. Reading, reviewing, and editing surfaces remain quieter and denser.

#### Trust is visible

Do not hide citations, validation issues, costs, processing states, or failures.
Truth and provenance are part of the design, not secondary metadata.

### 4.4 Product naming

No public product name or logo is approved in the repository. Until one is
approved, use `AI Visual Learning Platform` in metadata and formal contexts. Do
not invent a wordmark, startup-style name, mascot, or logo during screen work.

### 4.5 Voice and copy

The voice is clear, capable, warm, and specific.

Use:

- Concrete verbs: Upload, Review, Approve, Generate, Preview, Render, Download.
- Short headings that describe the current task.
- Reassuring explanations that say what happened and what to do next.
- Status copy that matches actual domain state.
- Teacher-centered language such as `Your source is ready to review`.

Avoid:

- Hype words such as revolutionary, magical, seamless, and next-generation.
- Anthropomorphizing the AI.
- Cute metaphors in errors or high-stakes workflow messages.
- Generic step labels such as Step 1 when the action name is clearer.
- Multiple labels for the same action. Use one term consistently.
- Decorative punctuation, version labels, and technical build metadata.

Preferred value statement:

> Turn teaching material into an editable visual lesson.

## 5. Visual identity

### 5.1 Color strategy

Violet is an explicit brand choice derived from the approved reference. It is
not a generic AI decoration. Use one violet accent consistently and reserve the
violet-to-sky gradient for transformation, active AI work, previews, and brand
moments.

Do not place gradients behind dense text, forms, tables, document content, or
validation messages.

#### Studio Daylight tokens

| Token                    | Value     | Use                                    |
| ------------------------ | --------- | -------------------------------------- |
| `--color-canvas`         | `#F7F8FC` | Page background                        |
| `--color-surface`        | `#FCFCFF` | Primary working surface                |
| `--color-surface-subtle` | `#F0F1F7` | Grouped controls and secondary regions |
| `--color-surface-brand`  | `#F0EAFF` | Selected or AI-assisted regions        |
| `--color-text`           | `#2B2138` | Primary text                           |
| `--color-text-muted`     | `#6C6575` | Secondary text                         |
| `--color-border`         | `#DDD8E5` | Dividers and control borders           |
| `--color-brand`          | `#6430D7` | Primary action and active state        |
| `--color-brand-hover`    | `#5525BF` | Primary action hover                   |
| `--color-brand-active`   | `#47209F` | Primary action pressed state           |
| `--color-focus`          | `#5B2CCB` | Keyboard focus ring                    |

#### Focus Studio tokens

| Token                    | Value     | Use                                  |
| ------------------------ | --------- | ------------------------------------ |
| `--color-canvas`         | `#18131F` | Editor and theater background        |
| `--color-surface`        | `#211A2B` | Working panel                        |
| `--color-surface-raised` | `#292035` | Inspector, menus, and selected scene |
| `--color-text`           | `#F4F1F8` | Primary text                         |
| `--color-text-muted`     | `#BDB5C7` | Secondary text                       |
| `--color-border`         | `#3A3046` | Dividers and control borders         |
| `--color-brand`          | `#A883FF` | Active selection and key action      |
| `--color-on-brand`       | `#1B1027` | Text on the light violet action      |

#### Brand atmosphere

Use this only on large, low-information surfaces:

```css
linear-gradient(135deg, #6F35E8 0%, #8B68EE 52%, #79A9E7 100%)
```

Atmospheric backgrounds may add low-opacity lilac, sky, and peach radial
gradients. Keep saturation controlled and preserve text contrast without relying
on blur.

#### Semantic colors

| State       | Foreground | Background |
| ----------- | ---------- | ---------- |
| Success     | `#176B46`  | `#EFFAF4`  |
| Warning     | `#8A4B08`  | `#FFF8E7`  |
| Error       | `#B42318`  | `#FFF5F4`  |
| Information | `#3159A6`  | `#F0F5FF`  |

Never communicate a state through color alone. Pair it with an icon and a clear
text label. Decorative colored status dots are not part of the system.

### 5.2 Typography

#### Product interface

- Primary family: Geist Sans Variable, self-hosted through `next/font/local`.
- Fallback: `Arial, sans-serif` until the approved font asset is installed.
- Use the same family for display emphasis. Do not introduce a decorative serif.
- Use tabular numerals for durations, timestamps, usage, and render progress.

#### Lesson output

Keep Atkinson Hyperlegible for generated lesson video output unless a dedicated
story changes the video theme. Product UI branding must not silently change the
immutable video design contract.

#### Type scale

| Role             | Desktop size / line height | Typical use                                |
| ---------------- | -------------------------- | ------------------------------------------ |
| Display          | `56 / 60`                  | Marketing and meaningful empty states only |
| Page title       | `36 / 42`                  | Workspace and major route title            |
| Editor title     | `28 / 34`                  | Dense working screens                      |
| Section title    | `24 / 30`                  | Main content groups                        |
| Subsection title | `18 / 24`                  | Inspector and form groups                  |
| Body             | `16 / 24`                  | Default reading text                       |
| Control          | `14 / 20`                  | Buttons, fields, tabs, and navigation      |
| Supporting       | `13 / 18`                  | Metadata and helper text                   |

Use sentence case. Keep page titles under eight words. Avoid wide-tracked,
uppercase eyebrow labels except when they communicate a real content category.

### 5.3 Shape

Use a documented mixed-radius system:

- Major surfaces, dialogs, and cards: `16px`.
- Inputs, menus, thumbnails, and nested controls: `10px`.
- Primary and compact action buttons: pill shape.
- Circular controls: icon-only buttons, avatars, and play controls only.

Do not mix sharp cards, heavily rounded cards, and pill cards on the same screen.

### 5.4 Borders and elevation

- Prefer spacing and a single divider over placing every item in a card.
- Use one-pixel neutral borders for structural separation.
- Use tinted shadows only when elevation communicates interaction or layering.
- Daylight shadow: `0 18px 50px rgb(73 52 105 / 0.10)`.
- Focus Studio shadow: `0 20px 60px rgb(8 4 14 / 0.36)`.
- Do not apply outer glows to buttons, fields, or validation states.

### 5.5 Iconography

- Preferred family: Phosphor Icons with a consistent `1.5` stroke weight.
- Default size: `20px`; compact controls: `16px`; feature moments: `24px`.
- Do not mix icon families within the application.
- Do not hand-draw interface SVG icons.
- Every icon-only action requires an accessible name and a visible tooltip.

No icon package is currently installed in the web app. The first UI foundation
story that uses icons must add and document the dependency explicitly.

### 5.6 Imagery and lesson previews

- Use actual lesson frames, actual application screenshots, or approved
  educational imagery.
- Do not build fake screenshots from decorative rectangles.
- Use teacher or learner photography only when it supports a real story, not as
  filler behind text.
- Keep scientific imagery accurate, age-appropriate, and traceable.
- Show asset provenance anywhere an AI-generated or source-derived asset is
  selected.
- Use 16:9 as the default visual preview ratio.

## 6. Layout system

### 6.1 Global shell

The default authenticated shell uses:

- A `64px` top bar for product identity, project context, status, and account
  actions.
- A `224px` project pipeline rail on routes that belong to a project.
- A flexible central work area with `min-width: 0`.
- An optional `320-360px` contextual inspector.
- A maximum application width of `1600px`, except the storyboard editor, which
  may use the full viewport.
- Page padding of `24px` at desktop, `20px` at tablet, and `16px` at mobile.

The project pipeline uses the action names:

`Source`, `Review`, `Setup`, `Objectives`, `Outline`, `Narration`, `Storyboard`,
`Preview`, `Deliver`.

Show completed, current, available, and blocked stages. Do not imply completion
that the domain state does not confirm.

### 6.2 Project board and information rail

Use this pattern for the teacher workspace and other board-style summary
screens. It adapts the supplied dashboard reference to the product's real
workflow without copying its ornamental details.

- At wide desktop widths, use an approximately `70 / 30` composition: the main
  project board occupies the flexible region and the information rail occupies
  `320-360px`.
- The board contains the primary action, one featured recent or selected
  project when real data exists, and the remaining project records.
- The information rail contains contextual next actions, file requirements,
  failures, render or delivery state, or other information already supported by
  the screen's contracts. It is not a generic activity feed.
- Compact summary values must come from authoritative data. If the API does not
  provide an aggregate, omit it rather than counting one pagination page or
  inventing a total.
- Pastel surfaces use semantic status tokens. Violet remains the brand accent
  and must not compete with unrelated decorative colors.
- Workflow connectors are limited to stages of one selected project. Never draw
  connectors between unrelated project cards.
- Minor overlap or offset may emphasize one featured item on wide screens, but
  it must not cover content, controls, or focus indicators.
- Below `1024px`, move the information rail below the main board or into a
  labeled drawer. Below `768px`, use a strict single column with no overlap or
  rotation.

### 6.3 Reading width

- Long prose and narration: maximum `72ch`.
- Form columns: maximum `720px` unless comparison requires more space.
- Dialog text: maximum `60ch`.
- Document review may exceed these limits because source and correction views
  need side-by-side comparison.

### 6.4 Responsive behavior

#### 1280px and wider

Show the full project rail. The storyboard may show scene navigation, canvas,
and inspector simultaneously.

#### 768px to 1279px

Collapse the project rail to icons or a labeled drawer. Move secondary
inspectors into a slide-over panel. Keep the primary action visible.

#### Below 768px

Use a strict single column. Do not preserve desktop asymmetry. Editors may use a
sequence of `Scenes`, `Preview`, and `Details` tabs. Drag and drop must have
button-based alternatives. Tables become labeled record groups or horizontal
scroll regions only when the data relationship requires a table.

Use `min-height: 100dvh` for full-height product surfaces. Never rely on
`100vh` for mobile layouts.

## 7. Navigation and action hierarchy

Each screen has one dominant action. The hierarchy is:

1. Primary action: solid brand fill.
2. Secondary action: neutral surface with a border.
3. Tertiary action: text or quiet icon button.
4. Destructive action: error color, separated from the normal flow, confirmed
   when the result is hard to reverse.

Primary labels should usually contain one to three words. Button text must not
wrap on desktop. Do not place two controls with the same intent on one screen.

Save behavior must be explicit:

- Use `Save changes` when a manual save is required.
- Use `Saved` with a timestamp when autosave is implemented and confirmed.
- Never show a fake autosave state.
- Approval is distinct from saving. Use `Approve objectives`, `Approve outline`,
  or the exact domain action.

## 8. Core component direction

### 8.1 Application header

Keep the header on one line at desktop. Show product identity on the left,
project title and status near the center, and account or high-level actions on
the right. Avoid a second utility bar.

### 8.2 Project pipeline rail

The rail is navigation and workflow context, not a decorative progress bar. It
must remain keyboard navigable, expose blocked stages, and preserve route labels
at desktop.

### 8.3 Project records

Use one featured `Create lesson` surface followed by a clean project list or
asymmetric grid. A project record contains title, meaningful stage, updated
time, visual thumbnail when available, and a single open action. Duplicate and
delete live in an overflow menu.

Do not put separate forms and multiple action links inside every project card.

### 8.4 Forms

- Put labels above controls.
- Helper text follows the label or control.
- Inline errors appear below the relevant control.
- Do not use placeholder text as a label.
- Group related choices with `fieldset` and `legend`.
- Make selected states visible beyond color.
- Preserve entered values after recoverable errors.

### 8.5 Status and progress

Use skeletons that match the expected content for short loading states. For
background work, show the actual job state, a plain-language explanation, and
the next available action. Do not invent percentage progress when the backend
does not provide it.

The transformation pipeline may animate between known stages, but it must stop
and display a stable state when the job is waiting, failed, or blocked.

### 8.6 Notices

- Inline validation belongs next to the affected content.
- Page-level failures use a persistent banner with recovery action.
- Toasts are reserved for short, non-critical confirmations.
- Warnings never use the same styling as errors.

### 8.7 Dialogs

Use dialogs for confirmation, focused generation choices, and replacement flows.
Do not move ordinary editing into repeated modal windows. Destructive dialogs
name the affected object and describe whether recovery is possible.

### 8.8 Scene thumbnails

A scene thumbnail uses a real frame preview when available. Show scene order,
title, duration, and grounded or warning state outside the image. Selection uses
border, surface, and text changes together. Never overlay decorative tags on the
preview image.

### 8.9 Inspector

The inspector is contextual. Only show controls and evidence related to the
current selection. Group content into `Content`, `Visual`, `Audio`, `Sources`,
and `Checks` where those categories exist. Use tabs or disclosure sections when
all groups would create excessive vertical scrolling.

### 8.10 AI command field

When a screen supports natural-language changes, the field must name its scope,
for example `Describe how to revise this scene`. Keep a nearby set of supported
actions such as Shorten, Simplify, Expand, or Regenerate. Submitting a paid
provider action requires the quota and confirmation behavior defined by the
product requirements.

## 9. Motion system

### 9.1 Motion principles

- Preserve continuity when an item changes position or expands into detail.
- Use motion to show transformation from one approved artifact to the next.
- Keep reading and editing surfaces still while the user is typing.
- Prefer direct state transitions over perpetual ambient loops.
- Animate only transform and opacity.

### 9.2 Timing

| Token     | Duration | Use                                                |
| --------- | -------: | -------------------------------------------------- |
| Instant   |  `120ms` | Pressed state and compact feedback                 |
| Quick     |  `200ms` | Menu, tooltip, and selection                       |
| Standard  |  `320ms` | Panel, disclosure, and route-local transition      |
| Transform |  `600ms` | Source-to-outline or outline-to-scenes explanation |

Standard easing: `cubic-bezier(0.16, 1, 0.3, 1)`.

Use spring motion only for direct manipulation such as scene reorder, panel
expansion, or a draggable asset. Do not use bouncy motion for errors, approvals,
or destructive actions.

### 9.3 Reduced motion

Honor `prefers-reduced-motion`. Replace transformation sequences with an instant
state change or a short opacity transition. Autoplaying, parallax, and looping
motion must stop. Product use must remain complete without animation.

### 9.4 Implementation boundary

The web app does not currently include a UI motion dependency. A future story
must verify and add the dependency before importing it. If Motion is selected,
interactive animation belongs in small client components. Server components
remain responsible for static layout and data loading.

Do not implement scroll behavior through React state or unthrottled window scroll
listeners.

## 10. Screen-by-screen direction

### 10.1 Root route

The current root route is a health screen, not a public marketing page. Keep it
functionally simple until a marketing story is assigned. Do not silently turn it
into a landing page.

If a public landing page is later approved, use an asymmetric split hero with a
real product or lesson preview, the preferred value statement, one primary
action, and one secondary action. Keep the hero within the initial viewport.

### 10.2 Sign in, registration, and password recovery

**Mode:** Studio Daylight.

Use a two-part composition at desktop. The form occupies a calm, narrow column.
The supporting region shows a real lesson transformation or an approved visual
asset. On small screens, remove the supporting region and keep the form first.

- Keep forms between `400px` and `460px` wide.
- Use one page title, one short explanation, and the form.
- Keep password requirements visible before submission.
- Show errors inline and preserve valid fields.
- Do not use a centered glass card over a decorative gradient.
- Primary action: `Sign in`, `Create account`, `Send reset link`, or
  `Update password`.

### 10.3 Teacher workspace

**Mode:** Studio Daylight.

Lead with an asymmetric `Create lesson` surface that clearly starts a project.
Place recent projects below or beside it based on available width. Use actual
lesson thumbnails only after they exist.

- Page title: `Your lessons`.
- Primary action: `Create lesson`.
- Project stage should use the teacher-facing label mapped from domain state.
- Show failures within the affected project record with a recovery path.
- Keep duplicate and delete in an overflow menu.
- Empty state should explain the PDF or DOCX starting point and offer the create
  action.
- Pagination remains explicit and keyboard accessible.

### 10.4 Source upload and ingestion

**Mode:** Studio Daylight.

Make the upload surface the visual focus. Pair it with a compact requirements
summary and the project pipeline. After upload, the same region transforms into
processing status so the user does not lose context.

- Show accepted file types, size limit, page limit, and English-only boundary.
- Provide a browse action and drag-and-drop support.
- Progress reflects actual upload bytes only.
- Ingestion shows named backend stages rather than invented percentages.
- Duplicate detection is a decision panel, not a generic error.
- Success action: `Review source`.
- Failure states preserve the file name and offer the allowed recovery action.

### 10.5 Ingestion review

**Mode:** Studio Daylight with high information density.

Use a split document workspace:

- Left: section tree, warnings, page navigation, and include or exclude state.
- Center: extracted content with headings, figures, tables, and page references.
- Right or slide-over: correction, provenance, and selected item controls.

The content itself remains visually dominant. Use surface changes sparingly.
Teacher corrections must be distinguishable from the immutable original and
must include a restore action. Excluded content remains discoverable and
reversible.

Primary action: `Confirm source`.

On small screens, use `Sections`, `Content`, and `Details` tabs. Do not compress
the three desktop regions into unusable narrow columns.

### 10.6 Lesson and voice configuration

**Mode:** Studio Daylight.

Use one focused form column with a sticky lesson summary on wide screens. Group
choices into learner, lesson, visual, and narration sections. Avoid a sequence
of unrelated cards.

- Use segmented controls or radio groups for small fixed option sets.
- Make duration and tone choices easy to compare.
- Voice options include name, description, playback, and selected state.
- Speaking-rate feedback uses a readable value next to the control.
- Pronunciation overrides use repeatable field groups with explicit removal.
- Primary action: `Save setup` or the exact generation action required by the
  current story.

### 10.7 Learning objectives

**Mode:** Studio Daylight.

Present objectives as an ordered, editable learning plan. Use spacing and order
handles rather than placing every sentence in a heavy card.

- Each objective shows edit, remove, reorder, and source-grounding context.
- Suggested and approved states are visually distinct and labeled.
- Add and regenerate actions must not compete with approval.
- Regeneration explains what content will be preserved.
- Primary action: `Approve objectives`.

Use a compact source drawer for prerequisite knowledge, vocabulary,
misconceptions, and assessment suggestions when those data are available.

### 10.8 Lesson outline

**Mode:** Studio Daylight.

Show a vertical story arc from hook through summary. Each outline item includes
title, teaching purpose, estimated time, and covered objectives when available.

- Reordering uses drag and drop plus move controls.
- Duration totals remain visible without turning into a dashboard chart.
- Source links open the relevant review location.
- Keep generation candidates separate from the approved outline.
- Primary action: `Approve outline`.

### 10.9 Narration

**Mode:** Studio Daylight.

Treat narration as a reading and writing surface. Use a central script column and
a narrow contextual panel for source support, duration, and rewrite actions.

- Divide the script by lesson section or scene group.
- Keep line length within `72ch`.
- Show word or duration estimates only when derived from real data.
- Shorten, Simplify, Expand, and Regenerate are scoped to the selected block.
- Teacher edits must survive candidate generation until replacement is
  confirmed.
- Primary action: the exact approval or continuation action supported by the
  story.

### 10.10 Storyboard editor

**Mode:** Focus Studio.

This is the main creative workspace. Use the full viewport with three adaptive
regions:

- Left: ordered scene navigation.
- Center: large 16:9 scene preview and direct scene context.
- Right: contextual inspector for content, visual, audio, sources, and checks.

Keep the canvas as the strongest visual element. The scene list and inspector
must not compete with it.

- Scene reorder, add, duplicate, and delete remain visible and keyboard usable.
- Regeneration is scoped to the selected scene and names what will change.
- Source citations and grounding are one inspector section away, not buried in
  a separate route.
- Asset pickers show provenance and real previews.
- Audio controls belong with the selected scene.
- Version history opens as a focused panel with timestamps and restoration
  consequences.
- Validation issues link to the affected scene or upstream artifact.
- Primary action: `Preview lesson` when validation permits it.

On tablet, place scene navigation in a collapsible strip and the inspector in a
drawer. On mobile, use `Scenes`, `Preview`, and `Details` tabs with button-based
reorder controls.

### 10.11 Full lesson preview

**Mode:** Focus Studio.

Use a theater composition with the 16:9 lesson player centered and minimal
surrounding chrome.

- Provide play, pause, seek, captions, volume, and scene navigation.
- Keep scene markers connected to meaningful scene titles.
- Show `Edit scene` as a contextual action linked to the current scene.
- Preserve approximate-final-output messaging when preview quality differs from
  render quality.
- Display missing asset, missing audio, or invalid scene errors in the player
  region with a direct edit action.
- Primary action: `Render lesson` after checks pass.

### 10.12 Render, export, and sharing

**Mode:** Studio Daylight.

Organize the screen around the latest render first. Older renders and share
links are history, not equal-weight cards.

- Show queued, rendering, completed, failed, and retry states plainly.
- Show real progress only when available.
- Completed render includes thumbnail, created time, file details, and download.
- Group MP4, captions, narration, and storyboard under `Downloads`.
- Place share-link creation in a separate section with permission and revocation
  status.
- Destructive revocation requires confirmation and names the link.
- Primary action depends on state: `Start render`, `Retry render`, or
  `Download video`.

### 10.13 Public shared lesson

**Mode:** Focus Studio theater.

The lesson is the page. Use a restrained header with lesson title and owner or
source attribution only when the product provides that data. Center the player,
preserve captions, and avoid editor controls.

Unavailable or revoked links use a calm, self-contained error page. Do not
reveal private project details, internal identifiers, or recovery controls to a
viewer.

### 10.14 Internal video design preview

This route is a development tool, not a customer-facing gallery. Give it a
simple Studio Daylight shell, clear fixture selectors, and a large preview. It
must exercise the shared video theme rather than introduce application-brand
styles inside rendered scenes.

## 11. Loading, empty, error, and success states

Every screen implementation includes all relevant states before it is complete.

### Loading

- Match skeleton geometry to the expected final content.
- Keep previously usable content visible during background refreshes.
- Use a spinner only inside a compact button or control when no structural
  skeleton is appropriate.

### Empty

- State what is missing.
- Explain how to create it.
- Provide one primary action.
- Use an approved illustration or real preview only when it adds meaning.

### Error

- State what failed in teacher-facing language.
- Preserve unaffected work.
- Explain whether retry is safe.
- Provide a recovery action when one exists.
- Do not expose raw provider payloads, storage URLs, or internal stack details.

### Success

- Confirm the completed action without blocking the next step.
- Update the relevant artifact or status in place.
- Reserve celebratory motion for major milestones such as the first complete
  preview or successful final render.

## 12. Accessibility and inclusive design

- Meet WCAG AA contrast for controls and body text. Target AAA for long-form
  source and narration text.
- All interaction is available by keyboard.
- Focus indicators are visible on both page modes.
- Maintain logical heading order and semantic landmarks.
- Announce upload, generation, validation, and rendering changes through
  appropriate live regions without repeated noise.
- Do not rely on hover for required information.
- Provide text alternatives for educational imagery and meaningful preview
  frames.
- Captions remain available in preview and public playback.
- Drag-and-drop interactions include move-up and move-down alternatives.
- Minimum target size is `44px` for primary touch controls and `36px` for compact
  desktop controls.
- Validate zoom at 200 percent without hiding actions or content.

## 13. Content and data integrity rules

- Use actual project, job, validation, and render states from contracts.
- Never invent progress percentages, success metrics, or classroom outcomes.
- Preserve tenant isolation in links, previews, assets, and error messages.
- Never display source text in logs or diagnostic UI.
- Do not display raw provider responses.
- Do not expose signed URLs beyond their intended media surface.
- Clearly identify AI-generated additions and source-grounded content.
- Paid generation actions require explicit user action, quota checks, and usage
  records as defined by the product requirements.

## 14. Implementation foundation

The current web application has no installed component, icon, or UI motion
library. This guide does not add one.

When implementation begins:

1. Define the semantic color, spacing, radius, typography, shadow, and z-index
   tokens in one application-level source.
2. Use CSS variables so Studio Daylight and Focus Studio share component APIs.
3. Build or adopt one accessible component foundation. Do not mix multiple
   design systems.
4. Check `package.json` before importing any package.
5. Keep animated client components small and isolated.
6. Preserve current form names, route labels, authorization behavior, and test
   selectors unless the assigned story approves a change.
7. Keep the product UI token system separate from the Remotion video theme.

Suggested future dependency direction, subject to an implementation story:

- Accessible primitives: Radix UI or Radix Themes, customized with these tokens.
- Icons: Phosphor Icons.
- Interaction motion: Motion for React.

Do not install these dependencies as part of an unrelated feature story.

## 15. Screen design worksheet

Before implementing a new screen, record:

1. Route and assigned story.
2. User goal in one sentence.
3. Primary action and continuation action.
4. Studio Daylight or Focus Studio mode.
5. Design variance, motion intensity, and visual density.
6. Required information hierarchy.
7. Loading, empty, error, success, blocked, and permission states.
8. Desktop, tablet, and mobile composition.
9. Keyboard and screen-reader behavior.
10. Paid-action, source-grounding, tenant, and privacy implications.
11. Real imagery or preview assets required.
12. Visual-regression screenshots required by the story.

If a screen cannot answer these points, it is not ready for implementation.

## 16. UI review checklist

### Brand and hierarchy

- [ ] The screen has one clear purpose and one dominant action.
- [ ] The correct route-level mode is used consistently.
- [ ] Violet is purposeful and not spread across every surface.
- [ ] The gradient appears only in a transformation, preview, or brand moment.
- [ ] Typography follows the approved family and scale.
- [ ] Shape and shadow rules are consistent.

### Product behavior

- [ ] The UI reflects real domain states and does not invent functionality.
- [ ] Generated, approved, teacher-edited, and source-grounded content are clear.
- [ ] Paid actions are explicit.
- [ ] Destructive actions are separated and confirmed where required.
- [ ] Authorization and tenant isolation remain intact.

### Interaction

- [ ] Loading, empty, error, success, and blocked states are designed.
- [ ] Button labels do not wrap on desktop.
- [ ] The same intent uses the same label everywhere.
- [ ] Motion explains feedback or state change.
- [ ] Reduced motion provides a complete experience.

### Accessibility

- [ ] Text, controls, forms, and focus indicators meet contrast requirements.
- [ ] Labels are visible and placeholders are not used as labels.
- [ ] Keyboard navigation and focus order are complete.
- [ ] Icon-only actions have accessible names.
- [ ] Status changes are announced appropriately.
- [ ] Drag actions have button alternatives.

### Responsive and quality

- [ ] The screen is reviewed at mobile, tablet, laptop, and wide desktop widths.
- [ ] Multi-panel layouts have an explicit narrow-screen fallback.
- [ ] Content remains usable at 200 percent zoom.
- [ ] Images and player regions reserve their dimensions to prevent layout shift.
- [ ] No fake screenshots, decorative status dots, or unnecessary cards appear.
- [ ] Visible copy has been read for clarity, accuracy, and consistency.

## 17. Known open brand decisions

These decisions require explicit product-owner approval before implementation:

- Public product name.
- Logo and wordmark.
- Licensed or self-hosted final brand font asset.
- Whether the public marketing site launches in the MVP.
- Whether the default generated lesson theme will eventually adopt the violet
  product identity.
- Whether a user-selectable dark mode is needed outside Focus Studio routes.

Until those decisions are made, follow this guide without inventing answers.
