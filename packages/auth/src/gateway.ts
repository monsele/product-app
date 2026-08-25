import { createHmac, randomBytes } from "node:crypto";
import { setTimeout as wait } from "node:timers/promises";
import { hash, verify } from "@node-rs/argon2";
import { createId } from "@avlp/config";
import {
  authIdentities,
  passwordCredentials,
  passwordResetTokens,
  sessions,
  users,
  type DatabaseClient,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import { and, eq, gt, isNull } from "drizzle-orm";
import {
  authenticatedUserSchema,
  loginInputSchema,
  passwordResetConfirmInputSchema,
  passwordResetRequestInputSchema,
  registerInputSchema,
  type AuthContext,
  type AuthGateway,
  type AuthResult,
  type AuthenticatedUser,
  DuplicateEmailError,
  InvalidPasswordResetTokenError,
  type LoginInput,
  type RegisterInput,
  type PasswordResetConfirmInput,
  type PasswordResetRequestInput,
  type PasswordResetEmailSender,
} from "./contracts.js";

const credentialsProvider = "application_credentials";
const sessionLifetimeMs = 1000 * 60 * 60 * 24 * 14;
// Keeps unknown-account attempts on the same Argon2id work factor as known ones.
const dummyPasswordHash =
  "$argon2id$v=19$m=19456,t=2,p=1$WWoY7w32Uxukc8HAISf0pQ$cUs2TpZg1b7spIiRER/3hhVzCN/K8LmxaOvk3lJOnTY";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function defaultDisplayName(email: string): string {
  return email.slice(0, email.indexOf("@")) || "Teacher";
}

export function hashSessionToken(token: string, secret: string): string {
  return createHmac("sha256", secret).update(token).digest("hex");
}

const unavailablePasswordResetEmailSender: PasswordResetEmailSender = {
  sendPasswordReset: () => Promise.reject(new Error("Email is unavailable.")),
};

export class PostgresAuthGateway implements AuthGateway {
  public constructor(
    private readonly executor: DatabaseClient,
    private readonly sessionSecret: string,
    private readonly now: () => Date = () => new Date(),
    private readonly passwordResetEmailSender: PasswordResetEmailSender = unavailablePasswordResetEmailSender,
    private readonly passwordResetOrigin = "http://localhost:3000",
    private readonly passwordResetLifetimeMs = 1000 * 60 * 15,
    private readonly passwordResetResponseFloorMs = 250,
    private readonly delay: (milliseconds: number) => Promise<void> = (
      milliseconds,
    ) => wait(milliseconds),
  ) {}

  public async register(
    input: RegisterInput,
    context: AuthContext,
  ): Promise<AuthResult> {
    const parsed = registerInputSchema.parse(input);
    const email = normalizeEmail(parsed.email);
    const userId = createId(this.now());
    const passwordHash = await hash(parsed.password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
    try {
      await this.executor.transaction(async (transaction) => {
        await transaction.insert(users).values({
          id: userId,
          emailNormalized: email,
          displayName: parsed.displayName ?? defaultDisplayName(email),
        });
        await transaction.insert(authIdentities).values({
          id: createId(this.now()),
          userId,
          provider: credentialsProvider,
          providerSubject: userId,
        });
        await transaction
          .insert(passwordCredentials)
          .values({ userId, passwordHash });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: userId,
          actor: { type: "user", userId },
          eventType: "auth.registration",
          target: { type: "user", id: userId },
          correlationId: context.correlationId,
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateEmailError();
      throw error;
    }
    return this.createSession(
      authenticatedUserSchema.parse({
        id: userId,
        email,
        displayName: parsed.displayName ?? defaultDisplayName(email),
      }),
    );
  }

  public async signIn(
    input: LoginInput,
    context: AuthContext,
  ): Promise<AuthResult | null> {
    const parsed = loginInputSchema.parse(input);
    const email = normalizeEmail(parsed.email);
    const [record] = await this.executor
      .select({
        id: users.id,
        email: users.emailNormalized,
        displayName: users.displayName,
        status: users.status,
        passwordHash: passwordCredentials.passwordHash,
      })
      .from(users)
      .innerJoin(passwordCredentials, eq(passwordCredentials.userId, users.id))
      .where(eq(users.emailNormalized, email))
      .limit(1);
    const passwordMatches = await verify(
      record?.passwordHash ?? dummyPasswordHash,
      parsed.password,
    );
    const valid =
      record !== undefined && record.status === "active" && passwordMatches;
    if (!valid) {
      if (record !== undefined)
        await new PostgresAuditWriter(this.executor).write({
          ownerUserId: record.id,
          actor: { type: "user", userId: record.id },
          eventType: "auth.login_failed",
          target: { type: "user", id: record.id },
          correlationId: context.correlationId,
        });
      return null;
    }
    const user = authenticatedUserSchema.parse({
      id: record.id,
      email: record.email,
      displayName: record.displayName,
    });
    const result = await this.createSession(user);
    await new PostgresAuditWriter(this.executor).write({
      ownerUserId: user.id,
      actor: { type: "user", userId: user.id },
      eventType: "auth.login",
      target: { type: "user", id: user.id },
      correlationId: context.correlationId,
    });
    return result;
  }

  public async currentSession(
    token: string,
  ): Promise<AuthenticatedUser | null> {
    const tokenHash = hashSessionToken(token, this.sessionSecret);
    const [record] = await this.executor
      .select({
        id: users.id,
        email: users.emailNormalized,
        displayName: users.displayName,
        status: users.status,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.tokenHash, tokenHash),
          isNull(sessions.revokedAt),
          gt(sessions.expiresAt, this.now()),
        ),
      )
      .limit(1);
    return record === undefined || record.status !== "active"
      ? null
      : authenticatedUserSchema.parse(record);
  }

  public async signOut(token: string, context: AuthContext): Promise<void> {
    const tokenHash = hashSessionToken(token, this.sessionSecret);
    const [record] = await this.executor
      .select({ sessionId: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(and(eq(sessions.tokenHash, tokenHash), isNull(sessions.revokedAt)))
      .limit(1);
    if (record === undefined) return;
    await this.executor
      .update(sessions)
      .set({ revokedAt: this.now(), updatedAt: this.now() })
      .where(eq(sessions.id, record.sessionId));
    await new PostgresAuditWriter(this.executor).write({
      ownerUserId: record.userId,
      actor: { type: "user", userId: record.userId },
      eventType: "auth.logout",
      target: { type: "session", id: record.sessionId },
      correlationId: context.correlationId,
    });
  }

  public async requestPasswordReset(
    input: PasswordResetRequestInput,
    context: AuthContext,
  ): Promise<void> {
    const startedAt = Date.now();
    const parsed = passwordResetRequestInputSchema.parse(input);
    const email = normalizeEmail(parsed.email);
    try {
      const [user] = await this.executor
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.emailNormalized, email))
        .limit(1);
      if (user === undefined || user.status !== "active") return;

      const token = randomBytes(32).toString("base64url");
      const requestedAt = this.now();
      await this.executor.transaction(async (transaction) => {
        await transaction.insert(passwordResetTokens).values({
          id: createId(requestedAt),
          userId: user.id,
          tokenHash: hashSessionToken(token, this.sessionSecret),
          expiresAt: new Date(
            requestedAt.getTime() + this.passwordResetLifetimeMs,
          ),
        });
        await new PostgresAuditWriter(transaction).write({
          ownerUserId: user.id,
          actor: { type: "user", userId: user.id },
          eventType: "auth.password_reset_requested",
          target: { type: "user", id: user.id },
          correlationId: context.correlationId,
        });
      });
      const resetUrl = new URL("/reset-password", this.passwordResetOrigin);
      resetUrl.searchParams.set("token", token);
      // Delivery is intentionally detached from the enumeration-safe response.
      // Promise.resolve also converts a synchronous adapter throw into a rejection.
      void Promise.resolve()
        .then(() =>
          this.passwordResetEmailSender.sendPasswordReset({
            recipient: email,
            resetUrl: resetUrl.toString(),
          }),
        )
        .catch(() => undefined);
    } finally {
      const remaining =
        this.passwordResetResponseFloorMs - (Date.now() - startedAt);
      if (remaining > 0) await this.delay(remaining);
    }
  }

  public async confirmPasswordReset(
    input: PasswordResetConfirmInput,
    context: AuthContext,
  ): Promise<void> {
    const parsed = passwordResetConfirmInputSchema.parse(input);
    const passwordHash = await hash(parsed.password, {
      algorithm: 2,
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      outputLen: 32,
    });
    const resetAt = this.now();
    const tokenHash = hashSessionToken(parsed.token, this.sessionSecret);
    const consumed = await this.executor.transaction(async (transaction) => {
      const [token] = await transaction
        .update(passwordResetTokens)
        .set({ usedAt: resetAt, updatedAt: resetAt })
        .where(
          and(
            eq(passwordResetTokens.tokenHash, tokenHash),
            isNull(passwordResetTokens.usedAt),
            gt(passwordResetTokens.expiresAt, resetAt),
          ),
        )
        .returning({
          userId: passwordResetTokens.userId,
          id: passwordResetTokens.id,
        });
      if (token === undefined) return false;
      await transaction
        .update(passwordCredentials)
        .set({ passwordHash, updatedAt: resetAt })
        .where(eq(passwordCredentials.userId, token.userId));
      await transaction
        .update(sessions)
        .set({ revokedAt: resetAt, updatedAt: resetAt })
        .where(
          and(eq(sessions.userId, token.userId), isNull(sessions.revokedAt)),
        );
      await new PostgresAuditWriter(transaction).write({
        ownerUserId: token.userId,
        actor: { type: "user", userId: token.userId },
        eventType: "auth.password_changed",
        target: { type: "password_reset_token", id: token.id },
        correlationId: context.correlationId,
      });
      return true;
    });
    if (!consumed) throw new InvalidPasswordResetTokenError();
  }

  private async createSession(user: AuthenticatedUser): Promise<AuthResult> {
    const sessionToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(this.now().getTime() + sessionLifetimeMs);
    await this.executor.insert(sessions).values({
      id: createId(this.now()),
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken, this.sessionSecret),
      expiresAt,
    });
    return { user, sessionToken, expiresAt };
  }
}

function isUniqueViolation(error: unknown): boolean {
  if (hasPostgresCode(error, "23505")) return true;
  return (
    typeof error === "object" &&
    error !== null &&
    "cause" in error &&
    isUniqueViolation(error.cause)
  );
}

function hasPostgresCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}
