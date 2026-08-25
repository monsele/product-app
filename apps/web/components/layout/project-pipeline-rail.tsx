"use client";

import React from "react";
import { Lock, Check } from "@phosphor-icons/react";

export type StageId =
  | "Source"
  | "Review"
  | "Setup"
  | "Objectives"
  | "Outline"
  | "Narration"
  | "Storyboard"
  | "Preview"
  | "Deliver";

export interface StageState {
  id: StageId;
  label: string;
  status: "completed" | "current" | "available" | "blocked";
  onClick?: () => void;
}

export interface ProjectPipelineRailProps {
  stages: StageState[];
}

export const ProjectPipelineRail: React.FC<ProjectPipelineRailProps> = ({ stages }) => {
  return (
    <nav
      aria-label="Project pipeline stages"
      style={{
        width: "224px",
        minWidth: "224px",
        backgroundColor: "var(--color-surface-subtle)",
        borderRight: "1px solid var(--color-border)",
        padding: "16px 12px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
      }}
    >
      <div
        style={{
          padding: "8px",
          fontSize: "12px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          color: "var(--color-text-muted)",
        }}
      >
        Lesson Pipeline
      </div>

      {stages.map((stage) => {
        const isCurrent = stage.status === "current";
        const isCompleted = stage.status === "completed";
        const isBlocked = stage.status === "blocked";

        return (
          <button
            key={stage.id}
            disabled={isBlocked}
            onClick={stage.onClick}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              width: "100%",
              padding: "8px 12px",
              borderRadius: "var(--radius-control)",
              border: isCurrent ? "1px solid var(--color-brand)" : "1px solid transparent",
              backgroundColor: isCurrent
                ? "var(--color-surface-brand)"
                : "transparent",
              color: isCurrent
                ? "var(--color-brand)"
                : isBlocked
                ? "var(--color-text-muted)"
                : "var(--color-text)",
              fontSize: "13px",
              fontWeight: isCurrent ? 600 : 400,
              cursor: isBlocked ? "not-allowed" : "pointer",
              opacity: isBlocked ? 0.6 : 1,
              textAlign: "left",
              transition: "all var(--motion-quick) var(--motion-easing)",
            }}
          >
            <span>{stage.label}</span>
            <span style={{ display: "inline-flex", fontSize: "14px" }}>
              {isCompleted ? (
                <Check weight="bold" style={{ color: "var(--color-success-fg)" }} />
              ) : isBlocked ? (
                <Lock weight="bold" />
              ) : null}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
