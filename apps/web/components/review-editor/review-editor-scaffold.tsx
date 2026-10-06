"use client";
import React from "react";
import styles from "./review-editor-scaffold.module.css";
export interface ReviewEditorScaffoldProps {
  title: string;
  subtitle: string;
  statusBadge?: React.ReactNode;
  notices?: React.ReactNode;
  candidateBanner?: React.ReactNode;
  mainContent: React.ReactNode;
  sidebarContent?: React.ReactNode;
  sourceDrawer?: React.ReactNode;
}
export const ReviewEditorScaffold: React.FC<ReviewEditorScaffoldProps> = ({
  title,
  subtitle,
  statusBadge,
  notices,
  candidateBanner,
  mainContent,
  sidebarContent,
  sourceDrawer,
}) => (
  <div className={styles.page}>
    <header className={styles.header}>
      <div className={styles.identity}>
        <div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {statusBadge}
      </div>
      {notices && <div className={styles.notices}>{notices}</div>}
      {candidateBanner}
    </header>
    <div
      className={`${styles.grid} ${sidebarContent ? styles.withSidebar : ""}`}
    >
      <div className={styles.content}>{mainContent}</div>
      {sidebarContent && (
        <aside
          aria-label="Artifact context and summary"
          className={styles.sidebar}
        >
          {sidebarContent}
        </aside>
      )}
    </div>
    {sourceDrawer}
  </div>
);
