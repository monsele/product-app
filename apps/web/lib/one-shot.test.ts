import { afterEach, describe, expect, it, vi } from "vitest";
import { at, estimate, projectId, runView } from "./one-shot-fixtures";
import {
  audienceFor,
  audienceKindFrom,
  currentDisplayStep,
  newIdempotencyKey,
  nextPollDelay,
  pollInitialMs,
  pollMaxMs,
  requestSignature,
  startOneShotRun,
  toDisplaySteps,
  validateRequestForm,
  viewForRun,
  wizardLinkForStage,
  wizardProjectIdFromPath,
  type RequestFormValues,
} from "./one-shot";

const values: RequestFormValues = {
  focusPrompt: "Explain evaporation.",
  audienceKind: "self",
  studentAgeBand: "11-13",
  targetDurationSeconds: 300,
};

describe("toDisplaySteps", () => {
  it("folds server steps into the seven display steps, never ahead of the server", () => {
    const steps = toDisplaySteps(runView());
    expect(steps.map((step) => step.label)).toEqual([
      "Reading document",
      "Planning",
      "Outline",
      "Narration",
      "Visuals",
      "Audio",
      "Checks",
    ]);
    expect(steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "running",
      "pending",
      "pending",
      "pending",
      "pending",
    ]);
    expect(currentDisplayStep(steps)?.label).toBe("Outline");
  });

  it("marks a group running while only part of it is done", () => {
    const steps = toDisplaySteps(
      runView({
        currentStep: "illustrations",
        steps: [
          ...runView().steps.slice(0, 4),
          { step: "outline", state: "done", startedAt: at },
          { step: "narration", state: "done", startedAt: at },
          { step: "storyboard", state: "done", startedAt: at },
        ],
      }),
    );
    expect(steps.find((step) => step.id === "visuals")?.state).toBe("running");
  });

  it("shows the stopped step as needing attention", () => {
    const steps = toDisplaySteps(
      runView({
        status: "needs_attention",
        currentStep: "objectives",
        steps: [
          ...runView().steps.slice(0, 3),
          { step: "objectives", state: "needs_attention", startedAt: at },
        ],
      }),
    );
    expect(steps.find((step) => step.id === "planning")?.state).toBe(
      "attention",
    );
    expect(currentDisplayStep(steps)?.id).toBe("planning");
  });

  it("marks every build step done once the run reaches approval", () => {
    const steps = toDisplaySteps(
      runView({ status: "awaiting_render_approval", currentStep: "render" }),
    );
    expect(steps.every((step) => step.state === "done")).toBe(true);
  });
});

describe("viewForRun", () => {
  it("maps every status to its screen", () => {
    expect(viewForRun(null)).toBe("request");
    expect(viewForRun(runView({ status: "queued" }))).toBe("progress");
    expect(viewForRun(runView({ status: "running" }))).toBe("progress");
    expect(viewForRun(runView({ status: "awaiting_render_approval" }))).toBe(
      "approval",
    );
    expect(viewForRun(runView({ status: "rendering" }))).toBe("delivery");
    expect(viewForRun(runView({ status: "completed" }))).toBe("delivery");
    expect(viewForRun(runView({ status: "cancelled" }))).toBe("request");
    expect(
      viewForRun(
        runView({
          status: "needs_attention",
          needsAttention: {
            stage: "outline",
            errorCode: "STAGE_BLOCKED",
            message: "Blocked.",
          },
        }),
      ),
    ).toBe("attention");
    expect(
      viewForRun(
        runView({
          status: "needs_attention",
          needsAttention: {
            stage: "objectives",
            errorCode: "FOCUS_NOT_COVERED",
            message: "No.",
          },
        }),
      ),
    ).toBe("not_covered");
    expect(
      viewForRun(
        runView({
          status: "failed",
          needsAttention: {
            stage: "render",
            errorCode: "RENDER_FAILED",
            message: "Failed.",
          },
        }),
      ),
    ).toBe("delivery");
  });
});

describe("wizard links", () => {
  it("sends each stopped stage to the wizard page that fixes it", () => {
    expect(wizardLinkForStage(projectId, "ingestion").href).toBe(
      `/workspace/${projectId}/upload`,
    );
    expect(wizardLinkForStage(projectId, "source_snapshot").href).toBe(
      `/workspace/${projectId}/review`,
    );
    expect(wizardLinkForStage(projectId, "objectives")).toEqual({
      href: `/workspace/${projectId}/objectives`,
      label: "Objectives",
    });
    expect(wizardLinkForStage(projectId, "grounding").href).toBe(
      `/workspace/${projectId}/storyboard`,
    );
    expect(wizardLinkForStage(projectId, "audio").href).toBe(
      `/workspace/${projectId}/storyboard`,
    );
    expect(wizardLinkForStage(projectId, "preview").label).toBe("Preview");
    expect(wizardLinkForStage(projectId, "validation").href).toBe(
      `/workspace/${projectId}/preview`,
    );
  });

  it("finds the project of a wizard route but not of the run page itself", () => {
    expect(wizardProjectIdFromPath(`/workspace/${projectId}/storyboard`)).toBe(
      projectId,
    );
    expect(
      wizardProjectIdFromPath(`/workspace/${projectId}/one-shot`),
    ).toBeNull();
    expect(wizardProjectIdFromPath("/workspace")).toBeNull();
    expect(wizardProjectIdFromPath(null)).toBeNull();
  });
});

