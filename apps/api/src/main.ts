import { startTelemetry } from "@avlp/observability/telemetry";

async function bootstrap(): Promise<void> {
  const telemetry = await startTelemetry({
    serviceName: "avlp-api",
    ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  });
  try {
    const { runApi } = await import("./runtime.js");
    await runApi({ telemetryShutdown: telemetry.shutdown });
  } catch (error) {
    await telemetry.shutdown();
    throw error;
  }
}

void bootstrap();
