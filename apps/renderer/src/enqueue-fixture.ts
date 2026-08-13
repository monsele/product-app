import {
  createId,
  databaseEnvironmentSchema,
  parseWorkerEnvironment,
} from "@avlp/config";
import { createDatabaseConnection } from "@avlp/database";
import {
  createIdempotencyKey,
  createJobEnvelope,
  PostgresJobRepository,
} from "@avlp/jobs";
import { photosynthesisThreeMinutePreview } from "@avlp/scene-library";
import {
  createFixtureRenderPayload,
  renderJobType,
  renderJobPayloadSchema,
  renderPayloadVersion,
} from "./contracts.js";

const fixtureOwnerUserId = "00000000-0000-7000-8000-000000000105";

async function enqueue(): Promise<void> {
  parseWorkerEnvironment(process.env);
  const environment = databaseEnvironmentSchema.parse(process.env);
  const database = createDatabaseConnection(environment.DATABASE_URL);
  try {
    const payload = createFixtureRenderPayload(
      photosynthesisThreeMinutePreview,
    );
    const jobId = createId();
    const correlationId = createId();
    const inputVersion = payload.compositionSha256;
    const repository = new PostgresJobRepository(database.client);
    const result = await repository.createJob({
      envelope: createJobEnvelope(renderJobPayloadSchema, {
        correlationId,
        idempotencyKey: createIdempotencyKey({
          inputVersion,
          jobType: renderJobType,
          options: { optionsHash: payload.optionsHash },
          projectId: photosynthesisThreeMinutePreview.lesson.projectId,
        }),
        inputVersion,
        jobId,
        jobType: renderJobType,
        ownerUserId: fixtureOwnerUserId,
        payload,
        payloadVersion: renderPayloadVersion,
        projectId: photosynthesisThreeMinutePreview.lesson.projectId,
      }),
      queueName: "render",
      retryPolicy: {
        leaseDurationMs: 300_000,
        maxAttempts: 3,
        retryDelayMs: 30_000,
      },
    });
    console.info(
      JSON.stringify({ created: result.created, jobId: result.job.id }),
    );
  } finally {
    await database.close();
  }
}

void enqueue();
