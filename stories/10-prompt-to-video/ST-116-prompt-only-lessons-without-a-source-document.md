---
story_id: ST-116
title: "Start a Lesson from a Topic Prompt Alone with a Reviewed AI-Written Reference"
phase: "10 — Prompt to Video"
status: Blocked
priority: could-have
epics: ["E4", "E5", "E6", "E19", "E21"]
prd_user_stories: ["E5-US1", "E5-US3", "E6-US3", "E19-US1", "E21-US2"]
depends_on: ["ST-104", "ST-105", "ST-106", "ST-107"]
---

# ST-116 — Prompt-Only Lessons

> **Blocked on product-owner decisions** (see the last section). This story
> changes a core product promise and must start with an accepted ADR-016.

## Story

As a teacher or self-learner without a suitable document, I want to describe
a topic and get a lesson video, so that I can teach or learn something I
don't have source material for.

## Background

Today every lesson starts from an uploaded PDF or DOCX. The focus prompt
(ST-104) only narrows a document. The one-shot brief returns 409 with no
source document (`docs/prompt-to-video-pilot.md`). This is deliberate. ADR-013
§2 keeps "every objective, outline item, narration claim and scene still cites
approved source blocks", and E19 makes source grounding a product feature.
ST-105 lists web research as out of scope.

Competitors offer text-to-animation. We can offer it without breaking the
pipeline, but not without changing what "grounded" means for these lessons.

## Proposed approach (to be ratified by ADR-016)

1. **An AI-written reference becomes the source.** A metered
   `ai.reference-draft` call turns the topic prompt, audience and target
   length into a structured reference (headings, paragraphs, definitions,
   worked examples, at most ~3,000 words). It is stored as an immutable
   `NormalizedDocument` with provenance `generated` (model, prompt version,
   input hash). It has no uploaded original.
2. **A person reviews it before anything else runs.** The reference opens in
   the existing ingestion review (E5): the user can correct text (overlay),
   exclude sections and approve. In the one-shot flow, the brief shows the
   reference and confirming the brief counts as that approval.
3. **Everything downstream is unchanged.** Objectives, outline, narration and
   storyboard cite the reference's blocks. The deterministic citation and
   grounding checks run as usual, so the lesson stays faithful to the
   reviewed reference, though not to an external source.
4. **The lesson is labelled everywhere.** The brief, the storyboard citation
   panel, preview, render page, share page and the "how this video was made"
   export say: "Written from an AI-generated reference, not your document.
   Check facts before teaching." Version snapshots record the source kind, so
   the label survives restore and duplication.

## Outcome

- ADR-016 is accepted. It amends ADR-013 §2 and E19 for `generated` sources
  only and records the label, review gate and limits.
- A project can be created from "Start from a topic" as well as "Upload a
  document", behind `PROMPT_ONLY_ENABLED` and a cohort list (ST-105 pattern).
- Both the wizard and the one-shot runner accept a project whose only source
  is an approved generated reference.

## Scope

- [ ] ADR-016 (first deliverable; no code merges before it is accepted).
- [ ] Schemas: source kind `uploaded | generated` on source documents and
      snapshots, `NormalizedDocument` provenance for generated blocks, and a
      `topicPrompt` (1–1,000 chars, treated like `focusPrompt`: never logged).
- [ ] Prompt `reference-draft/v1`: subject-neutral and audience-aware. It
      states uncertainty instead of inventing figures, dates or quotations,
      and marks contested claims.
- [ ] Moderation on the topic prompt and on the drafted reference. A
      rejected topic stops with a teacher-facing reason and no further cost.
- [ ] Job `reference-draft` in the pipeline worker. It is idempotent per
      (project, topic, audience, prompt version) and metered against the
      generation quota.
- [ ] Ingestion review accepts generated sources (no original-file panel).
      The one-shot brief includes the reference and its cost line.
- [ ] Labels on every surface listed above. The label is persisted in version
      and render manifests.
- [ ] Feature flag and cohort, closed by default.

## Acceptance Criteria

- [ ] AC1 A cohort user can create a project from a topic, review and correct
      the generated reference, and complete the wizard to a rendered MP4.
- [ ] AC2 Objectives cannot be generated until the generated reference is
      approved, and a one-shot run cannot start until the brief that contains
      it is confirmed.
- [ ] AC3 Every scene of a prompt-only lesson cites blocks of the reviewed
      reference, and the existing grounding checks run and can block.
- [ ] AC4 The AI-reference label appears on brief, storyboard citations,
      preview, render page, public share page and export. A restored or
      duplicated version keeps it.
- [ ] AC5 A topic rejected by moderation makes no further paid calls and
      shows a reason.
- [ ] AC6 With the flag off, or for a user outside the cohort, the topic
      option is hidden and every endpoint returns 409. Uploaded-document
      projects are unaffected.
- [ ] AC7 The topic prompt never appears in logs. Audit metadata records only
      that a topic was given.

## Required Tests

- [ ] Unit: source-kind schemas, snapshot/manifest label propagation.
- [ ] Prompt evaluation cases: factual topic, contested topic, topic needing
      numbers (no invented figures), unsafe topic.
- [ ] Integration (Postgres): topic → reference job → review/approve →
      objectives; idempotent replay; quota metering.
- [ ] Authorization: cohort and flag gating, cross-tenant access.
- [ ] UI: "Start from a topic" flow and label presence on every listed surface.
- [ ] E2E (mocked provider): topic to preview.

## Out of Scope

- Web search or retrieval to source facts (would be a separate ADR).
- Mixing a generated reference with an uploaded document in one project.
- Unlabelled prompt-only lessons.
- Lessons for learner self-study without the review step.

## Decisions for the product owner

- **Is a lesson not grounded in a user's document acceptable at all?** The
  PRD's market (introductory science, learners 10–16) and E19 assume a
  trusted source. Proposed: yes, as a labelled, cohort-only pilot.
- **Mandatory review of the reference.** Proposed: required in both the
  wizard and one-shot flows. It is the human check that replaces a trusted
  document.
- **Label wording and placement** on the public share page, where viewers
  may not be the author.
- **Audience limits.** Should prompt-only lessons be allowed for the youngest
  age bands? Proposed: yes, but only with the review step above.

## Dev Agent Record

- **Agent:**
- **Started:**
- **Completed:**
- **Branch/PR:**
- **Files changed:**
- **Migrations:**
- **Commands/tests:**
- **Screenshots/output:**
- **Decisions/assumptions:**
- **Deviations:**
- **Known risks/follow-up:**
