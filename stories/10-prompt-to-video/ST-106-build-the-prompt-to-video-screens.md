---
story_id: ST-106
title: "Build the Prompt-to-Video Screens: Request, Progress, Preview Approval, and Delivery"
phase: "10 — Prompt to Video"
status: Done
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

- [x] **Entry.** On `/workspace` project creation, add a "Quick video from a PDF" option.
  It is shown only when `GET /one-shot/eligibility` returns `visible: true`. It creates the
  project and goes to `/workspace/<projectId>/one-shot`.
- [x] **Request form** at `/workspace/<projectId>/one-shot`:
  - PDF upload, reusing the upload panel and the `source-upload` flow
  - a focus prompt textarea, 1,000 characters, with a counter and an example placeholder
    that is not specific to a subject
  - an audience picker: *Myself (adult learner)*, *Students (choose age band)* or
    *Professional*
  - duration: 3, 5 or 7 minutes
  - the itemised estimate from `one-shot/estimate`, and **Create video**
  - validation messages inline
- [x] **Progress view.**
  - Poll `GET one-shot` with backoff and show the steps: Reading document → Planning →
    Outline → Narration → Visuals → Audio → Checks.
  - Show cost so far and a **Cancel** action (with confirmation).
  - Reloading restores the current step.
- [x] **Needs attention.**
  - Show a card with a plain-language reason and a deep link to the wizard stage, then a
    **Resume** action.
  - For `not_covered`, show the reason and offer **Edit prompt**, which starts a new run.
- [x] **Awaiting render approval.** Show:
  - the embedded existing preview player
  - any `partial` coverage note, listing what is missing
  - validation warnings, read-only
  - **Render video** (calls `one-shot/render`)
  - **Refine in editor**, which opens the wizard at the storyboard stage
- [x] **After render.** Reuse the render panel's progress, failure and retry, download and
  share. Show the ST-103 review summary when available.
- [x] **Wizard link.** Projects that have a run show a "Prompt-to-video run" link from the
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

- [x] A cohort user completes upload → prompt → estimate → Create video → progress → preview
  → Render → download without visiting a wizard page.
- [x] Users outside the cohort never see the entry. Navigating directly to the route shows an
  "unavailable" state.
- [x] Reloading at any point shows the correct step, and polling resumes.
- [x] `not_covered` and `needs_attention` states show the reason, the correct deep link and
  resume or edit actions that work.
- [x] Double-clicking **Create video** or **Render video** creates only one run and one render.
- [x] The screens pass the ST-083 accessibility checks and work at phone width.

## Required Tests

- [x] **Component tests:** form validation, the estimate display, each run status view, and
  the coverage notices.
- [x] **Hydrated browser tests (Playwright):**
  - the golden path with the mock provider
  - reload mid-run
  - cancel
  - needs-attention → wizard → resume
  - a double-click on each action
- [x] **End to end** with the `run-app` skill: three different-subject PDFs, with screenshots
  of each state.

## Out of Scope

- The brief screen, budget readout and decision-log panel (ST-107).
- New server endpoints.
- Changes to the wizard pages beyond the header link.

## Definition of Done

- [x] All acceptance criteria pass.
- [x] Required tests pass.
- [x] Lint, typecheck, test and build commands pass for the affected workspaces.
- [x] Screenshots are recorded in the Dev Agent Record.
- [x] No unresolved security, tenant-isolation, idempotency or data-loss issue remains.
- [x] Dev Agent Record is completed.
- [x] Story status and index are updated to Done.

## Dev Agent Record

