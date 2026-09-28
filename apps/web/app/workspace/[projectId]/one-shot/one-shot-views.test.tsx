import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ValidationIssue } from "@avlp/schemas";
import type { OneShotResponse, OneShotRunView } from "@avlp/schemas/one-shot";
import {
  briefView,
  decisionLog,
  estimate,
  projectId,
  runView,
} from "../../../../lib/one-shot-fixtures";
import {
  soundBedOptions,
  type RequestFormValues,
} from "../../../../lib/one-shot";
import {
  BriefCard,
  BudgetCapCard,
  CoverageGapNotice,
  CoverageNotice,
  DecisionPanel,
  EstimatePanel,
  RequestFields,
  RunMeta,
  ValidationWarnings,
} from "./one-shot-views";
import { OneShotWorkspace, announcementFor } from "./one-shot-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ prefetch: () => undefined, push: () => undefined }),
  usePathname: () => null,
}));

const noop = () => undefined;
const eligible = { visible: true, canStart: true, reasons: [] };

function page(run: OneShotRunView | null, eligibility = eligible): string {
  const initial: OneShotResponse = { eligibility, run };
  return renderToStaticMarkup(
    <OneShotWorkspace
      projectId={projectId}
      projectTitle="Water cycle"
      initial={initial}
      documentReady={run !== null}
    />,
  );
}

function fields(
  overrides: Partial<React.ComponentProps<typeof RequestFields>> = {},
): string {
  const values: RequestFormValues = {
    focusPrompt: "",
    audienceKind: null,
    studentAgeBand: "11-13",
    targetDurationSeconds: 300,
  };
  return renderToStaticMarkup(
    <RequestFields
      values={values}
      errors={{}}
      revisions={null}
      documentSlot={<p>document</p>}
      blockedReason={null}
      submitting={false}
      submitError={null}
      onFocusPromptChange={noop}
      onAudienceKindChange={noop}
      onStudentAgeBandChange={noop}
      onDurationChange={noop}
      onSubmit={noop}
      {...overrides}
    />,
  );
}

