import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { middleware } from "./middleware";

describe("workspace route protection", () => {
  it("redirects a visitor without a session cookie to sign-in", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/workspace"),
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in",
    );
  });
  it("allows a visitor with a session cookie through", () => {
    const response = middleware(
      new NextRequest("http://localhost:3000/workspace", {
        headers: { cookie: "avlp_session=opaque" },
      }),
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
