import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthenticatedAppShell } from "../../../components/layout/authenticated-app-shell";
import { DesignSystemsEditor } from "./systems-editor";

export default async function DesignSystemsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  if (!(await cookies()).get("avlp_session")) redirect("/sign-in");
  const { projectId } = await searchParams;
  return (
    <AuthenticatedAppShell mode="daylight">
      <DesignSystemsEditor initialProjectId={projectId} />
    </AuthenticatedAppShell>
  );
}
