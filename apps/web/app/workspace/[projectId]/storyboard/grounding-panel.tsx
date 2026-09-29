"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  groundingCheckRequestSchema,
  groundingCheckResultResponseSchema,
  type GroundingCheckResultResponse,
} from "@avlp/schemas";
import {
  groundingCheckMatchesLesson,
  groundingReviewStatus,
  groundingStatusLabel,
} from "./grounding-input";

export function GroundingClaimExplanation({
  text,
  spans,
}: {
  text: string;
  spans: ReadonlyArray<{ start: number; end: number; reason: string }>;
}) {
  if (spans.length === 0) return null;
  return (
    <ul aria-label="Why this claim was flagged">
      {spans.map((span, index) => (
        <li key={`${span.start}-${span.end}-${index}`}>
          <q>{text.slice(span.start, span.end)}</q>: {span.reason}
        </li>
      ))}
    </ul>
  );
}

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
      if (parsed === undefined || !parsed.success) throw new Error("grounding");
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
  }, [refresh, lessonSpecId, lessonSpecRevision]);

  useEffect(() => {
    if (
      state.kind !== "ready" ||
      state.value.latestJob === null ||
      !["queued", "running", "retry_wait"].includes(state.value.latestJob.state)
    )
      return;
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [refresh, state]);

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
      .map((claim) => {
        const result = resultsByClaim.get(claim.id);
        return { claim, result: result === undefined ? undefined : {
          ...result, status: groundingReviewStatus(result),
        } };
      });
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
  const stale =
    check !== null &&
    !groundingCheckMatchesLesson(check, lessonSpecId, lessonSpecRevision);
  const running =
    latestJob !== null &&
    (latestJob.state === "queued" ||
      latestJob.state === "running" ||
      latestJob.state === "retry_wait");

  return (
    <section aria-label="Grounding" data-testid={`grounding-${sceneId}`}>
      <h4>Grounding</h4>
      <p>
        Claim review notes do not block rendering. To change a flagged claim,
        edit the scene's narration or on-screen text, then recheck grounding.
        Missing or invalid source references must be fixed before rendering.
      </p>
      {stale ? (
        <p role="status">
          These results belong to an earlier lesson revision. Recheck grounding
          to assess the current text.
        </p>
      ) : null}
      {latestJob?.state === "failed" ? (
        <p role="status">
          The latest grounding check could not finish. You can recheck it here.
        </p>
      ) : null}

      {check === null ? (
        <p role="status">
          {running
            ? "Checking grounding. This can take a few minutes for a long lesson."
            : "No grounding check has run for this lesson yet."}
        </p>
      ) : (
        <>
          <p role="status" data-testid={`grounding-summary-${sceneId}`}>
            {
              claimsForScene.filter(
                ({ result }) => result?.status === "supported",
              ).length
            }{" "}
            supported ·{" "}
            {
              claimsForScene.filter(
                ({ result }) => result?.status === "unsupported",
              ).length
            }{" "}
            unsupported ·{" "}
            {
              claimsForScene.filter(
                ({ result }) => result?.status === "generated_addition",
              ).length
            }{" "}
            generated ·{" "}
            {
              claimsForScene.filter(
                ({ result }) => result?.status === "needs_review",
              ).length
            }{" "}
            need review in this scene
          </p>
          {claimsForScene.length > 0 ? (
            <ul aria-label="Grounding results for this scene">
              {claimsForScene.map(({ claim, result }) => (
                <li key={claim.id} data-testid={`grounding-claim-${claim.id}`}>
                  <p>{claim.text}</p>
                  <p>
                    {claim.location.type === "on_screen_text"
                      ? "On-screen text"
                      : "Narration"}
                  </p>
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
                  {result === undefined ? null : (
                    <GroundingClaimExplanation
                      text={claim.text}
                      spans={result.unsupportedSpans}
                    />
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
