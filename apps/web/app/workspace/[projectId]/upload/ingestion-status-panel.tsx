"use client";

import React, { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startNavigationProgress } from "../../../../components/layout/navigation-progress-bar";
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
import { toast } from "../../../../components/ui/toast-provider";
import { useTaskStatusNotification } from "../../../../lib/use-task-notification";

type State =
  | { kind: "loading" }
  | { kind: "ready"; value: ProjectIngestionStatusResponse }
  | { kind: "failed"; message: string };

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

const activeJobStates = new Set(["queued", "running", "retry_wait"]);

/** Extraction is still running, so the panel keeps polling and shows progress. */
export function isIngestionActive(
  value: ProjectIngestionStatusResponse,
): boolean {
  return (
    value.latestJob !== null && activeJobStates.has(value.latestJob.state)
  );
}

/** The worker's own reported progress; never an invented animation. */
export function ingestionProgressPercent(
  value: ProjectIngestionStatusResponse,
): number | null {
  const job = value.latestJob;
  if (job === null || !activeJobStates.has(job.state)) return null;
  return Math.round(Math.min(1, Math.max(0, job.progress)) * 100);
}

type QualityFinding = NonNullable<
  ProjectIngestionStatusResponse["quality"]
>["findings"][number];

export type FindingSummary = {
  readonly code: QualityFinding["code"];
  readonly severity: QualityFinding["severity"];
  readonly count: number;
  readonly label: string;
  readonly pages: string;
};

const findingLabels: Readonly<Record<QualityFinding["code"], string>> = {
  unknown_block: "Content the parser could not classify",
  low_ocr_quality: "Low-confidence text from a scanned page",
  missing_caption: "Figure or table without a caption",
  malformed_table: "Incomplete table structure",
  malformed_media: "Figure image could not be read",
  uncertain_reading_order: "Uncertain reading order",
  duplicate_reading_order: "Repeated reading order",
  parser_failure: "The document could not be parsed",
};

/**
 * One row per finding kind. A long document can produce hundreds of findings;
 * listing them individually buried the ones a teacher can act on.
 */
export function summarizeFindings(
  findings: readonly QualityFinding[],
): FindingSummary[] {
  const groups = new Map<
    string,
    { finding: QualityFinding; count: number; first: number; last: number }
  >();
  for (const finding of findings) {
    const key = `${finding.severity}:${finding.code}`;
    const group = groups.get(key);
    const last = finding.pageEnd ?? finding.pageStart;
    if (group === undefined)
      groups.set(key, {
        finding,
        count: 1,
        first: finding.pageStart,
        last,
      });
    else {
      group.count += 1;
      group.first = Math.min(group.first, finding.pageStart);
      group.last = Math.max(group.last, last);
    }
  }
  return [...groups.values()]
    .sort(
      (left, right) =>
        Number(right.finding.severity === "blocking") -
          Number(left.finding.severity === "blocking") ||
        right.count - left.count,
    )
    .map((group) => ({
      code: group.finding.code,
      severity: group.finding.severity,
      count: group.count,
      label: findingLabels[group.finding.code],
      pages:
        group.first === group.last
          ? `page ${group.first}`
          : `pages ${group.first}–${group.last}`,
    }));
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
  if (jobState === "failed") return { status: "error", label: "Extraction failed" };
  if (jobState === "queued") return { status: "in_progress", label: "Queued" };
  if (jobState === "running") return { status: "in_progress", label: "Extracting content" };
  if (jobState === "retry_wait") return { status: "in_progress", label: "Waiting to retry" };

  const qualityStatus = value.quality?.status;
  if (qualityStatus === "blocked") return { status: "blocked", label: "Review blocked" };
  if (qualityStatus === "review_required") return { status: "warning", label: "Items to check" };
  if (qualityStatus === "ready") return { status: "success", label: "Ready for review" };

  return { status: "info", label: "Ingestion pending" };
}

