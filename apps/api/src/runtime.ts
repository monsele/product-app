import { parseEnvironment } from "@avlp/config";
import {
  InMemoryAuthRateLimiter,
  PostgresAuthGateway,
  WebhookPasswordResetEmailSender,
} from "@avlp/auth";
import { createDatabaseConnection } from "@avlp/database";
import { createApp } from "./app.js";

export async function runApi(input: {
  telemetryShutdown: () => Promise<void>;
}): Promise<void> {
  const environment = parseEnvironment(process.env);
  const database = createDatabaseConnection(environment.DATABASE_URL);
  try {
    await database.healthCheck();
    const app = await createApp({
      database,
      authGateway: new PostgresAuthGateway(
        database.client,
        environment.AUTH_SESSION_SECRET,
        undefined,
        environment.PASSWORD_RESET_EMAIL_WEBHOOK_URL === undefined
          ? undefined
          : new WebhookPasswordResetEmailSender(
              environment.PASSWORD_RESET_EMAIL_WEBHOOK_URL,
              environment.PASSWORD_RESET_EMAIL_WEBHOOK_TOKEN,
            ),
        environment.WEB_ORIGIN ?? "http://localhost:3000",
        environment.PASSWORD_RESET_TTL_SECONDS * 1000,
      ),
      authRateLimiter: new InMemoryAuthRateLimiter(
        environment.AUTH_SESSION_SECRET,
      ),
      ...(environment.WEB_ORIGIN === undefined
        ? {}
        : { trustedOrigin: environment.WEB_ORIGIN }),
      telemetryShutdown: input.telemetryShutdown,
    });
    app.enableShutdownHooks();
    await app.listen({ port: environment.PORT, host: "0.0.0.0" });
  } catch (error) {
    await database.close();
    throw error;
  }
}
