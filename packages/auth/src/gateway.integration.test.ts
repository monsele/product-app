import { createId } from "@avlp/config";
import {
  auditEvents,
  authIdentities,
  migrateDatabase,
  passwordCredentials,
  passwordResetTokens,
  sessions,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  DuplicateEmailError,
  InvalidPasswordResetTokenError,
  type PasswordResetEmailSender,
} from "./contracts.js";
import { PostgresAuthGateway } from "./gateway.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;
const context = () => ({ correlationId: createId() });

describeWithPostgres("PostgresAuthGateway", () => {
  let database: TestDatabase | undefined;
  let gateway: PostgresAuthGateway;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
    gateway = new PostgresAuthGateway(database.client, "a".repeat(32));
  });
  beforeEach(async () => {
    await database!.client.delete(auditEvents);
    await database!.client.delete(passwordResetTokens);
    await database!.client.delete(sessions);
    await database!.client.delete(passwordCredentials);
    await database!.client.delete(authIdentities);
    await database!.client.delete(users);
  });
  afterAll(async () => {
    await database?.destroy();
  });

  it("normalizes email, creates an account, and persists only hash values", async () => {
    const result = await gateway.register(
      {
        email: " Teacher@Example.test ",
        password: "correct horse battery staple",
      },
      context(),
    );
    expect(result.user.email).toBe("teacher@example.test");
    expect(await gateway.currentSession(result.sessionToken)).toEqual(
      result.user,
    );
    const [credential] = await database!.client
      .select()
      .from(passwordCredentials);
    const [session] = await database!.client.select().from(sessions);
    expect(credential?.passwordHash).not.toContain(
      "correct horse battery staple",
    );
    expect(session?.tokenHash).not.toBe(result.sessionToken);
  });

  it("rejects duplicate normalized email and keeps invalid credentials generic", async () => {
    await gateway.register(
      {
        email: "teacher@example.test",
        password: "correct horse battery staple",
      },
      context(),
    );
    await expect(
      gateway.register(
        { email: "TEACHER@example.test", password: "another long password" },
        context(),
      ),
    ).rejects.toBeInstanceOf(DuplicateEmailError);
    await expect(
      gateway.signIn(
        { email: "teacher@example.test", password: "incorrect password" },
        context(),
      ),
    ).resolves.toBeNull();
    await expect(
      gateway.signIn(
        { email: "missing@example.test", password: "incorrect password" },
        context(),
      ),
    ).resolves.toBeNull();
  });

  it("revokes a session on sign-out", async () => {
    const created = await gateway.register(
      {
        email: "teacher@example.test",
        password: "correct horse battery staple",
      },
      context(),
    );
    await gateway.signOut(created.sessionToken, context());
    await expect(
      gateway.currentSession(created.sessionToken),
    ).resolves.toBeNull();
  });

  it("creates a hashed, expiring single-use reset token and revokes sessions", async () => {
    const sent: { recipient: string; resetUrl: string }[] = [];
    const emailSender: PasswordResetEmailSender = {
      sendPasswordReset: async (message) => {
        sent.push(message);
      },
    };
    let now = new Date("2026-08-10T00:00:00.000Z");
    const resetGateway = new PostgresAuthGateway(
      database!.client,
      "a".repeat(32),
      () => now,
      emailSender,
      "https://app.example.test",
      60_000,
    );
    const registered = await resetGateway.register(
      {
        email: "teacher@example.test",
        password: "correct horse battery staple",
      },
      context(),
    );
    await resetGateway.requestPasswordReset(
      { email: "teacher@example.test" },
      context(),
    );
    expect(sent).toHaveLength(1);
    const token = new URL(sent[0]!.resetUrl).searchParams.get("token")!;
    expect(
      sent[0]!.resetUrl.startsWith("https://app.example.test/reset-password?"),
    ).toBe(true);
    const [stored] = await database!.client.select().from(passwordResetTokens);
    expect(stored?.tokenHash).not.toBe(token);

    await resetGateway.confirmPasswordReset(
      { token, password: "a brand new secure password" },
      context(),
    );
    await expect(
      resetGateway.currentSession(registered.sessionToken),
    ).resolves.toBeNull();
    await expect(
      resetGateway.signIn(
        {
          email: "teacher@example.test",
          password: "correct horse battery staple",
        },
        context(),
      ),
    ).resolves.toBeNull();
    await expect(
      resetGateway.signIn(
        {
          email: "teacher@example.test",
          password: "a brand new secure password",
        },
        context(),
      ),
    ).resolves.not.toBeNull();
    await expect(
      resetGateway.confirmPasswordReset(
        { token, password: "another secure password" },
        context(),
      ),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    await resetGateway.requestPasswordReset(
      { email: "teacher@example.test" },
      context(),
    );
    const expiredToken = new URL(sent[1]!.resetUrl).searchParams.get("token")!;
    now = new Date(now.getTime() + 60_001);
    await expect(
      resetGateway.confirmPasswordReset(
        { token: expiredToken, password: "another secure password" },
        context(),
      ),
    ).rejects.toBeInstanceOf(InvalidPasswordResetTokenError);

    now = new Date("2026-08-10T00:00:00.000Z");
    await resetGateway.requestPasswordReset(
      { email: "teacher@example.test" },
      context(),
    );
    const concurrentToken = new URL(sent[2]!.resetUrl).searchParams.get(
      "token",
    )!;
    const concurrentResults = await Promise.allSettled([
      resetGateway.confirmPasswordReset(
        { token: concurrentToken, password: "another secure password" },
        context(),
      ),
      resetGateway.confirmPasswordReset(
        { token: concurrentToken, password: "another secure password" },
        context(),
      ),
    ]);
    expect(
      concurrentResults.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
  });

  it("does not send a reset link for an unknown email address", async () => {
    const sent: string[] = [];
    const emailSender: PasswordResetEmailSender = {
      sendPasswordReset: async ({ recipient }) => {
        sent.push(recipient);
      },
    };
    const resetGateway = new PostgresAuthGateway(
      database!.client,
      "a".repeat(32),
      undefined,
      emailSender,
    );
    await resetGateway.requestPasswordReset(
      { email: "missing@example.test" },
      context(),
    );
    expect(sent).toEqual([]);
  });
});
