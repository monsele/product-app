"use client";

import React, { useState } from "react";
import { SourceUploadForm } from "./source-upload-form";
import { IngestionStatusPanel } from "./ingestion-status-panel";
import { SourceRequirementsRail } from "./source-requirements-rail";

export interface SourceIntakeWorkspaceProps {
  projectId: string;
}

export const SourceIntakeWorkspace: React.FC<SourceIntakeWorkspaceProps> = ({
  projectId,
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleUploadSuccess = () => {
    setRefreshKey((prev) => prev + 1);
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
        gap: "32px",
        alignItems: "start",
      }}
    >
      {/* Main Intake & Processing Region (Flexible 70% region) */}
      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "32px",
        }}
      >
        <SourceUploadForm
          projectId={projectId}
          onUploadSuccess={handleUploadSuccess}
        />
        <IngestionStatusPanel
          key={refreshKey}
          projectId={projectId}
        />
      </div>

      {/* Requirements & Guidelines Rail (320-360px on wide screens) */}
      <div
        style={{
          width: "100%",
          maxWidth: "360px",
          justifySelf: "center",
        }}
      >
        <SourceRequirementsRail />
      </div>
    </div>
  );
};
