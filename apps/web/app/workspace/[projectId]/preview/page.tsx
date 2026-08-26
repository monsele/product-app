import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ProjectStage } from "@avlp/schemas";
import { previewManifestSchema } from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { getPipelineStages } from "../../../../lib/project-pipeline";
import { getStageDetails } from "../../project-stage-utils";
import { FullLessonPreview } from "./preview-player";

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

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (!token) redirect("/sign-in");
  const { projectId } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const headers = { cookie: `avlp_session=${encodeURIComponent(token)}` };

  const [projectResponse, manifestResponse] = await Promise.all([
    fetch(`${api}/projects/${encodeURIComponent(projectId)}`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${api}/projects/${encodeURIComponent(projectId)}/preview-manifest`, {
      headers,
      cache: "no-store",
    }),
  ]);

  const projectPayload: unknown = projectResponse.ok
    ? await projectResponse.json().catch(() => null)
    : null;
  const manifestPayload: unknown = manifestResponse.ok
    ? await manifestResponse.json().catch(() => null)
    : null;

  const parsed = previewManifestSchema.safeParse(manifestPayload);
  if (!manifestResponse.ok || !parsed.success) {
    redirect(`/workspace/${encodeURIComponent(projectId)}/storyboard`);
  }

  const project = isProjectPayload(projectPayload)
    ? projectPayload.project
    : {
        id: projectId,
        title: parsed.data.storyboard.title || "Lesson Preview",
        stage: "ready_to_render" as ProjectStage,
      };

  const stageDetails = getStageDetails(project.stage);
  const stages = getPipelineStages(project.stage, "Preview");

  return (
    <AuthenticatedAppShell
      projectTitle={project.title}
      projectStatus={stageDetails.label}
      userEmail="teacher@school.org"
      stages={stages}
      mode="focus-studio"
      maxWidth="1440px"
    >
      <FullLessonPreview
        projectId={projectId}
        initialManifest={parsed.data}
        projectTitle={project.title}
      />
    </AuthenticatedAppShell>
  );
}
