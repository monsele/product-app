// ---------------------------------------------------------------------------
// ST-106: prompt-to-video ("one-shot") runs for e2e/one-shot.spec.ts, served
// by workspace-mock-api.mjs.
//
// ST-107: a run starts as a brief (`brief_ready`); confirming the brief queues
// it. The `budget` scenario stops once at the storyboard with
// ONE_SHOT_BUDGET_CAP until the new estimate is accepted; the `partial`
// scenario also leaves one brief point uncovered at the preview.
//
// The cohort is the session: `avlp_session=pilot-session` is in it, every
// other session is not. Each `GET one-shot` advances an in-flight run by one
// step, standing in for the server's tick chain. Specs seed a project with
// `POST /__one-shot/seed` and read counters from `GET /__one-shot/state`.
// ---------------------------------------------------------------------------

const now = "2026-09-27T08:00:00.000Z";

const oneShotSteps = [
  "ingestion",
  "source_snapshot",
  "configuration",
  "objectives",
  "outline",
  "narration",
  "storyboard",
  "illustrations",
  "grounding",
  "audio",
  "validation",
];
const projects = new Map();

function seed(projectId, input = {}) {
  const state = {
    projectId,
    title: input.title ?? "Quick video project",
    documentUploaded: input.documentUploaded === true,
    scenario: input.scenario ?? "golden",
    stopDone: false,
    runs: [],
    keys: new Map(),
    createCalls: 0,
    briefCalls: 0,
    confirmCalls: 0,
    budgetAccepts: 0,
    renderCalls: 0,
    rendersStarted: 0,
    render: null,
    budgetStopDone: false,
  };
  projects.set(projectId, state);
  return state;
}

function inCohort(request) {
  return /(?:^|;\s*)avlp_session=pilot-session(?:;|$)/.test(
    request.headers.cookie ?? "",
  );
}

function eligibilityFor(request) {
  return inCohort(request)
    ? { visible: true, canStart: true, reasons: [] }
    : {
        visible: false,
        canStart: false,
        reasons: [
          {
            code: "not_in_cohort",
            message:
              "Prompt-to-video is an invited pilot and is not enabled for this account.",
          },
        ],
      };
}

function view(state, run) {
  const past = ["awaiting_render_approval", "rendering", "completed"].includes(
    run.status,
  );
  const index = oneShotSteps.indexOf(run.currentStep ?? "");
  const steps = [];
  oneShotSteps.forEach((step, position) => {
    if (past || position < index)
      steps.push({ step, state: "done", startedAt: now, finishedAt: now });
    else if (position === index)
      steps.push({
        step,
        state: run.status === "needs_attention" ? "needs_attention" : "running",
        startedAt: now,
      });
  });
  if (run.status === "rendering" || run.status === "completed")
    steps.push({
      step: "render",
      state: run.status === "completed" ? "done" : "running",
      startedAt: now,
    });
  return {
    id: run.id,
    projectId: state.projectId,
    status: run.status,
    currentStep: run.currentStep,
    steps,
    focusPrompt: run.focusPrompt,
    audience: run.audience,
    targetDurationSeconds: run.targetDurationSeconds,
    acceptedEstimateUsd: run.acceptedEstimateUsd,
    actualCostUsd: Math.round(run.ticks * 7) / 100,
    focusCoverage: run.focusCoverage,
    needsAttention: run.needsAttention,
    lessonVersionId: run.lessonVersionId,
    renderJobId: run.renderJobId,
    briefRevision: run.confirmedRevision,
    budget:
      run.reservedUsd === null
        ? null
        : {
            reservedUsd: run.reservedUsd,
            capUsd: Math.round(run.reservedUsd * 125) / 100,
            actualUsd: Math.round(run.ticks * 7) / 100,
            reservationRevision: run.reservationRevision,
            proposedEstimateUsd: run.proposedEstimateUsd,
          },
    coverageGaps: run.coverageGaps,
    stylePackId: run.stylePackId,
    soundBed: run.soundBed,
    correlationId: "019ffbf1-6200-7000-8000-00000000c0de",
    createdAt: now,
    updatedAt: new Date(Date.parse(now) + run.ticks * 1_000).toISOString(),
  };
}

function responseFor(request, state) {
  const eligibility = eligibilityFor(request);
  const run = state?.runs.at(-1);
  return {
    eligibility,
    run: !eligibility.visible || run === undefined ? null : view(state, run),
  };
}

