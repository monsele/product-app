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

const outlineObjectiveId = "019ffbf1-6111-738a-b087-6775ff97568c";
const outlineItemA = "019ffbf1-6121-738a-b087-6775ff97568c";
const outlineItemB = "019ffbf1-6122-738a-b087-6775ff97568c";

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
  const target = Math.round(
    (seconds / 60) * 140 * (1 - 0.2),
  );
  return {
    min: Math.max(1, Math.round(target * 0.9)),
    target,
    max: Math.max(target, Math.round(target * 1.15)),
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

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", "http://127.0.0.1:3002");
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      "access-control-allow-origin": "http://127.0.0.1:3000",
      "access-control-allow-credentials": "true",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers":
        "content-type, x-amz-checksum-sha256, idempotency-key",
    });
    return response.end();
  }
  response.setHeader("access-control-allow-origin", "http://127.0.0.1:3000");
  response.setHeader("access-control-allow-credentials", "true");
  if (request.method === "GET" && url.pathname === "/health")
    return send(response, 200, { status: "ok" });
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
              previewUrl: "http://127.0.0.1:3002/signed-figure/019ffbf1-6114.png",
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
          message: "The lesson configuration changed. Please refresh and try again.",
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
  const objectivesMatch = url.pathname.match(
    /^\/projects\/([^/]+)\/objectives(?:\/([^/]+))?$/,
  );  if (objectivesMatch !== null) {
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
            sourceRefs: input.sourceBlockIds
              ? objectiveSourceRef()
              : [],
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
    if (request.method === "GET" && subPath === undefined && itemId === undefined)
      return send(response, 200, outlineResponse(projectId));
    if (request.method === "POST" && subPath === undefined && itemId === undefined) {
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
  if (request.method === "GET" && url.pathname.startsWith("/projects/")) {
    const project = projects.get(decodeURIComponent(url.pathname.slice(10)));
    return project === undefined
      ? send(response, 404, { error: { code: "not_found" } })
      : send(response, 200, { project });
  }
  return send(response, 404, { error: { code: "not_found" } });
});

server.listen(3002, "127.0.0.1");
