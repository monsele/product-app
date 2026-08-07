# MVP Definition of Done

The MVP is complete only when:

1. Every story in `STORY_INDEX.md` is marked **Done**.
2. Every PRD user story in `TRACEABILITY_MATRIX.md` has all mapped implementation stories Done.
3. ST-071 passes its automated and manual release gates.
4. The complete product supports the following teacher journey:
   - Create an account and sign in.
   - Create a project.
   - Upload one supported PDF or DOCX of no more than 20 pages.
   - Review extraction warnings, sections, text, figures, and tables.
   - Correct or exclude source content and approve an immutable source snapshot.
   - Configure audience, subject, title, difficulty, duration, tone, theme, and recall preference.
   - Generate, edit, and approve grounded objectives.
   - Generate, edit, and approve the lesson outline.
   - Generate and edit grounded narration.
   - Generate a valid LessonSpec storyboard using the ten supported templates.
   - Edit, reorder, add, duplicate, delete, and regenerate individual scenes.
   - Select, upload, or generate permitted assets.
   - Select a voice and generate scene-level audio and captions.
   - Preview scenes and the full lesson.
   - Resolve all blocking validation issues.
   - Render a verified 1920×1080, 30 fps, H.264/AAC MP4.
   - Download the video and supporting files.
   - Create and revoke a view-only share link.
   - View source citations and restore an earlier lesson version.
5. Tenant isolation, private storage, signed URLs, malware controls, quotas, usage records, job recovery, and deletion/retention behavior pass their tests.
6. The canonical five-page introductory-science fixture becomes a coherent, editable, grounded, visually useful approximately three-minute lesson.
7. MVP exclusions remain excluded unless an approved ADR and PRD update change scope.