describe("request form", () => {
  it("offers the prompt, the three audiences, three lengths and Prepare brief", () => {
    const html = fields();
    expect(html).toContain("What should the video explain?");
    expect(html).toContain("0 / 1,000 characters");
    expect(html).toContain("Myself (adult learner)");
    expect(html).toContain("Students");
    expect(html).toContain("Professional");
    for (const minutes of [3, 5, 7])
      expect(html).toContain(`${minutes} minutes`);
    expect(html).toContain("Prepare brief");
    expect(html).not.toContain("Create video");
    // No cost is shown before the brief: it is computed from the brief.
    expect(html).not.toContain('data-testid="one-shot-estimate"');
    // The example is generic, not tied to one subject's vocabulary.
    expect(html).toContain("explain the main idea of section 2");
  });

  it("shows validation messages inline next to their fields", () => {
    const html = fields({
      errors: {
        focusPrompt: "Describe what the video should explain.",
        audience: "Choose who the video is for.",
        document: "Upload a PDF and wait for it to pass the checks.",
      },
    });
    expect(html).toContain('id="one-shot-focus-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toMatch(/aria-describedby="[^"]*one-shot-focus-error/);
    expect(html).toContain('id="one-shot-audience-error"');
    expect(html).toContain("Upload a PDF and wait for it to pass the checks.");
  });

  it("flags a prompt over the limit in the counter", () => {
    const html = fields({
      values: {
        focusPrompt: "a".repeat(1_005),
        audienceKind: "self",
        studentAgeBand: "11-13",
        targetDurationSeconds: 300,
      },
    });
    expect(html).toContain("1,005 / 1,000 characters");
    expect(html).toContain('aria-invalid="true"');
  });

  it("asks for an age band only for students", () => {
    expect(fields()).not.toContain("Student age band");
    const html = fields({
      values: {
        focusPrompt: "x",
        audienceKind: "students",
        studentAgeBand: "14-16",
        targetDurationSeconds: 300,
      },
    });
    expect(html).toContain("Student age band");
    expect(html).toContain("Ages 14–16");
  });

  it("disables Prepare brief while submitting, while paused and once every brief is used", () => {
    const disabled = /<button[^>]*disabled=""[^>]*data-testid="one-shot-prepare-brief"/;
    expect(fields({ submitting: true })).toMatch(disabled);
    const paused = fields({ blockedReason: "Prompt-to-video is paused." });
    expect(paused).toContain("New runs are paused");
    expect(paused).toMatch(disabled);
    const exhausted = fields({ revisions: { used: 3, max: 3 } });
    expect(exhausted).toMatch(disabled);
    expect(exhausted).toContain("the most for one video");
    const revising = fields({ revisions: { used: 1, max: 3 }, onBackToBrief: noop });
    expect(revising).toContain("Brief 1 of 3 prepared");
    expect(revising).toContain("Back to the brief");
    expect(revising).not.toMatch(disabled);
  });
});

describe("estimate", () => {
  it("itemises the estimate with a total", () => {
    const html = renderToStaticMarkup(
      <EstimatePanel
        state={{
          kind: "ready",
          estimate: {
            ...estimate,
            items: [
              {
                key: "model.outline",
                label: "Outline",
                quantity: 1,
                unitCostUsd: 0.1,
                costUsd: 0.1,
              },
              {
                key: "image",
                label: "Illustrations",
                quantity: 10,
                unitCostUsd: 0.04,
                costUsd: 0.4,
              },
            ],
            totalUsd: 0.5,
          },
        }}
      />,
    );
    expect(html).toContain("Outline");
    expect(html).toContain("Illustrations × 10");
    expect(html).toContain("$0.40");
    expect(html).toContain("Total, at most");
    expect(html).toContain("$0.50");
    expect(html).toContain("about 10 scenes");
  });

  it("shows loading and error states", () => {
    expect(
      renderToStaticMarkup(<EstimatePanel state={{ kind: "loading" }} />),
    ).toContain("Calculating the estimate");
    expect(
      renderToStaticMarkup(
        <EstimatePanel state={{ kind: "error", message: "Paused." }} />,
      ),
    ).toContain('role="alert"');
  });
});

describe("run status views", () => {
  it("request: no run shows the form", () => {
    const html = page(null);
    expect(html).toContain('data-view="request"');
    expect(html).toContain("Describe the video");
    // No document yet: the existing upload panel is embedded.
    expect(html).toContain("Source document");
    expect(html).toContain("Upload document");
  });

  it("request: a cancelled run restores its inputs for a new run", () => {
    const html = page(runView({ status: "cancelled" }));
    expect(html).toContain('data-view="request"');
    expect(html).toContain(
      "Explain how the water cycle moves heat around the planet.",
    );
  });

  it("queued and running show the steps, cost so far and Cancel", () => {
    for (const status of ["queued", "running"] as const) {
      const html = page(runView({ status }));
      expect(html).toContain('data-view="progress"');
      expect(html).toContain("Reading document");
      expect(html).toContain("Checks");
      expect(html).toContain('aria-current="step"');
      expect(html).toContain("$0.42");
      expect(html).toContain("Cancel video");
    }
  });

  it("needs_attention names the reason, deep-links the wizard stage and offers Resume", () => {
    const html = page(
      runView({
        status: "needs_attention",
        currentStep: "outline",
        steps: [
          ...runView().steps.slice(0, 4),
          {
            step: "outline",
            state: "needs_attention",
            startedAt: "2026-09-27T08:00:00.000Z",
          },
        ],
        needsAttention: {
          stage: "outline",
          errorCode: "STAGE_BLOCKED",
          message: "The outline draft cannot be approved as generated.",
        },
      }),
    );
    expect(html).toContain('data-view="attention"');
    expect(html).toContain(
      "The outline draft cannot be approved as generated.",
    );
    expect(html).toContain(`href="/workspace/${projectId}/outline"`);
    expect(html).toContain("Open Outline in the editor");
    expect(html).toContain("Resume");
  });

  it("failed (not at render) also offers the wizard link and Resume", () => {
    const html = page(
      runView({
        status: "failed",
        needsAttention: {
          stage: "audio",
          errorCode: "STAGE_JOB_FAILED",
          message: "Scene audio failed.",
        },
      }),
    );
    expect(html).toContain("A step failed");
    expect(html).toContain(`href="/workspace/${projectId}/storyboard"`);
    expect(html).toContain('data-testid="one-shot-resume"');
  });

  it("not_covered shows the reason and Edit prompt", () => {
    const html = page(
      runView({
        status: "needs_attention",
        focusCoverage: {
          status: "not_covered",
          reason: "The document is about rivers, not heat.",
        },
        needsAttention: {
          stage: "objectives",
          errorCode: "FOCUS_NOT_COVERED",
          message:
            "The document does not cover this focus: The document is about rivers, not heat.",
        },
      }),
    );
    expect(html).toContain('data-view="not_covered"');
    expect(html).toContain("The document is about rivers, not heat.");
    expect(html).toContain("Edit prompt");
    expect(html).not.toContain('data-testid="one-shot-resume"');
  });

  it("awaiting_render_approval shows the player, Render video and Refine in editor", () => {
    const html = page(
      runView({
        status: "awaiting_render_approval",
        currentStep: "render",
        focusCoverage: { status: "partial", missing: ["The role of oceans"] },
      }),
    );
    expect(html).toContain('data-view="approval"');
    expect(html).toContain('data-testid="one-shot-player"');
    expect(html).toContain("Render video");
    expect(html).toContain(`href="/workspace/${projectId}/storyboard"`);
    expect(html).toContain("Refine in editor");
    expect(html).toContain("The role of oceans");
  });

  it("rendering and completed hand over to the render panel", () => {
    const rendering = page(
      runView({ status: "rendering", currentStep: "render" }),
    );
    expect(rendering).toContain('data-view="delivery"');
    expect(rendering).toContain("Rendering");
    expect(rendering).toContain("Cancel video");
    const completed = page(runView({ status: "completed", currentStep: null }));
    expect(completed).toContain("Video ready");
    expect(completed).not.toContain("Cancel video");
  });

  it("a failed render offers Resume alongside the render panel", () => {
    const html = page(
      runView({
        status: "failed",
        currentStep: "render",
        needsAttention: {
          stage: "render",
          errorCode: "RENDER_FAILED",
          message:
            "The render did not finish. Resume the run to approve a new render.",
        },
      }),
    );
    expect(html).toContain('data-view="delivery"');
    expect(html).toContain("Render did not finish");
    expect(html).toContain('data-testid="one-shot-resume"');
  });

  it("outside the cohort shows only the unavailable state", () => {
    const html = page(null, {
      visible: false,
      canStart: false,
      reasons: [{ code: "not_in_cohort", message: "Not enabled." }],
    } as unknown as typeof eligible);
    expect(html).toContain('data-testid="one-shot-unavailable"');
    expect(html).not.toContain("Prepare brief");
  });

  it("announces the current step through a live region", () => {
    expect(page(runView())).toMatch(
      /role="status" aria-live="polite"[^>]*>Building your video: Outline in progress\./,
    );
    expect(announcementFor("approval", null)).toContain("preview is ready");
  });
});

describe("coverage and warnings", () => {
  it("lists what a partial coverage is missing, and nothing for full coverage", () => {
    const html = renderToStaticMarkup(
      <CoverageNotice
        coverage={{
          status: "partial",
          missing: ["Heat transfer", "Latent heat"],
        }}
      />,
    );
    expect(html).toContain("covers only part of this request");
    expect(html).toContain("<li>Heat transfer</li>");
    expect(html).toContain("<li>Latent heat</li>");
    expect(
      renderToStaticMarkup(<CoverageNotice coverage={{ status: "covered" }} />),
    ).toBe("");
    expect(renderToStaticMarkup(<CoverageNotice coverage={null} />)).toBe("");
  });

  it("lists validation warnings read-only, with no acknowledge action", () => {
    const issue = (
      id: string,
      severity: "warning" | "error",
      message: string,
    ): ValidationIssue => ({
      id,
      severity,
      code: "CAPTION_TOO_LONG" as ValidationIssue["code"],
      scopeType: "captions",
      scopeId: null,
      sceneId: null,
      fieldPath: "captions",
      message,
      details: {},
      acknowledgeable: severity === "warning",
      acknowledgedAt: null,
    });
    const html = renderToStaticMarkup(
      <ValidationWarnings
        issues={[
          issue(
            "019ffbf1-7000-7000-8000-0000000000a1",
            "warning",
            "Caption 3 is long.",
          ),
          issue(
            "019ffbf1-7000-7000-8000-0000000000a2",
            "error",
            "Scene 2 has no audio.",
          ),
        ]}
      />,
    );
    expect(html).toContain("Check notes (1)");
    expect(html).toContain("Caption 3 is long.");
    expect(html).not.toContain("Scene 2 has no audio.");
    expect(html).not.toMatch(/<button/);
  });
});

// ---------------------------------------------------------------------------
// ST-107
// ---------------------------------------------------------------------------

function briefCard(overrides: Partial<React.ComponentProps<typeof BriefCard>> = {}): string {
  const brief = briefView();
  return renderToStaticMarkup(
    <BriefCard
      brief={brief}
      revisions={{ used: 1, max: 3 }}
      stylePackIds={["essential", "systems", "field-notes"]}
      stylePackId={brief.stylePackId}
      soundBed={brief.soundBed}
      soundBedOptions={soundBedOptions([{ trackId: "morning-pad", title: "Morning Pad" }], brief.soundBed)}
      onStylePackChange={noop}
      onSoundBedChange={noop}
      onEdit={noop}
      onConfirm={noop}
      onCancel={noop}
      confirming={false}
      confirmError={null}
      blockedReason={null}
      {...overrides}
    />,
  );
}

describe("ST-107 video brief", () => {
  it("lists every coverage point with its source-section chips, and what is left out", () => {
    const html = briefCard();
    expect(html.match(/data-testid="one-shot-brief-point"/g)).toHaveLength(2);
    expect(html).toContain("How evaporation absorbs heat");
    expect(html).toMatch(/data-testid="one-shot-source-chip"[^>]*>Evaporation</);
    expect(html).toMatch(/data-testid="one-shot-source-chip"[^>]*>Condensation</);
    expect(html).toContain("What it will leave out");
    expect(html).toContain("Ocean currents");
    expect(html).toContain("about 8 scenes");
  });

  it("offers the style pack and sound bed from the closed lists, each with its reason", () => {
    const html = briefCard();
    expect(html).toContain('<label for="one-shot-style"');
    expect(html).toMatch(/<option value="field-notes" selected="">Field Notes<\/option>/);
    expect(html).toContain("Suggested: Documentary tones suit an earth-science explanation.");
    expect(html).toMatch(/<option value="morning-pad" selected="">Morning Pad<\/option>/);
    expect(html).toContain('<option value="none">No background sound</option>');
    expect(html).toContain("Suggested: A calm bed that sits under the narration.");
    const changed = briefCard({ stylePackId: "systems", soundBed: "none" });
    expect(changed).toContain("Your choice. The brief suggested Field Notes.");
    expect(changed).toContain("Your choice. It plays quietly under the narration.");
  });

  it("shows the itemised estimate and confirms with one guarded action", () => {
    const html = briefCard();
    expect(html).toContain('data-testid="one-shot-estimate-total"');
    expect(html).toContain("$1.84");
    expect(html).toContain("Confirm &amp; create video");
    expect(html).toContain("Brief 1 of 3 prepared");
    expect(briefCard({ confirming: true })).toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="one-shot-confirm"/,
    );
    expect(briefCard({ confirmError: "A newer brief has been prepared." })).toContain(
      "A newer brief has been prepared.",
    );
  });

  it("disables Edit request once every brief is used", () => {
    expect(briefCard({ revisions: { used: 3, max: 3 } })).toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="one-shot-edit-brief"/,
    );
    expect(briefCard()).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="one-shot-edit-brief"/);
  });

  it("a run in a brief status opens the brief view and loads the brief", () => {
    const html = page(runView({ status: "brief_ready", currentStep: null, steps: [], budget: null, briefRevision: null }));
    expect(html).toContain('data-view="brief"');
    expect(html).toContain("Loading your brief");
  });
});

