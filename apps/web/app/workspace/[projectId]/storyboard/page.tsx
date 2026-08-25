import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StoryboardPanel } from "./storyboard-panel";

type ProjectPayload = { project: { id: string; title: string } };

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
    typeof value.project.title === "string"
  );
}

export default async function StoryboardPage({
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
  return (
    <main>
      <h1>Storyboard</h1>
      <p>{payload.project.title}</p>
      <StoryboardPanel projectId={projectId} />
      <a href={`/workspace/${encodeURIComponent(projectId)}/preview`}>
        Preview full lesson
      </a>
      <a href="/workspace">Back to workspace</a>
    </main>
  );
}
