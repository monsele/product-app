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
import { ProjectAssetService } from "./project-assets.js";
import { IllustrationGenerationService } from "./illustration-generation.js";
import { PostgresIngestionStatusService } from "./ingestion-status.js";
import { PostgresParsedDocumentReviewService } from "./parsed-document-review.js";
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
import { PostgresCitationHistoryService } from "./citation-history.js";
import { PostgresLessonVersionsService } from "./lesson-versions.js";
import { PostgresVoiceConfigurationService } from "./voice-configuration.js";
import { SceneAudioService } from "./scene-audio.js";
import { PreviewManifestService } from "./preview-manifest.js";
import { PostgresLessonValidationService } from "./lesson-validation.js";
import { PostgresRenderService } from "./renders.js";
import { ExportService } from "./exports.js";
import { PostgresShareLinkService } from "./share-links.js";

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
        "image/jpeg",
        "image/png",
        "image/webp",
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
    const projectAuthorizer = new ProjectAuthorizationService(
      projectRepository,
    );
    const parsedDocumentRepository = new ParsedDocumentRepository(
      database.client,
    );
    const authorizedProjectStorage = new AuthorizedProjectStorage(
      storage,
      projectAuthorizer,
    );
    const lessonValidationService = new PostgresLessonValidationService(
      database.client,
    );
      const sourceSnapshotService = new PostgresSourceSnapshotService(
        database.client,
      );
      const citationHistoryService = new PostgresCitationHistoryService(
        database.client,
        (input) => sourceSnapshotService.resolveSourceRefs(input),
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
          environment.PASSWORD_RESET_RESPONSE_FLOOR_MS,
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
        projectAssetService: new ProjectAssetService(database.client, storage),
        illustrationGenerationService: new IllustrationGenerationService(
          database.client,
          undefined,
          environment.MAX_REGENERATIONS_PER_HOUR,
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
        sourceSnapshotService,
        objectivesService: new PostgresObjectivesService(
          database.client,
          (input) => sourceSnapshotService.status(input),
        ),
        outlineService: new PostgresOutlineService(
          database.client,
          (input) => sourceSnapshotService.status(input),
        ),
        narrationService: new PostgresNarrationService(
          database.client,
          (input) => sourceSnapshotService.status(input),
        ),
        storyboardService: new PostgresStoryboardService(
          database.client,
          (input) => sourceSnapshotService.status(input),
        ),
        citationService: new PostgresCitationService(
          database.client,
          (input) => sourceSnapshotService.resolveSourceRefs(input),
        ),
        groundingService: new PostgresGroundingService(
          database.client,
          (input) => sourceSnapshotService.status(input),
        ),
        lessonVersionsService: new PostgresLessonVersionsService(
          database.client,
          citationHistoryService,
        ),
      voiceConfigurationService: new PostgresVoiceConfigurationService(
        database.client,
      ),
      sceneAudioService: new SceneAudioService(database.client),
      previewManifestService: new PreviewManifestService(
        database.client,
        storage,
      ),
      lessonValidationService,
      renderService: new PostgresRenderService(
        database.client,
        lessonValidationService,
        {
          maxConcurrentPerProject: environment.RENDER_CONCURRENCY,
          maxStartsPerProjectHour: environment.MAX_RENDERS_PER_HOUR,
        },
        undefined,
        storage,
      ),
      exportService: new ExportService(
        database.client,
        authorizedProjectStorage,
      ),
      shareLinkService: new PostgresShareLinkService(database.client, storage),
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
