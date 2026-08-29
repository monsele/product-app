import React from "react";
import { AppShell } from "../../../components/layout/app-shell";
import { Skeleton } from "../../../components/ui/skeleton";
import { CircleNotch } from "@phosphor-icons/react/dist/ssr";

const SKELETON_STAGES = [
  { id: "Source" as const, label: "Source", status: "completed" as const },
  { id: "Review" as const, label: "Review", status: "completed" as const },
  { id: "Setup" as const, label: "Setup", status: "completed" as const },
  { id: "Objectives" as const, label: "Objectives", status: "current" as const },
  { id: "Outline" as const, label: "Outline", status: "available" as const },
  { id: "Narration" as const, label: "Narration", status: "available" as const },
  { id: "Storyboard" as const, label: "Storyboard", status: "available" as const },
  { id: "Preview" as const, label: "Preview", status: "available" as const },
  { id: "Deliver" as const, label: "Deliver", status: "available" as const },
];

export default function WorkspaceStageLoading(): React.JSX.Element {
  return (
    <AppShell
      projectTitle="Loading lesson…"
      projectStatus={<Skeleton width="90px" height="22px" borderRadius="9999px" />}
      userEmail="teacher@school.org"
      stages={SKELETON_STAGES}
      mode="daylight"
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          padding: "8px 0 40px 0",
        }}
      >
        {/* Stage Header Skeleton */}
        <header
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", flex: 1 }}>
            <Skeleton width="280px" height="34px" />
            <Skeleton width="460px" height="18px" />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "6px 14px",
              backgroundColor: "var(--color-surface-raised, #ffffff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "var(--radius-pill, 9999px)",
              boxShadow: "var(--shadow-elevation, 0 4px 12px rgba(0, 0, 0, 0.04))",
            }}
            role="status"
            aria-live="polite"
          >
            <span
              style={{
                display: "inline-flex",
                animation: "spin 1s linear infinite",
                color: "var(--color-brand, #795290)",
              }}
            >
              <CircleNotch size={14} weight="bold" />
            </span>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--color-text-muted, #64748b)",
              }}
            >
              Loading workflow stage…
            </span>
          </div>
        </header>

        {/* Stage Content Area Skeleton Cards */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "20px",
          }}
        >
          <div
            style={{
              backgroundColor: "var(--color-surface-raised, #ffffff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "16px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              minHeight: "280px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Skeleton width="180px" height="22px" />
              <Skeleton width="70px" height="26px" borderRadius="9999px" />
            </div>
            <Skeleton width="100%" height="16px" />
            <Skeleton width="90%" height="16px" />
            <Skeleton width="75%" height="16px" />
            <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
              <Skeleton width="120px" height="38px" borderRadius="9999px" />
              <Skeleton width="100px" height="38px" borderRadius="9999px" />
            </div>
          </div>

          <div
            style={{
              backgroundColor: "var(--color-surface-raised, #ffffff)",
              border: "1px solid var(--color-border, #e2e8f0)",
              borderRadius: "16px",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
              minHeight: "280px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Skeleton width="160px" height="22px" />
              <Skeleton width="80px" height="26px" borderRadius="9999px" />
            </div>
            <Skeleton width="100%" height="16px" />
            <Skeleton width="85%" height="16px" />
            <Skeleton width="95%" height="16px" />
            <div style={{ marginTop: "auto", display: "flex", gap: "12px" }}>
              <Skeleton width="140px" height="38px" borderRadius="9999px" />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
