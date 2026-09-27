/**
 * ST-106 — client helpers for the prompt-to-video ("one-shot") screens.
 *
 * Everything here is pure or a thin typed wrapper over ST-105's endpoints, so
 * the screens stay declarative and the rules (step grouping, deep links,
 * audience presets, form validation, poll backoff) are unit-tested once.
 *
 * The focus prompt is user content: it only ever travels in a request body.
 * It never goes into a URL, a query string, a log line or analytics.
 */

import {
  lessonFocusPromptMaxLength,
  type LessonAgeBand,
  type TargetDurationSeconds,
} from "@avlp/schemas";
import {
  oneShotEligibilitySchema,
  oneShotEstimateSchema,
  oneShotResponseSchema,
  type OneShotAttentionStage,
  type OneShotAudience,
  type OneShotEligibility,
  type OneShotEstimate,
  type OneShotResponse,
  type OneShotRunStatus,
  type OneShotRunView,
  type OneShotStep,
  type OneShotStepState,
} from "@avlp/schemas/one-shot";

export function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function projectPath(projectId: string, suffix: string): string {
  return `/projects/${encodeURIComponent(projectId)}/one-shot${suffix}`;
}

// ---------------------------------------------------------------------------
// Display steps
// ---------------------------------------------------------------------------

export type DisplayStepId =
  | "reading"
  | "planning"
  | "outline"
  | "narration"
  | "visuals"
  | "audio"
  | "checks";

export interface DisplayStepConfig {
  id: DisplayStepId;
  label: string;
  steps: readonly OneShotStep[];
}

/** The seven user-facing steps, each covering one or more server steps. */
export const displaySteps: readonly DisplayStepConfig[] = [
  {
    id: "reading",
    label: "Reading document",
    steps: ["ingestion", "source_snapshot"],
  },
  { id: "planning", label: "Planning", steps: ["configuration", "objectives"] },
  { id: "outline", label: "Outline", steps: ["outline"] },
  { id: "narration", label: "Narration", steps: ["narration"] },
  {
    id: "visuals",
    label: "Visuals",
    steps: ["storyboard", "illustrations", "grounding"],
  },
  { id: "audio", label: "Audio", steps: ["audio"] },
  { id: "checks", label: "Checks", steps: ["validation"] },
] as const;

export type DisplayStepState =
  "pending" | "running" | "done" | "attention" | "failed";

export interface DisplayStep {
  id: DisplayStepId;
  label: string;
  state: DisplayStepState;
}

/**
 * Folds the run's step records into the seven display steps. A display step is
 * `done` only when every server step it covers is done, so it never implies
 * completion the server has not confirmed.
 */
export function toDisplaySteps(
  run: Pick<OneShotRunView, "steps" | "currentStep" | "status">,
): DisplayStep[] {
  const stateOf = new Map<OneShotStep, OneShotStepState>(
    run.steps.map((entry) => [entry.step, entry.state]),
  );
  const pastApproval =
    run.status === "awaiting_render_approval" ||
    run.status === "rendering" ||
    run.status === "completed" ||
    (run.currentStep === "render" && run.status !== "cancelled");
  return displaySteps.map((config) => {
    const states = config.steps.map((step) => stateOf.get(step) ?? "pending");
    let state: DisplayStepState;
    if (states.includes("failed")) state = "failed";
    else if (states.includes("needs_attention")) state = "attention";
    else if (pastApproval || states.every((value) => value === "done"))
      state = "done";
    else if (
      states.includes("running") ||
      (run.currentStep !== null && config.steps.includes(run.currentStep))
    )
      state = "running";
    else if (states.some((value) => value === "done")) state = "running";
    else state = "pending";
    return { id: config.id, label: config.label, state };
  });
}

/** The single display step to announce, or null when nothing is running. */
export function currentDisplayStep(
  steps: readonly DisplayStep[],
): DisplayStep | null {
  return (
    steps.find((step) => step.state === "running") ??
    steps.find(
      (step) => step.state === "attention" || step.state === "failed",
    ) ??
    null
  );
}

// ---------------------------------------------------------------------------
// Run phases → views
// ---------------------------------------------------------------------------

export type RunView =
  | "request"
  | "progress"
  | "not_covered"
  | "attention"
  | "approval"
  | "delivery";

/** Which screen a run belongs on. `null` (no run) and `cancelled` go back to
 * the request form so the user can start again. */
export function viewForRun(run: OneShotRunView | null): RunView {
  if (run === null) return "request";
  switch (run.status) {
    case "queued":
    case "running":
      return "progress";
    case "awaiting_render_approval":
      return "approval";
    case "rendering":
    case "completed":
      return "delivery";
    case "cancelled":
      return "request";
    case "needs_attention":
    case "failed":
      if (run.needsAttention?.errorCode === "FOCUS_NOT_COVERED")
        return "not_covered";
      if (run.needsAttention?.errorCode === "RENDER_FAILED") return "delivery";
      return "attention";
  }
}

