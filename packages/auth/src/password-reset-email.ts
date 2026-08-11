import type { PasswordResetEmailSender } from "./contracts.js";

/**
 * Provider-neutral HTTP adapter. The configured endpoint owns transactional
 * email delivery and receives only the recipient plus the one-time HTTPS link.
 */
export class WebhookPasswordResetEmailSender implements PasswordResetEmailSender {
  public constructor(
    private readonly endpoint: string,
    private readonly bearerToken: string | undefined,
  ) {}

  public async sendPasswordReset(input: {
    recipient: string;
    resetUrl: string;
  }): Promise<void> {
    const response = await fetch(this.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.bearerToken === undefined
          ? {}
          : { authorization: `Bearer ${this.bearerToken}` }),
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) throw new Error("Password-reset email delivery failed.");
  }
}
