"use client";

import React from "react";
import { Sparkle } from "@phosphor-icons/react";
import { Button } from "../ui/button";

export interface CandidateBannerProps {
  hasCandidate: boolean;
  isGenerating?: boolean;
  generatingMessage?: string;
  candidateTitle?: string;
  candidateDescription?: string;
  onApplyCandidate?: () => void;
  onDiscardCandidate?: () => void;
}

export const CandidateBanner: React.FC<CandidateBannerProps> = ({
  hasCandidate,
  isGenerating = false,
  generatingMessage = "Generating new suggestions in the background… Current draft remains active.",
  candidateTitle = "AI Regeneration Candidate Ready",
  candidateDescription = "A new set of items has been generated. Review and confirm replacement to apply these changes to your working draft.",
  onApplyCandidate,
  onDiscardCandidate,
}) => {
  if (isGenerating) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          padding: "14px 18px",
          backgroundColor: "var(--color-surface-brand)",
          border: "1px solid var(--color-brand)",
          borderRadius: "var(--radius-card)",
          color: "var(--color-text)",
          boxShadow: "0 2px 8px rgba(100, 48, 215, 0.08)",
        }}
      >
        <Sparkle
          size={20}
          weight="fill"
          style={{
            color: "var(--color-brand)",
            animation: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-brand)" }}>
            AI Generation in progress
          </div>
          <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
            {generatingMessage}
          </div>
        </div>
      </div>
    );
  }

  if (hasCandidate) {
    return (
      <div
        role="region"
        aria-label="Candidate suggestions"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          padding: "16px 20px",
          backgroundColor: "var(--color-surface-brand)",
          border: "1.5px solid var(--color-brand)",
          borderRadius: "var(--radius-card)",
          color: "var(--color-text)",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
          <Sparkle
            size={20}
            weight="fill"
            style={{ color: "var(--color-brand)", marginTop: "2px", flexShrink: 0 }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-brand)" }}>
              {candidateTitle}
            </div>
            <div style={{ fontSize: "13px", color: "var(--color-text-muted)", marginTop: "2px" }}>
              {candidateDescription}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px", alignSelf: "flex-end" }}>
          {onDiscardCandidate && (
            <Button
              variant="tertiary"
              size="compact"
              onClick={onDiscardCandidate}
            >
              Keep current draft
            </Button>
          )}
          {onApplyCandidate && (
            <Button
              variant="primary"
              size="compact"
              onClick={onApplyCandidate}
            >
              Apply AI Suggestions
            </Button>
          )}
        </div>
      </div>
    );
  }

  return null;
};
