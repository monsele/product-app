"use client";

import React, { useEffect, useState } from "react";
import {
  ingestionRetryResponseSchema,
  projectIngestionStatusResponseSchema,
  type ProjectIngestionStatusResponse,
} from "@avlp/schemas";
import {
  ArrowsClockwise,
  ArrowRight,
  FileText,
} from "@phosphor-icons/react";
import { Button } from "../../../../components/ui/button";
import { Notice } from "../../../../components/ui/notice";
import { StatusLabel, type StatusType } from "../../../../components/ui/status-label";

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

export function getIngestionStatusBadge(value: ProjectIngestionStatusResponse): {
  status: StatusType;
  label: string;
} {
  const jobState = value.latestJob?.state;
  if (jobState === "failed") return { status: "error", label: "Extraction Failed" };
  if (jobState === "queued") return { status: "in_progress", label: "Queued" };
  if (jobState === "running") return { status: "in_progress", label: "Extracting Content" };
  if (jobState === "retry_wait") return { status: "in_progress", label: "Waiting to Retry" };

  const qualityStatus = value.quality?.status;
  if (qualityStatus === "blocked") return { status: "blocked", label: "Review Blocked" };
  if (qualityStatus === "review_required") return { status: "warning", label: "Items to Check" };
  if (qualityStatus === "ready") return { status: "success", label: "Ready for Review" };

  return { status: "info", label: "Ingestion Pending" };
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

  const isReadyForReview =
    value?.canProceed ||
    value?.quality?.status === "ready" ||
    value?.quality?.status === "review_required";

  const badge = value ? getIngestionStatusBadge(value) : null;

  return (
    <section
      aria-labelledby="ingestion-status-heading"
      style={{
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-card)",
        padding: "32px",
        display: "flex",
        flexDirection: "column",
        gap: "24px",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
        <div>
          <h2
            id="ingestion-status-heading"
            style={{
              margin: "0 0 6px 0",
              fontSize: "20px",
              fontWeight: 700,
              color: "var(--color-text)",
              letterSpacing: "-0.01em",
            }}
          >
            Document ingestion
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: "14px",
              color: "var(--color-text-muted)",
              lineHeight: "20px",
            }}
          >
            Structured text extraction, figure detection, and section analysis.
          </p>
        </div>

        {badge && (
          <StatusLabel status={badge.status} label={badge.label} />
        )}
      </div>

      {state.kind === "loading" && (
        <div style={{ padding: "16px 0", color: "var(--color-text-muted)", fontSize: "14px" }}>
          <p role="status">Loading document status…</p>
        </div>
      )}

      {state.kind === "failed" && (
        <Notice
          type="error"
          title="Status unavailable"
          message={state.message}
          actionLabel="Refresh"
          onAction={() => void refresh()}
        />
      )}

      {value && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Main Status Message */}
          <div
            style={{
              padding: "16px 20px",
              borderRadius: "var(--radius-control)",
              backgroundColor: "var(--color-surface-subtle)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <FileText size={22} weight="duotone" color="var(--color-brand)" />
            <p
              role="status"
              style={{
                margin: 0,
                fontSize: "14px",
                color: "var(--color-text)",
                lineHeight: "20px",
              }}
            >
              {ingestionStatusMessage(value)}
            </p>
          </div>

          {/* Quality Score & Findings */}
          {value.quality !== null && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                padding: "16px 20px",
                borderRadius: "var(--radius-control)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-surface)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text)" }}>
                  Extraction Quality Score
                </span>
                <span
                  style={{
                    fontSize: "14px",
                    fontWeight: 700,
                    color: value.quality.score >= 80 ? "var(--color-success-fg)" : "var(--color-warning-fg)",
                  }}
                >
                  {value.quality.score}/100
                </span>
              </div>

              {value.quality.findings && value.quality.findings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                    Items to check in review:
                  </span>
                  <ul
                    style={{
                      margin: 0,
                      paddingLeft: "20px",
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    {value.quality.findings.map((finding, index) => (
                      <li key={`${finding.code}-${finding.pageStart}-${index}`}>
                        {finding.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Row */}
          <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
            {isReadyForReview && (
              <Button
                variant="primary"
                onClick={() => {
                  window.location.assign(`/workspace/${projectId}/review`);
                }}
              >
                Review source <ArrowRight size={16} weight="bold" />
              </Button>
            )}

            {canRetry && (
              <Button
                variant="secondary"
                disabled={retrying}
                onClick={() => void retry()}
              >
                {retrying ? (
                  "Retrying…"
                ) : (
                  <>
                    <ArrowsClockwise size={16} weight="bold" /> Retry document ingestion
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
