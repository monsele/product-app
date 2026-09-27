import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sourceDocumentStatusResponseSchema } from "@avlp/schemas";
import { oneShotResponseSchema } from "@avlp/schemas/one-shot";
import { AuthenticatedAppShell } from "../../../../components/layout/authenticated-app-shell";
import { OneShotUnavailable } from "./one-shot-views";
import { OneShotWorkspace } from "./one-shot-workspace";
import styles from "./one-shot.module.css";

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

/**
 * ST-106 — the prompt-to-video run page. The API enforces the pilot cohort on
 * every read and write; a user outside it sees the unavailable state here,
 * whether they followed a link or typed the URL.
 */
export default async function OneShotPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");

  const { projectId } = await params;
  const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
  const headers = { cookie: `avlp_session=${encodeURIComponent(token)}` };
  const base = `${api}/projects/${encodeURIComponent(projectId)}`;
  const [projectResponse, runResponse, documentResponse] = await Promise.all([
    fetch(base, { headers, cache: "no-store" }),
    fetch(`${base}/one-shot`, { headers, cache: "no-store" }),
    fetch(`${base}/source-document`, { headers, cache: "no-store" }),
  ]);

  if (projectResponse.status === 401) redirect("/sign-in");
  const projectPayload: unknown = projectResponse.ok
    ? await projectResponse.json().catch(() => null)
    : null;
  // Unknown or another tenant's project: the API answers 404 either way.
  if (!isProjectPayload(projectPayload)) redirect("/workspace");

  const run = runResponse.ok
    ? oneShotResponseSchema.safeParse(
        await runResponse.json().catch(() => null),
      )
    : null;
  const document = documentResponse.ok
    ? sourceDocumentStatusResponseSchema.safeParse(
        await documentResponse.json().catch(() => null),
      )
    : null;
  const documentReady =
    document?.success === true && document.data.validation.status === "active";

  return (
    <AuthenticatedAppShell
      projectTitle={projectPayload.project.title}
      userEmail="teacher@school.org"
      mode="daylight"
      maxWidth="1200px"
    >
      {run?.success === true && run.data.eligibility.visible ? (
        <OneShotWorkspace
          projectId={projectId}
          projectTitle={projectPayload.project.title}
          initial={run.data}
          documentReady={documentReady}
        />
      ) : (
        <div className={styles.page}>
          <header className={styles.header}>
            <h1 className={styles.title}>Quick video from a PDF</h1>
          </header>
          <div className={styles.column}>
            <OneShotUnavailable projectId={projectId} />
          </div>
        </div>
      )}
    </AuthenticatedAppShell>
  );
}
