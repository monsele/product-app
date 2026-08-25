import { startTelemetry } from "@avlp/observability/telemetry";
import { health } from "./health.js";

async function bootstrap(): Promise<void> {
  if (process.argv.includes("--health")) {
    console.info(JSON.stringify(health()));
    return;
  }
  const telemetry = await startTelemetry({
    serviceName: "avlp-renderer",
    ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  });
  try {
    const { runRenderWorker } = await import("./runtime.js");
    await runRenderWorker(process.env);
  } finally {
    await telemetry.shutdown();
  }
}

void bootstrap();
