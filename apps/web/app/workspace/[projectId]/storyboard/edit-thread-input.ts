import {
  editPlanConflictDetailsSchema,
  editThreadResponseSchema,
  type EditPlanFieldValue,
  type EditThreadMessage,
  type EditThreadMessageStatus,
  type EditThreadOperationProgress,
  type EditThreadPlanOperation,
  type EditThreadResponse,
  type EditThreadScope,
  type EditThreadScopeKind,
} from "@avlp/schemas";

/**
 * ST-115. Pure presentation and request helpers for the "Ask for changes"
 * panel. Every label here describes real thread state from the API; nothing
 * is inferred or animated without a backing status (design.md §8.5).
 */

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export type EditThreadSceneOption = Readonly<{
  sceneId: string;
  order: number;
  title: string | null;
}>;

/** The request scope the switcher describes, or null when it names nothing. */
export function buildEditScope(
  kind: EditThreadScopeKind,
  selectedSceneId: string | null,
  checkedSceneIds: readonly string[],
): EditThreadScope | null {
  if (kind === "lesson") return { kind, sceneIds: [] };
  if (kind === "scene")
    return selectedSceneId === null
      ? null
      : { kind, sceneIds: [selectedSceneId] };
  return checkedSceneIds.length === 0
    ? null
    : { kind, sceneIds: [...checkedSceneIds].slice(0, 8) };
}

function sceneName(
  sceneId: string,
  scenes: readonly EditThreadSceneOption[],
): string {
  const scene = scenes.find((entry) => entry.sceneId === sceneId);
  return scene === undefined ? "a removed scene" : `scene ${scene.order}`;
}

/** The composer's label names its scope (design.md §8.10). */
export function editScopeLabel(
  scope: EditThreadScope | null,
  scenes: readonly EditThreadSceneOption[],
): string {
  if (scope === null) return "Choose the scenes to change";
  if (scope.kind === "lesson") return "Describe how to revise the whole lesson";
  if (scope.sceneIds.length === 1)
    return `Describe how to revise ${sceneName(scope.sceneIds[0]!, scenes)}`;
  return `Describe how to revise ${scope.sceneIds.length} selected scenes`;
}

/** Short scope tag shown on each teacher message in the thread. */
export function editScopeTag(
  scope: EditThreadScope,
  scenes: readonly EditThreadSceneOption[],
): string {
  if (scope.kind === "lesson") return "Whole lesson";
  if (scope.sceneIds.length === 1) {
    const name = sceneName(scope.sceneIds[0]!, scenes);
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return `${scope.sceneIds.length} scenes`;
}

export function editMessageStatusLabel(status: EditThreadMessageStatus): string {
  switch (status) {
    case "sent":
      return "Sent";
    case "planning":
      return "Planning your change…";
    case "proposed":
      return "Proposed — nothing has changed yet";
    case "answered":
      return "Answer";
    case "applying":
      return "Applying…";
    case "applied":
      return "Applied";
    case "partly_applied":
      return "Partly applied";
    case "dismissed":
      return "Dismissed";
    case "undone":
      return "Undone";
    case "failed":
      return "Couldn't plan that change";
  }
}

const regenerationModeLabels: Record<string, string> = {
  simplify: "Simplify",
  shorten: "Shorten",
  "improve-visual": "Improve the visual",
  regenerate: "Regenerate",
  expand: "Expand",
};

/** One line naming what an operation does, e.g. "Scene 3 · Simplify". */
export function editOperationTitle(entry: EditThreadPlanOperation): string {
  const { operation, display } = entry;
  const scene =
    display.sceneOrder === null ? "Lesson" : `Scene ${display.sceneOrder}`;
  switch (operation.type) {
    case "regenerate-scene":
      return `${scene} · ${regenerationModeLabels[operation.mode] ?? operation.mode}`;
    case "regenerate-narration-block":
      return `${scene} narration · ${regenerationModeLabels[operation.mode] ?? operation.mode}`;
    case "edit-scene-field":
      return `${scene} · ${display.fieldLabel ?? operation.path}`;
    case "reorder-scenes":
      return "Reorder scenes";
    case "answer-only":
      return "Answer";
  }
}

/** A field value as the teacher reads it in a diff. */
export function formatEditValue(value: EditPlanFieldValue | null): string {
  if (value === null) return "(empty)";
  if (Array.isArray(value))
    return value.length === 0 ? "(empty)" : value.join(" / ");
  const text = String(value);
  return text.trim() === "" ? "(empty)" : text;
}

/** Whether the operation is reviewed as a generated before/after candidate. */
export function isGeneratedOperation(entry: EditThreadPlanOperation): boolean {
  return (
    entry.operation.type === "regenerate-scene" ||
    entry.operation.type === "regenerate-narration-block"
  );
}

export function editOperationStateLabel(
  progress: EditThreadOperationProgress | undefined,
): string | null {
  switch (progress?.state) {
    case undefined:
    case "proposed":
      return null;
    case "applied":
      return "Applied";
    case "queued":
      return "Generating a version to review…";
    case "ready":
      return "Ready to review";
    case "failed":
      return "Not applied";
    case "skipped":
      return "Not applied";
  }
}

/** Operations the teacher can apply (an answer has nothing to apply). */
export function actionableOperations(
  message: EditThreadMessage,
): readonly EditThreadPlanOperation[] {
  return (message.plan?.operations ?? []).filter(
    ({ operation }) => operation.type !== "answer-only",
  );
}

/** The answer text of an answer-only plan, or null. */
export function editPlanAnswer(message: EditThreadMessage): string | null {
  const answer = message.plan?.operations.find(
    ({ operation }) => operation.type === "answer-only",
  );
  return answer?.operation.type === "answer-only"
    ? answer.operation.answer
    : null;
}

/** Whether the thread still has work the server is doing for it. */
export function editThreadNeedsPolling(
  thread: EditThreadResponse | null,
): boolean {
  return (
    thread?.messages.some(
      (message) =>
        message.status === "planning" ||
        message.status === "applying" ||
        message.operations.some((operation) => operation.state === "queued"),
    ) ?? false
  );
}

/** Generated operations that became reviewable between two thread reads. */
export function newlyReadyOperations(
  previous: EditThreadResponse | null,
  next: EditThreadResponse,
): readonly { message: EditThreadMessage; operationId: string }[] {
  const before = new Map(
    (previous?.messages ?? []).flatMap((message) =>
      message.operations.map((operation) => [
        `${message.id}:${operation.operationId}`,
        operation.state,
      ]),
    ),
  );
  return next.messages.flatMap((message) =>
    message.operations
      .filter(
        (operation) =>
          operation.state === "ready" &&
          before.get(`${message.id}:${operation.operationId}`) === "queued",
      )
      .map((operation) => ({ message, operationId: operation.operationId })),
  );
}

/** A plan's remaining-scene note (AC2), or null when nothing was left. */
export function remainingScenesNote(message: EditThreadMessage): string | null {
  const count = message.plan?.remainingSceneIds.length ?? 0;
  if (count === 0) return null;
  return `${count} more scene${count === 1 ? " was" : "s were"} left for a follow-up request. Ask again to continue.`;
}

export class EditThreadRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
    public readonly replan: boolean,
  ) {
    super(message);
    this.name = "EditThreadRequestError";
  }
}

