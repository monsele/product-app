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
import { PostgresCreativeDesignService } from "./creative-design.js";
import { PostgresSourceSnapshotService } from "./source-snapshot.js";
import { PostgresSourceVisualsService } from "./source-visuals.js";
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
import {
  createEnvironmentPilotCohort,
  installDemonstrationNarrationRegistry,
  PostgresDemonstrationPilotService,
} from "./demonstration-pilot.js";
import {
  installDemonstrationSeedNarration,
  PostgresDemonstrationTestLessonService,
} from "./demonstration-test-lessons.js";
import { ExportService } from "./exports.js";
import { PostgresShareLinkService } from "./share-links.js";
import { PostgresSoundBedService } from "./sound-beds.js";
import { soundBedCatalogPrefix } from "@avlp/schemas";
import {
  PostgresJobRepository,
  redisConnectionFromUrl,
  registerJobConsumer,
} from "@avlp/jobs";
import {
  createStructuredLogger,
  PostgresGenerationQuotaGuard,
} from "@avlp/observability";
import {
  DynamicMockLanguageModelProvider,
  TogetherLanguageModelProvider,
  togetherPricing,
  type LanguageModelProvider,
} from "@avlp/provider-adapters";
import { ProviderLessonIntentService } from "./lesson-intent.js";
import {
  createEnvironmentOneShotCohort,
  createOneShotAdvanceJobHandler,
  OneShotRunnerHost,
  oneShotPricingFromEnvironment,
  OutboxOneShotTickScheduler,
  PostgresOneShotService,
} from "./one-shot.js";
import { ServiceOneShotGateway } from "./one-shot-gateway.js";
import { ProviderOneShotBriefService } from "./one-shot-brief.js";

function createLanguageModelProvider(
  environment: ReturnType<typeof parseEnvironment>,
): LanguageModelProvider {
  if (environment.TOGETHER_API_KEY === undefined)
    // Local deterministic execution simulates the configured Together route,
    // exactly as the pipeline worker does.
    return new DynamicMockLanguageModelProvider({ providerId: "together" });
  return new TogetherLanguageModelProvider({
    apiKey: environment.TOGETHER_API_KEY,
    baseUrl: environment.TOGETHER_API_BASE_URL,
    requestTimeoutMs: environment.TOGETHER_REQUEST_TIMEOUT_MS,
    maxRetries: environment.TOGETHER_MAX_RETRIES,
    logger: createStructuredLogger({ service: "api" }),
  });
}

