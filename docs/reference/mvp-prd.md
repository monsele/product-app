# AI Visual Learning Platform — MVP Product Requirements Document

## 1. Document Overview

### Product Name

Working title: **AI Visual Learning Platform**

### Product Vision

Enable teachers to transform short textbook chapters and teaching documents into editable, narrated, motion-graphics-based visual lessons for visual-spatial learners.

### MVP Goal

The MVP must prove that a teacher can upload a short educational document and produce a coherent, editable, visually useful 3–7 minute explainer video without needing animation or video-production expertise.

### Primary User

The primary MVP user is:

> A teacher, tutor, instructional designer, or course creator who has written educational content but lacks the time or technical skill to convert it into high-quality visual lessons.

### Initial Market Boundary

The MVP will focus on:

- Introductory science lessons
- Learners aged 10–16
- English-language source documents
- PDF and DOCX input
- Source documents up to 20 pages
- Video output between 3 and 7 minutes
- One visual theme
- Ten reusable scene templates
- Two or three voice options
- 1080p MP4 output

---

# 2. Product Objectives

The MVP should:

1. Reduce the effort required to turn written educational material into a visual lesson.
2. Preserve factual grounding in the uploaded source.
3. Allow teachers to review and edit every important AI-generated decision.
4. Produce visually consistent lessons from reusable animation templates.
5. Support scene-level regeneration rather than requiring full lesson regeneration.
6. Establish a structured `LessonSpec` that can later power interactive lessons.
7. Measure whether teachers find the generated lessons useful enough to publish or use in class.

---

# 3. Success Metrics

## Product Metrics

The MVP should track:

- Percentage of uploaded documents successfully ingested
- Percentage of projects reaching storyboard generation
- Percentage of projects reaching final render
- Average number of teacher edits per generated lesson
- Average number of regenerated scenes
- Average time from upload to first preview
- Average time from approval to final render
- Percentage of rendered videos downloaded or shared
- Percentage of lessons abandoned before rendering

## Quality Metrics

The MVP should evaluate:

- Factual faithfulness to source
- Learning-objective coverage
- Age appropriateness
- Narration clarity
- Visual-template suitability
- Text density per scene
- Caption timing quality
- Missing asset rate
- Rendering failure rate
- Teacher satisfaction score

## Initial Validation Target

The first major product test should answer:

> Can one well-parsed five-page science chapter become a coherent, editable, and visually useful three-minute lesson?

---

# 4. User Roles

## 4.1 Teacher

The teacher can:

- Create and manage lesson projects
- Upload source documents
- Review extracted content
- Configure lesson settings
- Review and edit AI-generated objectives
- Review and edit lesson outlines
- Review and edit narration
- Edit the storyboard
- Preview scenes and full lessons
- Render and export videos
- View source citations
- Restore previous versions

## 4.2 System Administrator

The administrator role is not a core user-facing MVP feature, but the system must support internal operations such as:

- Viewing failed jobs
- Retrying ingestion or rendering jobs
- Monitoring storage and processing usage
- Viewing system logs
- Investigating generation failures

A dedicated administrator interface may be deferred. Initial administration can occur through internal tools and database access.

---

# 5. Core Product Workflow

```text
Teacher creates account
        ↓
Teacher creates project
        ↓
Teacher uploads PDF or DOCX
        ↓
System validates and stores document
        ↓
Docling ingestion job parses content
        ↓
Teacher reviews extracted content
        ↓
Teacher configures learner and lesson settings
        ↓
AI generates learning objectives
        ↓
Teacher approves objectives
        ↓
AI generates lesson outline
        ↓
Teacher approves outline
        ↓
AI generates narration and storyboard
        ↓
Teacher edits scenes and assets
        ↓
System generates voice-over and captions
        ↓
Teacher previews scenes and full lesson
        ↓
System validates lesson quality
        ↓
System renders MP4
        ↓
Teacher downloads or shares lesson
```

---

# 6. Epic Summary

| Epic ID | Epic                                       | Priority    |
| ------- | ------------------------------------------ | ----------- |
| E1      | Authentication and Access Control          | Must Have   |
| E2      | Teacher Workspace and Project Management   | Must Have   |
| E3      | Document Upload and Validation             | Must Have   |
| E4      | Document Ingestion and Normalization       | Must Have   |
| E5      | Ingestion Review                           | Must Have   |
| E6      | Lesson Configuration                       | Must Have   |
| E7      | Learning Objective Generation              | Must Have   |
| E8      | Lesson Outline Generation                  | Must Have   |
| E9      | Narration Generation                       | Must Have   |
| E10     | Storyboard Generation                      | Must Have   |
| E11     | Visual Scene Template Library              | Must Have   |
| E12     | Storyboard Editor                          | Must Have   |
| E13     | Asset Management                           | Must Have   |
| E14     | Voice-Over and Caption Generation          | Must Have   |
| E15     | Scene and Lesson Preview                   | Must Have   |
| E16     | Quality Validation                         | Must Have   |
| E17     | Video Rendering                            | Must Have   |
| E18     | Export and Sharing                         | Must Have   |
| E19     | Source Grounding and Citations             | Must Have   |
| E20     | Basic Version History                      | Should Have |
| E21     | Observability, Security, and Cost Controls | Must Have   |

---

# 7. Detailed Epics and User Stories

# Epic E1: Authentication and Access Control

## Objective

Allow teachers to create accounts and securely access only their own projects and files.

