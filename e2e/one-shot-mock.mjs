// ---------------------------------------------------------------------------
// ST-106: prompt-to-video ("one-shot") runs for e2e/one-shot.spec.ts, served
// by workspace-mock-api.mjs.
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
    renderCalls: 0,
    rendersStarted: 0,
    render: null,
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
  if (request.method === "GET" && url.pathname === "/__one-shot/state") {
    const state = projects.get(url.searchParams.get("projectId") ?? "");
    send(response, 200, {
      runs: state?.runs.length ?? 0,
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
  if (request.method !== "POST") return false;
  const body = await readJson(request);
  if (!eligibility.visible)
    return conflict(
      send,
      response,
      "Prompt-to-video is not enabled for this account.",
    );

  if (action === "/estimate") {
    const scenes = Math.max(1, Math.round(body.targetDurationSeconds / 30));
    const audio = Math.round((body.targetDurationSeconds / 60) * 15) / 100;
    const images = Math.round(scenes * 4) / 100;
    send(response, 200, {
      pricingVersion: "mock-2026-09",
      currency: "USD",
      targetDurationSeconds: body.targetDurationSeconds,
      estimatedScenes: scenes,
      items: [
        {
          key: "model.planning",
          label: "Planning and writing",
          quantity: 6,
          unitCostUsd: 0.1,
          costUsd: 0.6,
        },
        {
          key: "image.illustration",
          label: "Illustrations",
          quantity: scenes,
          unitCostUsd: 0.04,
          costUsd: images,
        },
        {
          key: "tts.narration",
          label: "Narration audio",
          quantity: 1,
          unitCostUsd: audio,
          costUsd: audio,
        },
      ],
      totalUsd: Math.round((0.6 + images + audio) * 100) / 100,
    });
    return true;
  }
  if (state === undefined)
    return conflict(
      send,
      response,
      "Upload a source document to this project before starting a prompt-to-video run.",
    );

  if (action === "") {
    state.createCalls += 1;
    await delay(250);
    const key = request.headers["idempotency-key"];
    if (typeof key !== "string" || key.length === 0) {
      send(response, 400, {
        error: {
          code: "validation_failed",
          message: "An idempotency key is required.",
        },
      });
      return true;
    }
    // Replaying a key returns the run it created.
    if (state.keys.has(key)) {
      send(response, 202, responseFor(request, state));
      return true;
    }
    if (!state.documentUploaded)
      return conflict(
        send,
        response,
        "Upload a source document to this project before starting a prompt-to-video run.",
      );
    const active = state.runs.at(-1);
    if (
      active !== undefined &&
      !["completed", "cancelled"].includes(active.status)
    )
      return conflict(
        send,
        response,
        "This project already has a prompt-to-video run in progress. Finish or cancel it before starting another.",
      );
    const run = {
      id: `019ffbf1-6200-7000-8000-${String(state.runs.length + 1).padStart(12, "0")}`,
      status: "queued",
      currentStep: null,
      focusPrompt: String(body.focusPrompt ?? "").trim(),
      audience: body.audience,
      targetDurationSeconds: body.targetDurationSeconds,
      acceptedEstimateUsd: body.acceptedEstimateUsd,
      focusCoverage: null,
      needsAttention: null,
      lessonVersionId: null,
      renderJobId: null,
      ticks: 0,
    };
    state.runs.push(run);
    state.keys.set(key, run.id);
    // A new run after "Edit prompt" is judged afresh.
    state.stopDone = state.scenario === "not_covered" && state.runs.length > 1;
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