/** One server tick: move the latest run on by one step, or stop it. */
function tick(state) {
  const run = state.runs.at(-1);
  if (run === undefined) return;
  if (run.status === "rendering") {
    run.ticks += 1;
    state.render.status = "completed";
    state.render.progress = 1;
    run.status = "completed";
    run.currentStep = null;
    return;
  }
  if (run.status !== "queued" && run.status !== "running") return;
  run.ticks += 1;
  const next =
    run.currentStep === null ? 0 : oneShotSteps.indexOf(run.currentStep) + 1;
  if (next >= oneShotSteps.length) {
    run.status = "awaiting_render_approval";
    run.currentStep = "render";
    run.decisions.push(
      decision("repair", "Round 1: applied the regenerated scene 3.", {
        reason: "on-screen text overflowed its layout",
        model: "mock-model-1",
        costUsd: 0.01,
      }),
    );
    if (state.scenario === "partial") {
      run.coverageGaps = ["Why clouds form over mountains"];
      run.decisions.push(
        decision("coverage_gap", "Not covered: Why clouds form over mountains", {
          reason: "No scene cites the sections behind this brief point.",
        }),
      );
    }
    return;
  }
  if (
    state.scenario === "budget" &&
    oneShotSteps[next] === "storyboard" &&
    !state.budgetStopDone
  ) {
    state.budgetStopDone = true;
    run.status = "needs_attention";
    run.currentStep = "storyboard";
    run.proposedEstimateUsd = 3.25;
    run.needsAttention = {
      stage: "storyboard",
      errorCode: "ONE_SHOT_BUDGET_CAP",
      message:
        "The next step would take this video past its budget cap of $2.30 ($2.10 spent so far). Accept the new estimate of $3.25 to continue.",
    };
    return;
  }
  run.status = "running";
  run.currentStep = oneShotSteps[next];
  if (
    state.scenario === "not_covered" &&
    run.currentStep === "objectives" &&
    !state.stopDone
  ) {
    state.stopDone = true;
    run.status = "needs_attention";
    run.focusCoverage = {
      status: "not_covered",
      reason: "The document describes the water cycle, not volcanoes.",
    };
    run.needsAttention = {
      stage: "objectives",
      errorCode: "FOCUS_NOT_COVERED",
      message:
        "The document does not cover this focus: The document describes the water cycle, not volcanoes.",
    };
  }
  if (
    state.scenario === "attention" &&
    run.currentStep === "outline" &&
    !state.stopDone
  ) {
    state.stopDone = true;
    run.status = "needs_attention";
    run.needsAttention = {
      stage: "outline",
      errorCode: "STAGE_BLOCKED",
      message:
        "The outline draft cannot be approved as generated. Review it in the wizard, then resume the run.",
    };
  }
  if (state.scenario === "partial" && run.currentStep === "objectives")
    run.focusCoverage = { status: "partial", missing: ["How clouds form"] };
}

function renderStatus(state) {
  const render = state.render;
  return {
    id: render.id,
    lessonVersionId: "019ffbf1-6200-7000-8000-0000000000b1",
    validationRunId: "019ffbf1-6200-7000-8000-0000000000b2",
    status: render.status,
    progress: render.progress,
    attempt: 0,
    errorCode: null,
    errorMessage: null,
    retryable: false,
    correlationId: "019ffbf1-6200-7000-8000-00000000c0de",
    createdAt: now,
    startedAt: now,
    completedAt: render.status === "completed" ? now : null,
    review: null,
    video:
      render.status === "completed"
        ? {
            id: "019ffbf1-6200-7000-8000-0000000000b3",
            durationMs: 60_000,
            sizeBytes: 12_400_000,
            width: 1920,
            height: 1080,
            fps: 30,
            videoCodec: "h264",
            audioCodec: "aac",
            storageKey: "projects/one-shot/renders/lesson.mp4",
            thumbnailStorageKey: "projects/one-shot/renders/lesson.jpg",
            thumbnailUrl: null,
          }
        : null,
  };
}

function manifest(projectId, storyboardDraft) {
  const storyboard = storyboardDraft(projectId, {
    status: "approved",
    revision: 3,
  });
  return {
    assets: {},
    canvas: { fps: 30, height: 1080, width: 1920 },
    generatedAt: now,
    storyboard,
    scenes: storyboard.scenes.map((entry) => ({
      sceneId: entry.stableSceneId,
      audio: { status: "ready", url: null, expiresAt: null },
      captions: [],
      missingAssetIds: [],
      stale: false,
    })),
  };
}