## User Story E1-US1: Create an account

**As a teacher, I want to create an account so that I can save and manage my lesson projects.**

### Acceptance Criteria

- The user can register using an email address and password.
- The system validates email format.
- The system enforces a minimum password policy.
- Duplicate email addresses are rejected.
- A successful registration creates a user profile.
- The user is redirected to the teacher workspace after successful registration.
- Errors are displayed clearly without exposing sensitive system details.

### Technical Dependencies

- Authentication provider or custom identity service
- User database table
- Password hashing or managed authentication
- Session management
- Email service if email verification is enabled

## User Story E1-US2: Sign in and sign out

**As a teacher, I want to sign in and sign out so that I can securely access my account.**

### Acceptance Criteria

- The user can sign in with valid credentials.
- Invalid credentials produce a generic error.
- Authenticated sessions persist according to the configured session policy.
- The user can sign out from any authenticated page.
- After sign-out, protected pages are inaccessible.

### Technical Dependencies

- Session or token management
- Route protection
- Authentication middleware

## User Story E1-US3: Reset password

**As a teacher, I want to reset my password if I forget it.**

### Acceptance Criteria

- The user can request a password-reset email.
- The reset token expires after a defined period.
- The user can set a new password using a valid token.
- Used or expired tokens are rejected.
- The user can sign in with the new password.

### Technical Dependencies

- Transactional email provider
- Password-reset token storage
- Secure token generation

## User Story E1-US4: Project access isolation

**As a teacher, I want my documents and lessons to remain private to my account.**

### Acceptance Criteria

- A teacher cannot access another teacher’s projects by changing a URL or identifier.
- All document, lesson, asset, and render requests verify ownership.
- Private files are served through signed or authenticated URLs.
- Access failures return appropriate authorization errors.

### Technical Dependencies

- Authorization middleware
- Ownership columns on domain entities
- Signed object-storage URLs
- Integration tests for tenant isolation

---

# Epic E2: Teacher Workspace and Project Management

## Objective

Provide a central workspace for creating and managing lesson projects.

## User Story E2-US1: Create a project

**As a teacher, I want to create a lesson project so that I can organise the source document and generated lesson.**

### Acceptance Criteria

- The teacher can create a new project from the workspace.
- A project requires a title.
- The system records the project owner and creation time.
- New projects begin in a clearly defined state such as `draft`.
- The teacher is directed to the document upload step.

### Technical Dependencies

- Project data model
- Project creation API
- Workspace UI
- Project status state machine

## User Story E2-US2: View projects

**As a teacher, I want to see my existing projects and their statuses.**

### Acceptance Criteria

- The workspace lists only the current teacher’s projects.
- Each project displays title, last modified time, and current status.
- Statuses include at least draft, ingesting, ready for review, generating, rendering, completed, and failed.
- The teacher can open a project from the list.
- Empty-state guidance is displayed when no projects exist.

### Technical Dependencies

- Project query API
- Status aggregation
- Pagination or bounded project list
- Workspace cards or table

## User Story E2-US3: Duplicate a project

**As a teacher, I want to duplicate a project so that I can create a variation without changing the original.**

### Acceptance Criteria

- The teacher can duplicate an existing project.
- The duplicate receives a new project identifier.
- The source document reference is copied or reused safely.
- The current approved lesson data is copied.
- Rendered outputs are not treated as the new active render unless intentionally copied.
- The duplicated project opens in draft mode.

### Technical Dependencies

- Project cloning service
- Versioned lesson data
- Object-reference strategy

## User Story E2-US4: Delete a project

**As a teacher, I want to delete a project I no longer need.**

### Acceptance Criteria

- The teacher is asked to confirm deletion.
- The deleted project is removed from the workspace.
- Active jobs are cancelled or marked for termination where possible.
- Associated data is deleted or scheduled for deletion according to retention policy.
- Another teacher cannot delete the project.

### Technical Dependencies

- Soft-delete or hard-delete strategy
- Storage cleanup jobs
- Queue cancellation support
- Authorization checks

---

# Epic E3: Document Upload and Validation

## Objective

Allow teachers to upload supported educational documents safely and reliably.

## User Story E3-US1: Upload PDF or DOCX

**As a teacher, I want to upload a PDF or DOCX file so that the system can create a visual lesson from it.**

### Acceptance Criteria

- The upload interface accepts PDF and DOCX files.
- Unsupported formats are rejected before processing.
- The upload displays progress.
- A successful upload is attached to the current project.
- Upload failures can be retried.
- Only one active source document is supported per MVP project.

### Technical Dependencies

- File upload API
- Direct-to-object-storage upload or backend streaming
- Object storage
- Upload progress mechanism
- Source-document database model

## User Story E3-US2: Validate file size and page count

**As a teacher, I want clear limits so that I know whether my document can be processed.**

### Acceptance Criteria

- Files above the configured maximum size are rejected.
- Documents above 20 pages are rejected or require the teacher to select a smaller range.
- The teacher receives a clear explanation of the limit.
- Validation occurs before starting expensive AI or ingestion work.

### Technical Dependencies

- File metadata inspection
- PDF page-count library
- DOCX document metadata or conversion check
- Configurable limits

## User Story E3-US3: Detect duplicate upload

**As a teacher, I want the system to recognise repeated uploads so that unnecessary processing is avoided.**

### Acceptance Criteria

- A checksum is generated for every uploaded source document.
- Reuploading the same file in the same project prompts the teacher or reuses existing ingestion results.
- Duplicate detection does not expose another user’s file existence.

