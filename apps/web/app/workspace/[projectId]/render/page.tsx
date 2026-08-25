import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  lessonVersionsResponseSchema,
  renderStatusResponseSchema,
} from "@avlp/schemas";
import { RenderPanel } from "./render-panel";

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
  const [renderResponse, versionsResponse] = await Promise.all([
    fetch(`${api}/projects/${encodeURIComponent(projectId)}/renders`, {
      headers,
      cache: "no-store",
    }),
    fetch(`${api}/projects/${encodeURIComponent(projectId)}/versions`, {
      headers,
      cache: "no-store",
    }),
  ]);
  const renderPayload: unknown = renderResponse.ok
    ? await renderResponse.json()
    : { renders: [] };
  const versionsPayload: unknown = versionsResponse.ok
    ? await versionsResponse.json()
    : null;
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
  return (
    <main>
      <RenderPanel
        projectId={projectId}
        lessonVersionId={
          versions.success ? versions.data.currentVersionId : null
        }
        initial={renders}
      />
    </main>
  );
}
