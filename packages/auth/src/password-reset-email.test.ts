import { afterEach, describe, expect, it, vi } from "vitest";
import { WebhookPasswordResetEmailSender } from "./password-reset-email.js";

describe("WebhookPasswordResetEmailSender", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the recipient and reset URL through the configured adapter", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const sender = new WebhookPasswordResetEmailSender(
      "https://mail.example.test/password-resets",
      "secret",
    );
    await sender.sendPasswordReset({
      recipient: "teacher@example.test",
      resetUrl: "https://app.example.test/reset-password?token=opaque",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://mail.example.test/password-resets",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ authorization: "Bearer secret" }),
      }),
    );
  });
});