### Technical Dependencies

- SHA-256 hashing
- Document checksum column
- Tenant-safe duplicate lookup

---

# Epic E4: Document Ingestion and Normalization

## Objective

Convert PDF and DOCX documents into a structured, traceable representation suitable for lesson generation.

## User Story E4-US1: Parse a supported document

**As a teacher, I want the system to extract the document’s structure and content accurately.**

### Acceptance Criteria

- The system invokes a Docling-based ingestion worker.
- The worker extracts text, headings, lists, tables, figures, captions, and page references where available.
- The original document is preserved.
- The Docling output is stored as canonical JSON.
- A readable Markdown representation is stored.
- Processing status is visible to the teacher.
- Failed ingestion jobs provide a recoverable error state.

### Technical Dependencies

- Python ingestion service
- Docling
- Background job queue
- Worker runtime
- Object storage
- PostgreSQL document records

## User Story E4-US2: Normalize parser output

**As the product system, I need a stable normalized document schema so that downstream services are not tightly coupled to Docling.**

### Acceptance Criteria

- Docling output is converted into an application-owned schema.
- Sections retain hierarchy.
- Content blocks retain page provenance.
- Figures and tables receive stable identifiers.
- Unsupported or unrecognised blocks are logged.
- The normalized output can be versioned.

### Technical Dependencies

- Normalized schema definitions
- Docling adapter
- Schema validation library
- Version field for parsed-document schema

## User Story E4-US3: Extract figures and tables

**As a teacher, I want diagrams, figures, and tables preserved because they may be important to the visual lesson.**

### Acceptance Criteria

- Extracted figures are stored as separate assets where possible.
- Figure captions and page numbers are retained.
- Table structure is stored as rows and columns.
- Figures and tables remain linked to nearby sections.
- Extraction failures produce warnings rather than silently dropping content.

### Technical Dependencies

- Docling figure extraction
- Image storage
- Table normalization
- Figure and table database models

## User Story E4-US4: Generate ingestion quality report

**As a teacher, I want to know when the document was not parsed reliably.**

### Acceptance Criteria

- The system produces a quality score or review status.
- Warnings can identify low OCR quality, missing captions, malformed tables, or uncertain reading order.
- Severe failures prevent lesson generation.
- Non-blocking warnings are displayed in the ingestion review screen.
- Quality checks are stored for audit and debugging.

### Technical Dependencies

- Quality-check service
- Rule engine
- Processing warnings data model
- Optional OCR confidence values

---

# Epic E5: Ingestion Review

## Objective

Allow teachers to correct or exclude extracted content before AI lesson generation.

## User Story E5-US1: Review extracted structure

**As a teacher, I want to review the detected sections so that the AI uses the correct material.**

### Acceptance Criteria

- The review screen shows the document title and section hierarchy.
- The teacher can expand sections to view extracted content.
- Each section displays page references.
- Figures and tables associated with the section are visible.
- Processing warnings are displayed in context.

### Technical Dependencies

- Parsed-document query API
- Hierarchical document viewer
- Asset preview support
- Warning display components

## User Story E5-US2: Exclude irrelevant sections

**As a teacher, I want to exclude content such as references, exercises, or sidebars that should not be used.**

### Acceptance Criteria

- The teacher can include or exclude sections.
- Excluded sections are not sent to lesson-generation prompts.
- At least one section must remain selected.
- Section-selection changes are saved.
- The teacher can restore an excluded section.

### Technical Dependencies

- Section-selection state
- Project-source configuration model
- Validation rules

## User Story E5-US3: Correct extracted text

**As a teacher, I want to correct parsing errors before lesson generation.**

### Acceptance Criteria

- The teacher can edit extracted paragraph text.
- The original extracted text remains available for audit or rollback.
- Edits are stored separately from the immutable parser output.
- Updated text is used in downstream generation.
- The teacher can restore the original text.

### Technical Dependencies

- Editable content overlay model
- Revision support
- Rich text or structured text editor

## User Story E5-US4: Remove decorative images

**As a teacher, I want to remove irrelevant images so that they are not used in the generated lesson.**

### Acceptance Criteria

- Extracted figures can be marked as included or excluded.
- Excluded images are not offered to the asset planner.
- The teacher can reverse the exclusion.
- Image provenance remains visible.

### Technical Dependencies

- Figure inclusion state
- Asset preview component
- Asset-planning filters

---

# Epic E6: Lesson Configuration

## Objective

Collect teacher preferences needed to generate an appropriate lesson.

## User Story E6-US1: Configure learner profile

**As a teacher, I want to choose the learner age and difficulty so that the lesson is appropriate.**

### Acceptance Criteria

- The teacher can select an age band.
- The teacher can select a difficulty level.
- The system stores the values in the project.
- Generation cannot continue until required values are selected.
- The selected profile is included in AI-generation requests.

### Technical Dependencies

- Lesson configuration model
- Configuration UI
- Prompt-variable mapping

## User Story E6-US2: Configure lesson duration and tone

**As a teacher, I want to select video length and teaching tone.**

### Acceptance Criteria

- The teacher can choose 3, 5, or 7 minutes.
- The teacher can choose friendly, academic, or conversational tone.
- The duration influences narration word-count targets.
- The tone influences script-generation instructions.
- The teacher can change the options before final generation.

### Technical Dependencies

