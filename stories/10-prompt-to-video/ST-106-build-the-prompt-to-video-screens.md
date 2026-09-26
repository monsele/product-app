---
story_id: ST-106
title: "Build the Prompt-to-Video Screens: Request, Progress, Preview Approval, and Delivery"
phase: "10 — Prompt to Video"
status: Ready
priority: should-have
epics: ["E2", "E3", "E15", "E17", "E18"]
prd_user_stories: ["E2-US1", "E3-US1", "E15-US2", "E17-US1", "E17-US2", "E18-US1"]
depends_on: ["ST-075", "ST-081", "ST-082", "ST-083", "ST-105"]
---

# ST-106 — Build the Prompt-to-Video Screens

## Story

As a pilot user, I want one screen where I upload a PDF, say what I want explained, see the
cost, and watch the video being built. Then I want to preview it and click Render, or open the
editor to refine it.

## Outcome

This is the third of three prompt-to-video stories. The prompt-to-video flow becomes usable end
to end in the browser for cohort users, entirely on top of ST-105's API.

## Required Reading

- `AGENTS.md`
- `docs/design.md`. This is required before any UI change.
- ST-105's endpoint contracts
- The existing upload panel, preview player (`apps/web/app/workspace/[projectId]/preview/preview-player.tsx`)
  and render panel (`.../render/render-panel.tsx`)

## Dependencies

ST-075, ST-081, ST-082 and ST-083 are Done. ST-105 must be Done before this starts.

## Scope

- [ ] **Entry.** On `/workspace` project creation, add a "Quick video from a PDF" option.
  It is shown only when `GET /one-shot/eligibility` returns `visible: true`. It creates the
  project and goes to `/workspace/<projectId>/one-shot`.
- [ ] **Request form** at `/workspace/<projectId>/one-shot`:
  - PDF upload, reusing the upload panel and the `source-upload` flow
  - a focus prompt textarea, 1,000 characters, with a counter and an example placeholder
    that is not specific to a subject
  - an audience picker: *Myself (adult learner)*, *Students (choose age band)* or
    *Professional*
  - duration: 3, 5 or 7 minutes
  - the itemised estimate from `one-shot/estimate`, and **Create video**
  - validation messages inline
- [ ] **Progress view.**
  - Poll `GET one-shot` with backoff and show the steps: Reading document → Planning →
    Outline → Narration → Visuals → Audio → Checks.
  - Show cost so far and a **Cancel** action (with confirmation).
  - Reloading restores the current step.
- [ ] **Needs attention.**
  - Show a card with a plain-language reason and a deep link to the wizard stage, then a
    **Resume** action.
  - For `not_covered`, show the reason and offer **Edit prompt**, which starts a new run.
- [ ] **Awaiting render approval.** Show:
  - the embedded existing preview player
  - any `partial` coverage note, listing what is missing
  - validation warnings, read-only
  - **Render video** (calls `one-shot/render`)
  - **Refine in editor**, which opens the wizard at the storyboard stage
- [ ] **After render.** Reuse the render panel's progress, failure and retry, download and
  share. Show the ST-103 review summary when available.
- [ ] **Wizard link.** Projects that have a run show a "Prompt-to-video run" link from the
  wizard header back to the run page.

## Technical Implementation Requirements

- The UI hides nothing for authorisation. The server enforces the cohort. Hidden entry points
  are a convenience only.
- Paid work starts only from the explicit **Create video** and **Render video** clicks.
  **Create video** sends an idempotency key. Double clicks cannot create two runs.
- Accessible and responsive, following ST-083:
  - keyboard operable
  - progress announced through a live region
  - works at phone width with no horizontal scroll
- Never put the focus prompt in URLs or analytics.

## Contracts and Persistence

- No new server contracts. The UI consumes ST-105's DTOs through the existing typed client
  pattern.

## Interfaces

- Routes: the `/workspace` entry and `/workspace/<projectId>/one-shot`.

## Acceptance Criteria

- [ ] A cohort user completes upload → prompt → estimate → Create video → progress → preview
  → Render → download without visiting a wizard page.
- [ ] Users outside the cohort never see the entry. Navigating directly to the route shows an
  "unavailable" state.
- [ ] Reloading at any point shows the correct step, and polling resumes.
- [ ] `not_covered` and `needs_attention` states show the reason, the correct deep link and
  resume or edit actions that work.
- [ ] Double-clicking **Create video** or **Render video** creates only one run and one render.
- [ ] The screens pass the ST-083 accessibility checks and work at phone width.

## Required Tests

- [ ] **Component tests:** form validation, the estimate display, each run status view, and
  the coverage notices.
- [ ] **Hydrated browser tests (Playwright):**
  - the golden path with the mock provider
  - reload mid-run
  - cancel
  - needs-attention → wizard → resume
  - a double-click on each action
- [ ] **End to end** with the `run-app` skill: three different-subject PDFs, with screenshots
  of each state.

## Out of Scope

- The brief screen, budget readout and decision-log panel (ST-107).
- New server endpoints.
- Changes to the wizard pages beyond the header link.

## Definition of Done

- [ ] All acceptance criteria pass.
- [ ] Required tests pass.
- [ ] Lint, typecheck, test and build commands pass for the affected workspaces.
- [ ] Screenshots are recorded in the Dev Agent Record.
- [ ] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [ ] Dev Agent Record is completed.
- [ ] Story status and index are updated to Done.

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
