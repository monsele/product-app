import { AsyncLocalStorage } from "node:async_hooks";
import {
  getCorrelationId,
  identifierSchema,
  type CorrelationContext,
  type Identifier,
} from "@avlp/config";

export const correlationHeader = "x-correlation-id" as const;
const correlationStorage = new AsyncLocalStorage<CorrelationContext>();

export function correlationIdFromHeader(
  value: string | readonly string[] | undefined,
): Identifier {
  return getCorrelationId(Array.isArray(value) ? value[0] : value);
}

export function correlationHeaders(
  correlationId: Identifier,
): Record<typeof correlationHeader, Identifier> {
  return { [correlationHeader]: identifierSchema.parse(correlationId) };
}

export function withCorrelationContext<T>(
  context: CorrelationContext,
  operation: () => T,
): T {
  return correlationStorage.run(
    { correlationId: identifierSchema.parse(context.correlationId) },
    operation,
  );
}

export function currentCorrelationId(): Identifier | undefined {
  return correlationStorage.getStore()?.correlationId;
}
