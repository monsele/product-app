# AI Visual Learning Platform — MVP Product and Engineering Plan

## Executive Summary

This product should not be treated as a simple “text-to-video generator.”

It is better understood as an **AI instructional-design and visual-composition system** that helps teachers transform textbook chapters and written learning materials into visual, narrated, motion-graphics-based lessons for visual-spatial learners.

The MVP should:

1. Accept a short PDF or DOCX chapter.
2. Extract and understand the educational content.
3. Identify learning objectives, concepts, examples, and misconceptions.
4. Convert the source into a lesson script.
5. Create a scene-by-scene visual storyboard.
6. Select appropriate visual templates.
7. Generate narration and timing.
8. Allow the teacher to review and edit the lesson.
9. Render a polished Udemy-style visual explainer video.

## Recommended Technology Direction

Use the following stack:

- **Codex** as the primary coding agent
- **Next.js and TypeScript** for the web application
- **Remotion** as the main video composition engine
- **SVG and React components** for motion graphics
- **Motion Canvas** for specialised technical diagrams
- **FFmpeg** for final media processing
- **A capable multimodal AI model** for document understanding and lesson planning
- **A human review workflow** before final rendering

For the initial production MVP, choose **Codex over Antigravity**.

Codex is a better fit for a growing codebase involving document parsing, structured schemas, background rendering jobs, media infrastructure, test suites, prompt evaluation, and multiple packages or repositories.

Antigravity may still be useful for browser-heavy prototyping, UI experimentation, and visual quality assurance.

---

# Product Definition

The product flow should look like this:

```text
Teacher uploads PDF or DOCX
              ↓
Document is parsed and segmented
              ↓
AI extracts learning objectives
              ↓
AI creates a lesson script
              ↓
AI creates a scene-by-scene visual plan
              ↓
Scene planner selects reusable templates
              ↓
Narration and timestamps are generated
              ↓
Teacher reviews the storyboard
              ↓
Remotion renders the video
              ↓
Teacher previews, edits and exports
```

A key product decision is:

> Do not let the AI freely generate arbitrary animation code for every scene.

Allowing unrestricted code generation will create inconsistent visual design, rendering failures, unpredictable layouts, poor timing, and difficult-to-maintain animation code.

Instead, create a controlled **visual learning language** made from reusable scene templates and structured lesson data.

---

# The Lesson Specification

The AI should not directly generate the final video.

It should first generate a structured intermediate representation called a **Lesson Specification** or `LessonSpec`.

```json
{
  "lessonTitle": "Introduction to Photosynthesis",
  "audience": {
    "level": "Junior secondary",
    "priorKnowledge": ["Basic plant structure"]
  },
  "learningObjectives": [
    "Explain why plants need photosynthesis",
    "Identify the inputs and outputs",
    "Describe the role of sunlight"
  ],
  "scenes": [
    {
      "id": "scene-01",
      "type": "hook",
      "durationSeconds": 12,
      "narration": "A plant cannot walk to a restaurant, so how does it get food?",
      "visual": {
        "template": "character-question",
        "subject": "plant",
        "supportingElements": ["restaurant", "sunlight"]
      }
    },
    {
      "id": "scene-02",
      "type": "process-diagram",
      "durationSeconds": 18,
      "narration": "Plants combine carbon dioxide and water using energy from sunlight.",
      "visual": {
        "template": "input-process-output",
        "inputs": ["Carbon dioxide", "Water", "Sunlight"],
        "process": "Photosynthesis",
        "outputs": ["Glucose", "Oxygen"]
      }
    }
  ]
}
```

The LessonSpec becomes the contract between the AI pipeline and the video renderer.

It provides reliable outputs, schema validation, editable scenes, repeatable animation behaviour, multiple themes, scene-level regeneration, and support for future interactive learning experiences.

---

# Use Templates Instead of Infinite Generation

The MVP should begin with approximately **10–15 high-quality scene templates**.

## Recommended Scene Templates

1. **Hook scene** — a surprising question, fact, or problem.
2. **Definition scene** — term, simple explanation, and visual example.
3. **Input–process–output** — useful for biology, chemistry, computing, economics, and systems.
4. **Sequence or process** — progressive steps.
5. **Comparison** — split-screen similarities and differences.
6. **Cause and effect** — cause, mechanism, and result.
7. **Labelled diagram** — cells, organs, machines, maps, and systems.
8. **Zoom into detail** — whole object to smaller component.
9. **Timeline** — history, development, or ordered events.
10. **Numerical visualisation** — counters, bars, proportions, and simple charts.
11. **Analogy scene** — unfamiliar idea mapped to a familiar one.
12. **Worked example** — step-by-step problem solving.
13. **Misconception correction** — common belief versus correct model.
14. **Summary scene** — rebuilds the lesson’s central mental model.
15. **Recall question** — asks learners to predict or remember something.

Each template should be implemented as a stable React component.

```tsx
<ComparisonScene
  title="Plant cells and animal cells"
  left={plantCell}
  right={animalCell}
  similarities={["Cell membrane", "Nucleus"]}
  differences={["Cell wall", "Chloroplasts"]}
/>
```

