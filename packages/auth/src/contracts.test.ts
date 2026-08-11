import { describe, expect, it } from "vitest";
import {
  loginInputSchema,
  passwordResetConfirmInputSchema,
  passwordResetRequestInputSchema,
  registerInputSchema,
} from "./contracts.js";
import { hashSessionToken, normalizeEmail } from "./gateway.js";
import { InMemoryAuthRateLimiter } from "./rate-limiter.js";

describe("auth contracts", () => {
  it("enforces email and password input boundaries", () => {
    expect(() =>
      registerInputSchema.parse({ email: "bad", password: "short" }),
    ).toThrow();
    expect(
      loginInputSchema.safeParse({
        email: "teacher@example.test",
        password: "x",
      }).success,
    ).toBe(true);
  });
  it("validates password-reset input boundaries", () => {
    expect(
      passwordResetRequestInputSchema.safeParse({ email: "bad" }).success,
    ).toBe(false);
    expect(
      passwordResetConfirmInputSchema.safeParse({
        token: "a".repeat(43),
        password: "correct horse battery staple",
      }).success,
    ).toBe(true);
    expect(
      passwordResetConfirmInputSchema.safeParse({
        token: "short",
        password: "short",
      }).success,
    ).toBe(false);
  });
  it("normalizes email and keyed-hashes opaque session tokens", () => {
    expect(normalizeEmail(" Teacher@Example.test ")).toBe(
      "teacher@example.test",
    );
    expect(hashSessionToken("token", "a".repeat(32))).not.toBe("token");
  });
  it("limits both account and network attempts without retaining raw email", () => {
    const limiter = new InMemoryAuthRateLimiter(
      "a".repeat(32),
      () => new Date(0),
      1,
    );
    expect(
      limiter.check({
        operation: "login",
        email: "teacher@example.test",
        network: "127.0.0.1",
      }),
    ).toBe(true);
    expect(
      limiter.check({
        operation: "login",
        email: "teacher@example.test",
        network: "127.0.0.1",
      }),
    ).toBe(false);
  });
});
