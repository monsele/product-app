// ---------------------------------------------------------------------------
// ST-115: conversational storyboard editing for e2e/edit-thread.spec.ts,
// served by workspace-mock-api.mjs with a mocked planning provider.
//
// `POST /__edit-thread/seed` creates a fresh project with a two-scene draft.
// A request is planned on the next `GET .../edit-thread/messages` (standing
// in for the planning job): "simpler" plans a scene regeneration, anything
// else plans two field edits. A queued regeneration's candidate is ready on
// the following read, and it is reviewed through the existing
// apply-candidate route.
// ---------------------------------------------------------------------------

const now = "2026-10-15T09:00:00.000Z";
const threads = new Map();

function readBody(request) {
  return new Promise((resolve) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => resolve(body === "" ? {} : JSON.parse(body)));
  });
}

function messageBase(id, seq, role, scope, extra) {
  return {
    id,
    seq,
    role,
    replyToId: null,
    text: null,
    scope,
    status: "sent",
    plan: null,
    operations: [],
    appliedOperationIds: [],
    beforeRevision: null,
    afterRevision: null,
    failure: null,
    canUndo: false,
    createdAt: now,
    ...extra,
  };
}

function hex(seed, index) {
  return `019ffbf1-${seed}-738a-b087-${String(index).padStart(12, "0")}`;
}

function planFor(text, scope, draft) {
  const sceneId = scope.sceneIds[0] ?? draft.scenes[0].stableSceneId;
  const scene = draft.scenes.find((entry) => entry.stableSceneId === sceneId);
  const order = scene?.order ?? 1;
  const operations = /simpl/i.test(text)
    ? [
        {
          id: "op-1",
          operation: {
            type: "regenerate-scene",
            sceneId,
            mode: "simplify",
            instruction: text.slice(0, 500),
            rationale: `Rewrites scene ${order} in simpler words; you compare before and after.`,
          },
          display: { sceneOrder: order, fieldLabel: null, before: null },
        },
      ]
    : [
        {
          id: "op-1",
          operation: {
            type: "edit-scene-field",
            sceneId,
            path: "transition",
            value: "fade",
            rationale: `A fade eases into scene ${order}.`,
          },
          display: {
            sceneOrder: order,
            fieldLabel: "Transition",
            before: scene?.scene.transition ?? "cut",
          },
        },
        {
          id: "op-2",
          operation: {
            type: "edit-scene-field",
            sceneId,
            path: "title",
            value: "Puddles dry up",
            rationale: "A shorter title reads faster.",
          },
          display: {
            sceneOrder: order,
            fieldLabel: "Title",
            before: scene?.scene.title ?? null,
          },
        },
      ];
  return {
    schemaVersion: "edit-plan-v1",
    summary:
      operations.length === 1
        ? `Simplify scene ${order}.`
        : `Soften the transition and shorten the title of scene ${order}.`,
    remainingSceneIds: [],
    expectedRevision: draft.revision,
    narrationSetRevision: null,
    modelCallId: hex("9999", 1),
    operations,
  };
}

function response(projectId, context) {
  const thread = threads.get(projectId);
  const draft = context.storyboardDraft(projectId);
  const used = thread.messages.filter((message) => message.role === "teacher").length;
  const latestUndoable = [...thread.messages]
    .reverse()
    .find((message) => message.status === "applied" || message.status === "partly_applied");
  return {
    threadId: thread.id,
    storyboardRevision: draft.revision,
    turnLimit: { limit: 20, used, remaining: 20 - used },
    // The mock thread is always a single page.
    earlierCursor: null,
    // `previousDraft` is this mock's own undo record, not part of the contract.
    messages: thread.messages.map(({ previousDraft: _undo, ...message }) => ({
      ...message,
      canUndo:
        message.id === latestUndoable?.id &&
        message.afterRevision !== message.beforeRevision &&
        message.afterRevision === draft.revision,
    })),
  };
}

/** Advances planning and queued regenerations by one step per read. */
function advance(projectId, context) {
  const thread = threads.get(projectId);
  for (const message of thread.messages) {
    if (message.status === "planning") {
      const request = thread.messages.find((entry) => entry.id === message.replyToId);
      const plan = planFor(request.text, request.scope, context.storyboardDraft(projectId));
      Object.assign(message, {
        status: "proposed",
        text: plan.summary,
        plan,
        beforeRevision: plan.expectedRevision,
        operations: plan.operations.map(({ id }) => ({
          operationId: id,
          state: "proposed",
          jobId: null,
          candidateId: null,
          errorCode: null,
        })),
      });
    }
    for (const state of message.operations)
      if (state.state === "queued") {
        state.state = "ready";
        state.candidateId = hex("6152", thread.seq);
      }
  }
}

