import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ValidationIssue } from "@avlp/schemas";
import type { OneShotResponse, OneShotRunView } from "@avlp/schemas/one-shot";
import {
  estimate,
  projectId,
  runView,
} from "../../../../lib/one-shot-fixtures";
import type { RequestFormValues } from "../../../../lib/one-shot";
import {
  CoverageNotice,
  EstimatePanel,
  RequestFields,
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
      estimate={{ kind: "ready", estimate }}
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
  it("offers the prompt, the three audiences, three lengths and Create video", () => {
    const html = fields();
    expect(html).toContain("What should the video explain?");
    expect(html).toContain("0 / 1,000 characters");
    expect(html).toContain("Myself (adult learner)");
    expect(html).toContain("Students");
    expect(html).toContain("Professional");
    for (const minutes of [3, 5, 7])
      expect(html).toContain(`${minutes} minutes`);
    expect(html).toContain("Create video");
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

  it("disables Create video while submitting and while the pilot is paused", () => {
    expect(fields({ submitting: true })).toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="one-shot-create"/,
    );
    const paused = fields({ blockedReason: "Prompt-to-video is paused." });
    expect(paused).toContain("New runs are paused");
    expect(paused).toMatch(
      /<button[^>]*disabled=""[^>]*data-testid="one-shot-create"/,
    );
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
    expect(html).not.toContain("Create video");
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
