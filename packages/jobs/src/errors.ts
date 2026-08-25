import { ZodError } from "zod";
import {
  jobErrorMetadataSchema,
  type JobErrorClassification,
  type JobErrorMetadata,
  type JobMetadata,
} from "./contracts.js";

export class JobExecutionError extends Error {
  public constructor(
    public readonly classification: JobErrorClassification,
    public readonly code: string,
    message: string,
    public readonly details?: JobMetadata,
  ) {
    super(message);
    this.name = "JobExecutionError";
  }
}

export function classifyJobError(error: unknown): JobErrorMetadata {
  if (error instanceof JobExecutionError)
    return jobErrorMetadataSchema.parse({
      classification: error.classification,
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
  if (error instanceof ZodError)
    return {
      classification: "terminal",
      code: "PAYLOAD_VALIDATION_FAILED",
      message: "The job payload did not match its versioned contract.",
    };
  return {
    classification: "retryable",
    code: "UNEXPECTED_JOB_FAILURE",
    message: "The job failed unexpectedly.",
  };
}
