import {
  Catch,
  ExceptionFilter,
  HttpException,
  ArgumentsHost,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import {
  PublicError,
  createId,
  toApiErrorEnvelope,
  type Identifier,
} from "@avlp/config";

type RequestWithCorrelation = { correlationId?: Identifier };

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<RequestWithCorrelation>();
    const reply = context.getResponse<FastifyReply>();
    const correlationId = request.correlationId ?? createId();
    const publicError =
      exception instanceof HttpException
        ? toPublicHttpError(exception)
        : exception;
    const envelope = toApiErrorEnvelope(publicError, correlationId);
    const statusCode =
      publicError instanceof PublicError ? publicError.statusCode : 500;
    void reply
      .header("x-correlation-id", correlationId)
      .status(statusCode)
      .send(envelope);
  }
}

function toPublicHttpError(exception: HttpException): PublicError {
  const statusCode = exception.getStatus();
  if (statusCode >= 500) {
    return new PublicError(
      "internal_error",
      "An unexpected error occurred.",
      statusCode,
      true,
    );
  }
  return new PublicError(
    mapHttpStatusToErrorCode(statusCode),
    statusCode === 404
      ? "The requested resource was not found."
      : "The request could not be processed.",
    statusCode,
  );
}

function mapHttpStatusToErrorCode(
  statusCode: number,
): "bad_request" | "unauthorized" | "forbidden" | "not_found" | "rate_limited" {
  switch (statusCode) {
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 429:
      return "rate_limited";
    default:
      return "bad_request";
  }
}
