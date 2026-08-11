import { afterEach, describe, expect, it } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import { createId } from "@avlp/config";
import { InvalidPasswordResetTokenError, type AuthGateway } from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";

const user = {
  id: createId(),
  email: "teacher@example.test",
  displayName: "Teacher",
};
function gateway(): AuthGateway {
  let active = true;
  return {
    register: async () => ({
      user,
      sessionToken: "session-token",
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
    }),
    signIn: async (input) =>
      input.password === "valid-password"
        ? {
            user,
            sessionToken: "session-token",
            expiresAt: new Date("2026-09-01T00:00:00.000Z"),
          }
        : null,
    currentSession: async (token) =>
      active && token === "session-token" ? user : null,
    signOut: async () => {
      active = false;
    },
    requestPasswordReset: async () => {},
    confirmPasswordReset: async (input) => {
      if (input.token !== "a".repeat(43))
        throw new InvalidPasswordResetTokenError();
    },
  };
}

describe("authentication routes", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });
  async function api() {
    app = await createApp({
      authGateway: gateway(),
      trustedOrigin: "http://localhost:3000",
    });
    return app.getHttpAdapter().getInstance();
  }
  it("registers with a secure session cookie and CORS/CSRF origin policy", async () => {
    const server = await api();
    const response = await server.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin: "http://localhost:3000" },
      payload: {
        email: "teacher@example.test",
        password: "correct horse battery staple",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers["set-cookie"]).toContain(
      `${sessionCookieName}=session-token`,
    );
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:3000",
    );
    const forbidden = await server.inject({
      method: "POST",
      url: "/auth/register",
      headers: { origin: "https://attacker.example" },
      payload: {
        email: "teacher@example.test",
        password: "correct horse battery staple",
      },
    });
    expect(forbidden.statusCode).toBe(403);
  });
  it("returns the same generic error for invalid credentials and prevents access after logout", async () => {
    const server = await api();
    const invalid = await server.inject({
      method: "POST",
      url: "/auth/login",
      headers: { origin: "http://localhost:3000" },
      payload: { email: "teacher@example.test", password: "wrong-password" },
    });
    expect(invalid.statusCode).toBe(401);
    expect(invalid.json().error.message).toBe("Invalid email or password.");
    const before = await server.inject({
      method: "GET",
      url: "/auth/session",
      cookies: { [sessionCookieName]: "session-token" },
    });
    expect(before.statusCode).toBe(200);
    const logout = await server.inject({
      method: "DELETE",
      url: "/auth/session",
      headers: { origin: "http://localhost:3000" },
      cookies: { [sessionCookieName]: "session-token" },
    });
    expect(logout.statusCode).toBe(200);
    const after = await server.inject({
      method: "GET",
      url: "/auth/session",
      cookies: { [sessionCookieName]: "session-token" },
    });
    expect(after.statusCode).toBe(401);
  });
  it("hides account existence and rate limits reset requests", async () => {
    const server = await api();
    const request = (email: string) =>
      server.inject({
        method: "POST",
        url: "/auth/password-reset/request",
        headers: { origin: "http://localhost:3000" },
        payload: { email },
      });
    const known = await request("teacher@example.test");
    const unknown = await request("missing@example.test");
    expect(known.statusCode).toBe(201);
    expect(known.json()).toEqual(unknown.json());
    for (let attempt = 0; attempt < 4; attempt += 1)
      await request("limited@example.test");
    expect((await request("limited@example.test")).statusCode).toBe(429);
  });
  it("rejects an invalid reset token without setting a session", async () => {
    const server = await api();
    const response = await server.inject({
      method: "POST",
      url: "/auth/password-reset/confirm",
      headers: { origin: "http://localhost:3000" },
      payload: {
        token: "b".repeat(43),
        password: "correct horse battery staple",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["set-cookie"]).toBeUndefined();
  });
});
