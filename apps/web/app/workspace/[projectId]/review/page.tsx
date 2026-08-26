import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProjectStage } from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { getPipelineStages } from "../../../../lib/project-pipeline";
import { getStageDetails } from "../../project-stage-utils";
import { IngestionReviewViewer } from "./ingestion-review-viewer";

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

export default async function IngestionReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ section?: string; block?: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");
  const { projectId } = await params;
  const query = await searchParams;
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
  const stages = getPipelineStages(payload.project.stage, "Review");

  return (
    <AuthenticatedAppShell
      projectTitle={payload.project.title}
      projectStatus={stageDetails.label}
      userEmail="teacher@school.org"
      stages={stages}
      mode="daylight"
    >
      <IngestionReviewViewer
        projectId={projectId}
        projectTitle={payload.project.title}
        {...(query.section === undefined
          ? {}
          : { focusSectionId: query.section })}
        {...(query.block === undefined ? {} : { focusBlockId: query.block })}
      />
    </AuthenticatedAppShell>
  );
}

