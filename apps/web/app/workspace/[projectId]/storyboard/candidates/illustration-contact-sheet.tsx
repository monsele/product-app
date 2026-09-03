"use client";

import React, { type JSX } from "react";
import {
  ArrowClockwise,
  Check,
  ImageSquare,
  Info,
  Prohibit,
  Sparkle,
  Warning,
  X,
} from "@phosphor-icons/react";

export type ContactSheetVisualRole =
  | "grounding_critical"
  | "source_derived"
  | "decorative";

export type ContactSheetCandidate = {
  id: string;
  jobId: string | null;
  status: string;
  moderationStatus: string;
  provenance: "ai_generated";
  provider: string;
  promptVersion: string;
  previewUrl: string | null;
  altText: string;
  costUsd: number | null;
  failureCode: string | null;
  selectable: boolean;
  blockedReason: string | null;
  blockedDetail: string | null;
};

export type ContactSheetSlot = {
  slot: string;
  visualRole: ContactSheetVisualRole;
  visualRolePermits: string;
  required: boolean;
  candidates: readonly ContactSheetCandidate[];
};

export type ContactSheetAdvisory = {
  code: string;
  message: string;
  source: "deterministic" | "model_assisted";
  rulesetVersion: string;
  model: string | null;
};

export type ContactSheetScene = {
  sceneId: string;
  order: number;
  title: string | null;
  template: string;
  sceneRevision: number;
  advisories: readonly ContactSheetAdvisory[];
  slots: readonly ContactSheetSlot[];
};

export type ContactSheetDecision = {
  candidateId: string;
  sceneId: string;
  sceneRevision: number;
};

/** Statuses the illustration pipeline writes for a candidate. */
function statusPresentation(status: string): { label: string; color: string } {
  switch (status) {
    case "queued":
      return { label: "Queued", color: "var(--color-text-muted, #BDB5C7)" };
    case "generating":
      return { label: "Generating", color: "#C4B5FD" };
    case "pending_review":
      return { label: "Needs your review", color: "#FCD34D" };
    case "accepted":
      return { label: "In use", color: "#86EFAC" };
    case "rejected":
      return { label: "Discarded", color: "var(--color-text-muted, #BDB5C7)" };
    case "failed":
      return { label: "Failed", color: "#FCA5A5" };
    default:
      return { label: status, color: "var(--color-text-muted, #BDB5C7)" };
  }
}

const visualRoleLabel: Record<ContactSheetVisualRole, string> = {
  grounding_critical: "Grounding critical",
  source_derived: "Source derived",
  decorative: "Decorative",
};

function formatCost(costUsd: number | null): string {
  if (costUsd === null) return "Cost not recorded yet";
  return `Cost ${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(costUsd)}`;
}

const cardBorder = "1px solid var(--color-border, #3A3046)";

/**
 * ST-089: a contact sheet of every AI illustration candidate for a lesson,
 * grouped by scene and slot. Presentational: the parent owns fetching and the
 * accept/reject calls, which reuse the existing per-scene commands. Selection is
 * always an explicit teacher action; a candidate that fails a deterministic
 * media check is rendered as a disabled control with a stated reason, and an
 * advisory finding never gates selection.
 */