async function readThread(
  response: Response,
  fallback: string,
): Promise<EditThreadResponse> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) {
    const parsed = editThreadResponseSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
    throw new EditThreadRequestError(fallback, response.status, false);
  }
  const error =
    typeof payload === "object" && payload !== null && "error" in payload
      ? (payload as { error?: { message?: unknown; details?: unknown } }).error
      : undefined;
  const message =
    typeof error?.message === "string" ? error.message : fallback;
  const replan = editPlanConflictDetailsSchema.safeParse(error?.details).success;
  throw new EditThreadRequestError(message, response.status, replan);
}

/**
 * The thread as shown: earlier pages the teacher opened plus the latest page,
 * one entry per message in thread order. The latest read of a message wins,
 * so a page loaded before new turns arrived never hides or stales one.
 */
export function mergeThreadMessages(
  earlier: readonly EditThreadMessage[],
  latest: readonly EditThreadMessage[],
): readonly EditThreadMessage[] {
  const byId = new Map<string, EditThreadMessage>();
  for (const message of [...earlier, ...latest]) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => left.seq - right.seq);
}

export async function fetchEditThread(
  projectId: string,
  before?: number,
): Promise<EditThreadResponse> {
  const query = before === undefined ? "" : `?before=${before}`;
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(projectId)}/edit-thread/messages${query}`,
    ),
    { credentials: "include", cache: "no-store" },
  );
  return readThread(response, "The change requests could not be loaded.");
}

export async function sendEditRequest(input: {
  projectId: string;
  text: string;
  scope: EditThreadScope;
  expectedRevision: number;
  idempotencyKey: string;
}): Promise<EditThreadResponse> {
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(input.projectId)}/edit-thread/messages`,
    ),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        "idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        text: input.text,
        scope: input.scope,
        expectedRevision: input.expectedRevision,
      }),
    },
  );
  return readThread(response, "Your request could not be sent.");
}

export async function postPlanAction(input: {
  projectId: string;
  planId: string;
  action: "apply" | "dismiss" | "undo";
  body: Record<string, unknown>;
}): Promise<EditThreadResponse> {
  const response = await fetch(
    apiUrl(
      `/projects/${encodeURIComponent(input.projectId)}/edit-thread/plans/${encodeURIComponent(input.planId)}/${input.action}`,
    ),
    {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input.body),
    },
  );
  return readThread(
    response,
    input.action === "apply"
      ? "This plan could not be applied."
      : input.action === "undo"
        ? "This change could not be undone."
        : "This plan could not be dismissed.",
  );
}

/** Starter requests near the field (design.md §8.10). */
export const editRequestSuggestions = [
  "Make this simpler",
  "Make the on-screen text shorter",
  "Use a gentler transition",
] as const;
