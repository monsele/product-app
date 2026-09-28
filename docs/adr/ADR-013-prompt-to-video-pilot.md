# ADR-013 — Prompt-to-video pilot: focus-driven, audience-aware generation with one human gate

- Status: Accepted — 2026-09-27, on the product decisions recorded in ST-104
  (2026-09-25). Confirmed by the product owner with the approval of ST-104
  (2026-09-27).
- Story: ST-104 — Add the Prompt-to-Video ADR, Focus and Audience Contracts,
  and Focus-Aware Prompts (followed by ST-105 and ST-106)
- Precedent: ADR-005 (a product decision superseding a PRD constraint, scoped
  and recorded before production contracts change)
- Numbering: the story names this record ADR-012, but ADR-012 was already
  taken by ST-103 (sound bed and post-render review), so it is ADR-013.

## Context

Teachers and self-learners want to say what a lesson should explain, and
have the system produce it. Examples:

- "How do trusses carry load?"
- "Why did the printing press weaken religious authority?"

They want it pitched at an adult or professional level when needed. They also
want the path to a preview to run automatically, with one approval before
rendering.

Four parts of the current source hierarchy prevent this:

| # | Constraint | Source |
| --- | --- | --- |
| 1 | Teachers "review and edit every important AI-generated decision". Objectives and outline each need explicit teacher approval. | `docs/reference/mvp-prd.md` objective 3 (:47), core workflow (:125-173), approval rules (:692, :739) |
| 2 | "The generation pipeline is not one long autonomous operation." | `docs/reference/epic-technical-implementation-guide.md` §2.2 (:63) |
| 3 | "Fully autonomous publishing" is excluded. | `docs/reference/mvp-plan.md` (:437) |
| 4 | The market boundary is introductory science for learners aged 10–16. | `docs/reference/mvp-prd.md` (:27-28) |

The prompts hardcode the same boundary. Objectives v2, outline v2 and
narration v3 say "for learners aged 10-16", and narration calls itself a
"science narrator". The audience contract stops at `adult-beginner` and
`intermediate`.

## Product decisions (recorded 2026-09-25)

| Decision | Choice |
| --- | --- |
| Users | Teachers drafting for students, and self-learners (adult or professional) |
| Automation | Automatic up to the preview; exactly one human approval before render |
| Rollout | Pilot cohort flag, enforced on the server (ST-105) |
| Depth | Add an `advanced` difficulty and adult audience bands |
| Subjects | Any subject; engineering was an example only |
| Frameworks | No LangChain, LangGraph or agent SDK; reuse `@avlp/jobs` and the existing NestJS services |

## Decision

### 1. Scope of the supersession

For the prompt-to-video pilot cohort only, this record supersedes constraints
1-3 above:

- A pilot run may approve objectives, the outline and narration
  automatically, in sequence, as it advances (ST-105).
- Every run stops at a preview, and a human approves it before any render.
- Users outside the cohort, and every lesson created through the normal
  wizard, keep the existing approval gates unchanged.

Constraint 4 (market boundary) is superseded for everyone. The normal wizard
gains the adult audience options and the optional focus field in ST-104. Both
are additive, and a lesson that uses neither behaves exactly as before.

### 2. What does not change

Every safeguard that makes a generated lesson trustworthy stays in force for
pilot runs:

- **Grounding checks and citations.** Every objective, outline item,
  narration claim and scene still cites approved source blocks. The
  deterministic citation checks and the grounding check job run unchanged.
- **Deterministic blocking validation.** Preflight and validation rules still
  block a render. An automatic run never acknowledges a blocking issue on
  anyone's behalf.
- **Immutable versions and manifests.** Source snapshots, lesson versions,
  creative-design manifests and render manifests stay immutable and pinned.
  Prompt versions are pinned per job, so a job in flight finishes on the
  version it started with.
- **A human gate before render.** There is no autonomous publishing. The
  single approval is a person reviewing the preview (ST-106).
- **An audit entry for every automatic approval.** Each automatic approval
  writes an audit event naming the run, the stage and the approved revision
  (ST-105).

### 3. Focus narrows by citation, not retrieval

A lesson configuration may carry an optional `focusPrompt` (1-1,000 characters,
trimmed).

- `objectives/v3` chooses objectives that serve the focus and cites only
  relevant blocks. It also reports `focusCoverage`: `covered`, `partial` with
  the missing parts, or `not_covered` with a reason.
- Outline and narration already narrow the source package to the blocks the
  objectives cite, so the focus narrows every later stage with no retrieval
  or embeddings.
- In the wizard, `partial` and `not_covered` are advisory. ST-105 stops an
  automatic run on `not_covered`.

The focus is user content, like source text:

- It is never logged. Log and audit redaction already treats `*prompt` keys
  as sensitive, and audit metadata records only whether a focus is set.
- It enters the generation params only when present. It therefore changes the
  input version and idempotency key, and a lesson without a focus keeps its
  previous params hash.