const validationRun = {
  id: "019ffbf1-6200-7000-8000-0000000000d1",
  lessonSpecId: "019ffbf1-6200-7000-8000-0000000000d2",
  lessonSpecRevision: 3,
  lessonSpecContentHash: "e".repeat(64),
  inputHash: "f".repeat(64),
  rulesetVersion: "v1",
  sceneLibraryVersion: "1.0.0",
  artifactHashes: {},
  status: "passed",
  stale: false,
  startedAt: now,
  completedAt: now,
  issues: [
    {
      id: "019ffbf1-6200-7000-8000-0000000000d3",
      severity: "warning",
      code: "lesson_duration_mismatch",
      scopeType: "lesson",
      scopeId: null,
      sceneId: null,
      fieldPath: "durationSeconds",
      message:
        "The lesson runs 1 minute, shorter than the 3 minutes requested.",
      details: {},
      acknowledgeable: true,
      acknowledgedAt: null,
    },
  ],
};

const briefSections = [
  { sectionId: "019ffbf1-6200-7000-8000-00000000a001", heading: "Evaporation" },
  { sectionId: "019ffbf1-6200-7000-8000-00000000a002", heading: "Condensation" },
  { sectionId: "019ffbf1-6200-7000-8000-00000000a003", heading: "Clouds and relief" },
];
const stylePackIds = ["essential", "editorial", "everyday", "systems", "field-notes", "prism"];

function briefEstimate(targetDurationSeconds) {
  const scenes = Math.max(3, Math.round(targetDurationSeconds / 30));
  const images = Math.round(scenes * 4) / 100;
  const audio = Math.round((targetDurationSeconds / 60) * 15) / 100;
  return {
    pricingVersion: "mock-2026-09",
    currency: "USD",
    targetDurationSeconds,
    estimatedScenes: scenes,
    items: [
      { key: "model.planning", label: "Brief, planning and writing", quantity: 6, unitCostUsd: 0.1, costUsd: 0.6 },
      { key: "image.illustration", label: "Illustrations", quantity: scenes, unitCostUsd: 0.04, costUsd: images },
      { key: "tts.narration", label: "Narration audio", quantity: 1, unitCostUsd: audio, costUsd: audio },
      { key: "repair.scene_regeneration", label: "Automatic fixes, only if needed", quantity: 12, unitCostUsd: 0.05, costUsd: 0.6 },
    ],
    totalUsd: Math.round((0.6 + images + audio + 0.6) * 100) / 100,
  };
}

function briefFor(run, revision, body) {
  const partial = [
    { point: "How evaporation carries heat upward", sectionIds: [briefSections[0].sectionId] },
    { point: "How condensation releases it", sectionIds: [briefSections[1].sectionId] },
  ];
  return {
    runId: run.id,
    revision,
    focusPrompt: String(body.focusPrompt ?? "").trim(),
    audience: body.audience,
    targetDurationSeconds: body.targetDurationSeconds,
    subject: "Earth science",
    lessonTitle: "How the water cycle moves heat",
    coverage: [
      ...partial,
      { point: "Why clouds form over mountains", sectionIds: [briefSections[2].sectionId] },
    ],
    notCovered: ["Ocean currents"],
    sections: briefSections,
    plannedSceneCount: Math.max(3, Math.round(body.targetDurationSeconds / 30)),
    stylePackId: "field-notes",
    stylePackReason: "Documentary tones suit an earth-science explanation.",
    soundBed: "morning-pad",
    soundBedReason: "A calm bed that sits under the narration.",
    estimate: briefEstimate(body.targetDurationSeconds),
    model: "mock-model-1",
    promptVersion: "one-shot-brief/v1",
    modelCallId: `019ffbf1-6200-7000-8000-0000000b${String(revision).padStart(4, "0")}`,
    createdAt: now,
  };
}

function briefResponse(run) {
  return {
    brief: run === undefined || run.briefs.length === 0 ? null : run.briefs.at(-1),
    revisionsUsed: run?.briefs.length ?? 0,
    maxRevisions: 3,
    stylePackIds,
  };
}

