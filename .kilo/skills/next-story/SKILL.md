---
name: next-story
description: Find the next eligible implementation story in an AI Visual Learning Platform story pack, then plan and implement it according to its dependency order and repository workflow. Use when asked to continue the story plan, start the next story, determine the next unblocked story, or implement the work after the last completed story.
---

# Next Story

Advance exactly one story safely. The implementation frontier is the earliest story in `STORY_INDEX.md` whose status is `Ready` and whose every `depends_on` story is `Done`; it is not necessarily the story numerically following the highest `Done` ID.

## Select the story

1. Find the repository root and read `AGENTS.md` before taking action.
2. Read `STORY_INDEX.md` and all story front matter under `stories/`. Treat a mismatch between the index and the story file as a blocker; do not guess which status is authoritative.
3. Report the latest `Done` story for context, then select the earliest eligible `Ready` story in index order. Every dependency must be `Done`, not merely `In Review`.
4. If no story is eligible, report the statuses/dependencies that prevent progress. Do not change files.
5. If an eligible story is already `In Progress`, do not take over unless the user explicitly asks. If several stories are eligible, choose the earliest unless the user names one or explicitly approves parallel work.

## Prepare work

1. Confirm the worktree is understood with `git status`; preserve unrelated user changes.
2. Create or use the story-specific branch only when it is safe to do so. Do not publish a branch or PR without user authorization.
3. Change the selected story's front-matter status and its `STORY_INDEX.md` row from `Ready` to `In Progress` together, using a focused edit.
4. Read the entire story file, each cited PRD section, the cited technical-guide epic and applicable cross-cutting sections, current ADRs, and relevant existing code.
5. Give a short implementation plan before modifying product files. Cover affected packages/files, contracts, migrations, interfaces, tests, security/authorization, failure paths, idempotency, and costs where applicable.

## Implement and verify

1. Implement only the selected story. Respect its scope and out-of-scope section.
2. Apply repository rules: strict TypeScript, boundary validation, tenant-scoped project queries, immutable canonical artifacts, editable overlays, and background/idempotent work for expensive operations.
3. Run the story's required tests plus relevant lint, typecheck, test, and build commands. Diagnose and correct failures caused by the story; clearly report unrelated or environmental failures.
4. Review the diff for scope creep, secret leakage, missing tenant checks, stale/concurrent completion, and unmetered paid calls.

## Hand off

1. Fill the story's Dev Agent Record with the required evidence, including files, migrations, contracts, commands/tests, output, decisions, deviations, and risks.
2. Change the story front matter and matching index row to `In Review` after all acceptance criteria and required tests pass.
3. Do not mark a story `Done`; the repository workflow reserves that transition for human review.
4. Give a concise completion report and state the next dependency frontier.