describe("audience presets", () => {
  it("maps the plain-language choices onto the audience contract and back", () => {
    expect(audienceFor("self", "11-13")).toEqual({
      ageBand: "adult-intermediate",
      difficulty: "intermediate",
      tone: "friendly",
    });
    expect(audienceFor("professional", "11-13")).toMatchObject({
      ageBand: "adult-professional",
      difficulty: "advanced",
    });
    expect(audienceFor("students", "8-10")).toMatchObject({
      ageBand: "8-10",
      difficulty: "introductory",
    });
    expect(audienceFor("students", "14-16")).toMatchObject({
      ageBand: "14-16",
      difficulty: "intermediate",
    });
    for (const kind of ["self", "students", "professional"] as const)
      expect(audienceKindFrom(audienceFor(kind, "14-16")).kind).toBe(kind);
    expect(
      audienceKindFrom(audienceFor("students", "14-16")).studentAgeBand,
    ).toBe("14-16");
  });
});

describe("validateRequestForm", () => {
  it("accepts a complete request with a matching estimate", () => {
    expect(
      validateRequestForm(values, { documentReady: true, estimate }),
    ).toEqual({});
  });

  it("reports each missing input inline", () => {
    const errors = validateRequestForm(
      { ...values, focusPrompt: "   ", audienceKind: null },
      { documentReady: false, estimate: null },
    );
    expect(Object.keys(errors).sort()).toEqual([
      "audience",
      "document",
      "estimate",
      "focusPrompt",
    ]);
  });

  it("rejects a prompt over 1,000 characters and a stale estimate", () => {
    const errors = validateRequestForm(
      { ...values, focusPrompt: "a".repeat(1_001), targetDurationSeconds: 420 },
      { documentReady: true, estimate },
    );
    expect(errors.focusPrompt).toMatch(/1,000 characters/);
    expect(errors.estimate).toBeDefined();
  });
});

describe("idempotency", () => {
  it("keeps the same signature for the same request and changes it for another", () => {
    expect(requestSignature(values, 1.84)).toBe(
      requestSignature({ ...values }, 1.84),
    );
    expect(requestSignature(values, 1.84)).not.toBe(
      requestSignature(
        { ...values, focusPrompt: "Explain condensation." },
        1.84,
      ),
    );
    expect(requestSignature(values, 1.84)).not.toBe(
      requestSignature(values, 2),
    );
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("nextPollDelay", () => {
  it("backs off while nothing changes and snaps back on change", () => {
    let delay = pollInitialMs;
    for (let i = 0; i < 10; i += 1) delay = nextPollDelay(delay, false);
    expect(delay).toBe(pollMaxMs);
    expect(nextPollDelay(delay, true)).toBe(pollInitialMs);
    expect(nextPollDelay(pollInitialMs, false)).toBe(3_000);
  });
});

describe("startOneShotRun", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the focus prompt only in the body and the key as a header", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            eligibility: { visible: true, canStart: true, reasons: [] },
            run: runView({ status: "queued", currentStep: null, steps: [] }),
          }),
          { status: 202, headers: { "content-type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const focusPrompt = "Explain evaporation with one worked example.";
    await startOneShotRun(
      projectId,
      {
        focusPrompt,
        audience: audienceFor("self", "11-13"),
        targetDurationSeconds: 300,
        acceptedEstimateUsd: 1.84,
      },
      "key-1",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toMatch(new RegExp(`/projects/${projectId}/one-shot$`));
    expect(url).not.toContain("evaporation");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe(
      "key-1",
    );
    expect(JSON.parse(String(init.body))).toMatchObject({ focusPrompt });
  });

  it("surfaces the API's own message on a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: "bad_request",
                message: "Upload a source document first.",
              },
            }),
            { status: 409 },
          ),
      ),
    );
    await expect(
      startOneShotRun(
        projectId,
        {
          focusPrompt: "x",
          audience: audienceFor("self", "11-13"),
          targetDurationSeconds: 300,
          acceptedEstimateUsd: 1,
        },
        "key-2",
      ),
    ).rejects.toMatchObject({
      status: 409,
      message: "Upload a source document first.",
    });
  });
});