function applyOperations(projectId, message, operationIds, context) {
  const { storyboardState } = context;
  let draft = context.storyboardDraft(projectId);
  const before = draft.revision;
  for (const entry of message.plan.operations) {
    const state = message.operations.find((item) => item.operationId === entry.id);
    if (!operationIds.includes(entry.id)) {
      state.state = "skipped";
      continue;
    }
    const { operation } = entry;
    if (operation.type === "regenerate-scene") {
      const scene = draft.scenes.find((item) => item.stableSceneId === operation.sceneId);
      const candidates = storyboardState.get(`${projectId}:sceneCandidates`) ?? [];
      storyboardState.set(`${projectId}:sceneCandidates`, [
        ...candidates,
        {
          id: hex("6152", threads.get(projectId).seq),
          sceneId: operation.sceneId,
          mode: "simplify",
          before: scene,
          after: {
            ...scene,
            scene: {
              ...scene.scene,
              title: "Where puddles go, simply",
              visual: { ...scene.scene.visual, term: "Puddles, simply" },
            },
          },
          status: "pending",
          sceneRevision: 0,
          modelCallId: hex("6150", 1),
          createdAt: now,
        },
      ]);
      state.state = "queued";
      state.jobId = hex("6153", threads.get(projectId).seq);
    } else if (operation.type === "edit-scene-field") {
      draft = {
        ...draft,
        revision: draft.revision + 1,
        scenes: draft.scenes.map((item) =>
          item.stableSceneId === operation.sceneId
            ? { ...item, scene: { ...item.scene, [operation.path]: operation.value } }
            : item,
        ),
      };
      storyboardState.set(projectId, draft);
      state.state = "applied";
    }
  }
  const applied = message.operations.filter((state) => state.state !== "skipped");
  Object.assign(message, {
    status: applied.length === message.plan.operations.length ? "applied" : "partly_applied",
    appliedOperationIds: applied.map((state) => state.operationId),
    beforeRevision: before,
    afterRevision: draft.revision,
  });
}

export async function handleEditThread(request, response_, url, context) {
  const { send, projects, storyboardState } = context;
  if (request.method === "POST" && url.pathname === "/__edit-thread/seed") {
    const body = await readBody(request);
    const projectId = body.projectId;
    projects.set(projectId, {
      id: projectId,
      title: "Conversational editing lesson",
      stage: "draft",
      latestFailedOperation: null,
      createdAt: now,
      updatedAt: now,
      revision: 1,
    });
    storyboardState.delete(projectId);
    storyboardState.delete(`${projectId}:sceneCandidates`);
    threads.set(projectId, { id: hex("1515", 1), seq: 0, messages: [] });
    send(response_, 200, { projectId });
    return true;
  }
  const match = url.pathname.match(
    /^\/projects\/([^/]+)\/edit-thread\/(messages|plans\/([^/]+)\/(apply|dismiss|undo))$/,
  );
  if (match === null) return false;
  const projectId = decodeURIComponent(match[1]);
  if (!threads.has(projectId))
    threads.set(projectId, { id: hex("1515", 2), seq: 0, messages: [] });
  const thread = threads.get(projectId);
  if (match[2] === "messages" && request.method === "GET") {
    advance(projectId, context);
    send(response_, 200, response(projectId, context));
    return true;
  }
  if (match[2] === "messages" && request.method === "POST") {
    const body = await readBody(request);
    const draft = context.storyboardDraft(projectId);
    if (body.expectedRevision !== draft.revision) {
      send(response_, 409, {
        error: {
          code: "edit_conflict",
          message: "The storyboard changed. Refresh it and send your request again.",
          retryable: false,
          correlationId: hex("0000", 1),
        },
      });
      return true;
    }
    thread.seq += 1;
    const teacherId = hex("1516", thread.seq);
    const assistantId = hex("1517", thread.seq);
    thread.messages.push(
      messageBase(teacherId, thread.seq * 2 - 1, "teacher", body.scope, {
        replyToId: assistantId,
        text: body.text,
      }),
      messageBase(assistantId, thread.seq * 2, "assistant", body.scope, {
        replyToId: teacherId,
        status: "planning",
      }),
    );
    send(response_, 202, response(projectId, context));
    return true;
  }
  const message = thread.messages.find((entry) => entry.id === match[3]);
  if (message === undefined) {
    send(response_, 404, { error: { code: "not_found", message: "Not found.", retryable: false, correlationId: hex("0000", 1) } });
    return true;
  }
  const body = await readBody(request);
  const action = match[4];
  if (action === "apply") {
    const draft = context.storyboardDraft(projectId);
    if (body.expectedRevision !== message.plan.expectedRevision || draft.revision !== body.expectedRevision) {
      send(response_, 409, {
        error: {
          code: "edit_conflict",
          message: "The storyboard changed after this plan was made. Re-plan to apply it to the current storyboard.",
          details: { action: "re-plan", currentRevision: draft.revision },
          retryable: false,
          correlationId: hex("0000", 1),
        },
      });
      return true;
    }
    message.previousDraft = draft;
    applyOperations(
      projectId,
      message,
      body.operationIds ?? message.plan.operations.map(({ id }) => id),
      context,
    );
  } else if (action === "dismiss") {
    message.status = "dismissed";
  } else if (action === "undo") {
    const draft = context.storyboardDraft(projectId);
    storyboardState.set(projectId, {
      ...draft,
      revision: draft.revision + 1,
      scenes: message.previousDraft.scenes,
    });
    message.status = "undone";
  }
  send(response_, 200, response(projectId, context));
  return true;
}