/** Statuses whose state changes on the server without a user action. */
export function isPollingStatus(status: OneShotRunStatus): boolean {
  return status === "queued" || status === "running" || status === "rendering";
}

export const pollInitialMs = 2_000;
export const pollMaxMs = 15_000;

/**
 * Backoff between polls: start at 2 s, grow 1.5× after every poll that saw no
 * change, capped at 15 s, and snap back to 2 s as soon as something moves.
 */
export function nextPollDelay(previousMs: number, changed: boolean): number {
  if (changed) return pollInitialMs;
  return Math.min(pollMaxMs, Math.round(previousMs * 1.5));
}

/** A cheap fingerprint of the parts of a run a poll cares about. */
export function runFingerprint(run: OneShotRunView | null): string {
  if (run === null) return "none";
  return [
    run.id,
    run.status,
    run.currentStep ?? "-",
    run.updatedAt,
    run.actualCostUsd,
    ...run.steps.map((entry) => `${entry.step}:${entry.state}`),
  ].join("|");
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

const wizardRouteByStage: Record<OneShotAttentionStage, string> = {
  ingestion: "upload",
  source_snapshot: "review",
  configuration: "configuration",
  objectives: "objectives",
  outline: "outline",
  narration: "narration",
  storyboard: "storyboard",
  illustrations: "storyboard",
  grounding: "storyboard",
  audio: "storyboard",
  validation: "preview",
  preview: "preview",
  render: "render",
};

const wizardLabelByRoute: Record<string, string> = {
  upload: "Source",
  review: "Review",
  configuration: "Setup",
  objectives: "Objectives",
  outline: "Outline",
  narration: "Narration",
  storyboard: "Storyboard",
  preview: "Preview",
  render: "Deliver",
};

/** The wizard page a stopped run asks the user to open. */
export function wizardLinkForStage(
  projectId: string,
  stage: OneShotAttentionStage,
): { href: string; label: string } {
  const route = wizardRouteByStage[stage];
  return {
    href: `/workspace/${encodeURIComponent(projectId)}/${route}`,
    label: wizardLabelByRoute[route] ?? "Editor",
  };
}

export function oneShotRunPath(projectId: string): string {
  return `/workspace/${encodeURIComponent(projectId)}/one-shot`;
}

/** The project id of a wizard route, or null outside one (and on the run
 * page itself, which needs no link back to itself). */
export function wizardProjectIdFromPath(
  pathname: string | null,
): string | null {
  if (pathname === null) return null;
  const match = /^\/workspace\/([^/]+)\/([^/]+)/.exec(pathname);
  if (match === null || match[2] === "one-shot") return null;
  try {
    return decodeURIComponent(match[1] ?? "");
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Request form
// ---------------------------------------------------------------------------

export type AudienceKind = "self" | "students" | "professional";
export const studentAgeBands = [
  "8-10",
  "11-13",
  "14-16",
] as const satisfies readonly LessonAgeBand[];
export type StudentAgeBand = (typeof studentAgeBands)[number];

export const audienceKindOptions: readonly {
  value: AudienceKind;
  label: string;
  description: string;
}[] = [
  {
    value: "self",
    label: "Myself (adult learner)",
    description: "Plain explanations for an adult new to the topic.",
  },
  {
    value: "students",
    label: "Students",
    description: "Pitched at the age band you choose.",
  },
  {
    value: "professional",
    label: "Professional",
    description: "Assumes solid prior knowledge and precise terms.",
  },
];

export const studentAgeBandLabels: Record<StudentAgeBand, string> = {
  "8-10": "Ages 8–10",
  "11-13": "Ages 11–13",
  "14-16": "Ages 14–16",
};

/** Maps the three plain-language choices onto the ST-104 audience contract. */
export function audienceFor(
  kind: AudienceKind,
  studentAgeBand: StudentAgeBand,
): OneShotAudience {
  switch (kind) {
    case "self":
      return {
        ageBand: "adult-intermediate",
        difficulty: "intermediate",
        tone: "friendly",
      };
    case "professional":
      return {
        ageBand: "adult-professional",
        difficulty: "advanced",
        tone: "friendly",
      };
    case "students":
      return {
        ageBand: studentAgeBand,
        difficulty:
          studentAgeBand === "14-16" ? "intermediate" : "introductory",
        tone: "friendly",
      };
  }
}

/** The reverse, to restore the form from a previous run. */
export function audienceKindFrom(audience: OneShotAudience): {
  kind: AudienceKind;
  studentAgeBand: StudentAgeBand;
} {
  if (audience.ageBand === "adult-professional")
    return { kind: "professional", studentAgeBand: "11-13" };
  if ((studentAgeBands as readonly string[]).includes(audience.ageBand))
    return {
      kind: "students",
      studentAgeBand: audience.ageBand as StudentAgeBand,
    };
  return { kind: "self", studentAgeBand: "11-13" };
}

export const durationOptions: readonly {
  minutes: 3 | 5 | 7;
  seconds: TargetDurationSeconds;
}[] = [
  { minutes: 3, seconds: 180 },
  { minutes: 5, seconds: 300 },
  { minutes: 7, seconds: 420 },
];

export const focusPromptMaxLength = lessonFocusPromptMaxLength;

export interface RequestFormValues {
  focusPrompt: string;
  audienceKind: AudienceKind | null;
  studentAgeBand: StudentAgeBand;
  targetDurationSeconds: TargetDurationSeconds;
}

export type RequestFormErrors = Partial<
  Record<"document" | "focusPrompt" | "audience" | "estimate", string>
>;

export function validateRequestForm(
  values: RequestFormValues,
  context: { documentReady: boolean; estimate: OneShotEstimate | null },
): RequestFormErrors {
  const errors: RequestFormErrors = {};
  if (!context.documentReady)
    errors.document = "Upload a PDF and wait for it to pass the checks.";
  const focus = values.focusPrompt.trim();
  if (focus.length === 0)
    errors.focusPrompt = "Describe what the video should explain.";
  else if (focus.length > focusPromptMaxLength)
    errors.focusPrompt = `Keep the description to ${focusPromptMaxLength.toLocaleString("en-US")} characters.`;
  if (values.audienceKind === null)
    errors.audience = "Choose who the video is for.";
  if (
    context.estimate === null ||
    context.estimate.targetDurationSeconds !== values.targetDurationSeconds
  )
    errors.estimate = "Wait for the cost estimate before creating the video.";
  return errors;
}

/** The key that makes Create video idempotent: stable while the request is
 * unchanged (so a double click or a retry replays the same run), new when any
 * input changes (the server rejects a reused key with a different body). */
export function requestSignature(
  values: RequestFormValues,
  estimateUsd: number,
): string {
  return JSON.stringify([
    values.focusPrompt.trim(),
    values.audienceKind,
    values.studentAgeBand,
    values.targetDurationSeconds,
    estimateUsd,
  ]);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return "< $0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

// ---------------------------------------------------------------------------
// Typed client
// ---------------------------------------------------------------------------

export class OneShotRequestError extends Error {
  public constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "OneShotRequestError";
  }
}

async function readError(response: Response, fallback: string): Promise<never> {
  const payload: unknown = await response.json().catch(() => null);
  const message =
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
      ? payload.error.message
      : fallback;
  throw new OneShotRequestError(message, response.status);
}

async function parsed<T>(
  response: Response,
  schema: {
    safeParse: (
      value: unknown,
    ) => { success: true; data: T } | { success: false };
  },
  fallback: string,
): Promise<T> {
  if (!response.ok) return readError(response, fallback);
  const result = schema.safeParse(await response.json().catch(() => null));
  if (!result.success) throw new OneShotRequestError(fallback, response.status);
  return result.data;
}

export async function fetchOneShot(
  projectId: string,
): Promise<OneShotResponse> {
  const response = await fetch(apiUrl(projectPath(projectId, "")), {
    credentials: "include",
    cache: "no-store",
  });
  return parsed(
    response,
    oneShotResponseSchema,
    "The run status could not be loaded.",
  );
}

export async function fetchEligibility(
  projectId: string,
): Promise<OneShotEligibility> {
  const response = await fetch(apiUrl(projectPath(projectId, "/eligibility")), {
    credentials: "include",
    cache: "no-store",
  });
  return parsed(
    response,
    oneShotEligibilitySchema,
    "Eligibility could not be checked.",
  );
}

export async function requestEstimate(
  projectId: string,
  targetDurationSeconds: TargetDurationSeconds,
  signal?: AbortSignal,
): Promise<OneShotEstimate> {
  const response = await fetch(apiUrl(projectPath(projectId, "/estimate")), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetDurationSeconds }),
    ...(signal === undefined ? {} : { signal }),
  });
  return parsed(
    response,
    oneShotEstimateSchema,
    "The cost estimate could not be loaded.",
  );
}

export async function startOneShotRun(
  projectId: string,
  input: {
    focusPrompt: string;
    audience: OneShotAudience;
    targetDurationSeconds: TargetDurationSeconds;
    acceptedEstimateUsd: number;
  },
  idempotencyKey: string,
): Promise<OneShotResponse> {
  const response = await fetch(apiUrl(projectPath(projectId, "")), {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    body: JSON.stringify(input),
  });
  return parsed(
    response,
    oneShotResponseSchema,
    "The video could not be started.",
  );
}

export async function postRunAction(
  projectId: string,
  action: "render" | "resume" | "cancel",
): Promise<OneShotResponse> {
  const response = await fetch(apiUrl(projectPath(projectId, `/${action}`)), {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const fallback =
    action === "render"
      ? "The render could not be started."
      : action === "resume"
        ? "The run could not be resumed."
        : "The run could not be cancelled.";
  return parsed(response, oneShotResponseSchema, fallback);
}

export function newIdempotencyKey(): string {
  return typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