- Duration-to-word-count rules
- Prompt templates
- Configuration persistence

## User Story E6-US3: Confirm subject and lesson title

**As a teacher, I want to confirm the subject and title so that the generated lesson is correctly framed.**

### Acceptance Criteria

- The system may suggest a title and subject.
- The teacher can edit both.
- Both values are required before lesson generation.
- The final title is used in the lesson metadata and opening scene.

### Technical Dependencies

- Metadata inference
- Editable configuration fields
- Lesson metadata model

---

# Epic E7: Learning Objective Generation

## Objective

Generate and approve the educational outcomes that will guide the lesson.

## User Story E7-US1: Generate learning objectives

**As a teacher, I want the AI to propose learning objectives from the selected content.**

### Acceptance Criteria

- The system generates a bounded number of objectives.
- Objectives are age-appropriate and measurable.
- Each objective includes source references.
- Objectives remain grounded in selected source content.
- Unsupported objectives are flagged or excluded.
- Generation failures can be retried.

### Technical Dependencies

- AI generation service
- Structured-output schema
- Source-grounding package
- Prompt versioning

## User Story E7-US2: Edit and approve objectives

**As a teacher, I want to modify objectives before they guide the lesson.**

### Acceptance Criteria

- The teacher can add, edit, remove, and reorder objectives.
- At least one approved objective is required.
- Approved objectives are versioned.
- Lesson-outline generation uses only approved objectives.
- The teacher can regenerate suggestions without losing approved content unless confirmed.

### Technical Dependencies

- Objective editor
- Ordering support
- Versioned LessonSpec or planning state

---

# Epic E8: Lesson Outline Generation

## Objective

Create an editable instructional sequence before producing detailed narration and scenes.

## User Story E8-US1: Generate lesson outline

**As a teacher, I want the AI to propose a logical lesson sequence.**

### Acceptance Criteria

- The outline includes an opening hook, concept sequence, examples, summary, and optional recall question.
- Each outline item maps to at least one approved objective.
- The outline fits the selected target duration.
- Outline items include source references.
- The output follows a validated structured schema.

### Technical Dependencies

- Lesson-planning AI prompt
- Structured output validation
- Objective-to-outline mapping
- Duration estimator

## User Story E8-US2: Edit and approve outline

**As a teacher, I want to reorder or change the proposed lesson structure.**

### Acceptance Criteria

- The teacher can edit titles and descriptions.
- The teacher can reorder, add, and delete outline items.
- Each remaining item can be linked to one or more objectives.
- The teacher must approve the outline before narration generation.
- Approved outline changes are saved.

### Technical Dependencies

- Outline editor
- Drag-and-drop ordering
- Objective-linking model

---

# Epic E9: Narration Generation

## Objective

Generate a spoken, age-appropriate lesson script grounded in the source and approved outline.

## User Story E9-US1: Generate narration

**As a teacher, I want the system to generate a spoken script for each outline section.**

### Acceptance Criteria

- Narration is divided by lesson section or scene group.
- Script length is consistent with selected duration.
- The language matches the learner age and selected tone.
- Claims retain source references.
- The script does not merely copy long passages from the source.
- The output avoids unsupported claims.
- The result follows a validated schema.

### Technical Dependencies

- Narration prompt
- Word-count estimator
- Source retrieval or section package
- Structured output
- Safety and grounding checks

## User Story E9-US2: Edit or regenerate narration

**As a teacher, I want to improve one part of the narration without regenerating everything.**

### Acceptance Criteria

- The teacher can directly edit narration text.
- The teacher can request shorten, simplify, expand, or regenerate actions.
- Only the selected narration block changes.
- Source references remain attached or are recalculated.
- Changes trigger affected audio and scene content to become outdated.

### Technical Dependencies

- Block-level narration editor
- Partial generation API
- Dependency invalidation logic
- Version tracking

---

# Epic E10: Storyboard Generation

## Objective

Convert narration and lesson structure into a scene-by-scene visual plan.

## User Story E10-US1: Generate storyboard

**As a teacher, I want the system to turn the approved script into visual scenes.**

### Acceptance Criteria

- The storyboard contains ordered scenes.
- Each scene includes narration, visual template, on-screen text, visual description, estimated duration, required assets, transition, and source citations.
- Only supported MVP templates are selected.
- Scene duration totals approximately match the selected lesson duration.
- Scene output conforms to the `LessonSpec` schema.
- Invalid scenes are rejected before saving.

### Technical Dependencies

- Storyboard generation prompt
- LessonSpec schema
- Template-selection rules
- Duration allocation service
- Schema validator

## User Story E10-US2: Regenerate one scene plan

**As a teacher, I want to regenerate a weak scene without changing the rest of the storyboard.**

### Acceptance Criteria

- The teacher can select one scene and request regeneration.
- Neighbouring scene context is provided to the model.
- The regenerated scene remains within supported templates.
- Existing teacher edits in other scenes are preserved.
- The new scene receives updated citations and validation.

### Technical Dependencies

- Scene-level regeneration API
- Context builder
- Version comparison
- Dependency invalidation

---

# Epic E11: Visual Scene Template Library

## Objective

Provide consistent, reusable animated scene components.

## MVP Templates

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

## User Story E11-US1: Render a scene from structured input

**As the video system, I need each template to render from validated data.**

### Acceptance Criteria

