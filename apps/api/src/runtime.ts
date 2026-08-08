import { parseEnvironment } from "@avlp/config";
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
      telemetryShutdown: input.telemetryShutdown,
    });
    app.enableShutdownHooks();
    await app.listen({ port: environment.PORT, host: "0.0.0.0" });
  } catch (error) {
    await database.close();
    throw error;
  }
}
