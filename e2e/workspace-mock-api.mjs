import { createServer } from "node:http";

const now = "2026-08-13T12:00:00.000Z";
const existingId = "019ffbf1-610e-738a-b087-6775ff97568c";
const createdId = "019ffbf1-610f-738a-b087-6775ff97568c";
const projects = new Map([
  [
    existingId,
    {
      id: existingId,
      title: "Existing water-cycle lesson",
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    },
  ],
]);
const uploads = new Map();
const configurations = new Map();
const objectiveState = new Map();
const outlineState = new Map();
const narrationState = new Map();
const storyboardState = new Map();

const outlineObjectiveId = "019ffbf1-6111-738a-b087-6775ff97568c";
const outlineItemA = "019ffbf1-6121-738a-b087-6775ff97568c";
const outlineItemB = "019ffbf1-6122-738a-b087-6775ff97568c";
const narrationBlockId = "019ffbf1-6131-738a-b087-6775ff97568c";
const narrationBlockIdB = "019ffbf1-6132-738a-b087-6775ff97568c";

function objectiveBlockId() {
  return "019ffbf1-2222-738a-b087-6775ff97568c";
}

function objectiveSourceRef() {
  return [
    {
      documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 1,
      sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
      blockIds: [objectiveBlockId()],
    },
  ];
}

function objectiveSet(projectId, overrides = {}) {
  const set = objectiveState.get(projectId) ?? {
    schemaVersion: 1,
    id: "019ffbf1-610e-738a-b087-6775ff97568c",
    projectId,
    sourceSnapshotId: "019ffbf1-610e-738a-b087-6775ff97568c",
    sourceSnapshotContentHash: "a".repeat(64),
    configurationVersion: 1,
    promptId: "objectives",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-610e-738a-b087-6775ff97568c",
    status: "draft",
    revision: 0,
    objectives: [
      {
        id: "019ffbf1-6111-738a-b087-6775ff97568c",
        order: 1,
        statement: "Describe how evaporation forms water vapour.",
        verb: "describe",
        confidence: 0.95,
        sourceRefs: objectiveSourceRef(),
        generated: true,
        revision: 0,
        groundingStatus: "supported",
      },
    ],
    keyConcepts: [],
    prerequisiteKnowledge: [],
    vocabulary: [],
    misconceptions: [],
    assessmentQuestions: [],
    generatedAt: now,
    createdAt: now,
  };
  return { ...set, ...overrides, objectives: set.objectives };
}

function objectiveResponse(projectId) {
  const set = objectiveSet(projectId);
  const approved = objectiveState.get(`${projectId}:approved`) ?? null;
  return {
    state: set.status === "approved" ? "approved" : "draft",
    set,
    approved,
    latestJob: null,
    canGenerate: true,
    canApprove: set.status === "draft" && set.objectives.length >= 1,
  };
}

function outlineSourceRef() {
  return [
    {
      documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
      parsedDocumentVersion: 1,
      pageStart: 1,
      pageEnd: 1,
      sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
      blockIds: ["019ffbf1-2222-738a-b087-6775ff97568c"],
    },
  ];
}

function outlineSet(projectId, overrides = {}) {
  const set = outlineState.get(projectId) ?? {
    schemaVersion: 1,
    id: "019ffbf1-610e-738a-b087-6775ff97568c",
    projectId,
    sourceSnapshotId: "019ffbf1-610e-738a-b087-6775ff97568c",
    sourceSnapshotContentHash: "a".repeat(64),
    objectiveSetId: "019ffbf1-610e-738a-b087-6775ff97568c",
    objectiveSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "outline",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-610e-738a-b087-6775ff97568c",
    status: "draft",
    revision: 0,
    items: [
      {
        id: outlineItemA,
        order: 1,
        kind: "hook",
        title: "Where does the water go?",
        description: "Open with a question.",
        estimatedSeconds: 20,
        sourceRefs: [],
        objectiveIds: [outlineObjectiveId],
        framingNote: "Generated framing question.",
        generated: true,
        revision: 0,
      },
      {
        id: outlineItemB,
        order: 2,
        kind: "concept",
        title: "Evaporation",
        description: "Explain evaporation.",
        estimatedSeconds: 40,
        sourceRefs: outlineSourceRef(),
        objectiveIds: [outlineObjectiveId],
        framingNote: null,
        generated: true,
        revision: 0,
      },
    ],
    totalEstimatedSeconds: 60,
    generatedAt: now,
    createdAt: now,
  };
  return { ...set, ...overrides, items: set.items };
}

function outlineValidation(projectId) {
  const set = outlineSet(projectId);
  return {
    structurallyValid:
      set.items.length >= 1 &&
      set.items.every(
        (item) =>
          item.objectiveIds.length >= 1 &&
          (item.kind !== "hook" ||
            item.sourceRefs.length > 0 ||
            item.framingNote !== null),
      ),
    durationStatus: "within",
    durationWarning: null,
    uncoveredObjectiveIds: [],
    structureWarning: null,
  };
}

function outlineResponse(projectId) {
  // The outline editor links items to approved objectives, so outline flows
  // need an approved objective set even though the objectives page starts
  // with a draft.
  if (objectiveState.get(`${projectId}:approved`) === undefined)
    objectiveState.set(`${projectId}:approved`, objectiveSet(projectId));
  const set = outlineSet(projectId);
  const approved = outlineState.get(`${projectId}:approved`) ?? null;
  const validation = outlineValidation(projectId);
  return {
    state: set.status === "approved" ? "approved" : "draft",
    set,
    approved,
    latestJob: null,
    canGenerate: true,
    canApprove:
      set.status === "draft" &&
      validation.structurallyValid &&
      validation.uncoveredObjectiveIds.length === 0,
    validation,
  };
}

function narrationTarget(seconds) {
  const target = Math.round((seconds / 60) * 140 * (1 - 0.2));
  return {
    min: Math.max(1, Math.round(target * 0.9)),
    target,
    max: Math.max(target, Math.round(target * 1.15)),
  };
}

function narrationBlock(projectId, overrides = {}) {
  return {
    id: narrationBlockId,
    outlineItemId: outlineItemA,
    order: 1,
    text: "Where does the water go when a puddle dries?",
    estimatedWords: 38,
    targetSeconds: 20,
    sourceRefs: [],
    generatedAdditions: [],
    generated: true,
    revision: 0,
    contentHash: "c".repeat(64),
    ...overrides,
  };
}

