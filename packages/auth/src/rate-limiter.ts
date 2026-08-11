import { createHmac } from "node:crypto";

export type AuthRateLimitInput = {
  operation: "register" | "login" | "password_reset";
  email: string;
  network: string;
};

/** A bounded local limiter; deploy behind a shared edge limiter when scaled out. */
export class InMemoryAuthRateLimiter {
  private readonly attempts = new Map<
    string,
    { count: number; resetAt: number }
  >();
  public constructor(
    private readonly secret: string,
    private readonly clock: () => Date = () => new Date(),
    private readonly maximumAttempts = 5,
    private readonly windowMs = 60_000,
  ) {}
  public check(input: AuthRateLimitInput): boolean {
    const now = this.clock().getTime();
    const emailKey = this.key(
      `${input.operation}:email:${input.email.trim().toLowerCase()}`,
    );
    const networkKey = this.key(`${input.operation}:network:${input.network}`);
    return this.increment(emailKey, now) && this.increment(networkKey, now);
  }
  private increment(key: string, now: number): boolean {
    const prior = this.attempts.get(key);
    const record =
      prior === undefined || prior.resetAt <= now
        ? { count: 0, resetAt: now + this.windowMs }
        : prior;
    record.count += 1;
    this.attempts.set(key, record);
    return record.count <= this.maximumAttempts;
  }
  private key(value: string): string {
    return createHmac("sha256", this.secret).update(value).digest("hex");
  }
}
