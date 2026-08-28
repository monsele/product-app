---
name: story-code-review
description: Review an AI Visual Learning Platform implementation against its assigned story, the PRD, the epic technical implementation guide, the ADRs, and the repository rules in AGENTS.md. Use when asked to review a completed story, check product-spec or technical-doc compliance, verify acceptance criteria, or identify and document deviations from the intended architecture. This is a spec-compliance review; for a plain bug-focused diff review use the built-in /code-review instead.
---

# Product Code Review

Perform an evidence-based review of a bounded implementation. Do not modify code, story status, or documentation unless the user explicitly asks for fixes.

## Establish review scope

1. Read `AGENTS.md`, then inspect `git status`, the requested diff/branch/PR, and affected files. Preserve unrelated work.
2. Identify the assigned story. If it is not named, infer it only from an unambiguous branch, changed story file, or diff; otherwise ask for the story ID.
3. Read the whole story, including scope, acceptance criteria, required tests, out-of-scope work, and Dev Agent Record.
4. Read every PRD user-story section and technical-guide epic/cross-cutting section cited by that story, plus all current ADRs. Apply this authority order: PRD, ADRs, story, technical guide, supporting references.

## Review method

1. Trace every acceptance criterion to implementation and automated/manual evidence. Mark it as `met`, `partially met`, `not met`, or `not verifiable`.
2. Check that the implementation stays in scope and that no stated exclusion has been silently added.
3. Review applicable engineering rules: strict typing, boundary validation, authorization and tenant isolation, immutable/versioned artifacts, background processing, job idempotency/retries/correlation/metering, safe external-provider use, and secret/source-text logging.
4. Run or inspect the relevant required tests where feasible. Treat absent or failing required tests as findings; do not claim a test passed without evidence.
5. Compare implementation decisions with the technical guide. A difference is not automatically a defect: determine whether it is explicitly permitted, a valid narrower implementation, or an unapproved architectural deviation.
6. For every deviation, state the expected technical guidance, actual implementation, evidence, impact, and whether an ADR or documented decision exists. Flag material unapproved deviations as findings requiring an ADR or corrective work.

## Report

Lead with findings, ordered by severity: `blocking`, `high`, `medium`, `low`. Each finding must include a concise title, evidence with file/line references, the relevant requirement, impact, and a concrete recommendation.

Then provide:

1. An acceptance-criteria table with the four statuses above.
2. A `Technical deviations` section, including `None found` when applicable.
3. Tests run/inspected and their result, with any limitations.
4. A short conclusion: approve, approve with follow-ups, or changes required.

Do not dilute a finding because it is documented in a Dev Agent Record. Documentation does not replace an ADR when the repository rules require one.
