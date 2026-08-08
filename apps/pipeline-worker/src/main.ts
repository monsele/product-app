import { startTelemetry } from "@avlp/observability/telemetry";

async function bootstrap(): Promise<void> {
  const telemetry = await startTelemetry({
    serviceName: "avlp-pipeline-worker",
    ...(process.env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : { otlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT }),
  });
  try {
    const { runPipelineWorker } = await import("./runtime.js");
    await runPipelineWorker(process.env);
  } finally {
    await telemetry.shutdown();
  }
}

void bootstrap();
