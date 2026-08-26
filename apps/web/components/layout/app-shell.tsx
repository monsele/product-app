"use client";

import React, { useState } from "react";
import { AppHeader } from "./app-header";
import { ProjectPipelineRail, type StageState } from "./project-pipeline-rail";
import { PageContainer } from "./page-container";
import { Drawer } from "../ui/drawer";

export interface AppShellProps {
  children: React.ReactNode;
  projectTitle?: string | undefined;
  projectStatus?: React.ReactNode | undefined;
  userEmail?: string | undefined;
  onSignOut?: (() => void) | undefined;
  headerActions?: React.ReactNode | undefined;
  stages?: StageState[] | undefined;
  mode?: "daylight" | "focus-studio" | undefined;
  maxWidth?: string | undefined;
}

export const AppShell: React.FC<AppShellProps> = ({
  children,
  projectTitle,
  projectStatus,
  userEmail,
  onSignOut,
  headerActions,
  stages,
  mode = "daylight",
  maxWidth = "1600px",
}) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen((prev) => !prev);
  };

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
  };

  return (
    <div
      className={mode === "focus-studio" ? "theme-focus-studio" : "theme-studio-daylight"}
      style={{
        minHeight: "100dvh",
        backgroundColor: "var(--color-canvas)",
        color: "var(--color-text)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <AppHeader
        projectTitle={projectTitle}
        projectStatus={projectStatus}
        userEmail={userEmail}
        onSignOut={onSignOut}
        actions={headerActions}
        onToggleMobileMenu={stages && stages.length > 0 ? toggleMobileMenu : undefined}
        isMobileMenuOpen={isMobileMenuOpen}
      />

      <div
        style={{
          flex: 1,
          display: "flex",
          minHeight: 0,
        }}
      >
        {stages && stages.length > 0 && (
          <aside
            className="desktop-pipeline-rail"
            style={{
              display: "flex",
              flexShrink: 0,
            }}
          >
            <ProjectPipelineRail stages={stages} />
          </aside>
        )}

        <main style={{ flex: 1, minWidth: 0 }}>
          <PageContainer maxWidth={maxWidth}>{children}</PageContainer>
        </main>
      </div>

      {stages && stages.length > 0 && (
        <Drawer
          isOpen={isMobileMenuOpen}
          onClose={closeMobileMenu}
          title="Lesson Pipeline"
          position="left"
          width="280px"
        >
          <ProjectPipelineRail
            stages={stages.map((stage) => ({
              ...stage,
              onClick: stage.onClick
                ? () => {
                    stage.onClick?.();
                    closeMobileMenu();
                  }
                : undefined,
            }))}
          />
        </Drawer>
      )}
    </div>
  );
};