- Each template has a defined input schema.
- The template calculates its own layout.
- The template supports 1920 × 1080 output.
- The template supports preview and server rendering.
- The template validates maximum text and item counts.
- The template produces no visible overflow with valid inputs.
- Animation is deterministic by frame.

### Technical Dependencies

- Remotion
- React and TypeScript
- Shared design tokens
- Zod or equivalent schemas
- Asset library
- Font-loading strategy

## User Story E11-US2: Apply consistent visual theme

**As a teacher, I want all scenes to look like one coherent lesson.**

### Acceptance Criteria

- All templates use shared typography, spacing, colours, and animation rules.
- The MVP supports one approved theme.
- Scene transitions follow a controlled set of presets.
- Captions and safe areas are consistent.
- Visual regression tests cover representative templates.

### Technical Dependencies

- Video design system
- Theme provider
- Motion preset library
- Screenshot or frame regression tests

---

# Epic E12: Storyboard Editor

## Objective

Allow teachers to control the final lesson at scene level.

## User Story E12-US1: View and navigate scenes

**As a teacher, I want to view all scenes and move between them easily.**

### Acceptance Criteria

- The editor shows scenes in order.
- Each scene displays template, narration summary, duration, and validation status.
- The teacher can select a scene for editing.
- The current scene remains selected after saving changes.
- Large storyboards remain usable without rendering the full video.

### Technical Dependencies

- Storyboard UI
- Scene list state
- LessonSpec API
- Optimistic or explicit save strategy

## User Story E12-US2: Reorder scenes

**As a teacher, I want to reorder scenes to improve the lesson flow.**

### Acceptance Criteria

- The teacher can drag and drop scenes.
- Scene order is persisted.
- Total duration is recalculated.
- Scene numbering updates automatically.
- Source citations remain attached to the correct scene.

### Technical Dependencies

- Drag-and-drop library
- Storyboard ordering API
- Duration recalculation

## User Story E12-US3: Add, duplicate, and delete scenes

**As a teacher, I want to modify the scene list.**

### Acceptance Criteria

- The teacher can add a scene using a supported template.
- The teacher can duplicate an existing scene.
- The teacher can delete a scene after confirmation.
- At least one scene must remain.
- Lesson validation updates after changes.

### Technical Dependencies

- Scene CRUD APIs
- Default scene factories
- Validation service

## User Story E12-US4: Edit scene content

**As a teacher, I want to edit narration, on-screen text, duration, template, and assets.**

### Acceptance Criteria

- Editable scene fields are determined by template schema.
- Invalid values produce field-level errors.
- Changing the template maps compatible fields where possible.
- Incompatible fields are clearly reset or require confirmation.
- Scene changes invalidate only dependent audio, preview, or render outputs.

### Technical Dependencies

- Schema-driven forms
- Template migration logic
- Dependency graph
- Draft-saving support

---

# Epic E13: Asset Management

## Objective

Provide and manage the visual assets required by scenes.

## User Story E13-US1: Select reusable assets

**As a teacher, I want scenes to use consistent icons and illustrations.**

### Acceptance Criteria

- The system can search or select assets from an approved library.
- Assets include usage metadata and source.
- Asset selection is restricted by scene requirements.
- Missing assets produce validation errors.
- The same asset can be reused across scenes.

### Technical Dependencies

- Asset catalog
- Search and tagging
- Object storage or static asset package
- Asset metadata model

## User Story E13-US2: Upload replacement asset

**As a teacher, I want to replace a generated or suggested asset with my own image.**

### Acceptance Criteria

- The teacher can upload a supported image type.
- File size and dimensions are validated.
- The uploaded asset is private to the project or teacher.
- The scene preview updates after selection.
- The original suggested asset remains recoverable.

### Technical Dependencies

- Image upload service
- Image validation
- Project asset model
- Thumbnail generation

## User Story E13-US3: Generate limited illustration

**As a teacher, I want the system to create a simple supporting illustration when no suitable asset exists.**

### Acceptance Criteria

- Illustration generation is limited to approved use cases.
- The output is associated with the requesting scene.
- The teacher can accept, reject, or regenerate it.
- Generated assets are marked as AI-generated.
- Failed generation does not block editing the rest of the lesson.

### Technical Dependencies

- Image-generation provider
- Prompt templates
- Generation job tracking
- Asset moderation and storage

---

# Epic E14: Voice-Over and Caption Generation

## Objective

Generate scene-level narration audio and synchronised captions.

## User Story E14-US1: Choose a voice

**As a teacher, I want to select a narrator voice appropriate for the lesson.**

### Acceptance Criteria

- The teacher can preview two or three available voices.
- One voice is selected for the lesson.
- Voice choice is saved.
- Changing the voice marks existing audio as outdated.
- English is the only required MVP language.

### Technical Dependencies

- Text-to-speech provider
- Voice catalog
- Preview audio clips
- Lesson audio configuration

## User Story E14-US2: Generate scene audio

**As a teacher, I want narration audio generated per scene so that individual scenes can be updated.**

### Acceptance Criteria

- Each scene’s approved narration can be converted to audio.
- Audio is stored separately per scene.
- Generation status is visible.
- Failed scenes can be retried independently.
- Audio duration is stored.
- Scene duration updates or warnings are produced if audio does not fit.

### Technical Dependencies

- TTS API
- Audio storage
- Background jobs
- Audio metadata extraction
- Scene-audio model

## User Story E14-US3: Generate captions

**As a teacher, I want captions synchronised with the narration.**

### Acceptance Criteria