export function IllustrationContactSheet({
  scenes,
  rulesetVersion,
  busyCandidateId,
  actionError,
  onAccept,
  onReject,
}: {
  scenes: readonly ContactSheetScene[];
  rulesetVersion: string | null;
  busyCandidateId: string | null;
  actionError: string | null;
  onAccept: (decision: ContactSheetDecision) => void;
  onReject: (decision: ContactSheetDecision) => void;
}): JSX.Element {
  const totalCandidates = scenes.reduce(
    (total, scene) =>
      total +
      scene.slots.reduce((count, slot) => count + slot.candidates.length, 0),
    0,
  );

  return (
    <section
      aria-label="Illustration candidate review"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "24px",
        color: "var(--color-text, #F4F1F8)",
      }}
    >
      <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <h1 style={{ margin: 0, fontSize: "28px", lineHeight: "34px" }}>
          Review illustration candidates
        </h1>
        <p
          style={{
            margin: 0,
            maxWidth: "72ch",
            fontSize: "14px",
            lineHeight: "20px",
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          Compare every generated illustration for this lesson side by side. You
          choose which one a scene uses; nothing is accepted for you. Cost and
          provenance are shown from the recorded generation, not estimated here.
        </p>
      </header>

      <div
        aria-live="polite"
        style={{
          fontSize: "13px",
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        {busyCandidateId === null
          ? `${totalCandidates} candidate${totalCandidates === 1 ? "" : "s"} across ${scenes.length} scene${scenes.length === 1 ? "" : "s"}.`
          : "Applying your decision…"}
      </div>

      {actionError !== null ? (
        <p
          role="alert"
          style={{
            margin: 0,
            display: "flex",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "10px",
            fontSize: "13px",
            backgroundColor: "#FFF5F4",
            border: "1px solid #B42318",
            color: "#B42318",
          }}
        >
          <Warning size={16} weight="fill" aria-hidden />
          {actionError}
        </p>
      ) : null}

      {scenes.length === 0 ? (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "8px",
            padding: "48px 24px",
            borderRadius: "16px",
            border: "1px dashed var(--color-border, #3A3046)",
            textAlign: "center",
          }}
        >
          <ImageSquare size={28} weight="light" aria-hidden />
          <p style={{ margin: 0, fontSize: "14px" }}>
            No illustration candidates yet.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: "13px",
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            Generate an illustration from a scene in the storyboard editor, then
            come back here to compare the results.
          </p>
        </div>
      ) : (
        scenes.map((scene) => (
          <SceneGroup
            key={scene.sceneId}
            scene={scene}
            rulesetVersion={rulesetVersion}
            busyCandidateId={busyCandidateId}
            onAccept={onAccept}
            onReject={onReject}
          />
        ))
      )}
    </section>
  );
}

