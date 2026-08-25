import { NextResponse, type NextRequest } from "next/server";
import {
  projectCloneIdempotencyKeySchema,
  projectDuplicateResponseSchema,
} from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
): Promise<NextResponse> {
  const { projectId } = await context.params;
  const formData = await request.formData();
  const idempotencyKey = projectCloneIdempotencyKeySchema.safeParse(
    formData.get("idempotencyKey"),
  );
  if (!idempotencyKey.success)
    return NextResponse.redirect(
      new URL("/workspace?error=duplicate", request.url),
      303,
    );
  const response = await fetch(
    apiUrl(`/projects/${encodeURIComponent(projectId)}/duplicate`),
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": idempotencyKey.data,
        cookie: request.headers.get("cookie") ?? "",
        ...(request.headers.get("origin") === null
          ? {}
          : { origin: request.headers.get("origin")! }),
      },
      body: JSON.stringify({}),
      cache: "no-store",
    },
  );
  const payload: unknown = await response.json().catch(() => null);
  const parsed = response.ok
    ? projectDuplicateResponseSchema.safeParse(payload)
    : undefined;
  if (!response.ok || parsed === undefined || !parsed.success)
    return NextResponse.redirect(
      new URL("/workspace?error=duplicate", request.url),
      303,
    );
  return NextResponse.redirect(
    new URL(`/workspace/${parsed.data.project.id}/upload`, request.url),
    303,
  );
}