- Captions are generated from approved narration.
- Sentence-level timing is required; word-level timing is preferred.
- Caption lines follow readability limits.
- Captions can be previewed.
- Captions can be exported as SRT or VTT.
- Caption updates are triggered when narration changes.

### Technical Dependencies

- TTS timestamps or alignment service
- Caption segmentation logic
- SRT/VTT exporter
- Caption data model

---

# Epic E15: Scene and Lesson Preview

## Objective

Allow teachers to review output before expensive final rendering.

## User Story E15-US1: Preview one scene

**As a teacher, I want to preview one scene while editing it.**

### Acceptance Criteria

- The selected scene plays in the browser.
- The preview includes animation, audio, captions, and transition context where possible.
- Preview updates after saved changes.
- Preview failures display actionable errors.
- Preview does not require a full MP4 render.

### Technical Dependencies

- Remotion Player
- Scene composition resolver
- Browser asset loading
- Audio and caption synchronisation

## User Story E15-US2: Preview full lesson

**As a teacher, I want to watch the complete lesson before rendering it.**

### Acceptance Criteria

- The teacher can play, pause, seek, and navigate by scene.
- The preview includes approved audio and captions.
- The teacher can return directly to editing a scene.
- Outdated scenes are clearly marked.
- The preview can operate in a lower-quality mode.

### Technical Dependencies

- Full composition preview
- Timeline assembly
- Scene navigation
- Preview-quality configuration

---

# Epic E16: Quality Validation

## Objective

Prevent broken, ungrounded, or incomplete lessons from being rendered.

## User Story E16-US1: Validate lesson before render

**As a teacher, I want the system to identify problems before rendering.**

### Acceptance Criteria

- Validation checks objective coverage.
- Validation checks scene text limits.
- Validation checks narration-to-duration fit.
- Validation checks required assets.
- Validation checks source grounding.
- Validation checks captions and audio presence.
- Validation checks supported templates.
- Validation checks total lesson duration.
- Validation checks frame-safe layout constraints.
- Blocking and non-blocking issues are distinguished.

### Technical Dependencies

- Validation rules engine
- Template-specific validators
- Grounding checker
- Audio and duration metadata
- Objective coverage mapping

## User Story E16-US2: Resolve validation issues

**As a teacher, I want validation messages to tell me what must be fixed.**

### Acceptance Criteria

- Each issue identifies the affected scene or lesson property.
- The teacher can navigate directly to the affected scene.
- Blocking issues prevent final rendering.
- Warnings can be acknowledged where allowed.
- Validation reruns after relevant edits.

### Technical Dependencies

- Validation UI
- Deep links to scene editor
- Incremental validation triggers

---

# Epic E17: Video Rendering

## Objective

Render the approved lesson into a downloadable MP4.

## User Story E17-US1: Start render

**As a teacher, I want to render my approved lesson as a video.**

### Acceptance Criteria

- Rendering can begin only when blocking validation errors are resolved.
- The render job uses the approved LessonSpec version.
- Output is 1920 × 1080, 16:9, 30 fps, H.264, with AAC audio.
- A render-job record is created.
- The teacher sees queued and processing states.
- Repeated render requests do not accidentally create duplicate jobs.

### Technical Dependencies

- Remotion renderer
- FFmpeg
- Rendering worker
- Job queue
- Idempotency keys
- Object storage

## User Story E17-US2: View render progress and failure

**As a teacher, I want to know whether rendering is progressing or has failed.**

### Acceptance Criteria

- The interface shows queued, rendering, completed, and failed states.
- Progress is shown when available.
- Failure messages are understandable.
- Failed renders can be retried.
- Internal logs retain technical failure details.
- Successful render metadata includes duration, size, and storage location.

### Technical Dependencies

- Render-job state machine
- Worker progress events
- Error classification
- Retry policy
- Observability

## User Story E17-US3: Produce thumbnail

**As a teacher, I want a thumbnail for the finished lesson.**

### Acceptance Criteria

- A thumbnail is generated from a valid lesson frame.
- The thumbnail is stored with the render.
- The thumbnail displays in the workspace and sharing view.
- Thumbnail failure does not invalidate an otherwise successful video.

### Technical Dependencies

- Frame extraction
- Image storage
- Thumbnail job or render step

---

# Epic E18: Export and Sharing

## Objective

Allow teachers to use the completed lesson outside the editor.

## User Story E18-US1: Download video

**As a teacher, I want to download the rendered MP4.**

### Acceptance Criteria

- A completed render has a download action.
- The download uses a secure signed URL.
- The correct project render is downloaded.
- Expired links can be regenerated.
- Unauthorized users cannot download the file.

### Technical Dependencies

- Signed storage URLs
- Authorization
- Render metadata

## User Story E18-US2: Share lesson link

**As a teacher, I want to share a view-only link to the lesson.**

### Acceptance Criteria

- The teacher can create or disable a share link.
- The share page is view-only.
- The page includes video playback and lesson title.
- Private source documents and editor data are not exposed.
- Share-link access can be revoked.

### Technical Dependencies

- Share-token model
- Public playback page
- Revocation logic
- CDN or signed media access

## User Story E18-US3: Export supporting files

**As a teacher, I want to download captions, narration, and storyboard files.**

### Acceptance Criteria

- The teacher can export captions as SRT or VTT.
- The teacher can export narration as text or Markdown.
- The teacher can export storyboard data in a readable format.
- Exported content matches the approved lesson version.

### Technical Dependencies

