import React from "react";
import { AuthenticatedAppShell } from "../../components/layout/authenticated-app-shell";
import { Skeleton } from "../../components/ui/skeleton";
import styles from "./workspace.module.css";

export default function WorkspaceLoading(): React.JSX.Element {
  return (
    <AuthenticatedAppShell userEmail="teacher@school.org" mode="daylight">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>Your lessons</h1>
          <p className={styles.pageLead}>
            Manage existing video lessons, monitor generation progress, or
            create a new lesson.
          </p>
        </header>

        {/* 70/30 board and rail skeleton composition */}
        <div className={styles.layout}>
          <div className={styles.board}>
            {/* Create lesson card skeleton */}
            <div
              className={styles.createCard}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                padding: "24px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <Skeleton width="40px" height="40px" borderRadius="10px" />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1 }}>
                  <Skeleton width="180px" height="20px" />
                  <Skeleton width="280px" height="14px" />
                </div>
              </div>
              <Skeleton width="100%" height="44px" borderRadius="10px" />
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <Skeleton width="140px" height="38px" borderRadius="9999px" />
              </div>
            </div>

            {/* Lesson record cards skeleton */}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginTop: "16px" }}>
              <div
                style={{
                  backgroundColor: "var(--color-surface-raised, #ffffff)",
                  border: "1px solid var(--color-border, #e2e8f0)",
                  borderRadius: "16px",
                  padding: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                  <Skeleton width="80px" height="52px" borderRadius="8px" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                    <Skeleton width="240px" height="18px" />
                    <div style={{ display: "flex", gap: "12px" }}>
                      <Skeleton width="90px" height="14px" />
                      <Skeleton width="120px" height="14px" />
                    </div>
                  </div>
                </div>
                <Skeleton width="100px" height="34px" borderRadius="9999px" />
              </div>

              <div
                style={{
                  backgroundColor: "var(--color-surface-raised, #ffffff)",
                  border: "1px solid var(--color-border, #e2e8f0)",
                  borderRadius: "16px",
                  padding: "20px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "16px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
                  <Skeleton width="80px" height="52px" borderRadius="8px" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1 }}>
                    <Skeleton width="200px" height="18px" />
                    <div style={{ display: "flex", gap: "12px" }}>
                      <Skeleton width="80px" height="14px" />
                      <Skeleton width="110px" height="14px" />
                    </div>
                  </div>
                </div>
                <Skeleton width="100px" height="34px" borderRadius="9999px" />
              </div>
            </div>
          </div>

          {/* Contextual rail skeleton */}
          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            <div
              style={{
                backgroundColor: "var(--color-surface-raised, #ffffff)",
                border: "1px solid var(--color-border, #e2e8f0)",
                borderRadius: "16px",
                padding: "20px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
              }}
            >
              <Skeleton width="140px" height="18px" />
              <Skeleton width="100%" height="14px" />
              <Skeleton width="85%" height="14px" />
              <Skeleton width="60%" height="14px" />
            </div>
          </aside>
        </div>
      </div>
    </AuthenticatedAppShell>
  );
}