---

# Product Differentiation

The product’s value is not simply converting paragraphs into voice-over.

Its differentiation should be a **visual pedagogy engine** that chooses the right representation for each concept:

- A process becomes a process diagram.
- A comparison becomes a split-screen visual.
- A spatial relationship becomes a labelled model.
- A causal explanation becomes an animated chain.
- A numerical relationship becomes a proportion or graph.
- An abstract concept becomes an analogy.
- A sequence becomes a timeline or progressive construction.

---

# AI Pipeline

## Stage 1: Document Ingestion

Responsibilities:

- extract text;
- preserve headings;
- identify figures and captions;
- detect tables;
- associate images with nearby text;
- record page references;
- remove headers and footers.

For the MVP, support digitally generated PDFs and DOCX files with clear layouts, preferably 5–20 pages per lesson.

## Stage 2: Instructional Analysis

Extract:

- target learner;
- prerequisite knowledge;
- key concepts;
- learning objectives;
- misconceptions;
- vocabulary;
- examples;
- assessment questions.

Output validated JSON.

## Stage 3: Lesson Architecture

Decide:

- lesson sequence;
- opening hook;
- explanation order;
- where analogies are needed;
- where diagrams are better than prose;
- where recall questions should appear;
- what information should be omitted.

## Stage 4: Narration Generation

Narration should be written for speech, using shorter sentences, one idea at a time, clear transitions, and explicit visual guidance.

## Stage 5: Visual Planning

The AI selects a supported visual template.

```ts
type VisualTemplate =
  | "hook"
  | "definition"
  | "comparison"
  | "process"
  | "cause-effect"
  | "labelled-diagram"
  | "timeline"
  | "analogy"
  | "worked-example"
  | "summary";
```

The AI should not control exact coordinates. The layout engine should position elements.

## Stage 6: Asset Planning

Classify scene assets as:

- reusable library icon;
- generated SVG;
- generated illustration;
- source-document figure;
- text and shapes only;
- stock media;
- diagram assembled from primitives.

For the MVP, favour typography, SVG illustrations, icons, shapes, diagrams, and permitted textbook figures.

## Stage 7: Narration and Timing Alignment

Generate voice-over and obtain sentence-level or word-level timestamps.

```json
{
  "text": "Water enters through the roots.",
  "startMs": 4200,
  "endMs": 6900,
  "words": [
    { "text": "Water", "startMs": 4200, "endMs": 4700 },
    { "text": "enters", "startMs": 4700, "endMs": 5200 }
  ]
}
```

This enables synchronised text highlighting, arrows, reveals, diagrams, captions, and transitions.

## Stage 8: Rendering

A background worker should:

1. Receive a render job.
2. Load the LessonSpec.
3. Fetch assets.
4. Generate the Remotion composition.
5. Render scenes.
6. Mix narration, music, and sound effects.
7. Upload the MP4.
8. Generate thumbnails and previews.
9. Update job status.

---

# Suggested Technical Architecture

```text
                         ┌─────────────────────┐
                         │ Next.js teacher app │
                         └──────────┬──────────┘
                                    │
                         Upload / edit / preview
                                    │
                         ┌──────────▼──────────┐
                         │ Application API     │
                         │ TypeScript          │
                         └───────┬─────┬───────┘
                                 │     │
                    ┌────────────┘     └────────────┐
                    │                               │
          ┌─────────▼─────────┐          ┌──────────▼─────────┐
          │ AI lesson service │          │ PostgreSQL         │
          │ Structured output │          │ Lessons and jobs   │
          └─────────┬─────────┘          └────────────────────┘
                    │
          ┌─────────▼──────────┐
          │ LessonSpec JSON    │
          └─────────┬──────────┘
                    │
          ┌─────────▼──────────┐
          │ Job queue          │
          │ BullMQ / cloud     │
          └─────────┬──────────┘
                    │
          ┌─────────▼───────────┐
          │ Remotion workers    │
          │ SVG + audio + FFmpeg│
          └─────────┬───────────┘
                    │
          ┌─────────▼──────────┐
          │ Object storage/CDN │
          └────────────────────┘
```

---

# Recommended Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- React Query
- Remotion Player

## Backend

- Next.js API routes initially, or NestJS/Fastify as the system grows
- PostgreSQL
- Prisma or Drizzle
- Redis
- BullMQ

Do not run full video rendering inside ordinary serverless request handlers.

## Media

- Remotion
- FFmpeg
- SVG
- optional Lottie or Rive
- S3-compatible object storage
- CDN

## AI

Use separate model calls for:

- document understanding;
- curriculum analysis;
- lesson planning;
- narration;
- visual-template selection;
- asset prompting;
- quality review.

---

# Teacher Editing Workflow

Teacher review should be mandatory.

The storyboard editor should allow teachers to:

- edit narration;
- change scene templates;
- add or remove scenes;
- select age and difficulty;
- replace illustrations;
- correct factual errors;
- regenerate one scene;
- adjust duration;
- preview before rendering.