- Export services
- Version selection
- File generation

---

# Epic E19: Source Grounding and Citations

## Objective

Make generated content traceable to the uploaded source.

## User Story E19-US1: View scene source references

**As a teacher, I want to see which parts of the document support each scene.**

### Acceptance Criteria

- Each generated scene stores one or more source references where applicable.
- References include page and section information.
- The teacher can open the relevant extracted source content.
- AI-added analogies or examples are labelled as generated additions.
- Missing grounding produces a validation warning or error.

### Technical Dependencies

- Provenance model
- Source-reference UI
- Grounding metadata in AI outputs
- Parsed-document block lookup

## User Story E19-US2: Preserve citation through edits

**As a teacher, I want citations to remain accurate when content changes.**

### Acceptance Criteria

- Direct teacher edits retain existing references unless explicitly removed.
- Regenerated content receives new references.
- Unsupported edited claims can be flagged.
- Citation history is retained with lesson versions.

### Technical Dependencies

- Versioned citations
- Grounding recheck service
- Edit metadata

---

# Epic E20: Basic Version History

## Objective

Allow teachers to recover earlier lesson states.

## User Story E20-US1: Save lesson version

**As a teacher, I want major lesson changes saved as versions.**

### Acceptance Criteria

- Versions are created at defined milestones or explicit save points.
- Each version records creation time and creator.
- The version includes approved objectives, outline, narration, storyboard, and citations.
- Render jobs reference a specific version.
- Old versions are read-only.

### Technical Dependencies

- Versioned LessonSpec storage
- Snapshot strategy
- Version metadata

## User Story E20-US2: Restore previous version

**As a teacher, I want to restore an earlier storyboard if later changes are worse.**

### Acceptance Criteria

- The teacher can view a list of versions.
- The teacher can preview version metadata.
- Restoring creates a new current version rather than deleting history.
- Existing renders remain attached to their original versions.
- The teacher is warned that current unsaved changes may be replaced.

### Technical Dependencies

- Version browser
- Restore service
- Snapshot cloning

---

# Epic E21: Observability, Security, and Cost Controls

## Objective

Ensure the MVP is safe, supportable, and financially manageable.

## User Story E21-US1: Track processing jobs

**As the product team, we need to monitor ingestion, AI, audio, and rendering jobs.**

### Acceptance Criteria

- Every background job has a unique identifier.
- Job status, start time, completion time, retries, and errors are recorded.
- Logs correlate by project and job identifier.
- Failed jobs can be investigated without accessing user credentials.
- Critical failure rates can trigger alerts.

### Technical Dependencies

- Structured logging
- Metrics platform
- Error tracking
- Correlation IDs
- Job dashboard or internal query tools

## User Story E21-US2: Enforce cost limits

**As the product team, we need to prevent unbounded generation and rendering costs.**

### Acceptance Criteria

- Page-count limits are enforced.
- Video-duration limits are enforced.
- Scene-count limits are enforced.
- Regeneration attempts can be rate-limited.
- Unchanged assets, audio, and previews are reused.
- Usage per project and user is recorded.
- Costly operations require an explicit user action.

### Technical Dependencies

- Usage metering
- Rate limiting
- Cache strategy
- Quota configuration
- Provider cost telemetry

## User Story E21-US3: Secure uploaded content

**As a teacher, I want my educational materials stored securely.**

### Acceptance Criteria

- Files are encrypted in transit.
- Object storage is private by default.
- Access uses signed or authenticated URLs.
- File uploads are scanned or validated for malicious content.
- Deleted content follows a defined retention and cleanup process.
- Sensitive operational secrets are not exposed to client applications.

### Technical Dependencies

- TLS
- Private object storage
- Malware-scanning integration
- Secrets manager
- Retention jobs
- Security review checklist

---

# 8. Core Data Entities

The MVP is expected to include at least the following entities:

```text
User
Project
SourceDocument
IngestionJob
ParsedDocument
ParsedSection
ContentBlock
ExtractedFigure
ParsedTable
IngestionWarning
LessonConfiguration
LearningObjective
LessonOutline
NarrationBlock
LessonSpec
LessonVersion
Scene
SceneAsset
VoiceConfiguration
SceneAudio
CaptionTrack
ValidationResult
RenderJob
RenderedVideo
ShareLink
UsageRecord
```

---

# 9. Technical Architecture Overview

```text
                        ┌───────────────────────┐
                        │ Next.js Teacher App  │
                        └───────────┬───────────┘
                                    │
                            HTTPS / authenticated API
                                    │
                        ┌───────────▼───────────┐
                        │ Application API       │
                        │ TypeScript            │
                        └───────┬───────┬───────┘
                                │       │
                   ┌────────────┘       └─────────────┐
                   │                                  │
          ┌────────▼────────┐               ┌─────────▼─────────┐
          │ PostgreSQL      │               │ Object Storage    │
          │ + pgvector      │               │ Documents/Media   │
          └────────┬────────┘               └─────────┬─────────┘
                   │                                  │
          ┌────────▼────────┐                         │
          │ Job Queue       │                         │
          │ Redis / BullMQ  │                         │
          └─────┬────┬──────┘                         │
                │    │                                │
      ┌─────────▼┐  ┌▼────────────────┐               │
      │ Python   │  │ TypeScript      │               │
      │ Ingestion│  │ AI Orchestrator │               │
      │ + Docling│  │ Lesson Pipeline │               │
      └────┬─────┘  └───────┬─────────┘               │
           │                │                         │
           │         ┌──────▼────────┐                │
           │         │ TTS / Images  │                │
           │         │ AI Providers  │                │
           │         └──────┬────────┘                │
           │                │                         │
           └────────────────┼─────────────────────────┘
                            │
                    ┌───────▼─────────┐
                    │ Remotion Worker │
                    │ + FFmpeg        │
                    └───────┬─────────┘
                            │
                    ┌───────▼─────────┐
                    │ MP4 / Thumbnail │
                    │ Captions        │
                    └─────────────────┘
```