describe("ST-107 budget", () => {
  it("shows cost so far, the approved estimate and the cap", () => {
    const html = renderToStaticMarkup(<RunMeta run={runView()} />);
    expect(html).toContain('data-testid="one-shot-cost"');
    expect(html).toMatch(/data-testid="one-shot-estimate-approved"[^>]*>\$1\.84/);
    expect(html).toMatch(/data-testid="one-shot-cap"[^>]*>\$2\.30/);
    // A run from before briefs has no cap to show.
    expect(renderToStaticMarkup(<RunMeta run={runView({ budget: null })} />)).not.toContain("one-shot-cap");
  });

  it("a budget-capped run asks to accept the new estimate before continuing", () => {
    const run = runView({
      status: "needs_attention",
      needsAttention: {
        stage: "storyboard",
        errorCode: "ONE_SHOT_BUDGET_CAP",
        message: "The next step would take this video past its budget cap of $2.30.",
      },
      budget: {
        reservedUsd: 1.84,
        capUsd: 2.3,
        actualUsd: 2.1,
        reservationRevision: 1,
        proposedEstimateUsd: 3.25,
      },
    });
    const card = renderToStaticMarkup(
      <BudgetCapCard run={run} busy={false} onAccept={noop} onCancel={noop} />,
    );
    expect(card).toContain("The video reached its budget");
    expect(card).toContain("past its budget cap of $2.30");
    expect(card).toContain("Accept $3.25 and continue");
    expect(page(run)).toContain('data-view="budget"');
  });
});

