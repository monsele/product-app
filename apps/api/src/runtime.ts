import { parseEnvironment } from "@avlp/config";
import {
  InMemoryAuthRateLimiter,
  PostgresAuthGateway,
  WebhookPasswordResetEmailSender,
  ProjectAuthorizationService,
} from "@avlp/auth";
import { createDatabaseConnection } from "@avlp/database";
import {
  AuthorizedProjectStorage,
  createS3CompatibleObjectStorage,
} from "@avlp/storage";
import { createApp } from "./app.js";
import { PostgresProjectRepository, ProjectService } from "./projects.js";
import {
  PostgresSourceUploadRepository,
  SourceUploadService,
} from "./source-uploads.js";
import { PostgresIngestionStatusService } from "./ingestion-status.js";
import {
  PostgresParsedDocumentReviewService,
} from "./parsed-document-review.js";
import { ParsedDocumentRepository } from "./parsed-document-repository.js";
import { PostgresSourceSectionSelectionService } from "./source-section-selection.js";
import { PostgresContentBlockCorrectionService } from "./content-block-corrections.js";
import { PostgresFigureInclusionService } from "./source-figure-inclusion.js";
import { PostgresLessonConfigurationService } from "./lesson-configuration.js";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";
import { PostgresObjectivesService } from "./objectives.js";
import { PostgresOutlineService } from "./outline.js";
import { PostgresNarrationService } from "./narration.js";
import { PostgresStoryboardService } from "./storyboard.js";
import { PostgresCitationService } from "./citations.js";
import { PostgresGroundingService } from "./grounding.js";

export async function runApi(input: {
  telemetryShutdown: () => Promise<void>;
}): Promise<void> {
  const environment = parseEnvironment(process.env);
  const database = createDatabaseConnection(environment.DATABASE_URL);
  try {
    await database.healthCheck();
    const projectRepository = new PostgresProjectRepository(database.client);
    if (
      environment.OBJECT_STORAGE_BUCKET === undefined ||
      environment.OBJECT_STORAGE_ACCESS_KEY === undefined ||
      environment.OBJECT_STORAGE_SECRET_KEY === undefined
    )
      throw new Error(
        "Object storage must be configured before the API can accept uploads.",
      );
    const storage = await createS3CompatibleObjectStorage({
      bucket: environment.OBJECT_STORAGE_BUCKET,
      allowedPrefix: "users",
      allowedUploadContentTypes: [
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ],
      maxUploadBytes: environment.MAX_UPLOAD_BYTES,
      defaultSignedUrlTtlSeconds: environment.SIGNED_URL_TTL_SECONDS,
      region: environment.OBJECT_STORAGE_REGION,
      forcePathStyle: environment.OBJECT_STORAGE_FORCE_PATH_STYLE,
      allowInsecureEndpoint: environment.OBJECT_STORAGE_ALLOW_INSECURE_ENDPOINT,
      runtimeEnvironment: environment.NODE_ENV,
      credentials: {
        accessKeyId: environment.OBJECT_STORAGE_ACCESS_KEY,
        secretAccessKey: environment.OBJECT_STORAGE_SECRET_KEY,
      },
      ...(environment.OBJECT_STORAGE_ENDPOINT === undefined
        ? {}
        : { endpoint: environment.OBJECT_STORAGE_ENDPOINT }),
    });
    const projectAuthorizer = new ProjectAuthorizationService(projectRepository);
    const parsedDocumentRepository = new ParsedDocumentRepository(
      database.client,
    );
    const authorizedProjectStorage = new AuthorizedProjectStorage(
      storage,
      projectAuthorizer,
    );
    const app = await createApp({
      database,
      authGateway: new PostgresAuthGateway(
        database.client,
        environment.AUTH_SESSION_SECRET,
        undefined,
        environment.PASSWORD_RESET_EMAIL_WEBHOOK_URL === undefined
          ? undefined
          : new WebhookPasswordResetEmailSender(
              environment.PASSWORD_RESET_EMAIL_WEBHOOK_URL,
              environment.PASSWORD_RESET_EMAIL_WEBHOOK_TOKEN,
            ),
        environment.WEB_ORIGIN ?? "http://localhost:3000",
        environment.PASSWORD_RESET_TTL_SECONDS * 1000,
      ),
      authRateLimiter: new InMemoryAuthRateLimiter(
        environment.AUTH_SESSION_SECRET,
      ),
      projectService: new ProjectService(projectRepository),
      sourceUploadService: new SourceUploadService(
        new PostgresSourceUploadRepository(database.client),
        storage,
        undefined,
        environment.MAX_UPLOAD_BYTES,
      ),
      ingestionStatusService: new PostgresIngestionStatusService(
        database.client,
      ),
      parsedDocumentReviewService: new PostgresParsedDocumentReviewService(
        parsedDocumentRepository,
        authorizedProjectStorage,
      ),
      sourceSectionSelectionService: new PostgresSourceSectionSelectionService(
        database.client,
      ),
      contentBlockCorrectionService: new PostgresContentBlockCorrectionService(
        database.client,
      ),
      figureInclusionService: new PostgresFigureInclusionService(
        database.client,
      ),
      lessonConfigurationService: new PostgresLessonConfigurationService(
        database.client,
      ),
      sourceSnapshotService: new PostgresSourceSnapshotService(database.client),
      objectivesService: new PostgresObjectivesService(
        database.client,
        new PostgresSourceSnapshotService(database.client).status,
      ),
      outlineService: new PostgresOutlineService(
        database.client,
        new PostgresSourceSnapshotService(database.client).status,
      ),
      narrationService: new PostgresNarrationService(
        database.client,
        new PostgresSourceSnapshotService(database.client).status,
      ),
      storyboardService: new PostgresStoryboardService(
        database.client,
        new PostgresSourceSnapshotService(database.client).status,
      ),
      citationService: new PostgresCitationService(
        database.client,
        new PostgresSourceSnapshotService(database.client).resolveSourceRefs,
      ),
      groundingService: new PostgresGroundingService(
        database.client,
        new PostgresSourceSnapshotService(database.client).status,
      ),
      projectAuthorizer,
      ...(environment.WEB_ORIGIN === undefined
        ? {}
        : { trustedOrigin: environment.WEB_ORIGIN }),
      telemetryShutdown: input.telemetryShutdown,
    });
    app.enableShutdownHooks();
    await app.listen({ port: environment.PORT, host: "0.0.0.0" });
  } catch (error) {
    await database.close();
    throw error;
  }
}
