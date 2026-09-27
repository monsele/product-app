import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { projectListPageSchema } from "@avlp/schemas";
import { oneShotEligibilitySchema } from "@avlp/schemas/one-shot";
import { AuthenticatedAppShell } from "../../components/layout/authenticated-app-shell";
import { ProjectBoardClient } from "./project-board-client";
import { ContextualInformationRail } from "./information-rail";
import styles from "./workspace.module.css";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ cursor?: string; error?: string; done?: string }>;
}) {
  const token = (await cookies()).get("avlp_session")?.value;
  if (token === undefined) redirect("/sign-in");

  const { cursor, error, done } = await searchParams;
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

  // ST-106. Eligibility is per user but served under a project, so it is read
  // through the most recent one. A user with no project yet does not see the
  // quick-video option until they have one. Hiding it is a convenience only:
  // the API enforces the cohort on every one-shot call.
  const eligibilityProject = payload.items[0];
  const eligibilityResponse =
    eligibilityProject === undefined
      ? null
      : await fetch(
          apiUrl(
            `/projects/${encodeURIComponent(eligibilityProject.id)}/one-shot/eligibility`,
          ),
          {
            headers: { cookie: `avlp_session=${encodeURIComponent(token)}` },
            cache: "no-store",
          },
        ).catch(() => null);
  const eligibility =
    eligibilityResponse?.ok === true
      ? oneShotEligibilitySchema.safeParse(
          await eligibilityResponse.json().catch(() => null),
        )
      : null;
  const quickVideoVisible =
    eligibility?.success === true && eligibility.data.visible;

  return (
    <AuthenticatedAppShell userEmail="teacher@school.org" mode="daylight">
      <div className={styles.page}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>Your lessons</h1>
          <p className={styles.pageLead}>
            Manage existing video lessons, monitor generation progress, or
            create a new lesson.
          </p>
        </header>

        {/* 70/30 board and rail composition. See docs/design.md 6.2. */}
        <div className={styles.layout}>
          <div className={styles.board}>
            <ProjectBoardClient
              projects={payload.items}
              nextCursor={payload.nextCursor}
              error={error}
              done={done}
              quickVideoVisible={quickVideoVisible}
            />
          </div>

          <ContextualInformationRail projects={payload.items} />
        </div>
      </div>
    </AuthenticatedAppShell>
  );
}