### 4. Audience and subject neutrality

- `difficulty` gains `advanced`, and `ageBand` gains `adult-intermediate` and
  `adult-professional`. Existing values are unchanged.
- LessonSpec goes to 1.9 because its `audience` accepts the new values.
- The 1.8 reader stays in place. A stored 1.8 document parses unchanged, is
  still restricted to the 1.8 audience values, and keeps its render identity.
- New prompt versions (objectives v3, outline v3, narration v4, storyboard v3)
  take their audience wording from the configuration through an `{{audience}}`
  slot. Their domain comes from the configured `subject`.
- No prompt text or code branches on subject.

### 5. Orchestration hosting (built in ST-105)

- The prompt-to-video runner is an orchestration consumer hosted in the API
  process. It is registered through `registerJobConsumer` on an
  `orchestration` queue from `@avlp/jobs`.
- It advances a persisted run by calling the existing services and waiting on
  the existing pipeline jobs.
- No agent framework (LangChain, LangGraph or an agent SDK) is introduced. The
  runner is ordinary, idempotent job code with persisted state, so an API
  restart resumes the run without duplicating a job.

### 6. Lesson intent

A small structured call, `ai.lesson-intent` (prompt `lesson-intent/v1`),
infers `{ subject, lessonTitle }` for ST-105:

- **Input:** the focus prompt plus the parsed document's title and section
  headings. It never receives body text.
- **Plumbing:** it uses the same model-call rules as every paid call: quota
  check, model-call record, usage record, approved provider with no silent
  fallback, and a bounded repair policy.
- **Home:** it lives in the API as `LessonIntentService.infer`, with no public
  endpoint.
- **Shared code:** the model-call repository and quota guard moved from the
  pipeline worker to `@avlp/observability`, so both processes record and meter
  calls through one implementation.

### 7. Amendment (ST-107, 2026-09-27): the brief is the authorisation

ST-107 changes how a run is authorised. Everything else above still holds.

- **Brief first.** A pilot request no longer starts a run directly. It first
  prepares a video brief with `ai.one-shot-brief` (prompt `one-shot-brief/v1`).
  The brief is one small call, made on the user's explicit "Prepare brief". It
  is quota-checked, recorded and metered like every other model call. It sees
  only the focus prompt, the audience, the length, the document title, the
  section headings and each section's first block.
- **Closed choices.** The brief may choose only section IDs from the document,
  a registered style pack, and an active sound-bed track or `none`. The output
  schema is built at call time over those lists. Anything else fails
  validation and goes through the bounded repair policy, with no fallback.
- **Replaces lesson intent.** The brief supersedes `ai.lesson-intent` for runs
  that have one. It returns the same subject and title, so those runs make no
  lesson-intent call.
- **Deterministic cost.** The estimate is computed from the brief's
  `plannedSceneCount` and the configured prices. The model never produces a
  cost.
- **Single authorisation.** Confirming one brief revision and its estimate is
  now the single explicit authorisation for every paid call after the brief.
  It replaces ST-105's bare estimate. The confirmation reserves the estimate.
  The run's cap is `reserved × ONE_SHOT_BUDGET_TOLERANCE`, and it stops with
  `ONE_SHOT_BUDGET_CAP` before any paid step that would take actual spend past
  the cap. Continuing needs a second explicit acceptance of a new estimate.
- **Bounded repair.** Automatic repair before the preview is bounded: at most
  two rounds of four scenes, plus one round for an unmet brief coverage point.
  Repairs use only the existing scene-regeneration job. Deterministic
  validation decides what is wrong and whether a round helped. Grounding
  findings are never repaired or acknowledged automatically.
- **Unchanged.** The human gate before render does not change.

## Consequences

- The PRD's approval rules and market boundary are no longer universal. The
  rules above scope the change: pilot cohort for automation, additive options
  for audience and focus.
- Four prompt versions and one new operation type are added. Older prompt
  versions stay registered for jobs pinned to them.
- The prompts still used for single-block narration rewrites
  (`narration-block/v1`) and scene regeneration (`scene-regeneration/v2`) keep
  their original wording. Moving them to the audience and focus slots is a
  follow-up.
- The mock provider judges focus coverage by keyword overlap. It exercises all
  three states locally; only the real model judges meaning.

## Alternatives rejected

- **Retrieval or embeddings to find focus-relevant blocks.** Citation-driven
  narrowing already exists and is grounded by construction. Retrieval adds
  infrastructure and a second, weaker notion of relevance.
- **An agent framework for the runner.** It adds non-deterministic control
  flow and a dependency the job platform does not need. Idempotency, retries
  and correlation already exist in `@avlp/jobs`.
- **Migrating stored 1.8 LessonSpecs to 1.9 on read.** Rewriting the version
  would change content hashes and render identity for lessons that did not
  change. Reading 1.8 in place keeps ST-098 parity.
