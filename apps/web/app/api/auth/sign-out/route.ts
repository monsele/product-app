import { NextResponse, type NextRequest } from "next/server";

export async function POST(request: NextRequest): Promise<NextResponse> {
  const token = request.cookies.get("avlp_session")?.value;
  if (token !== undefined) {
    const revoked = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/auth/session`,
      {
        method: "DELETE",
        headers: {
          cookie: `avlp_session=${encodeURIComponent(token)}`,
          origin: request.nextUrl.origin,
        },
      },
    );
    if (!revoked.ok)
      return NextResponse.json(
        { error: "Unable to sign out. Please try again." },
        { status: 503 },
      );
  }
  const response = NextResponse.redirect(new URL("/sign-in", request.url), 303);
  response.cookies.set("avlp_session", "", {
    httpOnly: true,
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
  return response;
}