---

# 10. Recommended Technology Stack

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- React Query
- Remotion Player
- Schema-driven forms

## Backend

- TypeScript
- Next.js API routes for early MVP or NestJS/Fastify for a separate API
- PostgreSQL
- pgvector if embeddings are required
- Prisma or Drizzle
- Redis
- BullMQ

## Ingestion

- Python
- Docling
- FastAPI if a service interface is needed
- Worker-based processing
- Application-owned normalized document schema

## AI Pipeline

- Structured outputs
- Versioned prompts
- Separate steps for objectives, outline, narration, storyboard, and quality review
- Grounded source packages
- Model-call logging and cost tracking

## Video and Media

- Remotion
- React and SVG
- FFmpeg
- S3-compatible object storage
- CDN or signed URLs
- Optional image-generation service
- Text-to-speech provider with timing support

## Quality and Testing

- Unit tests
- Integration tests
- Schema validation
- Visual regression tests
- Render smoke tests
- Prompt evaluation dataset
- Grounding and objective-coverage checks

---

# 11. Non-Functional Requirements

## Performance

- Standard document upload acknowledgement should complete quickly.
- Ingestion, generation, audio, and rendering should be asynchronous.
- Scene preview should load without requiring full video rendering.
- Previously generated unchanged outputs should be cached.

## Reliability

- Jobs must be retryable.
- Jobs must be idempotent where possible.
- Partial failures should not invalidate completed project stages.
- A failed scene should be retryable independently.

## Security

- Tenant isolation is mandatory.
- Private file storage is mandatory.
- Signed or authenticated asset access is mandatory.
- Secrets must remain server-side.
- Uploaded files require validation and malware controls.

## Maintainability

- Docling must sit behind an adapter.
- Lesson output must conform to a versioned LessonSpec.
- Scene templates must have independent schemas and tests.
- AI prompts must be versioned.
- Provider-specific integrations must be abstracted.

## Accessibility

- Teacher interfaces should support keyboard navigation.
- Form fields require visible labels.
- Video captions must be available.
- Important statuses must not rely on colour alone.

---

# 12. MVP Release Boundaries

## Included

- Email authentication
- Teacher project workspace
- PDF and DOCX upload
- Maximum 20-page source
- Docling ingestion
- Extraction review and correction
- Lesson configuration
- AI learning objectives
- AI outline
- AI narration
- AI storyboard
- Ten Remotion scene templates
- Storyboard editor
- Basic reusable asset library
- Limited illustration generation
- Two or three English voices
- Captions
- Scene preview
- Full lesson preview
- Quality validation
- 1080p MP4 rendering
- Download and share link
- Source citations
- Basic lesson version history

## Excluded

- Student accounts
- Interactive simulations
- Full quiz engine
- Multiple languages
- Real-time collaboration
- LMS integrations
- Direct YouTube publishing
- Full course marketplace
- Advanced character animation
- Automatic 3D scenes
- Unrestricted generative video
- Documents longer than 20 pages
- Multiple source documents in one project

---

# 13. Recommended Delivery Phases

## Phase 1: Foundation

- Authentication
- Project workspace
- File upload
- Object storage
- Job queue
- Docling ingestion
- Normalized document schema
- Ingestion review

## Phase 2: Manual Visual Pipeline

- LessonSpec schema
- Manual sample LessonSpec
- Video design system
- First three Remotion templates
- Scene preview
- Full lesson preview
- Render worker

## Phase 3: AI Lesson Planning

- Learning objective generation
- Outline generation
- Narration generation
- Storyboard generation
- Source grounding
- Structured output validation

## Phase 4: Teacher Editing

- Storyboard editor
- Scene CRUD
- Template switching
- Asset management
- Scene-level regeneration
- Version history

## Phase 5: Audio and Delivery

- Voice selection
- Scene-level TTS
- Captions
- Full rendering
- Export
- Share links
- Thumbnails

## Phase 6: Quality and Hardening

- Lesson validation
- Visual regression tests
- Prompt evaluation set
- Security review
- Cost metering
- Observability
- Retry and recovery testing

---

# 14. Definition of Done for the MVP

The MVP is complete when a teacher can:

1. Create an account.
2. Create a project.
3. Upload a supported five-page science chapter.
4. Review and approve extracted sections.
5. Configure learner age, duration, and tone.
6. Generate and edit learning objectives.
7. Generate and edit a lesson outline.
8. Generate and edit narration.
9. Generate a storyboard using supported templates.
10. Preview and edit individual scenes.
11. Generate scene-level voice-over and captions.
12. Preview the entire lesson.
13. Resolve blocking quality issues.
14. Render a 1080p MP4.
15. Download or share the completed lesson.
16. View the source references supporting generated scenes.
17. Restore a previous lesson version.

The final result must be a coherent, editable, and visually useful 3–7 minute lesson grounded in the uploaded source.
