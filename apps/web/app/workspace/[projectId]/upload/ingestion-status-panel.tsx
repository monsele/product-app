"use client";

import { useEffect, useState } from "react";
import {
  ingestionRetryResponseSchema,
  projectIngestionStatusResponseSchema,
  type ProjectIngestionStatusResponse,
} from "@avlp/schemas";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: ProjectIngestionStatusResponse }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export function ingestionStatusMessage(
  value: ProjectIngestionStatusResponse,
): string {
  if (value.latestJob?.state === "failed")
    return "We could not finish reading your document. You can retry safely.";
  if (
    value.latestJob?.state === "queued" ||
    value.latestJob?.state === "running" ||
    value.latestJob?.state === "retry_wait"
  )
    return "Reading your document. This page will update automatically.";
  if (value.quality?.status === "blocked")
    return "Review is required before this document can be used to create a lesson.";
  if (value.quality?.status === "review_required")
    return "Your document is ready for review, with items to check.";
  if (value.quality?.status === "ready")
    return "Your document is ready for review.";
  return "Waiting for document ingestion to start.";
}

export function IngestionStatusPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [retrying, setRetrying] = useState(false);
  const refresh = async (): Promise<void> => {
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/ingestion`),
        { credentials: "include", cache: "no-store" },
      );
      const payload: unknown = await response.json().catch(() => null);
      const parsed = response.ok
        ? projectIngestionStatusResponseSchema.safeParse(payload)
        : undefined;
      if (parsed === undefined || !parsed.success)
        throw new Error("Unable to refresh document status.");
      setState({ kind: "ready", value: parsed.data });
    } catch {
      setState({
        kind: "failed",
        message: "We could not refresh document status. Please try again.",
      });
    }
  };
  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => window.clearInterval(timer);
  }, [projectId]);
  const retry = async (): Promise<void> => {
    setRetrying(true);
    const retryId = globalThis.crypto.randomUUID();
    const configurationVersion = `retry-${retryId}`;
    try {
      const response = await fetch(
        apiUrl(`/projects/${encodeURIComponent(projectId)}/ingestion/retry`),
        {
          method: "POST",
          credentials: "include",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `ingestion-retry:${retryId}`,
          },
          body: JSON.stringify({ configurationVersion }),
        },
      );
      const payload: unknown = await response.json().catch(() => null);
      if (
        !response.ok ||
        !ingestionRetryResponseSchema.safeParse(payload).success
      )
        throw new Error("The document could not be retried. Please try again.");
      await refresh();
    } catch (error) {
      setState({
        kind: "failed",
        message:
          error instanceof Error
            ? error.message
            : "The document could not be retried.",
      });
    } finally {
      setRetrying(false);
    }
  };
  const value = state.kind === "ready" ? state.value : undefined;
  const canRetry =
    value?.latestJob?.state === "failed" ||
    value?.quality?.status === "blocked";
  return (
    <section aria-labelledby="ingestion-status-heading">
      <h2 id="ingestion-status-heading">Document ingestion</h2>
      {state.kind === "loading" ? (
        <p role="status">Loading document status.</p>
      ) : null}
      {state.kind === "failed" ? <p role="alert">{state.message}</p> : null}
      {value === undefined ? null : (
        <>
          <p role="status">{ingestionStatusMessage(value)}</p>
          {value.quality === null ? null : (
            <p>Quality score: {value.quality.score}/100</p>
          )}
          {value.quality?.findings.length ? (
            <ul>
              {value.quality.findings.map((finding, index) => (
                <li key={`${finding.code}-${finding.pageStart}-${index}`}>
                  {finding.message}
                </li>
              ))}
            </ul>
          ) : null}
          {canRetry ? (
            <button
              type="button"
              disabled={retrying}
              onClick={() => void retry()}
            >
              {retrying ? "Retrying…" : "Retry document ingestion"}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