Example:

```text
Scene 4 of 12

Narration:
“Water travels upward through tubes called xylem.”

Visual:
[Process diagram]

Assets:
[Roots] → [Xylem] → [Leaves]

Actions:
Edit narration
Change template
Replace illustration
Adjust duration
Regenerate scene
Delete scene
```

---

# What Not to Build in the MVP

Avoid:

- unlimited document lengths;
- every academic subject;
- fully interactive simulations;
- photorealistic generated video;
- automatic 3D scenes;
- complex animated characters;
- many languages;
- real-time collaboration;
- a complete course marketplace;
- fully autonomous publishing.

A strong first wedge is:

> Teachers upload a 5–10 page introductory science chapter for learners aged 10–16 and receive a 3–7 minute editable visual explainer.

---

# Realistic MVP Scope

The teacher should be able to:

1. Upload a PDF or DOCX.
2. Select learner age and lesson duration.
3. Review extracted concepts and objectives.
4. Generate a scene-based storyboard.
5. Edit narration and scene choices.
6. Preview each scene.
7. Generate voice-over.
8. Render a 1080p explainer video.
9. Download or share the lesson.

The first version can support one visual theme, one voice, ten scene templates, English only, simple SVG illustrations, one chapter at a time, and pre-rendered video.

---

# Video First, Interactivity Second

## Phase One

```text
Document → storyboard → narrated motion-graphics video
```

This validates document understanding, instructional design, visual quality, teacher editing behaviour, rendering cost, and lesson usefulness.

## Phase Two

The LessonSpec can later power:

- clickable diagrams;
- prediction questions;
- drag-and-drop ordering;
- hotspots;
- sliders;
- simulations;
- branching explanations;
- knowledge checks.

```text
LessonSpec
   ├── Remotion renderer → MP4
   └── Web renderer      → interactive lesson
```

---

# Codex Versus Antigravity

## Choose Codex When

- the repository will grow significantly;
- you need backend and infrastructure work;
- you are building queues, workers, and rendering systems;
- you want reusable engineering instructions;
- you expect significant testing and refactoring;
- you want end-to-end feature implementation.

## Choose Antigravity When

- you prefer a desktop-first IDE;
- browser automation and visual verification are central;
- you want agents working across editor, terminal, and browser;
- you prefer Gemini and Google’s ecosystem.

## Recommendation

Use **Codex** as the primary coding agent.

---

# Suggested Repository Structure

```text
visual-learning/
├── apps/
│   ├── web/                 # Teacher interface
│   ├── api/                 # Application API
│   └── renderer/            # Remotion rendering worker
├── packages/
│   ├── lesson-schema/       # Zod schemas and shared types
│   ├── scene-library/       # Remotion components
│   ├── document-parser/     # PDF and DOCX processing
│   ├── ai-pipeline/         # Prompts and orchestration
│   ├── design-system/       # Shared UI and video tokens
│   └── evals/               # Quality evaluations
├── samples/
│   ├── documents/
│   └── expected-lessons/
└── infrastructure/
```

Give Codex bounded tasks.

```text
Implement the ComparisonScene component according to the LessonSpec
schema. Add preview compositions, unit tests for layout selection,
and visual regression screenshots at 16:9.
```

Avoid vague tasks such as:

```text
Build my entire AI textbook-to-video platform.
```

---

# Evaluation Framework

Create an evaluation set containing approximately 20 textbook sections.

Evaluate:

- factual faithfulness;
- learning-objective coverage;
- age appropriateness;
- narration clarity;
- scene-template suitability;
- visual variety;
- unsupported claims;
- lesson length;
- text density;
- caption alignment;
- asset consistency.

A lesson should fail validation or require review when scenes contain too much text, claims are ungrounded, assets are missing, narration exceeds scene duration, or important objectives are omitted.

---

# Main Product Risk

The greatest risk is not whether Remotion can render motion graphics.

The real risk is whether the AI can consistently transform educational prose into good **visual teaching decisions**.

The first milestone should be:

```text
Five carefully selected textbook sections
        ↓
A robust LessonSpec schema
        ↓
Ten reusable scene templates
        ↓
Five genuinely useful generated videos
```

Once those videos are effective, build the teacher-facing SaaS around the pipeline.

---

# Recommended Build Sequence

```text
Visual grammar
→ lesson schema
→ scene renderer
→ AI planning pipeline
→ teacher editor
→ scalable rendering
→ interactive lesson runtime
```

Avoid:

```text
Upload screen
→ one large AI prompt
→ randomly generated video
```

## Final Recommendation

Start with introductory science for learners aged 10–16.

Build:

1. A strong LessonSpec schema.
2. Ten reusable Remotion scene templates.
3. A document-to-storyboard AI pipeline.
4. A teacher-facing storyboard editor.
5. A background rendering worker.
6. An evaluation set for instructional and visual quality.

Use Codex to build and maintain the engineering system, Remotion to compose the videos, SVG for primary visuals, Motion Canvas for specialised diagrams, and FFmpeg for final media processing.