function elapsedLabel(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export function IngestionStatusPanel({ projectId }: { projectId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const router = useRouter();
  const [openingReview, startOpeningReview] = useTransition();
  const [retrying, setRetrying] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const refresh = async (): Promise<ProjectIngestionStatusResponse | undefined> => {
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
      return parsed.data;
    } catch {
      setState({
        kind: "failed",
        message: "We could not refresh document status. Please try again.",
      });
      return undefined;
    }
  };

  // Extraction is a background job: poll while it runs, then stop. The previous
  // fixed 2s interval kept firing forever once the document was already ready.
  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;
    const tick = async (): Promise<void> => {
      const value = await refresh();
      if (cancelled) return;
      const active = value === undefined || isIngestionActive(value);
      // A settled document still gets a slow refresh so a retry elsewhere lands.
      timer = window.setTimeout(() => void tick(), active ? 2_000 : 30_000);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [projectId]);

  const retry = async (): Promise<void> => {
    setRetrying(true);
    const retryId = globalThis.crypto.randomUUID();
    const configurationVersion = `retry-${retryId}`;
    try {
      toast.info("Retrying document ingestion...");
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
      toast.info("Document ingestion retry queued.");
      await refresh();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "The document could not be retried.";
      setState({
        kind: "failed",
        message: msg,
      });
      toast.error(msg);
    } finally {
      setRetrying(false);
    }
  };

  const value = state.kind === "ready" ? state.value : undefined;

  useTaskStatusNotification({
    taskName: "Document ingestion",
    status: value?.latestJob?.state,
    successMessage: "Document ingestion completed. Ready to review content.",
    errorMessage:
      value?.latestJob?.errorCode ||
      "Document ingestion encountered an error during extraction.",
  });

  const canRetry =
    value?.latestJob?.state === "failed" ||
    value?.quality?.status === "blocked";

  const isReadyForReview =
    value?.canProceed ||
    value?.quality?.status === "ready" ||
    value?.quality?.status === "review_required";

  // Warm the review route's RSC payload as soon as the action becomes
  // available, so the click itself is not the first request for it.
  useEffect(() => {
    if (!isReadyForReview) return;
    router.prefetch(`/workspace/${projectId}/review`);
  }, [isReadyForReview, projectId, router]);

  const badge = value ? getIngestionStatusBadge(value) : null;
  const active = value !== undefined && isIngestionActive(value);
  const progress = value === undefined ? null : ingestionProgressPercent(value);
  const findings =
    value?.quality == null ? [] : summarizeFindings(value.quality.findings);

  // Extraction can take minutes; a stalled panel with no elapsed time reads as broken.
  useEffect(() => {
    if (!active) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1_000)),
      1_000,
    );
    return () => window.clearInterval(timer);
  }, [active]);

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

          {active && (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <div
                role="progressbar"
                aria-label="Document extraction progress"
                aria-valuemin={0}
                aria-valuemax={100}
                {...(progress === null ? {} : { "aria-valuenow": progress })}
                style={{
                  height: "6px",
                  borderRadius: "999px",
                  backgroundColor: "var(--color-surface-subtle)",
                  border: "1px solid var(--color-border)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress ?? 0}%`,
                    backgroundColor: "var(--color-brand)",
                    transition: "width 400ms ease",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "var(--color-text-muted)",
                }}
              >
                <span>
                  {progress === null
                    ? "Waiting for a worker"
                    : `${progress}% complete`}
                </span>
                <span>{elapsedLabel(elapsedSeconds)} elapsed</span>
              </div>
            </div>
          )}

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
                  Extraction quality score
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

              {findings.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "4px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 600, color: "var(--color-text-muted)" }}>
                    Items to check in review:
                  </span>
                  <ul
                    style={{
                      margin: 0,
                      padding: 0,
                      listStyle: "none",
                      fontSize: "13px",
                      color: "var(--color-text-muted)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                    }}
                  >
                    {findings.map((finding) => (
                      <li
                        key={`${finding.severity}-${finding.code}`}
                        style={{ display: "flex", alignItems: "baseline", gap: "8px" }}
                      >
                        <span
                          data-severity={finding.severity}
                          style={{
                            flex: "0 0 auto",
                            minWidth: "24px",
                            textAlign: "center",
                            padding: "1px 6px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color:
                              finding.severity === "blocking"
                                ? "var(--color-error-fg)"
                                : "var(--color-warning-fg)",
                            backgroundColor:
                              finding.severity === "blocking"
                                ? "var(--color-error-bg)"
                                : "var(--color-warning-bg)",
                          }}
                        >
                          {finding.count}
                        </span>
                        <span>
                          {finding.label}
                          <span style={{ opacity: 0.7 }}> · {finding.pages}</span>
                        </span>
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
                isLoading={openingReview}
                onClick={() => {
                  startNavigationProgress();
                  startOpeningReview(() => {
                    router.push(`/workspace/${projectId}/review`);
                  });
                }}
              >
                {openingReview ? (
                  "Opening review…"
                ) : (
                  <>
                    Review source <ArrowRight size={16} weight="bold" />
                  </>
                )}
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