function SceneGroup({
  scene,
  rulesetVersion,
  busyCandidateId,
  onAccept,
  onReject,
}: {
  scene: ContactSheetScene;
  rulesetVersion: string | null;
  busyCandidateId: string | null;
  onAccept: (decision: ContactSheetDecision) => void;
  onReject: (decision: ContactSheetDecision) => void;
}): JSX.Element {
  const headingId = `scene-${scene.sceneId}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "14px",
        padding: "18px",
        borderRadius: "16px",
        border: cardBorder,
        backgroundColor: "var(--color-surface, #211A2B)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          gap: "10px",
          flexWrap: "wrap",
        }}
      >
        <h2 id={headingId} style={{ margin: 0, fontSize: "18px" }}>
          Scene {scene.order}
          {scene.title === null ? "" : ` — ${scene.title}`}
        </h2>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          {scene.template} template
        </span>
      </div>

      {scene.advisories.map((advisory, index) => (
        <p
          key={`${advisory.code}-${index}`}
          role="note"
          style={{
            margin: 0,
            display: "flex",
            gap: "8px",
            padding: "10px 14px",
            borderRadius: "10px",
            fontSize: "13px",
            lineHeight: "18px",
            backgroundColor: "rgba(180, 132, 24, 0.14)",
            border: "1px solid rgba(180, 132, 24, 0.34)",
            color: "#FCD34D",
          }}
        >
          <Info size={16} weight="fill" aria-hidden style={{ flexShrink: 0, marginTop: "1px" }} />
          <span>
            <strong>Advisory</strong> — {advisory.message}{" "}
            <span style={{ color: "var(--color-text-muted, #BDB5C7)" }}>
              ({advisory.source === "model_assisted" && advisory.model !== null
                ? `model ${advisory.model}, `
                : ""}
              ruleset {advisory.rulesetVersion || rulesetVersion || "unknown"}).
              This is guidance only and does not block using any candidate.
            </span>
          </span>
        </p>
      ))}

      {scene.slots.map((slot) => (
        <SlotGroup
          key={slot.slot}
          scene={scene}
          slot={slot}
          busyCandidateId={busyCandidateId}
          onAccept={onAccept}
          onReject={onReject}
        />
      ))}
    </section>
  );
}

function SlotGroup({
  scene,
  slot,
  busyCandidateId,
  onAccept,
  onReject,
}: {
  scene: ContactSheetScene;
  slot: ContactSheetSlot;
  busyCandidateId: string | null;
  onAccept: (decision: ContactSheetDecision) => void;
  onReject: (decision: ContactSheetDecision) => void;
}): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
          }}
        >
          <h3 style={{ margin: 0, fontSize: "14px" }}>Slot “{slot.slot}”</h3>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "999px",
              fontSize: "11px",
              fontWeight: 700,
              backgroundColor: "var(--color-surface-raised, #292035)",
              border: cardBorder,
            }}
          >
            {visualRoleLabel[slot.visualRole]}
            {slot.required ? " · required" : ""}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: "12px",
            lineHeight: "17px",
            color: "var(--color-text-muted, #BDB5C7)",
          }}
        >
          {slot.visualRolePermits}
        </p>
      </div>

      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "grid",
          gap: "12px",
          gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        }}
      >
        {slot.candidates.map((candidate) => (
          <CandidateCard
            key={candidate.id}
            candidate={candidate}
            busy={busyCandidateId === candidate.id}
            anyBusy={busyCandidateId !== null}
            onAccept={() =>
              onAccept({
                candidateId: candidate.id,
                sceneId: scene.sceneId,
                sceneRevision: scene.sceneRevision,
              })
            }
            onReject={() =>
              onReject({
                candidateId: candidate.id,
                sceneId: scene.sceneId,
                sceneRevision: scene.sceneRevision,
              })
            }
          />
        ))}
      </ul>
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  anyBusy,
  onAccept,
  onReject,
}: {
  candidate: ContactSheetCandidate;
  busy: boolean;
  anyBusy: boolean;
  onAccept: () => void;
  onReject: () => void;
}): JSX.Element {
  const presentation = statusPresentation(candidate.status);
  const inFlight =
    candidate.status === "queued" || candidate.status === "generating";
  return (
    <li
      data-testid={`candidate-${candidate.id}`}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        padding: "10px",
        borderRadius: "12px",
        border: cardBorder,
        backgroundColor: "var(--color-surface-raised, #292035)",
      }}
    >
      <div
        style={{
          position: "relative",
          aspectRatio: "16 / 9",
          borderRadius: "10px",
          overflow: "hidden",
          border: cardBorder,
          backgroundColor: "rgba(0, 0, 0, 0.28)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {candidate.previewUrl !== null ? (
          <img
            alt={candidate.altText}
            src={candidate.previewUrl}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "4px",
              padding: "8px",
              fontSize: "11px",
              textAlign: "center",
              color: "var(--color-text-muted, #BDB5C7)",
            }}
          >
            <ImageSquare size={20} weight="light" aria-hidden />
            No image to preview
          </span>
        )}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "11px",
          lineHeight: "15px",
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        <span style={{ fontWeight: 700 }}>Alt text:</span> {candidate.altText}
      </p>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          fontSize: "12px",
          fontWeight: 700,
          color: presentation.color,
        }}
      >
        {inFlight ? (
          <ArrowClockwise size={13} weight="bold" aria-hidden />
        ) : candidate.status === "accepted" ? (
          <Check size={13} weight="bold" aria-hidden />
        ) : candidate.status === "failed" ? (
          <Warning size={13} weight="fill" aria-hidden />
        ) : candidate.selectable ? (
          <Sparkle size={13} weight="fill" aria-hidden />
        ) : (
          <Prohibit size={13} weight="bold" aria-hidden />
        )}
        {presentation.label}
      </div>

      <p
        style={{
          margin: 0,
          fontSize: "11px",
          lineHeight: "15px",
          color: "var(--color-text-muted, #BDB5C7)",
        }}
      >
        AI generated · {candidate.provider} · prompt {candidate.promptVersion}
        {candidate.jobId === null ? "" : ` · request ${candidate.jobId.slice(0, 8)}`}
        <br />
        {formatCost(candidate.costUsd)}
      </p>

      {candidate.blockedReason !== null ? (
        (() => {
          // A pending pipeline state is neutral information; only a real failure
          // uses the error treatment (design.md §8.6: warnings never look like
          // errors).
          const isFailure =
            candidate.blockedReason === "generation_failed" ||
            candidate.blockedReason === "moderation_rejected" ||
            candidate.blockedReason === "media_check_failed";
          return (
            <p
              role="status"
              style={{
                margin: 0,
                display: "flex",
                gap: "6px",
                padding: "6px 8px",
                borderRadius: "8px",
                fontSize: "11px",
                lineHeight: "15px",
                backgroundColor: isFailure
                  ? "rgba(180, 35, 24, 0.16)"
                  : "rgba(189, 181, 199, 0.12)",
                border: isFailure
                  ? "1px solid rgba(180, 35, 24, 0.34)"
                  : "1px solid var(--color-border, #3A3046)",
                color: isFailure ? "#FCA5A5" : "var(--color-text-muted, #BDB5C7)",
              }}
            >
              {isFailure ? (
                <Warning size={13} weight="fill" aria-hidden style={{ flexShrink: 0, marginTop: "1px" }} />
              ) : (
                <Info size={13} weight="bold" aria-hidden style={{ flexShrink: 0, marginTop: "1px" }} />
              )}
              {candidate.blockedDetail ?? "This candidate cannot be selected."}
              {isFailure && candidate.failureCode !== null
                ? ` (${candidate.failureCode})`
                : ""}
            </p>
          );
        })()
      ) : null}

      <div style={{ display: "flex", gap: "8px" }}>
        {(() => {
          const acceptDisabled = !candidate.selectable || busy || anyBusy;
          // Discard is valid for any candidate still awaiting review, including
          // one blocked from acceptance by a media or moderation check; the
          // /reject endpoint only rejects a candidate that is no longer
          // pending_review.
          const discardDisabled =
            candidate.status !== "pending_review" || busy || anyBusy;
          return (
            <>
              <button
                type="button"
                disabled={acceptDisabled}
                aria-disabled={acceptDisabled}
                onClick={onAccept}
                style={buttonStyle("primary", acceptDisabled)}
              >
                <Check size={13} weight="bold" aria-hidden />
                {busy ? "Working…" : "Use this"}
              </button>
              <button
                type="button"
                disabled={discardDisabled}
                aria-disabled={discardDisabled}
                onClick={onReject}
                style={buttonStyle("secondary", discardDisabled)}
              >
                <X size={13} weight="bold" aria-hidden />
                Discard
              </button>
            </>
          );
        })()}
      </div>
    </li>
  );
}

function buttonStyle(
  kind: "primary" | "secondary",
  disabled: boolean,
): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "5px",
    flex: 1,
    minHeight: "36px",
    padding: "6px 10px",
    borderRadius: "999px",
    fontSize: "12px",
    fontWeight: 700,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    backgroundColor:
      kind === "primary" ? "var(--color-brand, #A883FF)" : "transparent",
    border:
      kind === "primary"
        ? "none"
        : "1px solid var(--color-border, #3A3046)",
    color:
      kind === "primary"
        ? "var(--color-on-brand, #1B1027)"
        : "var(--color-text-muted, #BDB5C7)",
  };
}
