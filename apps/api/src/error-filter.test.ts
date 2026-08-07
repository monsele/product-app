import {
  BadRequestException,
  InternalServerErrorException,
  type ArgumentsHost,
} from "@nestjs/common";
import { createId, PublicError } from "@avlp/config";
import { describe, expect, it, vi } from "vitest";
import { ApiExceptionFilter } from "./error-filter.js";

function createHost(correlationId: string) {
  const reply = {
    header: vi.fn(),
    status: vi.fn(),
    send: vi.fn(),
  };
  reply.header.mockReturnValue(reply);
  reply.status.mockReturnValue(reply);
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ correlationId }),
      getResponse: () => reply,
    }),
  } as unknown as ArgumentsHost;
  return { host, reply };
}

describe("ApiExceptionFilter", () => {
  it("maps framework, public, and unexpected exceptions to safe envelopes", () => {
    const filter = new ApiExceptionFilter();
    const correlationId = createId();

    const framework = createHost(correlationId);
    filter.catch(new BadRequestException("source text"), framework.host);
    expect(framework.reply.send).toHaveBeenCalledWith({
      error: {
        code: "bad_request",
        message: "The request could not be processed.",
        retryable: false,
        correlationId,
      },
    });

    const frameworkInternal = createHost(correlationId);
    filter.catch(
      new InternalServerErrorException("provider secret"),
      frameworkInternal.host,
    );
    expect(frameworkInternal.reply.send).toHaveBeenCalledWith({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        retryable: true,
        correlationId,
      },
    });

    const publicError = createHost(correlationId);
    filter.catch(
      new PublicError("validation_failed", "Invalid input.", 400, false, {
        title: "Required.",
      }),
      publicError.host,
    );
    expect(publicError.reply.send).toHaveBeenCalledWith({
      error: {
        code: "validation_failed",
        message: "Invalid input.",
        fieldErrors: { title: "Required." },
        retryable: false,
        correlationId,
      },
    });

    const internal = createHost(correlationId);
    filter.catch(new Error("provider secret"), internal.host);
    expect(internal.reply.send).toHaveBeenCalledWith({
      error: {
        code: "internal_error",
        message: "An unexpected error occurred.",
        retryable: true,
        correlationId,
      },
    });
  });
});
