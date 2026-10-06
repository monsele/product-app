"use client";
import React from "react";
import Link from "next/link";
import { Lock, Check } from "@phosphor-icons/react";
import styles from "./project-pipeline-rail.module.css";
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
  href?: string | undefined;
  onClick?: (() => void) | undefined;
}
export interface ProjectPipelineRailProps {
  stages: StageState[];
}
export const ProjectPipelineRail: React.FC<ProjectPipelineRailProps> = ({
  stages,
}) => (
  <nav aria-label="Project pipeline stages" className={styles.rail}>
    <p className={styles.heading}>Lesson pipeline</p>
    <div className={styles.stages}>
      {stages.map((stage, index) => {
        const current = stage.status === "current";
        const completed = stage.status === "completed";
        const blocked = stage.status === "blocked";
        const content = (
          <>
            <span className={styles.marker} aria-hidden="true">
              {completed ? <Check size={14} weight="bold" /> : index + 1}
            </span>
            <span>{stage.label}</span>
            <span className={styles.state}>
              {blocked && <Lock size={14} aria-label="Blocked" />}
              {completed && <span className="sr-only">Completed</span>}
            </span>
          </>
        );
        const className = `${styles.stage} ${completed ? styles.completed : ""}`;
        return !blocked && stage.href ? (
          <Link
            key={stage.id}
            href={stage.href}
            prefetch
            className={className}
            aria-label={stage.label}
            aria-description={
              completed ? "Completed" : blocked ? "Blocked" : undefined
            }
            aria-current={current ? "step" : undefined}
            {...(stage.onClick ? { onClick: stage.onClick } : {})}
          >
            {content}
          </Link>
        ) : (
          <button
            key={stage.id}
            type="button"
            disabled={blocked}
            {...(stage.onClick ? { onClick: stage.onClick } : {})}
            className={className}
            aria-label={stage.label}
            aria-description={
              completed ? "Completed" : blocked ? "Blocked" : undefined
            }
            aria-current={current ? "step" : undefined}
          >
            {content}
          </button>
        );
      })}
    </div>
  </nav>
);
