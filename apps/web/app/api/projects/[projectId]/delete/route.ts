import { NextResponse, type NextRequest } from "next/server";
import { projectDeleteResponseSchema } from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const formData = await request.formData();
  if (formData.get("confirm") !== "delete")
    return NextResponse.redirect(
      new URL("/workspace?error=confirm-delete", request.url),
      303,
    );
  const { projectId } = await context.params;
  const response = await fetch(
    apiUrl(`/projects/${encodeURIComponent(projectId)}`),
    {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        cookie: request.headers.get("cookie") ?? "",
        ...(request.headers.get("origin") === null
          ? {}
          : { origin: request.headers.get("origin")! }),
      },
      body: JSON.stringify({ confirm: true }),
      cache: "no-store",
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const parsed = response.ok
    ? projectDeleteResponseSchema.safeParse(payload)
    : undefined;
  // The redirect carries the outcome so the board can confirm it in a toast:
  // a client-side toast would not survive this navigation.
  return NextResponse.redirect(
    new URL(
      !response.ok || parsed === undefined || !parsed.success
        ? "/workspace?error=delete"
        : "/workspace?done=delete",
      request.url,
    ),
    303,
  );
}
