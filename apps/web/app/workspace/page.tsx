import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { projectListPageSchema } from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

function stageLabel(stage: string): string {
  return stage.replaceAll("_", " ");
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; error?: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");
  const { cursor, error } = await searchParams;
  const query =
    cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  const response = await fetch(apiUrl(`/projects${query}`), {
    headers: { cookie: `avlp_session=${encodeURIComponent(token)}` },
    cache: "no-store",
  });
  if (response.status === 401) redirect("/sign-in");
  const parsed = response.ok
    ? projectListPageSchema.safeParse(await response.json())
    : undefined;
  if (!response.ok || parsed === undefined || !parsed.success)
    throw new Error("The workspace could not be loaded.");
  const payload = parsed.data;

  return (
    <main>
      <h1>Teacher workspace</h1>
      <form action="/api/projects" method="post">
        <label htmlFor="project-title">Project title</label>
        <input id="project-title" name="title" maxLength={160} required />
        <button type="submit">Create project</button>
      </form>
      {error === "title" ? <p role="alert">Enter a project title.</p> : null}
      {error === "duplicate" ? (
        <p role="alert">The project could not be duplicated.</p>
      ) : null}
      {error === "confirm-delete" ? (
        <p role="alert">Confirm deletion before continuing.</p>
      ) : null}
      {error === "delete" ? (
        <p role="alert">The project could not be deleted.</p>
      ) : null}
      {payload.items.length === 0 ? (
        <p>Create your first project to upload a source document and begin.</p>
      ) : (
        <ul aria-label="Projects">
          {payload.items.map((project) => (
            <li key={project.id}>
              <a href={`/workspace/${project.id}/upload`}>{project.title}</a>
              <p>
                Status: {stageLabel(project.stage)}. Last modified{" "}
                <time dateTime={project.updatedAt}>
                  {new Intl.DateTimeFormat("en", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  }).format(new Date(project.updatedAt))}
                </time>
                .
              </p>
              {project.latestFailedOperation === null ? null : (
                <p role="status">
                  Latest failed operation: {project.latestFailedOperation}
                </p>
              )}
              <form
                action={`/api/projects/${encodeURIComponent(project.id)}/duplicate`}
                method="post"
              >
                <input
                  name="idempotencyKey"
                  type="hidden"
                  value={randomUUID()}
                />
                <button type="submit">Duplicate project</button>
              </form>
              <form
                action={`/api/projects/${encodeURIComponent(project.id)}/delete`}
                method="post"
              >
                <label>
                  <input name="confirm" type="checkbox" value="delete" /> I
                  understand this removes the project from my workspace and
                  schedules retained cleanup.
                </label>
                <button type="submit">Delete project</button>
              </form>
            </li>
          ))}
        </ul>
      )}
      {payload.nextCursor === undefined ? null : (
        <a href={`/workspace?cursor=${encodeURIComponent(payload.nextCursor)}`}>
          Load more projects
        </a>
      )}
      <form action="/api/auth/sign-out" method="post">
        <button type="submit">Sign out</button>
      </form>
    </main>
  );
}
