import { NextResponse, type NextRequest } from "next/server";

const sessionCookieName = "avlp_session";

export function middleware(request: NextRequest): NextResponse {
  if (request.cookies.has(sessionCookieName)) return NextResponse.next();
  return NextResponse.redirect(new URL("/sign-in", request.url));
}

export const config = { matcher: ["/workspace/:path*"] };
