import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProjectStage } from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { getPipelineStages } from "../../../../lib/project-pipeline";
import { getStageDetails } from "../../project-stage-utils";
import { ComparisonWorkspace } from "./comparison-workspace";

type ProjectPayload = {
  project: { id: string; title: string; stage: ProjectStage };
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

/**
 * ST-096 — the comparison screen.
 *
 * Reached from the render/delivery step once a lesson has an output. It is a
 * sibling of the existing workspace screens rather than a replacement for any
 * of them: the standard path is untouched, and a project with no comparison
 * simply shows why it has none.
 */
export default async function ComparePage({
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
  const stages = getPipelineStages(payload.project.stage, "Deliver", projectId);

  return (
    <AuthenticatedAppShell
      mode="daylight"
      projectStatus={stageDetails.label}
      projectTitle={payload.project.title}
      stages={stages}
      userEmail="teacher@school.org"
    >
      <ComparisonWorkspace projectId={projectId} />
    </AuthenticatedAppShell>
  );
}
