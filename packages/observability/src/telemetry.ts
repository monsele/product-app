import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  BatchSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import type { Attributes, AttributeValue } from "@opentelemetry/api";
import { z } from "zod";
import { redactSensitiveData } from "./redaction.js";

type ExportCallback = Parameters<SpanExporter["export"]>[1];

function sanitizedAttributeValue(
  key: string,
  value: AttributeValue,
): AttributeValue {
  const wrapper = redactSensitiveData({ [key]: value });
  if (typeof wrapper !== "object" || wrapper === null || Array.isArray(wrapper))
    return "[REDACTED]";
  const sanitized = wrapper[key];
  if (
    typeof sanitized === "string" ||
    typeof sanitized === "number" ||
    typeof sanitized === "boolean"
  )
    return sanitized;
  if (Array.isArray(sanitized)) {
    if (sanitized.every((item) => typeof item === "string"))
      return sanitized as string[];
    if (sanitized.every((item) => typeof item === "number"))
      return sanitized as number[];
    if (sanitized.every((item) => typeof item === "boolean"))
      return sanitized as boolean[];
  }
  return "[REDACTED]";
}

export function sanitizeSpanAttributes(attributes: Attributes): Attributes {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(
        (entry): entry is [string, AttributeValue] => entry[1] !== undefined,
      )
      .map(([key, value]) => [key, sanitizedAttributeValue(key, value)]),
  );
}

function sanitizedSpan(span: ReadableSpan): ReadableSpan {
  const attributes = sanitizeSpanAttributes(span.attributes);
  const events = span.events.map((event) => ({
    ...event,
    name: String(sanitizedAttributeValue("eventName", event.name)),
    ...(event.attributes === undefined
      ? {}
      : { attributes: sanitizeSpanAttributes(event.attributes) }),
  }));
  const links = span.links.map((link) => ({
    ...link,
    ...(link.attributes === undefined
      ? {}
      : { attributes: sanitizeSpanAttributes(link.attributes) }),
  }));
  const status = {
    ...span.status,
    ...(span.status.message === undefined
      ? {}
      : {
          message: String(
            sanitizedAttributeValue("errorMessage", span.status.message),
          ),
        }),
  };
  const resource = new Proxy(span.resource, {
    get(target, property) {
      if (property === "attributes")
        return sanitizeSpanAttributes(target.attributes);
      const value = Reflect.get(target, property, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(span, {
    get(target, property) {
      switch (property) {
        case "attributes":
          return attributes;
        case "events":
          return events;
        case "links":
          return links;
        case "name":
          return String(sanitizedAttributeValue("spanName", target.name));
        case "resource":
          return resource;
        case "status":
          return status;
        default: {
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      }
    },
  });
}

export class SanitizingSpanExporter implements SpanExporter {
  public constructor(private readonly delegate: SpanExporter) {}

  public export(spans: ReadableSpan[], resultCallback: ExportCallback): void {
    this.delegate.export(spans.map(sanitizedSpan), resultCallback);
  }

  public shutdown(): Promise<void> {
    return this.delegate.shutdown();
  }

  public forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve();
  }
}

export const telemetryConfigurationSchema = z.object({
  serviceName: z.string().min(1).max(100),
  otlpEndpoint: z.string().url().optional(),
  metricExportIntervalMs: z
    .number()
    .int()
    .min(1_000)
    .max(300_000)
    .default(60_000),
});
export type TelemetryConfiguration = z.input<
  typeof telemetryConfigurationSchema
>;

export type TelemetryLifecycle = {
  enabled: boolean;
  shutdown: () => Promise<void>;
};

export async function startTelemetry(
  rawConfiguration: TelemetryConfiguration,
): Promise<TelemetryLifecycle> {
  const configuration = telemetryConfigurationSchema.parse(rawConfiguration);
  if (configuration.otlpEndpoint === undefined)
    return { enabled: false, shutdown: () => Promise.resolve() };
  const endpoint = configuration.otlpEndpoint.replace(/\/$/, "");
  const traceExporter = new SanitizingSpanExporter(
    new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
  );
  const sdk = new NodeSDK({
    serviceName: configuration.serviceName,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
      exportIntervalMillis: configuration.metricExportIntervalMs,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  await sdk.start();
  return { enabled: true, shutdown: () => sdk.shutdown() };
}
