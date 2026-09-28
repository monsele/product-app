import { afterEach, describe, expect, it, vi } from "vitest";
import { at, briefView, decisionLog, projectId, runView } from "./one-shot-fixtures";
import {
  acceptBudget,
  audienceFor,
  audienceKindFrom,
  confirmBrief,
  currentDisplayStep,
  decisionLogExport,
  newIdempotencyKey,
  nextPollDelay,
  pollInitialMs,
  pollMaxMs,
  prepareBrief,
  requestSignature,
  soundBedOptions,
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
    // ST-107: the brief, the budget cap and a failed render review.
    expect(viewForRun(runView({ status: "brief_pending" }))).toBe("brief");
    expect(viewForRun(runView({ status: "brief_ready" }))).toBe("brief");
    expect(
      viewForRun(
        runView({
          status: "needs_attention",
          needsAttention: { stage: "storyboard", errorCode: "ONE_SHOT_BUDGET_CAP", message: "Cap." },
        }),
      ),
    ).toBe("budget");
    expect(
      viewForRun(
        runView({
          status: "needs_attention",
          needsAttention: { stage: "render", errorCode: "RENDER_REVIEW_FAILED", message: "Review." },
        }),
      ),
    ).toBe("delivery");
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
  it("accepts a complete request", () => {
    expect(validateRequestForm(values, { documentReady: true })).toEqual({});
  });

  it("reports each missing input inline", () => {
    const errors = validateRequestForm(
      { ...values, focusPrompt: "   ", audienceKind: null },
      { documentReady: false },
    );
    expect(Object.keys(errors).sort()).toEqual([
      "audience",
      "document",
      "focusPrompt",
    ]);
  });

  it("rejects a prompt over 1,000 characters", () => {
    const errors = validateRequestForm(
      { ...values, focusPrompt: "a".repeat(1_001) },
      { documentReady: true },
    );
    expect(errors.focusPrompt).toMatch(/1,000 characters/);
  });
});

describe("idempotency", () => {
  it("keeps the same signature for the same request and changes it for another", () => {
    expect(requestSignature(values)).toBe(requestSignature({ ...values }));
    expect(requestSignature(values)).not.toBe(
      requestSignature({ ...values, focusPrompt: "Explain condensation." }),
    );
    expect(requestSignature(values)).not.toBe(
      requestSignature({ ...values, targetDurationSeconds: 420 }),
    );
    expect(newIdempotencyKey()).not.toBe(newIdempotencyKey());
  });
});

describe("ST-107 brief choices and the decision log", () => {
  it("offers none, the catalog, and always the brief's own sound bed", () => {
    expect(soundBedOptions([{ trackId: "morning-pad", title: "Morning Pad" }], "morning-pad")).toEqual([
      { value: "none", label: "No background sound" },
      { value: "morning-pad", label: "Morning Pad" },
    ]);
    // The catalog failed to load: the brief's choice is still selectable.
    expect(soundBedOptions([], "quiet-pulse").map((option) => option.value)).toEqual(["none", "quiet-pulse"]);
  });

  it("exports the log without usage-record ids, URLs or tokens", () => {
    const exported = JSON.parse(decisionLogExport(decisionLog, at));
    expect(exported).toMatchObject({
      schemaVersion: "one-shot-decisions-v1",
      runId: decisionLog.runId,
      exportedAt: at,
      decisions: decisionLog.decisions,
    });
    expect(exported.ledger[0]).toEqual({ step: "brief", estimateUsd: 0.1, actualUsd: 0.02, usageRecordCount: 1 });
    expect(JSON.stringify(exported)).not.toContain("00000000000b");
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

describe("ST-107 brief client", () => {
  afterEach(() => vi.unstubAllGlobals());

  function respond(body: unknown, status = 200) {
    return vi.fn(
      async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        }),
    );
  }

  it("prepares the brief with the focus prompt only in the body and the key as a header", async () => {
    const fetchMock = respond({
      brief: briefView(),
      revisionsUsed: 1,
      maxRevisions: 3,
      stylePackIds: ["essential"],
    });
    vi.stubGlobal("fetch", fetchMock);
    const focusPrompt = "Explain evaporation with one worked example.";
    await prepareBrief(
      projectId,
      { focusPrompt, audience: audienceFor("self", "11-13"), targetDurationSeconds: 300 },
      "key-1",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/projects/${projectId}/one-shot/brief$`));
    expect(url).not.toContain("evaporation");
    expect((init.headers as Record<string, string>)["idempotency-key"]).toBe("key-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ focusPrompt });
  });

  it("confirms one brief revision with the accepted estimate and the chosen style and sound", async () => {
    const fetchMock = respond(
      {
        eligibility: { visible: true, canStart: true, reasons: [] },
        run: runView({ status: "queued", currentStep: null, steps: [] }),
      },
      202,
    );
    vi.stubGlobal("fetch", fetchMock);
    await confirmBrief(
      projectId,
      { briefRevision: 2, acceptedEstimateUsd: 1.84, stylePackId: "systems", soundBed: "none" },
      "key-2",
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(new RegExp(`/projects/${projectId}/one-shot$`));
    expect(JSON.parse(String(init.body))).toEqual({
      briefRevision: 2,
      acceptedEstimateUsd: 1.84,
      stylePackId: "systems",
      soundBed: "none",
    });
  });

  it("accepts a raised budget against the reservation it saw", async () => {
    const fetchMock = respond(
      {
        eligibility: { visible: true, canStart: true, reasons: [] },
        run: runView(),
      },
      202,
    );
    vi.stubGlobal("fetch", fetchMock);
    await acceptBudget(projectId, { reservationRevision: 1, acceptedEstimateUsd: 3.5 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/\/one-shot\/budget\/accept$/);
    expect(JSON.parse(String(init.body))).toEqual({ reservationRevision: 1, acceptedEstimateUsd: 3.5 });
  });

  it("surfaces the API's own message on a refusal", async () => {
    vi.stubGlobal(
      "fetch",
      respond({ error: { code: "bad_request", message: "A newer brief has been prepared." } }, 409),
    );
    await expect(
      confirmBrief(projectId, { briefRevision: 1, acceptedEstimateUsd: 1, stylePackId: "systems", soundBed: "none" }, "k"),
    ).rejects.toMatchObject({ status: 409, message: "A newer brief has been prepared." });
  });
});