function narrationSet(projectId, overrides = {}) {
  const state = narrationState.get(projectId) ?? {
    schemaVersion: 1,
    id: "019ffbf1-610e-738a-b087-6775ff97568c",
    projectId,
    sourceSnapshotId: "019ffbf1-610e-738a-b087-6775ff97568c",
    sourceSnapshotContentHash: "a".repeat(64),
    outlineSetId: "019ffbf1-610e-738a-b087-6775ff97568c",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "narration",
    promptVersion: "v2",
    model: "mock-model-1",
    modelCallId: "019ffbf1-610e-738a-b087-6775ff97568c",
    status: "draft",
    revision: 0,
    blocks: [narrationBlock(projectId)],
    totalEstimatedSeconds: 180,
    contentHash: "d".repeat(64),
    generatedAt: now,
    createdAt: now,
  };
  const { candidates: _candidates, ...set } = state;
  return { ...set, ...overrides, blocks: set.blocks };
}

function narrationCandidates(projectId) {
  return narrationState.get(`${projectId}:candidates`) ?? [];
}

function narrationResponse(projectId) {
  const set = narrationSet(projectId);
  const approved = narrationState.get(`${projectId}:approved`) ?? null;
  const candidates = narrationCandidates(projectId);
  return {
    state: set.status === "approved" ? "approved" : "draft",
    set,
    approved,
    latestJob: null,
    latestTransformJob: null,
    canGenerate: true,
    canApprove: false,
    canEdit: set.status === "draft",
    stale: false,
    staleReason: null,
    candidates,
    validation: {
      structurallyValid: true,
      durationStatus: "within",
      durationWarning: null,
      wordCountStatus: "within",
      wordCountWarning: null,
      uncoveredOutlineItemIds: [],
    },
  };
}

function configurationResponse(projectId) {
  const configuration = configurations.get(projectId) ?? null;
  return {
    configuration,
    source: {
      parsedDocumentVersion: 1,
      sourceReviewComplete: true,
    },
    narrationTarget:
      configuration === null
        ? null
        : narrationTarget(configuration.targetDurationSeconds),
    canProceed: configuration !== null,
  };
}

function storyboardScene(projectId) {
  return {
    id: "019ffbf1-6151-738a-b087-6775ff97568c",
    stableSceneId: "019ffbf1-6151-738a-b087-6775ff97568c",
    order: 1,
    template: "definition",
    durationSeconds: 30,
    narrationBlockIds: [narrationBlockId],
    assetRequirements: [],
    scene: {
      id: "019ffbf1-6151-738a-b087-6775ff97568c",
      order: 1,
      narration: "Where does the water go when a puddle dries?",
      durationSeconds: 30,
      onScreenText: ["Where does the water go?"],
      transition: "cut",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
          blockIds: [narrationBlockId],
        },
      ],
      generatedAdditions: [],
      template: "definition",
      visual: {
        term: "The water cycle",
        definition:
          "Water moves through the environment in a continuous cycle.",
      },
    },
  };
}

function storyboardSceneTwo(projectId) {
  return {
    id: "019ffbf1-6154-738a-b087-6775ff97568c",
    stableSceneId: "019ffbf1-6154-738a-b087-6775ff97568c",
    order: 2,
    template: "summary",
    durationSeconds: 30,
    narrationBlockIds: [narrationBlockIdB],
    assetRequirements: [],
    scene: {
      id: "019ffbf1-6154-738a-b087-6775ff97568c",
      order: 2,
      narration:
        "The water cycle repeats as water moves between the sky and the ground.",
      durationSeconds: 30,
      onScreenText: ["The cycle repeats"],
      transition: "fade",
      assetBindings: [],
      sourceRefs: [
        {
          documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
          blockIds: [narrationBlockIdB],
        },
      ],
      generatedAdditions: [],
      template: "summary",
      visual: { takeaways: [{ text: "The cycle repeats." }] },
    },
  };
}

function storyboardSceneStatus(scene) {
  return {
    assets:
      scene.scene.assetBindings.length > 0
        ? "resolved"
        : scene.assetRequirements.length > 0
          ? "planned"
          : "none",
    audio: "not_generated",
    validation: "ok",
    stale: false,
  };
}

function storyboardDraft(projectId, overrides = {}) {
  const state = storyboardState.get(projectId) ?? {
    schemaVersion: 1,
    id: "019ffbf1-610e-738a-b087-6775ff97568c",
    projectId,
    basedOnNarrationSetId: "019ffbf1-610e-738a-b087-6775ff97568c",
    narrationSetContentHash: "a".repeat(64),
    outlineSetId: "019ffbf1-610e-738a-b087-6775ff97568c",
    outlineSetContentHash: "b".repeat(64),
    configurationVersion: 1,
    promptId: "storyboard",
    promptVersion: "v1",
    model: "mock-model-1",
    modelCallId: "019ffbf1-610e-738a-b087-6775ff97568c",
    status: "draft",
    revision: 0,
    title: "The water cycle",
    subject: "Science",
    targetDurationSeconds: 180,
    totalDurationSeconds: 60,
    objectiveIds: [outlineObjectiveId],
    contentHash: "d".repeat(64),
    scenes: [storyboardScene(projectId), storyboardSceneTwo(projectId)],
    generatedAt: now,
    createdAt: now,
  };
  return { ...state, ...overrides, scenes: state.scenes };
}

function storyboardResponse(projectId) {
  const draft = storyboardDraft(projectId);
  const approved = storyboardState.get(`${projectId}:approved`) ?? null;
  const sceneCandidates =
    storyboardState.get(`${projectId}:sceneCandidates`) ?? [];
  return {
    state: draft.status === "approved" ? "approved" : "draft",
    storyboard: draft,
    approved,
    latestJob: null,
    latestSceneRegenerationJob:
      storyboardState.get(`${projectId}:sceneRegenerationJob`) ?? null,
    sceneCandidates,
    canGenerate: true,
    canApprove: false,
    canEdit: false,
    stale: false,
    staleReason: null,
    validation: {
      structurallyValid: true,
      durationStatus: "within",
      durationWarning: null,
      uncoveredOutlineItemIds: [],
      unassignedBlockIds: [],
    },
  };
}

function storyboardSceneListResponse(projectId) {
  const draft = storyboardDraft(projectId);
  return {
    revision: draft.revision,
    stale: false,
    staleReason: null,
    totalDurationSeconds: draft.totalDurationSeconds,
    targetDurationSeconds: draft.targetDurationSeconds,
    scenes: draft.scenes.map((scene) => ({
      sceneId: scene.stableSceneId,
      order: scene.order,
      template: scene.template,
      title: scene.scene.title ?? null,
      narrationSummary: scene.scene.narration.slice(0, 120),
      narrationBlockCount: scene.narrationBlockIds.length,
      durationSeconds: scene.durationSeconds,
      status: storyboardSceneStatus(scene),
    })),
  };
}

function renumberStoryboardScenes(scenes) {
  return scenes.map((scene, index) => ({
    ...scene,
    order: index + 1,
    scene: { ...scene.scene, order: index + 1 },
  }));
}

