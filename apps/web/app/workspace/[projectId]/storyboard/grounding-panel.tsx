"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  groundingCheckRequestSchema,
  groundingCheckResultResponseSchema,
  type GroundingCheckResultResponse,
} from "@avlp/schemas";
import { groundingStatusLabel } from "./grounding-input";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: GroundingCheckResultResponse }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function groundingIdempotencyKey(): string {
  return `grounding-ui:${Date.now().toString(36)}`;
}

/**
 * Grounding status panel for one storyboard scene. Displays the latest
 * grounding recheck summary and per-claim classification, and lets the teacher
 * run a background grounding check after edits. The check is paid and metered,
 * so it requires an explicit button press with an idempotency key.
 */
export function SceneGrounding({
  projectId,
  sceneId,
  lessonSpecId,
  lessonSpecRevision,
}: {
  projectId: string;
  sceneId: string;
  lessonSpecId: string;
  lessonSpecRevision: number;
}) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch(
        apiUrl(
          `/projects/${encodeURIComponent(projectId)}/grounding-checks/latest`,
        ),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = response.ok
        ? groundingCheckResultResponseSchema.safeParse(payload)
        : undefined;
      if (parsed === undefined || !parsed.success)
        throw new Error("grounding");
      setState({ kind: "ready", value: parsed.data });
    } catch {
      setState({
        kind: "failed",
        message: "Grounding status is unavailable.",
      });
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runCheck = useCallback(async () => {
    setSubmitting(true);
    try {
      const body = groundingCheckRequestSchema.parse({
        scope: "scene",
        sceneId,
        lessonSpecId,
        lessonSpecRevision,
      });
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/grounding-checks`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "idempotency-key": groundingIdempotencyKey(),
          },
          body: JSON.stringify(body),
          credentials: "include",
        },
      );
      if (!response.ok) throw new Error("grounding");
      setState({ kind: "ready", value: { check: null, latestJob: null } });
      window.setTimeout(() => void refresh(), 500);
    } catch {
      setState({
        kind: "failed",
        message: "The grounding check could not be started.",
      });
    } finally {
      setSubmitting(false);
    }
  }, [projectId, sceneId, lessonSpecId, lessonSpecRevision, refresh]);

  const claimsForScene = useMemo(() => {
    const check = state.kind === "ready" ? state.value.check : null;
    if (check === null) return [];
    const resultsByClaim = new Map(
      check.results.map((result) => [result.claimId, result]),
    );
    return check.claims
      .filter((claim) => claim.location.sceneId === sceneId)
      .map((claim) => ({ claim, result: resultsByClaim.get(claim.id) }));
  }, [state, sceneId]);

  if (state.kind === "loading")
    return <p role="status">Loading grounding status…</p>;

  if (state.kind === "failed")
    return (
      <section aria-label="Grounding" data-testid={`grounding-${sceneId}`}>
        <p role="alert">{state.message}</p>
      </section>
    );

  const { check, latestJob } = state.value;
  const running =
    latestJob !== null &&
    (latestJob.state === "queued" ||
      latestJob.state === "running" ||
      latestJob.state === "retry_wait");

  return (
    <section aria-label="Grounding" data-testid={`grounding-${sceneId}`}>
      <h4>Grounding</h4>

      {check === null ? (
        <p role="status">No grounding check has run for this lesson yet.</p>
      ) : (
        <>
          <p role="status" data-testid={`grounding-summary-${sceneId}`}>
            {check.summary.supported} supported · {check.summary.unsupported}{" "}
            unsupported · {check.summary.generatedAddition} generated ·{" "}
            {check.summary.needsReview} need review
          </p>
          {claimsForScene.length > 0 ? (
            <ul aria-label="Grounding results for this scene">
              {claimsForScene.map(({ claim, result }) => (
                <li key={claim.id} data-testid={`grounding-claim-${claim.id}`}>
                  <p>{claim.text}</p>
                  {result === undefined ? (
                    <p role="status">Not classified.</p>
                  ) : (
                    <p>
                      <strong>{groundingStatusLabel(result.status)}</strong>
                      {result.unsupportedSpans.length > 0 ? (
                        <span role="alert">
                          {" "}
                          — {result.unsupportedSpans.length} unsupported span
                          {result.unsupportedSpans.length > 1 ? "s" : ""}
                        </span>
                      ) : null}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p role="status">No claims from this scene were checked.</p>
          )}
        </>
      )}

      <button
        type="button"
        data-testid={`grounding-run-${sceneId}`}
        onClick={() => void runCheck()}
        disabled={submitting || running}
      >
        {submitting || running ? "Checking grounding…" : "Recheck grounding"}
      </button>
    </section>
  );
}
