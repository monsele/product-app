import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProjectStage } from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { getPipelineStages } from "../../../../lib/project-pipeline";
import { getStageDetails } from "../../project-stage-utils";
import { SourceIntakeWorkspace } from "./source-intake-workspace";

type ProjectPayload = {
  project: {
    id: string;
    title: string;
    stage: ProjectStage;
  };
};

function isProjectPayload(value: unknown): value is ProjectPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    "project" in value &&
    typeof value.project === "object" &&
    value.project !== null &&
    "id" in value.project &&
    typeof value.project.id === "string" &&
    "title" in value.project &&
    typeof value.project.title === "string" &&
    "stage" in value.project &&
    typeof value.project.stage === "string"
  );
}

export default async function ProjectUploadPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");

  const { projectId } = await params;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/projects/${encodeURIComponent(projectId)}`,
    {
      headers: { cookie: `avlp_session=${encodeURIComponent(token)}` },
      cache: "no-store",
    },
  );

  const payload: unknown = response.ok ? await response.json() : null;
  if (!response.ok || !isProjectPayload(payload)) redirect("/workspace");

  const stageDetails = getStageDetails(payload.project.stage);
  const stages = getPipelineStages(payload.project.stage, "Source", projectId);

  return (
    <AuthenticatedAppShell
      projectTitle={payload.project.title}
      projectStatus={stageDetails.label}
      userEmail="teacher@school.org"
      stages={stages}
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
        {/* Page Header */}
        <header style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          <h1
            style={{
              margin: 0,
              fontSize: "32px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
            }}
          >
            Upload a source document
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              color: "var(--color-text-muted)",
              lineHeight: "22px",
            }}
          >
            Add a PDF or DOCX file for <strong>{payload.project.title}</strong> to extract structure, figures, and sections.
          </p>
        </header>

        {/* Studio Daylight Intake & Ingestion Workspace */}
        <SourceIntakeWorkspace projectId={projectId} />
      </div>
    </AuthenticatedAppShell>
  );
}