let decisionSequence = 0;
function decision(kind, summary, extra = {}) {
  decisionSequence += 1;
  return {
    runId: "019ffbf1-6200-7000-8000-000000000001",
    seq: decisionSequence,
    kind,
    summary,
    reason: extra.reason ?? null,
    model: extra.model ?? null,
    promptVersion: extra.promptVersion ?? null,
    costUsd: extra.costUsd ?? null,
    relatedIds: [],
    createdAt: now,
  };
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) body += chunk;
  try {
    return body.length === 0 ? {} : JSON.parse(body);
  } catch {
    return {};
  }
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function conflict(send, response, message) {
  send(response, 409, { error: { code: "bad_request", message } });
  return true;
}

/**
 * Answers one-shot routes, plus the reads of projects seeded for them.
 * Returns true when the request has been answered.
 */
export async function handleOneShot(
  request,
  response,
  url,
  { send, storyboardDraft },
) {
  if (request.method === "POST" && url.pathname === "/__one-shot/seed") {
    const input = await readJson(request);
    seed(input.projectId, input);
    send(response, 200, { ok: true });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/sound-beds") {
    send(response, 200, {
      tracks: [
        {
          trackId: "morning-pad",
          title: "Morning Pad",
          moodTags: ["calm", "warm"],
          durationMs: 16_000,
          loops: true,
          integratedLoudnessLufs: -20,
          licenseId: "CC0-1.0",
          sourceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
          attributionText: null,
          auditionUrl: "http://127.0.0.1:3002/__audio/morning-pad.wav",
          auditionExpiresAt: "2099-01-01T00:00:00.000Z",
        },
      ],
    });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/__one-shot/state") {
    const state = projects.get(url.searchParams.get("projectId") ?? "");
    const run = state?.runs.at(-1);
    send(response, 200, {
      runs: state?.runs.length ?? 0,
      briefCalls: state?.briefCalls ?? 0,
      briefRevisions: run?.briefs.length ?? 0,
      confirmCalls: state?.confirmCalls ?? 0,
      budgetAccepts: state?.budgetAccepts ?? 0,
      confirmedStylePack: run?.stylePackId ?? null,
      createCalls: state?.createCalls ?? 0,
      renderCalls: state?.renderCalls ?? 0,
      rendersStarted: state?.rendersStarted ?? 0,
      statuses: state?.runs.map((run) => run.status) ?? [],
    });
    return true;
  }
  const match = url.pathname.match(/^\/projects\/([^/]+)(\/.*)?$/);
  if (match === null) return false;
  const projectId = decodeURIComponent(match[1]);
  const rest = match[2] ?? "";
  const state = projects.get(projectId);

  // Seeded projects answer their own project, document, preview and render reads.
  if (state !== undefined && request.method === "GET") {
    if (rest === "") {
      send(response, 200, {
        project: {
          id: projectId,
          title: state.title,
          stage: "draft",
          latestFailedOperation: null,
          createdAt: now,
          updatedAt: now,
          revision: 1,
        },
      });
      return true;
    }
    if (rest === "/source-document") {
      if (!state.documentUploaded)
        send(response, 404, {
          error: { code: "not_found", message: "No document." },
        });
      else
        send(response, 200, {
          documentId: "019ffbf1-6111-738a-b087-6775ff97568c",
          validation: {
            status: "active",
            code: null,
            pageCount: 5,
            warnings: [],
          },
          reuse: { status: "not_reused" },
        });
      return true;
    }
    if (rest === "/renders") {
      send(response, 200, {
        renders: state.render === null ? [] : [renderStatus(state)],
      });
      return true;
    }
    if (
      /^\/renders\/[^/]+\/download$/.test(rest) &&
      state.render?.status === "completed"
    ) {
      response.writeHead(200, {
        "content-type": "video/mp4",
        "content-disposition": 'attachment; filename="lesson.mp4"',
      });
      response.end(Buffer.from("mock-mp4"));
      return true;
    }
    if (rest === "/share-links") {
      send(response, 200, { shareLinks: [] });
      return true;
    }
    if (rest === "/preview-manifest") {
      send(response, 200, manifest(projectId, storyboardDraft));
      return true;
    }
    if (rest === "/validation") {
      send(response, 200, { run: validationRun });
      return true;
    }
  }
  if (
    state !== undefined &&
    request.method === "POST" &&
    /^\/source-upload\/[^/]+\/complete$/.test(rest)
  ) {
    // The shared upload mock answers; the seeded project now has a document.
    state.documentUploaded = true;
    return false;
  }

  if (!rest.startsWith("/one-shot")) return false;
  const eligibility = eligibilityFor(request);
  const action = rest.slice("/one-shot".length);

  if (request.method === "GET" && action === "/eligibility") {
    send(response, 200, eligibility);
    return true;
  }
  if (request.method === "GET" && action === "") {
    if (state !== undefined && eligibility.visible) tick(state);
    send(response, 200, responseFor(request, state));
    return true;
  }
  if (request.method === "GET" && action === "/brief") {
    if (!eligibility.visible) {
      send(response, 404, { error: { code: "not_found", message: "Not enabled." } });
      return true;
    }
    send(response, 200, briefResponse(state?.runs.at(-1)));
    return true;
  }
  if (request.method === "GET" && action === "/decisions") {
    const run = state?.runs.at(-1);
    if (!eligibility.visible || run === undefined) {
      send(response, 200, { runId: null, decisions: [], ledger: [], budget: null });
      return true;
    }
    const current = view(state, run);
    send(response, 200, {
      runId: run.id,
      decisions: run.decisions,
      ledger: [
        { step: "brief", estimateUsd: 0.1, actualUsd: 0.02, usageRecordIds: [] },
        { step: "objectives", estimateUsd: 0.1, actualUsd: 0.05, usageRecordIds: [] },
        { step: "repair", estimateUsd: 0.6, actualUsd: 0.01, usageRecordIds: [] },
      ],
      budget: current.budget,
    });
    return true;
  }
  if (request.method !== "POST") return false;
  const body = await readJson(request);
  if (!eligibility.visible)
    return conflict(
      send,
      response,
      "Prompt-to-video is not enabled for this account.",
    );

  if (state === undefined)
    return conflict(
      send,
      response,
      "Upload a source document to this project before starting a prompt-to-video run.",
    );

  if (action === "/brief") {
    state.briefCalls += 1;
    await delay(250);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      send(response, 400, {
        error: { code: "validation_failed", message: "An idempotency key is required." },
      });
      return true;
    }
    if (!state.documentUploaded)
      return conflict(
        send,
        response,
        "Upload a source document to this project before preparing a video brief.",
      );
    // Replaying a key returns the brief it prepared.
    if (state.keys.has(key)) {
      send(response, 200, briefResponse(state.runs.at(-1)));
      return true;
    }
    let run = state.runs.at(-1);
    if (run === undefined || ["completed", "cancelled"].includes(run.status)) {
      run = {
        id: `019ffbf1-6200-7000-8000-${String(state.runs.length + 1).padStart(12, "0")}`,
        status: "brief_ready",
        currentStep: null,
        focusPrompt: String(body.focusPrompt ?? "").trim(),
        audience: body.audience,
        targetDurationSeconds: body.targetDurationSeconds,
        acceptedEstimateUsd: 0,
        focusCoverage: null,
        needsAttention: null,
        lessonVersionId: null,
        renderJobId: null,
        ticks: 0,
        briefs: [],
        confirmedRevision: null,
        reservedUsd: null,
        reservationRevision: 0,
        proposedEstimateUsd: null,
        coverageGaps: [],
        stylePackId: null,
        soundBed: null,
        decisions: [],
      };
      state.runs.push(run);
      // A new run after "Edit prompt" is judged afresh.
      state.stopDone = state.scenario === "not_covered" && state.runs.length > 1;
    } else if (!["brief_pending", "brief_ready"].includes(run.status))
      return conflict(
        send,
        response,
        "This project already has a prompt-to-video run in progress. Finish or cancel it before starting another.",
      );
    if (run.briefs.length >= 3)
      return conflict(
        send,
        response,
        "The brief can be prepared at most 3 times for one video. Confirm the current brief, or cancel and start again.",
      );
    const revision = run.briefs.length + 1;
    run.briefs.push(briefFor(run, revision, body));
    run.focusPrompt = String(body.focusPrompt ?? "").trim();
    run.audience = body.audience;
    run.targetDurationSeconds = body.targetDurationSeconds;
    run.decisions.push(
      decision("brief", `Prepared brief revision ${revision}: 3 coverage points.`, {
        model: "mock-model-1",
        promptVersion: "one-shot-brief/v1",
        costUsd: 0.02,
      }),
    );
    state.keys.set(key, run.id);
    send(response, 200, briefResponse(run));
    return true;
  }

  if (action === "") {
    state.createCalls += 1;
    state.confirmCalls += 1;
    await delay(250);
    const run = state.runs.at(-1);
    if (run === undefined)
      return conflict(send, response, "Prepare a video brief before creating the video.");
    // A replay, or a double click, sees the run it confirmed.
    if (run.confirmedRevision === body.briefRevision && run.status !== "brief_ready") {
      send(response, 202, responseFor(request, state));
      return true;
    }
    if (run.status !== "brief_ready")
      return conflict(send, response, "This video has already been started.");
    if (body.briefRevision !== run.briefs.length)
      return conflict(send, response, "A newer brief has been prepared. Review it, then confirm it.");
    const brief = run.briefs.at(-1);
    if (body.acceptedEstimateUsd + 1e-9 < brief.estimate.totalUsd)
      return conflict(send, response, "The accepted estimate is below the brief's estimate.");
    run.status = "queued";
    run.confirmedRevision = body.briefRevision;
    run.acceptedEstimateUsd = body.acceptedEstimateUsd;
    run.reservedUsd = body.acceptedEstimateUsd;
    run.reservationRevision = 1;
    run.stylePackId = body.stylePackId ?? brief.stylePackId;
    run.soundBed = body.soundBed ?? brief.soundBed;
    run.decisions.push(
      decision("style_pack", `Style pack: ${run.stylePackId}.`, {
        reason:
          run.stylePackId === brief.stylePackId
            ? brief.stylePackReason
            : `Chosen by you in the brief (the brief suggested ${brief.stylePackId}).`,
      }),
      decision("sound_bed", `Sound bed: ${run.soundBed}.`, { reason: brief.soundBedReason }),
      decision("budget_reservation", `Reserved $${run.reservedUsd.toFixed(2)} for brief revision ${body.briefRevision}.`),
    );
    send(response, 202, responseFor(request, state));
    return true;
  }

  const run = state.runs.at(-1);
  if (run === undefined) {
    send(response, 404, {
      error: {
        code: "not_found",
        message: "This project has no prompt-to-video run.",
      },
    });
    return true;
  }
  if (action === "/render") {
    state.renderCalls += 1;
    await delay(250);
    if (run.status !== "awaiting_render_approval")
      return conflict(
        send,
        response,
        "The lesson is not ready to render yet. Wait until the run is awaiting your render approval.",
      );
    state.rendersStarted += 1;
    state.render = {
      id: "019ffbf1-6200-7000-8000-0000000000e1",
      status: "rendering",
      progress: 0.4,
    };
    run.status = "rendering";
    run.currentStep = "render";
    run.lessonVersionId = "019ffbf1-6200-7000-8000-0000000000b1";
    run.renderJobId = state.render.id;
    send(response, 202, responseFor(request, state));
    return true;
  }
  if (action === "/budget/accept") {
    state.budgetAccepts += 1;
    if (run.needsAttention?.errorCode !== "ONE_SHOT_BUDGET_CAP")
      return conflict(send, response, "This run is not waiting for a new budget.");
    if (body.reservationRevision !== run.reservationRevision)
      return conflict(send, response, "The budget changed. Refresh and review the new estimate.");
    if (body.acceptedEstimateUsd + 1e-9 < run.proposedEstimateUsd)
      return conflict(send, response, "The accepted estimate is below the new estimate.");
    run.reservedUsd = body.acceptedEstimateUsd;
    run.reservationRevision += 1;
    run.proposedEstimateUsd = null;
    run.status = "running";
    run.needsAttention = null;
    run.decisions.push(
      decision("budget_reservation", `Raised the reservation to $${run.reservedUsd.toFixed(2)}.`, {
        reason: "You accepted a new estimate after the run reached its budget cap.",
      }),
    );
    send(response, 202, responseFor(request, state));
    return true;
  }
  if (action === "/resume") {
    if (run.status !== "needs_attention" && run.status !== "failed")
      return conflict(
        send,
        response,
        "Only a run that needs attention or has failed can be resumed.",
      );
    run.status = "running";
    run.needsAttention = null;
    send(response, 202, responseFor(request, state));
    return true;
  }
  if (action === "/cancel") {
    if (run.status === "completed" || run.status === "cancelled")
      return conflict(send, response, "This run has already finished.");
    run.status = "cancelled";
    send(response, 200, responseFor(request, state));
    return true;
  }
  return false;
}
