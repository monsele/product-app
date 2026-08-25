"use client";

import React from "react";

export interface PageContainerProps {
  children: React.ReactNode;
  maxWidth?: string;
  className?: string;
  style?: React.CSSProperties;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  children,
  maxWidth = "1600px",
  className = "",
  style,
}) => {
  return (
    <div
      className={`layout-page-container ${className}`}
      style={{
        width: "100%",
        maxWidth,
        margin: "0 auto",
        padding: "24px",
        boxSizing: "border-box",
        minWidth: 0,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
