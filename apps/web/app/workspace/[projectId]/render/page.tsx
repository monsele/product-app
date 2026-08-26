import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProjectStage } from "@avlp/schemas";
import {
  lessonVersionsResponseSchema,
  renderStatusResponseSchema,
} from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { getPipelineStages } from "../../../../lib/project-pipeline";
import { getStageDetails } from "../../project-stage-utils";
import { RenderPanel } from "./render-panel";

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

export default async function RenderPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (!token) redirect("/sign-in");
  const { projectId } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const headers = { cookie: `avlp_session=${encodeURIComponent(token)}` };
  const [projectResponse, renderResponse, versionsResponse] = await Promise.all([
    fetch(`${api}/projects/${encodeURIComponent(projectId)}`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${api}/projects/${encodeURIComponent(projectId)}/renders`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${api}/projects/${encodeURIComponent(projectId)}/versions`, {
      headers,
      cache: "no-store",
    }),
  ]);

  const projectPayload: unknown = projectResponse.ok
    ? await projectResponse.json().catch(() => null)
    : null;
  const renderPayload: unknown = renderResponse.ok
    ? await renderResponse.json().catch(() => null)
    : { renders: [] };
  const versionsPayload: unknown = versionsResponse.ok
    ? await versionsResponse.json().catch(() => null)
    : null;

  const project = isProjectPayload(projectPayload)
    ? projectPayload.project
    : {
        id: projectId,
        title: "Lesson Delivery",
        stage: "ready_to_render" as ProjectStage,
      };

  const rawRenders =
    renderPayload &&
    typeof renderPayload === "object" &&
    "renders" in renderPayload
      ? (renderPayload as { renders: unknown }).renders
      : [];
  const renders = Array.isArray(rawRenders)
    ? rawRenders
        .map((value) => renderStatusResponseSchema.safeParse(value))
        .filter(
          (
            value,
          ): value is {
            success: true;
            data: ReturnType<typeof renderStatusResponseSchema.parse>;
          } => value.success,
        )
        .map((value) => value.data)
    : [];
  const versions = lessonVersionsResponseSchema.safeParse(versionsPayload);

  const stageDetails = getStageDetails(project.stage);
  const stages = getPipelineStages(project.stage, "Deliver");

  return (
    <AuthenticatedAppShell
      projectTitle={project.title}
      projectStatus={stageDetails.label}
      userEmail="teacher@school.org"
      stages={stages}
      mode="daylight"
      maxWidth="1440px"
    >
      <RenderPanel
        projectId={projectId}
        projectTitle={project.title}
        lessonVersionId={
          versions.success ? versions.data.currentVersionId : null
        }
        initial={renders}
      />
    </AuthenticatedAppShell>
  );
}