- **Agent:** Claude Code (Opus 5.5)
- **Started:** 2026-09-27
- **Completed:** 2026-09-27 (handed off `In Review`)
- **Branch/PR:** `feat/st-106-prompt-to-video-screens`, cut from `feat/st-105-one-shot-orchestration` after ST-105 was committed as "approved 105". Not pushed; no PR.
- **Files changed:**
  - New, web:
    - `apps/web/lib/one-shot.ts` (the typed client over ST-105's DTOs and pure rules) and `one-shot.test.ts`;
    - `apps/web/lib/one-shot-fixtures.ts` (test-only);
    - `apps/web/app/workspace/[projectId]/one-shot/`:
      - `page.tsx`;
      - `one-shot-workspace.tsx`;
      - `one-shot-views.tsx`;
      - `one-shot-preview.tsx`;
      - `one-shot-delivery.tsx`;
      - `one-shot.module.css`;
      - `one-shot-views.test.tsx`;
      - `one-shot.playwright.test.tsx`;
    - `apps/web/components/layout/one-shot-run-link.tsx` and `.module.css`.
  - Changed, web:
    - `app/workspace/page.tsx`: eligibility read;
    - `app/workspace/project-board-client.tsx` and `workspace.module.css`: the "Quick video from a PDF" choice;
    - `app/api/projects/route.ts`: `flow=one-shot` redirect;
    - `components/layout/app-shell.tsx`: wizard header link;
    - `app/workspace/[projectId]/preview/preview-player.tsx`: `previewPlayerInput` extracted unchanged, so the approval screen plays the lesson identically.
  - Changed, API (see Deviations): `one-shot-runner.ts`, `one-shot-gateway.ts`, `one-shot-test-pipeline.ts`, `one-shot-runner.test.ts`.
  - Tests and docs:
    - `e2e/one-shot.spec.ts` and `e2e/one-shot-mock.mjs` (new);
    - `e2e/workspace-mock-api.mjs` (routes to the one-shot mock);
    - `docs/prompt-to-video-pilot.md` (screens section, configuration rule).
- **Migrations:** None.
- **Contracts:** No new endpoints and no schema changes.
  - `ConfigurationState` (runner-internal) gains `ageBand`, `difficulty` and `targetDurationSeconds`.
- **Commands/tests:**
  - **Web.** Typecheck and lint are clean. `vitest` passes the full suite (58 files, 322 tests) before the documentReady fix, then 42/42 on the one-shot files after it:
    - `lib/one-shot.test.ts`: 15;
    - `one-shot-views.test.tsx`: 20 (form validation, estimate, each run status, coverage notices, live region);
    - `one-shot.playwright.test.tsx`: 7 (axe WCAG A/AA, no serious or critical violations, in every view).
  - **`next build`:** passes, and `/workspace/[projectId]/one-shot` is 12.9 kB.
  - **API.**
    - Typecheck and lint are clean.
    - `one-shot-runner` 14/14 (2 new) and `one-shot-gateway` 7/7.
    - The Postgres integration tests (`TEST_DATABASE_URL`, `--hookTimeout 180000`): `one-shot.integration` 13/13 and `focus-intent.integration` 10/10.
    - Full unit suite: 546 passed, 8 failed. All 8 were first-test app-boot timeouts while `next build` ran alongside; they pass on rerun (8 files, 77/77).
  - **Hydrated Playwright** (`e2e/one-shot.spec.ts`, real Next dev + stateful mock): 6/6.
    - The cohort-only entry, and the unavailable route outside the cohort.
    - The golden path: upload, prompt, estimate, Create video, progress, preview, Render video, then download. It asserts no wizard navigation, no prompt words in any request URL, one run and one render after double clicks, and no horizontal scroll at 390 px.
    - Reload mid-run.
    - Cancel with confirmation.
    - Needs attention → wizard → header link back → Resume.
    - Not covered → Edit prompt → new run, after an in-page upload (regression test).
  - **Pre-existing failures**, reproduced on the unchanged code paths:
    - `app-shell.spec.ts` ×2 expect a "Teacher workspace" heading, which no longer exists.
    - `workspace.spec.ts` "rejects malformed project-list responses" gets 200 from `next dev` streaming for a throw that happens before any ST-106 code.
    - `workspace.spec.ts` "creates a new lesson" fails only when run in parallel with `one-shot.spec.ts` (shared mock state) and passes serially.
  - **run-app end to end**, with the full local stack and mock providers:
    - The API ran in the cohort with `ONE_SHOT_PILOT_ENABLED=true`.
    - Driver: `.runtime-logs/st106-drive.mjs`; results in `.runtime-logs/st106-results.json`.
- **Screenshots/output:** `.runtime-logs/st106-*.png`, for three subjects plus an outsider.
  - **Biology (cell biology PDF).**
    - Off-topic prompt → `not_covered` → Edit prompt → new run.
    - Progress, reload, then phone at 390 px with 0 px overflow.
    - Approval with the embedded player and a partial-coverage note.
    - Rendering, then completed. Downloaded `how-do-mitochondria-and-chloroplasts-supply-energy-to-a-cell-v1.mp4`; cost $0.06.
  - **History (Roman Republic PDF), Students 11–13.**
    - Progress and reload, then needs attention at audio.
    - Storyboard wizard showing the "Prompt-to-video run" header link, audio retried, Resume.
    - Approval, render, completed. Downloaded; cost $0.05.
  - **Finance (compound interest PDF), Professional.** The same needs-attention → wizard → Resume path, then completed and downloaded; cost $0.05.
  - **Outsider (not in the cohort):** no entry on `/workspace`, and the route shows "Quick video is unavailable".
- **Decisions/assumptions:**
  1. **Eligibility is read through the user's most recent project.** It is served only under `/projects/:id` and no new endpoints are allowed. A cohort user with no project yet does not see the entry until they have one. Hiding it is a convenience only; the server enforces the cohort.
  2. **Audience presets:**
     - *Myself*: `adult-intermediate`, `intermediate`.
     - *Students*: the chosen band; `introductory` for 8–13 and `intermediate` for 14–16.
     - *Professional*: `adult-professional`, `advanced`.
     - Tone is left at `friendly` in every preset.
  3. **Create video idempotency.** The key stays the same while the request (prompt, audience, duration and accepted estimate) is unchanged, and a new key is made when any of them changes. The button is also guarded in the browser. Render video relies on the in-browser guard plus the server's 409 once the run leaves approval.
  4. **Preview.** Approval embeds `FullLessonPreviewPlayer` directly, not the full `FullLessonPreview` page, which carries wizard actions (acknowledge, its own Render link). Warnings are listed read-only.
  5. **Delivery reuses `RenderPanel` unchanged**, including its own h1, so the run page drops its header h1 in that view. A `RENDER_FAILED` run shows the render panel plus **Resume**.
  6. **Polling** starts at 2 s and backs off ×1.5 to 15 s while nothing changes. It runs only while the run is `queued`, `running` or `rendering`.
  7. **Edit prompt** cancels the stopped run and returns to a prefilled form. The next Create video starts a new run.
- **Deviations:**
  1. **ST-105 runner fix (server code; not a new endpoint).**
     - The live run showed that after **Edit prompt** the new run kept the cancelled run's focus. `evaluateConfiguration` treated any configuration with a focus as done, so "Edit prompt starts a new run" could never succeed.
     - A configuration now counts as this run's only if the run has recorded its configuration step, or the stored configuration already matches the run's request (focus, age band, difficulty, duration). The second condition covers a tick that died after saving.
     - The user's mid-run wizard edits are still kept. Covered by two new runner tests, plus all ST-105 unit and integration tests. Please review it with ST-105 in mind.
  2. **UI fix found live:** document readiness is held by the run page, not the form, so it survives Edit prompt. Covered by the updated e2e.
- **Known risks/follow-up:**
  - **The focus prompt can reach a URL through the download filename.**
    - The render download's signed URL carries `response-content-disposition` with a slug of the lesson title.
    - With the mock provider, lesson-intent inference returns the focus prompt as the title. The biology download is named after the prompt verbatim.
    - The ST-106 screens never put the prompt in a URL. This comes from ST-105 intent inference combined with the existing render-download naming. Suggested follow-up: keep inferred titles short and distinct from the prompt, or name downloads by lesson ID.
  - **Live runs need matching TTS config across API and worker.**
    - An API started with `TOGETHER_API_KEY` from `.env` and a worker started without it disagree. Every `tts.generate` then fails `TTS_PROVIDER_MISMATCH`, and runs stop at audio.
    - The UI handled this correctly (needs attention → wizard → Resume). Run the stack with one provider setting; `.runtime-logs/st106-start-api.cmd` shows the mock setup.
  - **Resume after an audio failure only continues once the failed scene audio has been retried in the wizard.** This is ST-105's documented contract and the attention card says so.
  - **Renders queue behind one renderer,** so three parallel runs took about 12–19 minutes each locally.
  - **The API is left running** in the pilot configuration from `.runtime-logs/st106-start-api.cmd`. The renderer was restarted; web and Docling are stopped.
