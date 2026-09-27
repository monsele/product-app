import { NextResponse, type NextRequest } from "next/server";
import { projectCreateResponseSchema } from "@avlp/schemas";

function apiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}${path}`;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const data = await request.formData();
  const title = data.get("title");
  if (typeof title !== "string" || title.trim().length === 0)
    return NextResponse.redirect(
      new URL("/workspace?error=title", request.url),
      303,
    );

  const response = await fetch(apiUrl("/projects"), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie: request.headers.get("cookie") ?? "",
      ...(request.headers.get("origin") === null
        ? {}
        : { origin: request.headers.get("origin")! }),
    },
    body: JSON.stringify({ title }),
    cache: "no-store",
  });
  const payload: unknown = await response.json().catch(() => null);
  const parsed = response.ok
    ? projectCreateResponseSchema.safeParse(payload)
    : undefined;
  if (!response.ok || parsed === undefined || !parsed.success)
    return NextResponse.redirect(
      new URL("/workspace?error=title", request.url),
      303,
    );

  // ST-106: the quick-video option opens the prompt-to-video run page. The
  // page itself checks the cohort, so a forged `flow` only shows "unavailable".
  const next =
    data.get("flow") === "one-shot" ? "one-shot" : "upload";
  return NextResponse.redirect(
    new URL(`/workspace/${parsed.data.project.id}/${next}`, request.url),
    303,
  );
}
