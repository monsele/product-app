import { z } from "zod";
import { safeMetadataSchema, type SafeMetadata } from "./contracts.js";
import { currentCorrelationId } from "./correlation.js";
import { redactSensitiveData } from "./redaction.js";

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
export type LogLevel = z.infer<typeof logLevelSchema>;
const eventNameSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z][a-z0-9_.-]*$/);

export type StructuredLogRecord = {
  timestamp: string;
  level: LogLevel;
  event: string;
  fields: SafeMetadata;
};
export type LogSink = (record: StructuredLogRecord) => void;

export interface StructuredLogger {
  debug(event: string, fields?: unknown): void;
  info(event: string, fields?: unknown): void;
  warn(event: string, fields?: unknown): void;
  error(event: string, fields?: unknown): void;
}

export function createStructuredLogger(input: {
  service: string;
  sink?: LogSink;
  clock?: () => Date;
}): StructuredLogger {
  const service = eventNameSchema.parse(input.service);
  const clock = input.clock ?? (() => new Date());
  const sink =
    input.sink ??
    ((record: StructuredLogRecord) => {
      console.log(JSON.stringify(record));
    });
  const write = (level: LogLevel, event: string, fields: unknown = {}) => {
    try {
      const redacted = redactSensitiveData(fields);
      const safeFields = safeMetadataSchema.parse(
        typeof redacted === "object" &&
          redacted !== null &&
          !Array.isArray(redacted)
          ? redacted
          : { value: redacted },
      );
      const correlationId = currentCorrelationId();
      sink({
        timestamp: clock().toISOString(),
        level,
        event: eventNameSchema.parse(event),
        fields: {
          ...safeFields,
          service,
          ...(correlationId === undefined ? {} : { correlationId }),
        },
      });
    } catch {
      // Diagnostic logging must not change product behavior.
    }
  };
  return {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
  };
}
