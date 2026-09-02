"use client";

import React, { useCallback, useEffect, useState, type JSX } from "react";
import {
  ArrowClockwise,
  Check,
  ImageSquare,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";

type Candidate = {
  id: string;
  slot: string;
  assetId: string | null;
  status: string;
  moderationStatus: string;
  provenance: "ai_generated";
  previewUrl: string | null;
};
const apiUrl = (path: string) =>
  `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;

/** Statuses the worker and API write for a candidate. */
const inFlightStatuses = new Set(["queued", "generating"]);

function statusPresentation(status: string): {
  label: string;
  color: string;
  background: string;
  border: string;
} {
  switch (status) {
    case "queued":
      return {
        label: "Queued",
        color: "#BDB5C7",
        background: "rgba(189, 181, 199, 0.12)",
        border: "rgba(189, 181, 199, 0.28)",
      };
    case "generating":
      return {
        label: "Generating",
        color: "#C4B5FD",
        background: "rgba(168, 131, 255, 0.14)",
        border: "rgba(168, 131, 255, 0.32)",
      };
    case "pending_review":
      return {
        label: "Needs your review",
        color: "#FCD34D",
        background: "rgba(180, 132, 24, 0.16)",
        border: "rgba(180, 132, 24, 0.34)",
      };
    case "accepted":
      return {
        label: "In use",
        color: "#86EFAC",
        background: "rgba(23, 107, 70, 0.18)",
        border: "rgba(23, 107, 70, 0.34)",
      };
    case "rejected":
      return {
        label: "Rejected",
        color: "#BDB5C7",
        background: "rgba(189, 181, 199, 0.10)",
        border: "rgba(189, 181, 199, 0.24)",
      };
    case "failed":
      return {
        label: "Failed",
        color: "#FCA5A5",
        background: "rgba(180, 35, 24, 0.16)",
        border: "rgba(180, 35, 24, 0.34)",
      };
    default:
      return {
        label: status,
        color: "#BDB5C7",
        background: "rgba(189, 181, 199, 0.12)",
        border: "rgba(189, 181, 199, 0.28)",
      };
  }
}

const controlBase: React.CSSProperties = {
  borderRadius: "6px",
  fontSize: "13px",
  padding: "8px 10px",
  boxSizing: "border-box",
  outline: "none",
};

/** Explicit, bounded teacher workflow for AI illustration candidates. */
export function IllustrationCandidatePanel({
  projectId,
  sceneId,
  sceneRevision,
  storyboardRevision,
  slots,
  disabled,
  onChanged,
}: {
  projectId: string;
  sceneId: string;
  sceneRevision: number;
  storyboardRevision: number;
  slots: readonly string[];
  disabled: boolean;
  onChanged: () => void;
}): JSX.Element | null {
  const [candidates, setCandidates] = useState<readonly Candidate[]>([]);
  const [slot, setSlot] = useState(slots[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const reload = useCallback(async () => {
    const response = await fetch(
      apiUrl(
        `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/illustration-candidates`,
      ),
      { credentials: "include", cache: "no-store" },
    );
    if (response.ok)
      setCandidates(
        ((await response.json()) as { candidates: Candidate[] }).candidates,
      );
  }, [projectId, sceneId]);
  useEffect(() => {
    void reload();
  }, [reload]);

  // Generation runs on a worker. Without this the card sits on "Generating"
  // until something else happens to re-render the panel.
  const awaitingResult = candidates.some((candidate) =>
    inFlightStatuses.has(candidate.status),
  );
  useEffect(() => {
    if (!awaitingResult) return;
    const timer = window.setInterval(() => void reload(), 4_000);
    return () => window.clearInterval(timer);
  }, [awaitingResult, reload]);

  if (slots.length === 0) return null;
  const act = async (path: string, body: object) => {
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(apiUrl(path), {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok)
        throw new Error("Illustration action failed. Refresh and try again.");
      await reload();
      onChanged();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Illustration action failed.",
      );
    } finally {
      setBusy(false);
    }
  };

  const generateDisabled = disabled || busy || slot === "";

  return (
    <section
      aria-label="AI illustration candidates"
      data-testid="illustration-candidates"
      style={{ display: "flex", flexDirection: "column", gap: "12px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "8px",
          borderBottom: "1px solid var(--color-border, #3A3046)",
          paddingBottom: "8px",
        }}
      >
        <h4
          style={{
            margin: 0,
            display: "flex",
            alignItems: "center",
            gap: "6px",
            fontSize: "14px",
            fontWeight: 600,
            color: "var(--color-text, #F4F1F8)",
          }}
        >
          <Sparkle size={15} weight="fill" aria-hidden />
          AI illustration
        </h4>
        {candidates.length > 0 ? (
          <span
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            {candidates.length}{" "}
            {candidates.length === 1 ? "candidate" : "candidates"}
          </span>
        ) : null}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "12px",
          lineHeight: 1.5,
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        AI-generated illustrations are private and require your review before
        use.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <label
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "4px",
            minWidth: 0,
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          Asset slot
          <select
            value={slot}
            onChange={(event) => setSlot(event.target.value)}
            disabled={disabled || busy}
            style={{
              ...controlBase,
              width: "100%",
              backgroundColor: "var(--color-surface, #211A2B)",
              border: "1px solid var(--color-border, #3A3046)",
              color: "var(--color-text, #F4F1F8)",
              fontWeight: 500,
              cursor: disabled || busy ? "not-allowed" : "pointer",
              opacity: disabled || busy ? 0.6 : 1,
            }}
          >
            {slots.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={generateDisabled}
          onClick={() =>
            void act(
              `/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}/assets/${encodeURIComponent(slot)}/generate`,
              {
                useCase: "conceptual-supporting-illustration",
                expectedSceneRevision: sceneRevision,
                idempotencyKey: globalThis.crypto.randomUUID(),
              },
            )
          }
          style={{
            ...controlBase,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
            width: "100%",
            padding: "8px 14px",
            backgroundColor: "transparent",
            border: "1px solid var(--color-brand, #A883FF)",
            color: "var(--color-brand, #A883FF)",
            fontWeight: 600,
            whiteSpace: "nowrap",
            cursor: generateDisabled ? "not-allowed" : "pointer",
            opacity: generateDisabled ? 0.5 : 1,
          }}
        >
          <Sparkle size={14} weight="bold" aria-hidden />
          {busy ? "Starting…" : "Generate illustration"}
        </button>
      </div>

      {message !== null ? (
        <p
          role="alert"
          style={{
            margin: 0,
            display: "flex",
            alignItems: "flex-start",
            gap: "6px",
            padding: "8px 12px",
            borderRadius: "6px",
            fontSize: "12px",
            lineHeight: 1.5,
            backgroundColor: "rgba(180, 35, 24, 0.15)",
            border: "1px solid rgba(180, 35, 24, 0.3)",
            color: "#FCA5A5",
          }}
        >
          <Warning size={14} weight="fill" aria-hidden style={{ flexShrink: 0, marginTop: "1px" }} />
          {message}
        </p>
      ) : null}

      {candidates.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "6px",
            padding: "20px 12px",
            borderRadius: "8px",
            border: "1px dashed var(--color-border, #3A3046)",
            textAlign: "center",
          }}
        >
          <ImageSquare
            size={20}
            weight="light"
            aria-hidden
            style={{ color: "var(--color-text-muted, #BDB5C7)" }}
          />
          <p
            style={{
              margin: 0,
              fontSize: "12px",
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            No candidates yet. Pick a slot and generate one to review.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "grid",
            gap: "8px",
          }}
        >
          {candidates.map((candidate) => {
            const presentation = statusPresentation(candidate.status);
            const inFlight = inFlightStatuses.has(candidate.status);
            return (
              <li
                key={candidate.id}
                style={{
                  display: "flex",
                  gap: "10px",
                  padding: "8px",
                  borderRadius: "8px",
                  border: "1px solid var(--color-border, #3A3046)",
                  backgroundColor: "var(--color-surface, #211A2B)",
                }}
              >
                <div
                  style={{
                    position: "relative",
                    flexShrink: 0,
                    width: "56px",
                    height: "56px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    border: "1px solid var(--color-border, #3A3046)",
                    backgroundColor: "rgba(0, 0, 0, 0.25)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {candidate.previewUrl !== null ? (
                    <img
                      alt={`AI illustration for the ${candidate.slot} slot`}
                      src={candidate.previewUrl}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  ) : (
                    <ImageSquare
                      size={18}
                      weight="light"
                      aria-hidden
                      style={{ color: "var(--color-text-muted, #BDB5C7)" }}
                    />
                  )}
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "6px",
                    minWidth: 0,
                    flex: 1,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                      flexWrap: "wrap",
                    }}
                  >
                    <code
                      style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "var(--color-text, #F4F1F8)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {candidate.slot}
                    </code>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "4px",
                        padding: "1px 7px",
                        borderRadius: "999px",
                        fontSize: "10.5px",
                        fontWeight: 600,
                        color: presentation.color,
                        backgroundColor: presentation.background,
                        border: `1px solid ${presentation.border}`,
                      }}
                    >
                      {inFlight ? (
                        <ArrowClockwise size={10} weight="bold" aria-hidden />
                      ) : null}
                      {presentation.label}
                    </span>
                  </div>

                  {candidate.status === "pending_review" ? (
                    <div style={{ display: "flex", gap: "6px" }}>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            `/projects/${encodeURIComponent(projectId)}/illustration-candidates/${encodeURIComponent(candidate.id)}/accept`,
                            {
                              expectedSceneRevision: sceneRevision,
                              expectedStoryboardRevision: storyboardRevision,
                            },
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: "var(--color-brand, #A883FF)",
                          border: "none",
                          color: "var(--color-on-brand, #1B1027)",
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <Check size={12} weight="bold" aria-hidden />
                        Use this
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            `/projects/${encodeURIComponent(projectId)}/illustration-candidates/${encodeURIComponent(candidate.id)}/reject`,
                            {
                              expectedSceneRevision: sceneRevision,
                              expectedStoryboardRevision: storyboardRevision,
                            },
                          )
                        }
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "4px",
                          padding: "5px 10px",
                          borderRadius: "6px",
                          fontSize: "12px",
                          fontWeight: 600,
                          backgroundColor: "transparent",
                          border: "1px solid var(--color-border, #3A3046)",
                          color: "var(--color-text-muted, #BDB5C7)",
                          cursor: busy ? "not-allowed" : "pointer",
                          opacity: busy ? 0.6 : 1,
                        }}
                      >
                        <X size={12} weight="bold" aria-hidden />
                        Discard
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