export async function runApi(input: {
  telemetryShutdown: () => Promise<void>;
}): Promise<void> {
  const environment = parseEnvironment(process.env);
  const database = createDatabaseConnection(environment.DATABASE_URL);
  const logger = createStructuredLogger({ service: "api" });
  let oneShotConsumer: ReturnType<typeof registerJobConsumer> | undefined;
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
    // ST-103. A second client confined to the platform sound-bed catalog.
    // It can only read catalog bytes; tenant data stays behind `storage`.
    const catalogStorage = await createS3CompatibleObjectStorage({
      bucket: environment.OBJECT_STORAGE_BUCKET,
      allowedPrefix: soundBedCatalogPrefix,
      allowedUploadContentTypes: ["audio/wav"],
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
    const soundBedService = new PostgresSoundBedService(
      database.client,
      catalogStorage,
    );
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
    const renderService = new PostgresRenderService(
      database.client,
      lessonValidationService,
      {
        maxConcurrentPerProject: environment.RENDER_CONCURRENCY,
        maxStartsPerProjectHour: environment.MAX_RENDERS_PER_HOUR,
      },
      undefined,
      storage,
      sourceSnapshotService,
    );
    const demonstrationPilotCohort = createEnvironmentPilotCohort(environment);
    // ST-096. The generated narration module carries fifteen megabytes of
    // base64 audio, so it is loaded once here, when the pilot is actually
    // configured, rather than imported at the top of every module that needs a
    // beat list. A server with the pilot off never pays for it.
    if (demonstrationPilotCohort.enabled()) {
      const { demonstrationNarrationLibrary } =
        await import("@avlp/scene-library/demonstration-proof");
      const track = (trackId: string) => {
        const record = demonstrationNarrationLibrary[trackId];
        if (record === undefined)
          throw new Error(`No generated narration track "${trackId}".`);
        return record;
      };
      installDemonstrationNarrationRegistry((trackId) => {
        const record = track(trackId);
        return {
          beats: record.beats.map((beat) => ({ ...beat })),
          timingProvenance: record.timingProvenance,
        };
      });
      installDemonstrationSeedNarration((trackId) => {
        const record = track(trackId);
        return {
          beats: record.beats.map((beat) => ({ ...beat })),
          checksumSha256: record.checksumSha256,
          durationMs: record.durationMs,
          src: record.src,
        };
      });
    }
    const demonstrationPilotService = new PostgresDemonstrationPilotService(
      database.client,
      demonstrationPilotCohort,
      renderService,
      storage,
    );
    // Services the wizard routes and the ST-105 runner share, so a run is a
    // client of exactly the instances (and checks) the wizard uses.
    const lessonConfigurationService = new PostgresLessonConfigurationService(
      database.client,
      undefined,
      (scope) => demonstrationPilotService.eligibility(scope),
    );
    const ingestionStatusService = new PostgresIngestionStatusService(
      database.client,
    );
    const illustrationGenerationService = new IllustrationGenerationService(
      database.client,
    );
    const objectivesService = new PostgresObjectivesService(
      database.client,
      (input) => sourceSnapshotService.status(input),
    );
    const outlineService = new PostgresOutlineService(database.client, (input) =>
      sourceSnapshotService.status(input),
    );
    const narrationService = new PostgresNarrationService(
      database.client,
      (input) => sourceSnapshotService.status(input),
    );
    const storyboardService = new PostgresStoryboardService(
      database.client,
      (input) => sourceSnapshotService.status(input),
      (input) => sourceSnapshotService.latestApprovedVisuals(input),
    );
    const groundingService = new PostgresGroundingService(
      database.client,
      (input) => sourceSnapshotService.status(input),
    );
    const lessonVersionsService = new PostgresLessonVersionsService(
      database.client,
      citationHistoryService,
    );
    const voiceConfigurationService = new PostgresVoiceConfigurationService(
      database.client,
    );
    const sceneAudioService = new SceneAudioService(
      database.client,
      undefined,
      storage,
    );

    // ST-105. The prompt-to-video runner is hosted here, in the API process,
    // as a consumer of the `orchestration` queue (ADR-013 §5). It is
    // registered whatever the flag says, so turning the flag off drains runs
    // already in flight instead of stranding them.
    const creativeDesignService = new PostgresCreativeDesignService(
      database.client,
    );
    const oneShotGateway = new ServiceOneShotGateway({
      database: database.client,
      ingestion: ingestionStatusService,
      sourceSnapshots: sourceSnapshotService,
      lessonConfiguration: lessonConfigurationService,
      voiceConfiguration: voiceConfigurationService,
      lessonIntent: new ProviderLessonIntentService({
        database: database.client,
        provider: createLanguageModelProvider(environment),
        quotaGuard: new PostgresGenerationQuotaGuard(
          database.client,
          { "ai.lesson-intent": { maxCallsPerHour: 20 } },
          undefined,
          environment.MAX_PROVIDER_CALLS_PER_HOUR,
        ),
        pricing: togetherPricing,
      }),
      objectives: objectivesService,
      outline: outlineService,
      narration: narrationService,
      storyboard: storyboardService,
      illustrations: illustrationGenerationService,
      creativeDesign: creativeDesignService,
      grounding: groundingService,
      sceneAudio: sceneAudioService,
      validation: lessonValidationService,
      lessonVersions: lessonVersionsService,
      renders: renderService,
    });
    const oneShotScheduler = new OutboxOneShotTickScheduler();
    const oneShotService = new PostgresOneShotService(
      database.client,
      createEnvironmentOneShotCohort(environment),
      oneShotScheduler,
      oneShotGateway,
      {
        pricing: oneShotPricingFromEnvironment(environment),
        maxRunsPerHour: environment.MAX_ONE_SHOT_RUNS_PER_HOUR,
        // ST-107. The brief: one small call per "Prepare brief", with its own
        // hourly quota on top of the per-run brief limit.
        briefs: new ProviderOneShotBriefService({
          database: database.client,
          provider: createLanguageModelProvider(environment),
          quotaGuard: new PostgresGenerationQuotaGuard(
            database.client,
            { "ai.one-shot-brief": { maxCallsPerHour: 20 } },
            undefined,
            environment.MAX_PROVIDER_CALLS_PER_HOUR,
          ),
          pricing: togetherPricing,
        }),
        budgetTolerance: environment.ONE_SHOT_BUDGET_TOLERANCE,
        maxBriefRevisions: environment.ONE_SHOT_MAX_BRIEF_REVISIONS,
      },
    );
    const consumer = registerJobConsumer({
      queueName: "orchestration",
      connection: redisConnectionFromUrl(environment.REDIS_URL),
      repository: new PostgresJobRepository(database.client),
      handlers: [
        createOneShotAdvanceJobHandler(
          new OneShotRunnerHost(
            database.client,
            oneShotGateway,
            oneShotScheduler,
          ),
        ),
      ],
    });
    oneShotConsumer = consumer;
    consumer.on("error", () => {
      logger.error("worker.consumer_failed", { queueName: "orchestration" });
    });
    const closeConsumer = () => {
      void consumer.close();
    };
    process.once("SIGINT", closeConsumer);
    process.once("SIGTERM", closeConsumer);

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
      illustrationGenerationService,
      ingestionStatusService,
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
      lessonConfigurationService,
      creativeDesignService,
      sourceSnapshotService,
      sourceVisualsService: new PostgresSourceVisualsService(
        database.client,
        sourceSnapshotService,
        storage,
      ),
      objectivesService,
      outlineService,
      narrationService,
      storyboardService,
      citationService: new PostgresCitationService(database.client, (input) =>
        sourceSnapshotService.resolveSourceRefs(input),
      ),
      groundingService,
      lessonVersionsService,
      voiceConfigurationService,
      sceneAudioService,
      previewManifestService: new PreviewManifestService(
        database.client,
        storage,
        sourceSnapshotService,
        soundBedService,
      ),
      lessonValidationService,
      renderService,
      exportService: new ExportService(
        database.client,
        authorizedProjectStorage,
      ),
      shareLinkService: new PostgresShareLinkService(database.client, storage),
      soundBedService,
      demonstrationPilotService,
      demonstrationTestLessonService:
        new PostgresDemonstrationTestLessonService(database.client, storage),
      demonstrationPilotCohort,
      oneShotService,
      projectAuthorizer,
      ...(environment.WEB_ORIGIN === undefined
        ? {}
        : { trustedOrigin: environment.WEB_ORIGIN }),
      telemetryShutdown: input.telemetryShutdown,
    });
    app.enableShutdownHooks();
    await app.listen({ port: environment.PORT, host: "0.0.0.0" });
  } catch (error) {
    await oneShotConsumer?.close();
    await database.close();
    throw error;
  }
}
