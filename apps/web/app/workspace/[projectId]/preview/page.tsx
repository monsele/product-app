import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { previewManifestSchema } from "@avlp/schemas";
import { FullLessonPreview } from "./preview-player";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (!token) redirect("/sign-in");
  const { projectId } = await params;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/projects/${encodeURIComponent(projectId)}/preview-manifest`,
    {
      headers: { cookie: `avlp_session=${encodeURIComponent(token)}` },
      cache: "no-store",
    },
  );
  const payload: unknown = response.ok ? await response.json() : null;
  const parsed = previewManifestSchema.safeParse(payload);
  if (!response.ok || !parsed.success)
    redirect(`/workspace/${encodeURIComponent(projectId)}/storyboard`);
  return (
    <main>
      <h1>Lesson preview</h1>
      <FullLessonPreview projectId={projectId} initialManifest={parsed.data} />
      <a href={`/workspace/${encodeURIComponent(projectId)}/storyboard`}>
        Back to storyboard
      </a>
    </main>
  );
}