describe("ST-107 decision log and coverage gaps", () => {
  it("lists every decision with its reason, model and cost, and the ledger", () => {
    const html = renderToStaticMarkup(
      <DecisionPanel state={{ kind: "ready", log: decisionLog }} onExport={noop} />,
    );
    expect(html).toContain("How this video was made");
    expect(html.match(/data-testid="one-shot-decision"/g)).toHaveLength(2);
    expect(html).toContain("Round 1: applied the regenerated scene 3.");
    expect(html).toContain("on-screen text overflowed its layout");
    expect(html).toContain("Model: mock-model-1 · Cost: $0.01");
    expect(html.match(/data-testid="one-shot-ledger-row"/g)).toHaveLength(2);
    expect(html).toContain("Automatic fixes");
    expect(html).toContain('data-testid="one-shot-decisions-export"');
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*data-testid="one-shot-decisions-export"/);
  });

  it("keeps Export disabled until the log has loaded", () => {
    const loading = renderToStaticMarkup(<DecisionPanel state={{ kind: "loading" }} onExport={noop} />);
    expect(loading).toContain("Loading the decision log");
    expect(loading).toMatch(/<button[^>]*disabled=""[^>]*data-testid="one-shot-decisions-export"/);
    expect(
      renderToStaticMarkup(<DecisionPanel state={{ kind: "error", message: "Not loaded." }} onExport={noop} />),
    ).toContain('role="alert"');
  });

  it("shows each unmet brief point as Not covered on the preview", () => {
    const html = page(
      runView({
        status: "awaiting_render_approval",
        currentStep: "render",
        coverageGaps: ["How condensation releases it"],
      }),
    );
    expect(html).toContain('data-testid="one-shot-coverage-gap"');
    expect(html).toContain("Not covered: How condensation releases it");
    expect(html).toContain('data-testid="one-shot-decisions"');
    expect(renderToStaticMarkup(<CoverageGapNotice gaps={[]} />)).toBe("");
  });

  it("a failed render review offers Retry render with the findings", () => {
    const html = page(
      runView({
        status: "needs_attention",
        currentStep: "render",
        needsAttention: {
          stage: "render",
          errorCode: "RENDER_REVIEW_FAILED",
          message: "The finished video failed its quality review (NARRATION_SILENT: no narration from 0:12).",
        },
      }),
    );
    expect(html).toContain('data-view="delivery"');
    expect(html).toContain("The video failed its quality review");
    expect(html).toContain("NARRATION_SILENT");
    expect(html).toContain('data-testid="one-shot-resume"');
    expect(html).toContain("Retry render");
    // The same lesson renders to the same video: the fix comes first.
    expect(html).toMatch(new RegExp(`data-testid="one-shot-review-fix-link"`));
    expect(html).toContain(`href="/workspace/${projectId}/storyboard"`);
    expect(html).toContain("fix the findings in the editor first");
  });
});
