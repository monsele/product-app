"use client";

import React from "react";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  shimmer?: boolean;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-control)",
  className = "",
  shimmer = true,
  style,
}) => {
  return (
    <div
      aria-hidden="true"
      className={`ui-skeleton ${className}`}
      style={{
        width,
        height,
        borderRadius,
        backgroundColor: "var(--color-surface-subtle)",
        position: "relative",
        overflow: "hidden",
        display: "inline-block",
        verticalAlign: "middle",
        ...style,
      }}
    >
      {shimmer ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(90deg, transparent 0%, var(--color-surface-raised, rgba(255, 255, 255, 0.4)) 50%, transparent 100%)",
            animation: "shimmer 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite",
            opacity: 0.8,
          }}
        />
      ) : (
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "inherit",
            animation: "pulse 1.5s ease-in-out infinite",
          }}
        />
      )}
    </div>
  );
};
