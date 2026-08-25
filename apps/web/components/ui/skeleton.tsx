"use client";

import React from "react";

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  width = "100%",
  height = "20px",
  borderRadius = "var(--radius-control)",
  className = "",
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
        opacity: 0.7,
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
};