function newMockSceneId() {
  const hex = (length) =>
    Array.from({ length }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join("");
  return `019ffbf1-6199-7${hex(3)}-8${hex(3)}-${hex(12)}`;
}

function mockSceneVisual(template) {
  switch (template) {
    case "hook":
      return { question: "What will you discover?" };
    case "process":
      return { steps: ["First step", "Second step"] };
    case "input-process-output":
      return {
        inputs: [{ label: "Input" }],
        process: { label: "Process" },
        outputs: [{ label: "Output" }],
      };
    case "comparison":
      return {
        leftSubject: { label: "Left subject" },
        rightSubject: { label: "Right subject" },
        similarities: ["Shared feature"],
        differences: ["Key difference"],
      };
    case "cause-effect":
      return {
        causes: [{ id: "cause-1", label: "Cause", assetSlot: "cause-1-icon" }],
        effects: [
          { id: "effect-1", label: "Effect", assetSlot: "effect-1-icon" },
        ],
        connections: [{ from: "cause-1", to: "effect-1" }],
      };
    case "labelled-diagram":
      return {
        kind: "shapes",
        shape: "system",
        labels: [{ anchor: "top-left", id: "label-1", text: "Label" }],
      };
    case "analogy":
      return {
        sourceConcept: "Concept",
        familiarSystem: "Familiar system",
        mappings: [{ concept: "Concept part", analogy: "Familiar part" }],
      };
    case "worked-example":
      return {
        problem: "Example problem",
        steps: ["First step"],
        answer: "Answer",
      };
    case "summary":
      return { takeaways: [{ text: "Key takeaway" }] };
    default:
      return { term: "Key term", definition: "A concise explanation." };
  }
}

function send(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json",
    "access-control-allow-origin": response.requestOrigin ?? "http://127.0.0.1:3000",
    "access-control-allow-credentials": "true",
  });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3002");
  response.requestOrigin = request.headers.origin ?? "http://127.0.0.1:3000";
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": response.requestOrigin,
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers":
        request.headers["access-control-request-headers"] ?? "*",
    });
    return response.end();
  }
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3000");
  response.setHeader("access-control-allow-credentials", "true");
  if (request.method === "GET" && url.pathname === "/health")
    return send(response, 200, { status: "ok" });
  if (request.method === "GET" && url.pathname.endsWith("/source-document")) {
    return send(response, 200, {
      documentId: "019ffbf1-610e-738a-b087-6775ff97568c",
      validation: {
        status: "active",
        code: null,
        pageCount: 5,
        warnings: [],
      },
      reuse: {
        status: "not_reused",
      },
    });
  }
  if (request.method === "GET" && url.pathname.endsWith("/ingestion")) {
    return send(response, 200, {
      state: "pending",
      latestJob: null,
      quality: null,
      canRetry: false,
      canProceedToReview: false,
    });
  }
  if (
    request.method === "POST" &&
    url.pathname === "/auth/password-reset/request"
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    await new Promise((resolve) => setTimeout(resolve, 150));
    return input.email === "outage@example.test"
      ? send(response, 503, { error: { code: "internal_error" } })
      : send(response, 202, {});
  }
  if (
    request.method === "POST" &&
    url.pathname === "/auth/password-reset/confirm"
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    await new Promise((resolve) => setTimeout(resolve, 150));
    return input.token === "A".repeat(43)
      ? send(response, 204, {})
      : send(response, 400, { error: { code: "bad_request" } });
  }
  if (
    request.method === "GET" &&
    url.pathname === "/projects" &&
    url.searchParams.get("cursor") === "malformed-response"
  )
    return send(response, 200, {
      items: [{ ...projects.get(existingId), stage: "not-a-project-stage" }],
    });
  if (request.method === "GET" && url.pathname === "/projects")
    return send(response, 200, { items: [...projects.values()] });
  if (request.method === "POST" && url.pathname === "/projects") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    if (input.title === "Malformed project response")
      return send(response, 201, { project: { id: "not-a-project-id" } });
    const project = {
      id: createdId,
      title: input.title,
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    };
    projects.set(createdId, project);
    return send(response, 201, { project });
  }
  const uploadMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/source-upload$/,
  );
  if (request.method === "POST" && uploadMatch !== null) {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const sessionId = "019ffbf1-6110-738a-b087-6775ff97568c";
    uploads.set(sessionId, {
      uploaded: false,
      projectId: uploadMatch[1],
      input,
    });
    return send(response, 201, {
      sessionId,
      documentId: "019ffbf1-6111-738a-b087-6775ff97568c",
      uploadUrl: `http://127.0.0.1:3002/signed-upload/${sessionId}`,
      method: "PUT",
      requiredHeaders: { "content-type": input.mediaType },
      expiresAt: "2026-08-13T12:05:00.000Z",
    });
  }
  const completionMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/source-upload\/([^/]+)\/complete$/,
  );
  if (request.method === "POST" && completionMatch !== null) {
    const upload = uploads.get(completionMatch[2]);
    return upload?.uploaded === true && upload.projectId === completionMatch[1]
      ? send(response, 201, {
          documentId: "019ffbf1-6111-738a-b087-6775ff97568c",
          status: "active",
          ingestionRequested: true,
        })
      : send(response, 400, { error: { code: "validation_failed" } });
  }
  const signedUploadMatch = url.pathname.match(/^\/signed-upload\/([^/]+)$/);
  if (request.method === "PUT" && signedUploadMatch !== null) {
    const upload = uploads.get(signedUploadMatch[1]);
    if (upload === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    for await (const _chunk of request) {
      // Consume the direct-to-storage body without proxying it through Next.js.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    upload.uploaded = true;
    response.writeHead(200);
    return response.end();
  }
  const parsedDocMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/parsed-document$/,
  );
  if (request.method === "GET" && parsedDocMatch !== null) {
    const project = projects.get(parsedDocMatch[1]);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    return send(response, 200, {
      document: {
        id: "019ffbf1-610e-738a-b087-6775ff97568c",
        sourceDocumentId: "019ffbf1-6111-738a-b087-6775ff97568c",
        version: 1,
        schemaVersion: "1.0",
        parserVersion: "docling-v1",
        title: "The Water Cycle",
        language: "en",
        pageCount: 5,
      },
      sections: [
        {
          id: "019ffbf1-6112-738a-b087-6775ff97568c",
          order: 1,
          level: 1,
          heading: "Introduction",
          pageStart: 1,
          pageEnd: 2,
          blockCount: 1,
          figureCount: 1,
          tableCount: 0,
        },
        {
          id: "019ffbf1-6115-738a-b087-6775ff97568c",
          order: 2,
          level: 1,
          heading: "Evaporation",
          pageStart: 3,
          pageEnd: 4,
          blockCount: 1,
          figureCount: 0,
          tableCount: 0,
        },
        {
          id: "019ffbf1-6116-738a-b087-6775ff97568c",
          order: 3,
          level: 1,
          heading: "References",
          pageStart: 5,
          pageEnd: 5,
          blockCount: 0,
          figureCount: 0,
          tableCount: 0,
        },
      ],
      warnings: [
        {
          id: "019ffbf1-6113-738a-b087-6775ff97568c",
          code: "missing_caption",
          severity: "warning",
          message: "A figure is missing a caption.",
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-6112-738a-b087-6775ff97568c",
          figureId: "019ffbf1-6114-738a-b087-6775ff97568c",
        },
      ],
      quality: {
        score: 85,
        status: "review_required",
        findings: [],
      },
    });
  }
  const sectionMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/parsed-document\/sections\/([^/]+)$/,
  );
  if (request.method === "GET" && sectionMatch !== null) {
    const project = projects.get(sectionMatch[1]);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const sectionId = decodeURIComponent(sectionMatch[2]);
    if (sectionId === "019ffbf1-6112-738a-b087-6775ff97568c") {
      return send(response, 200, {
        section: {
          id: sectionId,
          order: 1,
          level: 1,
          heading: "Introduction",
          pageStart: 1,
          pageEnd: 2,
          blocks: [
            {
              id: "019ffbf1-6120-738a-b087-6775ff97568c",
              kind: "paragraph",
              order: 1,
              pageStart: 1,
              pageEnd: 1,
              text: "Water moves through the environment in a continuous cycle.",
            },
          ],
          figures: [
            {
              id: "019ffbf1-6114-738a-b087-6775ff97568c",
              order: 1,
              pageStart: 1,
              pageEnd: 1,
              contentType: "image/png",
              width: 800,
              height: 600,
              previewUrl:
                "http://127.0.0.1:3002/signed-figure/019ffbf1-6114.png",
            },
          ],
          tables: [],
        },
      });
    }
    if (sectionId === "019ffbf1-6115-738a-b087-6775ff97568c") {
      return send(response, 200, {
        section: {
          id: sectionId,
          order: 2,
          level: 1,
          heading: "Evaporation",
          pageStart: 3,
          pageEnd: 4,
          blocks: [
            {
              id: "019ffbf1-6121-738a-b087-6775ff97568c",
              kind: "paragraph",
              order: 1,
              pageStart: 3,
              pageEnd: 3,
              text: "Heat from the sun causes water to evaporate.",
            },
          ],
          figures: [],
          tables: [],
        },
      });
    }
    if (sectionId === "019ffbf1-6116-738a-b087-6775ff97568c") {
      return send(response, 200, {
        section: {
          id: sectionId,
          order: 3,
          level: 1,
          heading: "References",
          pageStart: 5,
          pageEnd: 5,
          blocks: [],
          figures: [],
          tables: [],
        },
      });
    }
    return send(response, 404, { error: { code: "not_found" } });
  }
  const configurationMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/configuration$/,
  );
  if (request.method === "GET" && configurationMatch !== null) {
    const project = projects.get(decodeURIComponent(configurationMatch[1]));
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    return send(
      response,
      200,
      configurationResponse(decodeURIComponent(configurationMatch[1])),
    );
  }
  if (request.method === "PUT" && configurationMatch !== null) {
    const projectId = decodeURIComponent(configurationMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const current = configurations.get(projectId);
    const expectedVersion = current?.version ?? 0;
    if (input.expectedVersion !== expectedVersion)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message:
            "The lesson configuration changed. Please refresh and try again.",
          retryable: false,
        },
      });
    const configuration = {
      version: expectedVersion + 1,
      ageBand: input.ageBand,
      difficulty: input.difficulty,
      subject: input.subject,
      lessonTitle: input.lessonTitle,
      targetDurationSeconds: input.targetDurationSeconds,
      tone: input.tone,
      visualTheme: "mvp-default",
      includeRecallQuestions: input.includeRecallQuestions,
      sourceParsedDocumentVersion: 1,
      updatedAt: now,
    };
    configurations.set(projectId, configuration);
    return send(response, 200, configurationResponse(projectId));
  }
  const narrationMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/narration(?:$|\/(.*)$)/,
  );
  if (narrationMatch !== null) {
    const projectId = decodeURIComponent(narrationMatch[1]);
    const rest = narrationMatch[2] ?? "";
    if (request.method === "GET" && rest === "")
      return send(response, 200, narrationResponse(projectId));
    const blockMatch = rest.match(/^blocks\/([^/]+)(?:\/(.*))?$/);
    if (blockMatch !== null) {
      const blockId = decodeURIComponent(blockMatch[1]);
      const subPath = blockMatch[2] ?? "";
      const current = narrationSet(projectId);
      if (request.method === "PATCH" && subPath === "") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const input = JSON.parse(body);
        if (input.expectedRevision !== current.revision)
          return send(response, 409, {
            error: {
              code: "bad_request",
              message: "The narration changed. Please refresh and try again.",
            },
          });
        const before = current.blocks.find((block) => block.id === blockId);
        const revisions = narrationState.get(`${projectId}:revisions`) ?? [];
        if (before !== undefined)
          narrationState.set(`${projectId}:revisions`, [
            ...revisions,
            {
              id: `019ffbf1-6143-738a-b087-6775ff97568${revisions.length}`,
              blockId,
              revision: before.revision,
              text: before.text,
              estimatedWords: before.estimatedWords,
              sourceRefs: before.sourceRefs,
              generatedAdditions: before.generatedAdditions,
              origin: "generated",
              modelCallId: null,
              createdAt: now,
            },
          ]);
        const blocks = current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                text: input.text,
                estimatedWords: input.text.trim().split(/\s+/).length,
                revision: block.revision + 1,
                contentHash: "c".repeat(64),
              }
            : block,
        );
        narrationState.set(projectId, {
          ...current,
          revision: current.revision + 1,
          blocks,
        });
        return send(response, 200, narrationResponse(projectId));
      }
      if (request.method === "GET" && subPath === "revisions") {
        const revisions = narrationState.get(`${projectId}:revisions`) ?? [];
        return send(response, 200, { revisions });
      }
      if (request.method === "POST" && subPath === "restore") {
        let body = "";
        for await (const chunk of request) body += chunk;
        const input = JSON.parse(body);
        if (input.expectedRevision !== current.revision)
          return send(response, 409, {
            error: {
              code: "bad_request",
              message: "The narration changed. Please refresh and try again.",
            },
          });
        const revisions = narrationState.get(`${projectId}:revisions`) ?? [];
        const archived = revisions.find(
          (revision) => revision.revision === input.revision,
        );
        if (archived === undefined)
          return send(response, 404, { error: { code: "not_found" } });
        narrationState.set(`${projectId}:revisions`, [
          ...revisions,
          {
            ...current.blocks.find((block) => block.id === blockId),
            revision: current.blocks.find((block) => block.id === blockId)
              .revision,
          },
        ]);
        const blocks = current.blocks.map((block) =>
          block.id === blockId
            ? {
                ...block,
                text: archived.text,
                estimatedWords: archived.estimatedWords,
                revision: block.revision + 1,
                contentHash: "c".repeat(64),
              }
            : block,
        );
        narrationState.set(projectId, {
          ...current,
          revision: current.revision + 1,
          blocks,
        });
        return send(response, 200, narrationResponse(projectId));
      }
      const candidateMatch = subPath.match(
        /^candidates\/([^/]+)\/(accept|reject)$/,
      );
      if (candidateMatch !== null) {
        let body = "";
        for await (const chunk of request) body += chunk;
        const input = JSON.parse(body);
        if (input.expectedRevision !== current.revision)
          return send(response, 409, {
            error: {
              code: "bad_request",
              message: "The narration changed. Please refresh and try again.",
            },
          });
        const candidateId = decodeURIComponent(candidateMatch[1]);
        const action = candidateMatch[2];
        const candidates = narrationCandidates(projectId);
        const candidate = candidates.find((item) => item.id === candidateId);
        if (candidate === undefined)
          return send(response, 404, { error: { code: "not_found" } });
        const updatedCandidates = candidates.map((item) =>
          item.id === candidateId
            ? {
                ...item,
                status: action === "accept" ? "accepted" : "rejected",
              }
            : item,
        );
        narrationState.set(`${projectId}:candidates`, updatedCandidates);
        if (action === "accept") {
          const blocks = current.blocks.map((block) =>
            block.id === blockId
              ? {
                  ...block,
                  text: candidate.text,
                  estimatedWords: candidate.estimatedWords,
                  revision: block.revision + 1,
                  contentHash: "c".repeat(64),
                }
              : block,
          );
          narrationState.set(projectId, {
            ...current,
            revision: current.revision + 1,
            blocks,
          });
        }
        return send(response, 200, narrationResponse(projectId));
      }
    }
    return send(response, 404, { error: { code: "not_found" } });
  }
  const storyboardMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/storyboard(?:\/(.*))?$/,
  );
  if (storyboardMatch !== null) {
    const projectId = decodeURIComponent(storyboardMatch[1]);
    const rest = storyboardMatch[2] ?? "";
    if (request.method === "GET" && rest === "") {
      const project = projects.get(projectId);
      if (project === undefined)
        return send(response, 404, { error: { code: "not_found" } });
      return send(response, 200, storyboardResponse(projectId));
    }
    if (request.method === "POST" && rest === "generate") {
      const project = projects.get(projectId);
      if (project === undefined)
        return send(response, 404, { error: { code: "not_found" } });
      return send(response, 202, {
        jobId: "019ffbf1-6150-738a-b087-6775ff97568c",
        status: "queued",
      });
    }
    if (request.method === "GET" && rest === "scenes") {
      const project = projects.get(projectId);
      if (project === undefined)
        return send(response, 404, { error: { code: "not_found" } });
      const draft = storyboardDraft(projectId);
      return send(response, 200, {
        revision: draft.revision,
        stale: false,
        staleReason: null,
        totalDurationSeconds: draft.totalDurationSeconds,
        targetDurationSeconds: draft.targetDurationSeconds,
        scenes: draft.scenes.map((scene) => ({
          sceneId: scene.stableSceneId,
          order: scene.order,
          template: scene.template,
          title: scene.scene.title ?? null,
          narrationSummary: scene.scene.narration.slice(0, 120),
          narrationBlockCount: scene.narrationBlockIds.length,
          durationSeconds: scene.durationSeconds,
          status: storyboardSceneStatus(scene),
        })),
      });
    }
    const sceneDetailMatch = rest.match(/^scenes\/([^/]+)$/);
    if (request.method === "GET" && sceneDetailMatch !== null) {
      const project = projects.get(projectId);
      if (project === undefined)
        return send(response, 404, { error: { code: "not_found" } });
      const sceneId = decodeURIComponent(sceneDetailMatch[1]);
      const draft = storyboardDraft(projectId);
      const scene = draft.scenes.find((item) => item.stableSceneId === sceneId);
      if (scene === undefined)
        return send(response, 404, { error: { code: "not_found" } });
      return send(response, 200, {
        scene,
        status: storyboardSceneStatus(scene),
      });
    }
    return send(response, 404, { error: { code: "not_found" } });
  }
  const sceneReorderMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/reorder$/,
  );
  if (request.method === "POST" && sceneReorderMatch !== null) {
    const projectId = decodeURIComponent(sceneReorderMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const draft = storyboardDraft(projectId);
    if (input.expectedRevision !== draft.revision)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The storyboard changed. Please refresh and try again.",
        },
      });
    const byId = new Map(
      draft.scenes.map((scene) => [scene.stableSceneId, scene]),
    );
    if (
      byId.size !== input.sceneIds.length ||
      [...byId.keys()].some((id) => !input.sceneIds.includes(id))
    )
      return send(response, 409, {
        error: { code: "bad_request", message: "Scene list mismatch." },
      });
    const scenes = renumberStoryboardScenes(
      input.sceneIds.map((id) => byId.get(id)),
    );
    storyboardState.set(projectId, {
      ...draft,
      revision: draft.revision + 1,
      totalDurationSeconds: scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      scenes,
    });
    return send(response, 200, storyboardSceneListResponse(projectId));
  }
  const sceneCreateMatch = url.pathname.match(/^\/projects\/([^/]+)\/scenes$/);
  if (request.method === "POST" && sceneCreateMatch !== null) {
    const projectId = decodeURIComponent(sceneCreateMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const draft = storyboardDraft(projectId);
    if (input.expectedRevision !== draft.revision)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The storyboard changed. Please refresh and try again.",
        },
      });
    const sceneId = newMockSceneId();
    const scenes = renumberStoryboardScenes([
      ...draft.scenes,
      {
        id: sceneId,
        stableSceneId: sceneId,
        order: draft.scenes.length + 1,
        template: input.template,
        durationSeconds: 10,
        narrationBlockIds: [],
        assetRequirements: [],
        scene: {
          id: sceneId,
          order: draft.scenes.length + 1,
          narration: "New scene narration.",
          durationSeconds: 10,
          onScreenText: [],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [],
          generatedAdditions: [],
          template: input.template,
          visual: mockSceneVisual(input.template),
        },
      },
    ]);
    storyboardState.set(projectId, {
      ...draft,
      revision: draft.revision + 1,
      totalDurationSeconds: scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      scenes,
    });
    return send(response, 200, storyboardSceneListResponse(projectId));
  }
  const sceneDuplicateMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/([^/]+)\/duplicate$/,
  );
  if (request.method === "POST" && sceneDuplicateMatch !== null) {
    const projectId = decodeURIComponent(sceneDuplicateMatch[1]);
    const sceneId = decodeURIComponent(sceneDuplicateMatch[2]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const draft = storyboardDraft(projectId);
    if (input.expectedRevision !== draft.revision)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The storyboard changed. Please refresh and try again.",
        },
      });
    const index = draft.scenes.findIndex(
      (scene) => scene.stableSceneId === sceneId,
    );
    if (index < 0) return send(response, 404, { error: { code: "not_found" } });
    const source = draft.scenes[index];
    const newId = newMockSceneId();
    const duplicate = {
      ...source,
      id: newId,
      stableSceneId: newId,
      scene: { ...source.scene, id: newId },
    };
    const reordered = [...draft.scenes];
    reordered.splice(index + 1, 0, duplicate);
    const scenes = renumberStoryboardScenes(reordered);
    storyboardState.set(projectId, {
      ...draft,
      revision: draft.revision + 1,
      totalDurationSeconds: scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      scenes,
    });
    return send(response, 200, storyboardSceneListResponse(projectId));
  }
  const sceneDeleteMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/([^/]+)$/,
  );
  if (request.method === "DELETE" && sceneDeleteMatch !== null) {
    const projectId = decodeURIComponent(sceneDeleteMatch[1]);
    const sceneId = decodeURIComponent(sceneDeleteMatch[2]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const draft = storyboardDraft(projectId);
    if (input.expectedRevision !== draft.revision)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The storyboard changed. Please refresh and try again.",
        },
      });
    if (draft.scenes.length <= 1)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "A storyboard must keep at least one scene.",
        },
      });
    if (!draft.scenes.some((scene) => scene.stableSceneId === sceneId))
      return send(response, 404, { error: { code: "not_found" } });
    const scenes = renumberStoryboardScenes(
      draft.scenes.filter((scene) => scene.stableSceneId !== sceneId),
    );
    storyboardState.set(projectId, {
      ...draft,
      revision: draft.revision + 1,
      totalDurationSeconds: scenes.reduce(
        (sum, scene) => sum + scene.durationSeconds,
        0,
      ),
      scenes,
    });
    return send(response, 200, storyboardSceneListResponse(projectId));
  }
  const sceneRegenerateMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/([^/]+)\/regenerate$/,
  );
  if (request.method === "POST" && sceneRegenerateMatch !== null) {
    const projectId = decodeURIComponent(sceneRegenerateMatch[1]);
    const sceneId = decodeURIComponent(sceneRegenerateMatch[2]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const draft = storyboardDraft(projectId);
    const scene = draft.scenes.find((item) => item.stableSceneId === sceneId);
    if (scene === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const candidateId = "019ffbf1-6152-738a-b087-6775ff97568c";
    const candidates =
      storyboardState.get(`${projectId}:sceneCandidates`) ?? [];
    if (!candidates.some((item) => item.id === candidateId)) {
      storyboardState.set(`${projectId}:sceneCandidates`, [
        ...candidates,
        {
          id: candidateId,
          sceneId,
          mode: "improve-visual",
          before: scene,
          after: {
            ...scene,
            template: "labelled-diagram",
            scene: {
              ...scene.scene,
              template: "labelled-diagram",
              visual: {
                kind: "shapes",
                shape: "system",
                labels: [
                  { anchor: "center", id: "water", text: "Water" },
                  { anchor: "top", id: "vapour", text: "Vapour" },
                ],
              },
            },
          },
          status: "pending",
          sceneRevision: 0,
          modelCallId: "019ffbf1-6150-738a-b087-6775ff97568c",
          createdAt: now,
        },
      ]);
    }
    return send(response, 202, {
      jobId: "019ffbf1-6153-738a-b087-6775ff97568c",
      status: "queued",
    });
  }
  const sceneDecisionMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/([^/]+)\/(apply|reject)-candidate$/,
  );
  if (request.method === "POST" && sceneDecisionMatch !== null) {
    const projectId = decodeURIComponent(sceneDecisionMatch[1]);
    const sceneId = decodeURIComponent(sceneDecisionMatch[2]);
    const decision = sceneDecisionMatch[3];
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const candidates =
      storyboardState.get(`${projectId}:sceneCandidates`) ?? [];
    const candidate = candidates.find((item) => item.id === input.candidateId);
    if (candidate === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    if (candidate.status !== "pending")
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The candidate is no longer pending.",
        },
      });
    const draft = storyboardDraft(projectId);
    const scene = draft.scenes.find((item) => item.stableSceneId === sceneId);
    if (scene === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    if (decision === "apply") {
      const replacement = candidates.map((item) =>
        item.id === candidate.id ? { ...item, status: "accepted" } : item,
      );
      storyboardState.set(`${projectId}:sceneCandidates`, replacement);
      const updatedScenes = draft.scenes.map((item) =>
        item.stableSceneId === sceneId ? candidate.after : item,
      );
      storyboardState.set(projectId, {
        ...draft,
        revision: draft.revision + 1,
        scenes: updatedScenes,
      });
    } else {
      storyboardState.set(
        `${projectId}:sceneCandidates`,
        candidates.map((item) =>
          item.id === candidate.id ? { ...item, status: "rejected" } : item,
        ),
      );
    }
    return send(response, 200, storyboardResponse(projectId));
  }
  const sceneCitationsMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/scenes\/([^/]+)\/citations$/,
  );
  if (request.method === "GET" && sceneCitationsMatch !== null) {
    const projectId = decodeURIComponent(sceneCitationsMatch[1]);
    const sceneId = decodeURIComponent(sceneCitationsMatch[2]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const draft = storyboardDraft(projectId);
    const scene = draft.scenes.find((item) => item.stableSceneId === sceneId);
    if (scene === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    return send(response, 200, {
      sceneId,
      citations: [
        {
          documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
          parsedDocumentVersion: 1,
          pageStart: 1,
          pageEnd: 1,
          sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
          sectionHeading: "Introduction",
          blocks: [
            {
              blockId: "019ffbf1-6120-738a-b087-6775ff97568c",
              sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
              kind: "paragraph",
              page: 1,
              text: "Water moves through the environment in a continuous cycle.",
            },
          ],
          figures: [],
          tables: [],
          issues: [],
        },
      ],
      generatedAdditions: [
        {
          kind: "analogy",
          content: "The water cycle is like a conveyor belt.",
          rationale: "Makes the cycle concrete.",
        },
      ],
    });
  }
  const groundingLatestMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/grounding-checks\/latest$/,
  );
  if (request.method === "GET" && groundingLatestMatch !== null) {
    const projectId = decodeURIComponent(groundingLatestMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const sceneId = storyboardDraft(projectId).scenes[0]?.stableSceneId;
    return send(response, 200, {
      check: {
        schemaVersion: "grounding-check-v1",
        id: "019ffbf1-6151-738a-b087-6775ff97568f",
        projectId,
        lessonSpecId: "019ffbf1-6151-738a-b087-6775ff975690",
        lessonSpecRevision: 0,
        lessonSpecContentHash: "a".repeat(64),
        sourceSnapshotId: "019ffbf1-6151-738a-b087-6775ff975691",
        sourceSnapshotContentHash: "b".repeat(64),
        claims: [
          {
            id: "019ffbf1-6151-738a-b087-6775ff975692",
            text: "Water moves through the environment in a continuous cycle.",
            sourceRefs: [
              {
                documentId: "019ffbf1-3333-738a-b087-6775ff97568c",
                parsedDocumentVersion: 1,
                pageStart: 1,
                pageEnd: 1,
                sectionId: "019ffbf1-1111-738a-b087-6775ff97568c",
                blockIds: ["019ffbf1-6120-738a-b087-6775ff97568c"],
              },
            ],
            location: { type: "narration", sceneId, sentenceIndex: 0 },
          },
        ],
        results: [
          {
            claimId: "019ffbf1-6151-738a-b087-6775ff975692",
            status: "supported",
            supportedSpans: [
              {
                start: 0,
                end: 20,
                sourceBlockId: "019ffbf1-6120-738a-b087-6775ff97568c",
              },
            ],
            unsupportedSpans: [],
            modelAssisted: true,
            modelCallId: "019ffbf1-6151-738a-b087-6775ff975693",
            checkedAt: "2026-08-20T10:00:00.000Z",
          },
        ],
        summary: {
          total: 1,
          supported: 1,
          unsupported: 0,
          generatedAddition: 0,
          needsReview: 0,
        },
        modelCalls: ["019ffbf1-6151-738a-b087-6775ff975693"],
        createdAt: "2026-08-20T10:00:00.000Z",
      },
      latestJob: {
        id: "019ffbf1-6151-738a-b087-6775ff975694",
        state: "succeeded",
        errorCode: null,
        updatedAt: "2026-08-20T10:00:05.000Z",
      },
    });
  }
  const groundingCheckMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/grounding-checks$/,
  );
  if (request.method === "POST" && groundingCheckMatch !== null) {
    const projectId = decodeURIComponent(groundingCheckMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    return send(response, 202, {
      jobId: "019ffbf1-6151-738a-b087-6775ff975695",
      status: "queued",
      cached: false,
    });
  }
  const transformMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/narration-blocks\/([^/]+)\/regenerate$/,
  );
  if (request.method === "POST" && transformMatch !== null) {
    const projectId = decodeURIComponent(transformMatch[1]);
    const blockId = decodeURIComponent(transformMatch[2]);
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    const current = narrationSet(projectId);
    if (input.expectedRevision !== current.revision)
      return send(response, 409, {
        error: {
          code: "bad_request",
          message: "The narration changed. Please refresh and try again.",
        },
      });
    const block = current.blocks.find((item) => item.id === blockId);
    if (block === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const candidateId = "019ffbf1-6141-738a-b087-6775ff97568c";
    const candidates = narrationCandidates(projectId);
    narrationState.set(`${projectId}:candidates`, [
      ...candidates,
      {
        id: candidateId,
        blockId,
        mode: input.mode,
        text: "A tighter, clearer rewrite of the opening question.",
        estimatedWords: 8,
        sourceRefs: [],
        generatedAdditions: [],
        status: "pending",
        blockRevision: block.revision,
        modelCallId: "019ffbf1-610e-738a-b087-6775ff97568c",
        createdAt: now,
      },
    ]);
    return send(response, 202, {
      jobId: "019ffbf1-6140-738a-b087-6775ff97568c",
      status: "queued",
    });
  }
  const objectivesMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/objectives(?:\/([^/]+))?$/,
  );
  if (objectivesMatch !== null) {
    const projectId = decodeURIComponent(objectivesMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    if (request.method === "GET")
      return send(response, 200, objectiveResponse(projectId));
    if (request.method === "POST" && objectivesMatch[2] === undefined) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = objectiveSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The objectives changed. Please refresh and try again.",
          },
        });
      const set = {
        ...current,
        revision: current.revision + 1,
        objectives: [
          ...current.objectives,
          {
            id:
              current.objectives.length === 0
                ? "019ffbf1-6120-738a-b087-6775ff97568c"
                : `019ffbf1-6121-738a-b087-6775ff97568${current.objectives.length}`,
            order: current.objectives.length + 1,
            statement: input.statement,
            verb: input.verb,
            confidence: 1,
            sourceRefs: input.sourceBlockIds ? objectiveSourceRef() : [],
            generated: false,
            revision: 0,
            groundingStatus: input.sourceBlockIds ? "supported" : "unsupported",
          },
        ],
      };
      objectiveState.set(projectId, set);
      return send(response, 200, objectiveResponse(projectId));
    }
    if (request.method === "POST" && objectivesMatch[2] === "reorder") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = objectiveSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The objectives changed. Please refresh and try again.",
          },
        });
      const byId = new Map(current.objectives.map((o) => [o.id, o]));
      const objectives = input.objectiveIds.map((id, index) => ({
        ...byId.get(id),
        order: index + 1,
      }));
      const set = { ...current, revision: current.revision + 1, objectives };
      objectiveState.set(projectId, set);
      return send(response, 200, objectiveResponse(projectId));
    }
    if (request.method === "POST" && objectivesMatch[2] === "approve") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = objectiveSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The objectives changed. Please refresh and try again.",
          },
        });
      if (current.objectives.length < 1)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "At least one objective is required before approving.",
          },
        });
      const set = { ...current, status: "approved" };
      objectiveState.set(projectId, set);
      objectiveState.set(`${projectId}:approved`, set);
      return send(response, 200, objectiveResponse(projectId));
    }
    const objectiveId = objectivesMatch[2];
    if (objectiveId === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    if (request.method === "PATCH") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = objectiveSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The objectives changed. Please refresh and try again.",
          },
        });
      const objectives = current.objectives.map((objective) =>
        objective.id === objectiveId
          ? {
              ...objective,
              statement: input.statement ?? objective.statement,
              verb: input.verb ?? objective.verb,
              revision: objective.revision + 1,
            }
          : objective,
      );
      const set = { ...current, revision: current.revision + 1, objectives };
      objectiveState.set(projectId, set);
      return send(response, 200, objectiveResponse(projectId));
    }
    if (request.method === "DELETE") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = objectiveSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The objectives changed. Please refresh and try again.",
          },
        });
      const objectives = current.objectives
        .filter((objective) => objective.id !== objectiveId)
        .map((objective, index) => ({ ...objective, order: index + 1 }));
      const set = { ...current, revision: current.revision + 1, objectives };
      objectiveState.set(projectId, set);
      return send(response, 200, objectiveResponse(projectId));
    }
    return send(response, 404, { error: { code: "not_found" } });
  }
  const outlineMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/outline(?:\/items(?:\/([^/]+))?|\/(reorder|approve))?$/,
  );
  if (outlineMatch !== null) {
    const projectId = decodeURIComponent(outlineMatch[1]);
    const project = projects.get(projectId);
    if (project === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    const subPath = outlineMatch[3];
    const itemId = outlineMatch[2];
    if (
      request.method === "GET" &&
      subPath === undefined &&
      itemId === undefined
    )
      return send(response, 200, outlineResponse(projectId));
    if (
      request.method === "POST" &&
      subPath === undefined &&
      itemId === undefined
    ) {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = outlineSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The outline changed. Please refresh and try again.",
          },
        });
      const set = {
        ...current,
        revision: current.revision + 1,
        items: [
          ...current.items,
          {
            id: `019ffbf1-6123-738a-b087-6775ff97568${current.items.length}`,
            order: current.items.length + 1,
            kind: input.kind,
            title: input.title,
            description: input.description,
            estimatedSeconds: input.estimatedSeconds,
            sourceRefs:
              input.sourceBlockIds !== undefined &&
              input.sourceBlockIds.length > 0
                ? outlineSourceRef()
                : [],
            objectiveIds: input.objectiveIds,
            framingNote: input.framingNote ?? null,
            generated: false,
            revision: 0,
          },
        ],
      };
      set.totalEstimatedSeconds = set.items.reduce(
        (total, item) => total + item.estimatedSeconds,
        0,
      );
      outlineState.set(projectId, set);
      return send(response, 200, outlineResponse(projectId));
    }
    if (request.method === "POST" && subPath === "reorder") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = outlineSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The outline changed. Please refresh and try again.",
          },
        });
      const byId = new Map(current.items.map((item) => [item.id, item]));
      const items = input.itemIds.map((id, index) => ({
        ...byId.get(id),
        order: index + 1,
      }));
      const set = { ...current, revision: current.revision + 1, items };
      outlineState.set(projectId, set);
      return send(response, 200, outlineResponse(projectId));
    }
    if (request.method === "POST" && subPath === "approve") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = outlineSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The outline changed. Please refresh and try again.",
          },
        });
      const set = { ...current, status: "approved" };
      outlineState.set(projectId, set);
      outlineState.set(`${projectId}:approved`, set);
      return send(response, 200, outlineResponse(projectId));
    }
    if (itemId === undefined)
      return send(response, 404, { error: { code: "not_found" } });
    if (request.method === "PATCH") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = outlineSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The outline changed. Please refresh and try again.",
          },
        });
      const items = current.items.map((item) =>
        item.id === itemId
          ? {
              ...item,
              kind: input.kind ?? item.kind,
              title: input.title ?? item.title,
              description: input.description ?? item.description,
              estimatedSeconds: input.estimatedSeconds ?? item.estimatedSeconds,
              sourceRefs:
                input.sourceBlockIds !== undefined &&
                input.sourceBlockIds.length > 0
                  ? outlineSourceRef()
                  : item.sourceRefs,
              objectiveIds: input.objectiveIds ?? item.objectiveIds,
              framingNote:
                input.framingNote === undefined
                  ? item.framingNote
                  : input.framingNote,
              revision: item.revision + 1,
            }
          : item,
      );
      const set = { ...current, revision: current.revision + 1, items };
      set.totalEstimatedSeconds = set.items.reduce(
        (total, item) => total + item.estimatedSeconds,
        0,
      );
      outlineState.set(projectId, set);
      return send(response, 200, outlineResponse(projectId));
    }
    if (request.method === "DELETE") {
      let body = "";
      for await (const chunk of request) body += chunk;
      const input = JSON.parse(body);
      const current = outlineSet(projectId);
      if (input.expectedRevision !== current.revision)
        return send(response, 409, {
          error: {
            code: "bad_request",
            message: "The outline changed. Please refresh and try again.",
          },
        });
      const items = current.items
        .filter((item) => item.id !== itemId)
        .map((item, index) => ({ ...item, order: index + 1 }));
      const set = { ...current, revision: current.revision + 1, items };
      set.totalEstimatedSeconds = set.items.reduce(
        (total, item) => total + item.estimatedSeconds,
        0,
      );
      outlineState.set(projectId, set);
      return send(response, 200, outlineResponse(projectId));
    }
    return send(response, 404, { error: { code: "not_found" } });
  }
  if (
    request.method === "POST" &&
    url.pathname.endsWith("/complete") &&
    url.pathname.includes("/source-upload")
  ) {
    let body = "";
    for await (const chunk of request) body += chunk;
    console.log("[MOCK API COMPLETE ROUTE HIT]", url.pathname);
    return send(response, 200, {
      documentId: "019ffbf1-610e-738a-b087-6775ff97568c",
      status: "validating",
      ingestionRequested: true,
      duplicateDetected: false,
    });
  }
  if (request.method === "POST" && url.pathname.endsWith("/source-upload")) {
    let body = "";
    for await (const chunk of request) body += chunk;
    console.log("[MOCK API SESSION ROUTE HIT]", url.pathname);
    return send(response, 200, {
      sessionId: "019ffbf1-610e-738a-b087-6775ff97568c",
      documentId: "019ffbf1-610e-738a-b087-6775ff97568c",
      uploadUrl: "http://127.0.0.1:3002/mock-upload",
      method: "PUT",
      requiredHeaders: {},
      expiresAt: new Date().toISOString(),
    });
  }
  if (request.method === "PUT" && url.pathname === "/mock-upload") {
    let body = "";
    for await (const chunk of request) body += chunk;
    return send(response, 200, {});
  }
  if (request.method === "GET" && url.pathname.endsWith("/source-document")) {
    return send(response, 200, {
      documentId: "019ffbf1-610e-738a-b087-6775ff97568c",
      validation: {
        status: "active",
        code: null,
        pageCount: 5,
        warnings: [],
      },
      reuse: {
        status: "not_reused",
      },
    });
  }
  if (request.method === "GET" && url.pathname.endsWith("/ingestion")) {
    return send(response, 200, {
      state: "pending",
      latestJob: null,
      quality: null,
      canRetry: false,
      canProceedToReview: false,
    });
  }
  if (request.method === "GET" && url.pathname.startsWith("/projects/")) {
    const project = projects.get(decodeURIComponent(url.pathname.slice(10)));
    return project === undefined
      ? send(response, 404, { error: { code: "not_found" } })
      : send(response, 200, { project });
  }
  return send(response, 404, { error: { code: "not_found" } });
});

server.listen(3002, "127.0.0.1");
