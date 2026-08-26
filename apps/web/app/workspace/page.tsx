import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { projectListPageSchema } from "@avlp/schemas";
import { AuthenticatedAppShell } from "../../components/layout/authenticated-app-shell";
import { ProjectBoardClient } from "./project-board-client";
import { ContextualInformationRail } from "./information-rail";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
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

  if (!response.ok || parsed === undefined || !parsed.success) {
    throw new Error("The workspace could not be loaded.");
  }

  const payload = parsed.data;

  return (
    <AuthenticatedAppShell userEmail="teacher@school.org" mode="daylight">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "24px",
          padding: "8px 0 40px 0",
        }}
      >
        {/* Workspace Title */}
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
            Your lessons
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "15px",
              color: "var(--color-text-muted)",
              lineHeight: "22px",
            }}
          >
            Manage existing video lessons, monitor generation progress, or create a new lesson.
          </p>
        </header>

        {/* 70/30 Composition: Project Board & Information Rail */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "32px",
            alignItems: "start",
          }}
        >
          {/* Main Board (Flexible 70% region) */}
          <div style={{ minWidth: 0, flex: 1 }}>
            <ProjectBoardClient
              projects={payload.items}
              nextCursor={payload.nextCursor}
              error={error}
            />
          </div>

          {/* Contextual Information Rail (320-360px on wide screens) */}
          <div
            style={{
              width: "100%",
              maxWidth: "360px",
              justifySelf: "center",
            }}
          >
            <ContextualInformationRail />
          </div>
        </div>
      </div>
    </AuthenticatedAppShell>
  );
}
