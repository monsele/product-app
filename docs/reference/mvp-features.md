# AI Visual Learning Platform — MVP Feature List

## MVP Product Goal

Enable a teacher to upload a short textbook chapter or teaching document and transform it into an editable, narrated visual lesson with motion graphics.

The first release should focus on generating a polished video explainer rather than a fully interactive learning experience.

---

## 1. User Authentication

Teachers should be able to:

- Create an account
- Sign in and sign out
- Reset their password
- Access only their own documents, projects, and lessons

For the MVP, email-based authentication is sufficient.

## 2. Teacher Workspace

Teachers should have a dashboard where they can:

- Create a lesson project
- View existing projects
- Monitor ingestion, generation, and rendering status
- Open, duplicate, and delete lessons
- Access rendered videos

A project should contain:

```text
Project
├── Source document
├── Extracted content
├── Learning objectives
├── Lesson outline
├── Storyboard
├── Assets
├── Voice-over
└── Final video
```

## 3. Document Upload

Support:

- PDF
- DOCX

The upload flow should include:

- File-type validation
- File-size and page-count limits
- Upload progress
- Processing status
- Clear errors

Recommended limits:

- One document per project
- Maximum 20 pages
- English only
- Digitally generated PDFs and DOCX files
- Scanned documents only when extraction quality is acceptable

## 4. Document Ingestion and Parsing

The system should:

- Extract text
- Detect headings and sections
- Preserve page references
- Extract figures, captions, tables, and lists
- Reconstruct reading order
- Remove repeated headers and footers
- Flag poor extraction quality

Docling can be the primary parser.

Store:

- Original file
- Docling JSON
- Clean Markdown
- Normalized application JSON
- Extracted figures
- Parsed tables
- Source provenance

## 5. Ingestion Review

Teachers should be able to review:

- Document title
- Section hierarchy
- Extracted text
- Figures
- Tables
- Processing warnings
- Page references

Teachers should be able to:

- Rename sections
- Exclude irrelevant sections
- Correct extracted text
- Remove decorative images
- Confirm the content to use

## 6. Lesson Configuration

Teachers should specify:

- Learner age or grade
- Subject
- Lesson title
- Desired video length
- Teaching tone
- Difficulty
- Visual style
- Whether to include recall questions

Recommended options:

```text
Learner level:
- Ages 8–10
- Ages 11–13
- Ages 14–16
- Adult beginner

Video length:
- 3 minutes
- 5 minutes
- 7 minutes

Teaching tone:
- Friendly
- Academic
- Conversational
```

## 7. Learning-Objective Extraction

The AI should generate:

- Learning objectives
- Key concepts
- Prerequisite knowledge
- Vocabulary
- Likely misconceptions
- Possible assessment questions

Teachers should be able to edit, add, remove, reorder, and regenerate objectives.

## 8. Lesson Outline Generation

The system should generate:

- Opening hook
- Concept sequence
- Examples
- Analogies
- Summary
- Optional recall questions

Teachers should approve or edit the outline before storyboard generation.

## 9. Narration Script Generation

The narration should:

- Be age-appropriate
- Use short spoken sentences
- Explain one idea at a time
- Use analogies when useful
- Remain grounded in the source
- Avoid unsupported claims
- Cover approved objectives
- Fit the chosen duration

Teachers should be able to edit, shorten, simplify, expand, or regenerate sections.

## 10. Storyboard Generation

Each generated scene should include:

- Narration
- Visual template
- Visual description
- Source citations
- Required assets
- Estimated duration
- Transition
- On-screen text
- Optional sound effects

## 11. Reusable Visual Scene Templates

The MVP should include ten templates:

1. Hook or question
2. Definition
3. Process or sequence
4. Input–process–output
5. Comparison
6. Cause and effect
7. Labelled diagram
8. Analogy
9. Worked example
10. Summary

Each template should accept structured input, calculate its own layout, support animation timing, validate text length, work in 16:9, and support both preview and rendering.

## 12. Storyboard Editor

Teachers should be able to:

- View and reorder scenes
- Add, delete, and duplicate scenes
- Edit narration
- Change visual templates
- Replace assets
- Adjust duration
- Regenerate one scene
- Preview one scene
- View source references

A weak scene should not require regenerating the whole lesson.

## 13. Asset Generation and Management

Support:

- SVG icons
- Simple diagrams
- Shapes
- Source-document images
- Limited AI-generated illustrations
- Simple charts

Teachers should be able to upload replacements, choose alternatives, remove assets, regenerate illustrations, and view asset provenance.

## 14. Voice-Over Generation

Teachers should be able to:

- Choose from two or three voices
- Generate narration
- Preview a voice
- Regenerate one scene’s audio
- Adjust pronunciation
- Control speaking speed

Use English only in the MVP. Generate audio per scene with sentence-level or word-level timestamps.

## 15. Caption Generation

Captions should:

- Synchronize with narration
- Use readable line lengths
- Avoid covering important visuals
- Appear in the rendered video
- Export as SRT or VTT

## 16. Scene Preview

Teachers should be able to preview a single scene with:

- Animation
- Narration
- Captions
- Transition
- Approximate final appearance

Use the Remotion Player for browser previews.

## 17. Full Lesson Preview

The browser preview should support:

- Play and pause
- Seeking
- Scene navigation
- Narration
- Captions
- Returning to scene editing

A lower-quality preview mode may reduce cost.

## 18. Video Rendering

Render lessons as MP4 with:

- 1920 × 1080 resolution
- 16:9 aspect ratio
- 30 fps
- H.264 video
- AAC audio

Show queued, in-progress, successful, failed, and retry states. Produce a downloadable file and thumbnail.

## 19. Export and Sharing

Teachers should be able to:

- Download the MP4
- Copy a shareable lesson link
- Download captions
- Download the narration script
- Download the storyboard

Direct LMS and YouTube publishing should come later.

## 20. Source Grounding and Citations

Every generated concept, narration section, and scene should retain:

- Source page
- Source section
- Source paragraph or block
- Associated figure
- Any AI-generated additions

## 21. Quality Validation

Before rendering, validate that:

- All learning objectives are covered
- Scenes do not contain excessive text
- Narration fits scene duration
- Required assets are available
- Claims are grounded
- Captions exist
- Only supported templates are selected
- Lesson duration is within range
- Audio files exist
- Visual elements remain within frame boundaries

## 22. Basic Version History

Support:

- Saving after major edits
- Restoring an earlier storyboard version
- Retaining previous rendered videos
- Showing the latest modification time

---

# MVP Product Constraints

- Introductory science lessons
- Learners aged 10–16
- English only
- Maximum 20-page source document
- Videos between 3 and 7 minutes
- Ten visual templates
- One visual theme
- Two or three voices
- 1080p MP4 output
- Video-based output rather than fully interactive lessons

# Recommended MVP Build Order

```text
1. User authentication
2. Teacher workspace
3. Document upload
4. Docling ingestion
5. Normalized document schema
6. Ingestion review
7. Lesson configuration
8. LessonSpec schema
9. Manual LessonSpec example
10. First three Remotion templates
11. Scene preview
12. Learning-objective generation
13. Lesson-outline generation
14. Narration generation
15. Storyboard generation
16. Storyboard editor
17. Asset management
18. Voice-over and timing
19. Caption generation
20. Full lesson preview
21. Video rendering
22. Quality validation
23. Export and sharing
24. Basic version history
```

The first major product test should answer:

> Can one well-parsed five-page science chapter become a coherent, editable, and visually useful three-minute lesson?
