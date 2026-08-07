# Story Development Workflow

## Picking work

1. Open `STORY_INDEX.md`.
2. Select the first story whose dependencies are all **Done**.
3. Change its status to **In Progress** in both the story front matter and the index.
4. Create one branch or pull request for the story.
5. Read `AGENTS.md`, the story file, cited PRD user stories, cited technical-guide epic, and current ADRs.

## Before coding

The agent must provide a short plan covering:

- Files and packages to change
- Schemas/contracts
- Database migrations
- API/worker/UI changes
- Tests
- Security, authorization, idempotency, cost, and failure concerns
- Any ambiguity or conflict

Do not authorize broad implementation such as “build the epic” when the assigned story is smaller.

## During implementation

- Implement only the assigned story.
- Keep domain and boundary validation server-side even if duplicated for UX.
- Add failure-path and authorization behavior alongside the happy path.
- Update shared contracts before consumers.
- Preserve immutable parser and lesson-version data.
- Never call paid providers from browser components or ordinary request handlers.

## Review

Before marking Done, the agent must:

1. Run affected lint, typecheck, unit, integration, UI, render, and evaluation commands.
2. Review the diff for unrelated changes.
3. Review every project query for tenant scoping.
4. Review every background operation for idempotency, retry classification, stale completion, correlation, and metering.
5. Review every external boundary for schema validation and safe error mapping.
6. Fill in the Dev Agent Record.
7. Update the story and index status to **In Review**.

The human reviewer then marks the story **Done** after the acceptance criteria and evidence are verified.

## Parallel work

Parallel stories are allowed only when:

- Their dependency sets are Done.
- They do not change the same central contract without coordination.
- Each has a separate branch/PR.
- Schema or migration ownership is explicit.

The numbered order remains the default safest execution order.
