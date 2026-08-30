import "reflect-metadata";
import { Buffer } from "node:buffer";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Injectable,
  Module,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  type DynamicModule,
  type OnApplicationShutdown,
} from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  type NestFastifyApplication,
} from "@nestjs/platform-fastify";
import {
  identifierSchema,
  PublicError,
  toApiErrorEnvelope,
  type Identifier,
} from "@avlp/config";
import {
  DuplicateEmailError,
  InvalidPasswordResetTokenError,
  InMemoryAuthRateLimiter,
  loginInputSchema,
  passwordResetConfirmInputSchema,
  passwordResetRequestInputSchema,
  registerInputSchema,
  type AuthGateway,
} from "@avlp/auth";
import type { DatabaseConnection } from "@avlp/database";
import {
  correlationIdFromHeader,
  createStructuredLogger,
  withCorrelationContext,
  type StructuredLogger,
} from "@avlp/observability";
import { ApiExceptionFilter } from "./error-filter.js";
import {
  authorizeProjectRoute,
  type AuthorizedProjectRequest,
  type ProjectRouteAuthorizer,
} from "./project-route-authorization.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import { ProjectService } from "./projects.js";
import { SourceUploadService } from "./source-uploads.js";
import { ProjectAssetService } from "./project-assets.js";
import { IllustrationGenerationService } from "./illustration-generation.js";
import type { IngestionStatusService } from "./ingestion-status.js";
import type { ParsedDocumentReviewService } from "./parsed-document-review.js";
import type { SourceSectionSelectionService } from "./source-section-selection.js";
import type { ContentBlockCorrectionService } from "./content-block-corrections.js";
import type { FigureInclusionService } from "./source-figure-inclusion.js";
import type { LessonConfigurationService } from "./lesson-configuration.js";
import type { SourceSnapshotService } from "./source-snapshot.js";
import type { ObjectivesService } from "./objectives.js";
import type { OutlineService } from "./outline.js";
import type { NarrationService } from "./narration.js";
import type { StoryboardService } from "./storyboard.js";
import type { CitationService } from "./citations.js";
import type { GroundingService } from "./grounding.js";
import type { LessonVersionsService } from "./lesson-versions.js";
import {
  approvedVoiceCatalog,
  approvedVoicePreview,
  type VoiceConfigurationService,
} from "./voice-configuration.js";
import { SceneAudioService } from "./scene-audio.js";
import type { PreviewManifestService } from "./preview-manifest.js";
import type { LessonValidationService } from "./lesson-validation.js";
import type { RenderService } from "./renders.js";
import type { ExportService } from "./exports.js";
import type { ShareLinkService } from "./share-links.js";
import { searchApprovedAssets } from "./approved-assets.js";

const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");
const TELEMETRY_SHUTDOWN = Symbol("TELEMETRY_SHUTDOWN");
const AUTH_GATEWAY = Symbol("AUTH_GATEWAY");
const TRUSTED_ORIGIN = Symbol("TRUSTED_ORIGIN");
const AUTH_RATE_LIMITER = Symbol("AUTH_RATE_LIMITER");
const SOURCE_UPLOAD_SERVICE = Symbol("SOURCE_UPLOAD_SERVICE");
const PROJECT_ASSET_SERVICE = Symbol("PROJECT_ASSET_SERVICE");
const ILLUSTRATION_GENERATION_SERVICE = Symbol(
  "ILLUSTRATION_GENERATION_SERVICE",
);
const PROJECT_SERVICE = Symbol("PROJECT_SERVICE");
const INGESTION_STATUS_SERVICE = Symbol("INGESTION_STATUS_SERVICE");
const PARSED_DOCUMENT_REVIEW_SERVICE = Symbol("PARSED_DOCUMENT_REVIEW_SERVICE");
const SOURCE_SECTION_SELECTION_SERVICE = Symbol(
  "SOURCE_SECTION_SELECTION_SERVICE",
);
const CONTENT_BLOCK_CORRECTION_SERVICE = Symbol(
  "CONTENT_BLOCK_CORRECTION_SERVICE",
);
const FIGURE_INCLUSION_SERVICE = Symbol("FIGURE_INCLUSION_SERVICE");
const LESSON_CONFIGURATION_SERVICE = Symbol("LESSON_CONFIGURATION_SERVICE");
const SOURCE_SNAPSHOT_SERVICE = Symbol("SOURCE_SNAPSHOT_SERVICE");
const OBJECTIVES_SERVICE = Symbol("OBJECTIVES_SERVICE");
const OUTLINE_SERVICE = Symbol("OUTLINE_SERVICE");
const NARRATION_SERVICE = Symbol("NARRATION_SERVICE");
const STORYBOARD_SERVICE = Symbol("STORYBOARD_SERVICE");
const CITATION_SERVICE = Symbol("CITATION_SERVICE");
const GROUNDING_SERVICE = Symbol("GROUNDING_SERVICE");
const LESSON_VERSIONS_SERVICE = Symbol("LESSON_VERSIONS_SERVICE");
const VOICE_CONFIGURATION_SERVICE = Symbol("VOICE_CONFIGURATION_SERVICE");
const SCENE_AUDIO_SERVICE = Symbol("SCENE_AUDIO_SERVICE");
const PREVIEW_MANIFEST_SERVICE = Symbol("PREVIEW_MANIFEST_SERVICE");
const LESSON_VALIDATION_SERVICE = Symbol("LESSON_VALIDATION_SERVICE");
const RENDER_SERVICE = Symbol("RENDER_SERVICE");
const EXPORT_SERVICE = Symbol("EXPORT_SERVICE");
const SHARE_LINK_SERVICE = Symbol("SHARE_LINK_SERVICE");
export const sessionCookieName = "avlp_session";
type ApiDatabaseConnection = Pick<DatabaseConnection, "healthCheck" | "close">;

@Injectable()
class HealthService {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly database: ApiDatabaseConnection,
  ) {}

  public async check(): Promise<void> {
    try {
      await this.database.healthCheck();
    } catch {
      throw new PublicError(
        "internal_error",
        "The service is temporarily unavailable.",
        503,
        true,
      );
    }
  }
}

@Controller()
class HealthController {
  public constructor(
    @Inject(HealthService) private readonly healthService: HealthService,
  ) {}

  @Get("health") async health(): Promise<{ status: "ok"; service: "api" }> {
    await this.healthService.check();
    return { status: "ok", service: "api" };
  }
}

type RequestWithAuth = FastifyRequest & { correlationId?: Identifier };

@Controller("auth")
class AuthController {
  public constructor(
    @Inject(AUTH_GATEWAY) private readonly auth: AuthGateway,
    @Inject(TRUSTED_ORIGIN) private readonly trustedOrigin: string | undefined,
    @Inject(AUTH_RATE_LIMITER)
    private readonly rateLimiter: InMemoryAuthRateLimiter,
  ) {}

  @Post("register")
  public async register(
    @Body() input: unknown,
    @Req() request: RequestWithAuth,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: unknown }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    try {
      const parsed = registerInputSchema.parse(input);
      assertRateLimit(this.rateLimiter, "register", parsed.email, request.ip);
      const result = await this.auth.register(parsed, {
        correlationId:
          request.correlationId ?? "00000000-0000-7000-8000-000000000000",
      });
      setSessionCookie(reply, result.sessionToken, result.expiresAt);
      return { user: result.user };
    } catch (error) {
      if (error instanceof DuplicateEmailError)
        throw new PublicError(
          "bad_request",
          "An account already exists for this email.",
          409,
        );
      throw error;
    }
  }

  @Post("login")
  public async login(
    @Body() input: unknown,
    @Req() request: RequestWithAuth,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ user: unknown }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const parsed = loginInputSchema.parse(input);
    assertRateLimit(this.rateLimiter, "login", parsed.email, request.ip);
    const result = await this.auth.signIn(parsed, {
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
    if (result === null)
      throw new PublicError("unauthorized", "Invalid email or password.", 401);
    setSessionCookie(reply, result.sessionToken, result.expiresAt);
    return { user: result.user };
  }

  @Delete("session")
  public async logout(
    @Req() request: RequestWithAuth,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<{ status: "signed_out" }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const token = request.cookies[sessionCookieName];
    if (token !== undefined)
      await this.auth.signOut(token, {
        correlationId:
          request.correlationId ?? "00000000-0000-7000-8000-000000000000",
      });
    reply.clearCookie(sessionCookieName, sessionCookieOptions());
    return { status: "signed_out" };
  }

  @Get("session")
  public async currentSession(
    @Req() request: RequestWithAuth,
  ): Promise<{ user: unknown }> {
    const token = request.cookies[sessionCookieName];
    const user =
      token === undefined ? null : await this.auth.currentSession(token);
    if (user === null)
      throw new PublicError("unauthorized", "Authentication is required.", 401);
    return { user };
  }

  @Post("password-reset/request")
  public async requestPasswordReset(
    @Body() input: unknown,
    @Req() request: RequestWithAuth,
  ): Promise<{ status: "accepted" }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const parsed = passwordResetRequestInputSchema.parse(input);
    assertRateLimit(
      this.rateLimiter,
      "password_reset",
      parsed.email,
      request.ip,
    );
    await this.auth.requestPasswordReset(parsed, {
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
    return { status: "accepted" };
  }

  @Post("password-reset/confirm")
  public async confirmPasswordReset(
    @Body() input: unknown,
    @Req() request: RequestWithAuth,
  ): Promise<{ status: "password_reset" }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    try {
      const parsed = passwordResetConfirmInputSchema.parse(input);
      await this.auth.confirmPasswordReset(parsed, {
        correlationId:
          request.correlationId ?? "00000000-0000-7000-8000-000000000000",
      });
      return { status: "password_reset" };
    } catch (error) {
      if (error instanceof InvalidPasswordResetTokenError)
        throw new PublicError(
          "bad_request",
          "This password reset link is invalid or has expired.",
          400,
        );
      throw error;
    }
  }
}

type ProjectApiService = Pick<
  ProjectService,
  "create" | "list" | "detail" | "duplicate" | "delete"
>;
type SourceUploadApiService = Pick<
  SourceUploadService,
  "create" | "complete" | "status"
>;
type ProjectAssetApiService = Pick<
  ProjectAssetService,
  "create" | "complete" | "list" | "remove" | "reviewPreview"
>;
type IllustrationGenerationApiService = Pick<
  IllustrationGenerationService,
  "request" | "list" | "reject"
>;
type IngestionStatusApiService = Pick<
  IngestionStatusService,
  "status" | "retry"
>;
type ParsedDocumentReviewApiService = Pick<
  ParsedDocumentReviewService,
  "review" | "section"
>;
type SourceSectionSelectionApiService = Pick<
  SourceSectionSelectionService,
  "list" | "update"
>;
type ContentBlockCorrectionApiService = Pick<
  ContentBlockCorrectionService,
  "update" | "restore"
>;
type FigureInclusionApiService = Pick<FigureInclusionService, "update">;
type LessonConfigurationApiService = Pick<
  LessonConfigurationService,
  "get" | "save"
>;
type SourceSnapshotApiService = Pick<
  SourceSnapshotService,
  "approve" | "metadata" | "status"
>;
type ObjectivesApiService = Pick<
  ObjectivesService,
  "generate" | "current" | "add" | "update" | "remove" | "reorder" | "approve"
>;
type OutlineApiService = Pick<
  OutlineService,
  "generate" | "current" | "add" | "update" | "remove" | "reorder" | "approve"
>;
type NarrationApiService = Pick<
  NarrationService,
  | "generate"
  | "current"
  | "approve"
  | "updateBlock"
  | "regenerateBlock"
  | "acceptCandidate"
  | "rejectCandidate"
  | "listBlockRevisions"
  | "restoreBlockRevision"
>;
type StoryboardApiService = Pick<
  StoryboardService,
  | "generate"
  | "current"
  | "regenerateScene"
  | "applySceneCandidate"
  | "rejectSceneCandidate"
  | "scenes"
  | "sceneDetail"
  | "addScene"
  | "duplicateScene"
  | "deleteScene"
  | "reorderScenes"
  | "updateScene"
  | "switchSceneTemplate"
  | "bindCatalogAsset"
  | "unbindCatalogAsset"
  | "acceptIllustrationCandidate"
>;
type CitationApiService = Pick<CitationService, "forScene">;
type GroundingApiService = Pick<GroundingService, "check" | "current">;
type LessonVersionsApiService = Pick<
  LessonVersionsService,
  "create" | "list" | "detail" | "restore"
>;
type VoiceConfigurationApiService = Pick<
  VoiceConfigurationService,
  "get" | "save"
>;
type SceneAudioApiService = Pick<SceneAudioService, "generate" | "status">;
type PreviewManifestApiService = Pick<PreviewManifestService, "get">;
type LessonValidationApiService = Pick<
  LessonValidationService,
  "run" | "latest" | "acknowledge"
>;
type RenderApiService = Pick<
  RenderService,
  "start" | "list" | "detail" | "retry"
>;
type ExportApiService = Pick<ExportService, "build" | "signedVideoDownload">;
type ShareLinkApiService = Pick<
  ShareLinkService,
  "create" | "list" | "revoke" | "resolve"
>;

function approvedAssetCatalogFilters(input: {
  query: unknown;
  slot: unknown;
  tags: unknown;
  template: unknown;
}): unknown {
  return {
    ...(input.query === undefined ? {} : { query: input.query }),
    ...(input.tags === undefined
      ? {}
      : {
          tags:
            typeof input.tags === "string"
              ? input.tags.split(",").filter(Boolean)
              : input.tags,
        }),
    ...(input.template === undefined ? {} : { template: input.template }),
    ...(input.slot === undefined ? {} : { slot: input.slot }),
  };
}

/** Immutable, provenance-complete catalog; it contains no tenant data. */
@Controller("assets")
class AssetsController {
  @Get()
  public list(
    @Query("query") query: unknown,
    @Query("tags") tags: unknown,
    @Query("template") template: unknown,
    @Query("slot") slot: unknown,
  ): unknown {
    return searchApprovedAssets(
      approvedAssetCatalogFilters({ query, tags, template, slot }),
    );
  }
}

@Controller("voices")
class VoicesController {
  public constructor(
    @Inject(AUTH_GATEWAY) private readonly auth: AuthGateway,
  ) {}
  @Get()
  public async list(@Req() request: RequestWithAuth): Promise<unknown> {
    await this.requireUser(request);
    return {
      voices: approvedVoiceCatalog(`${request.protocol}://${request.hostname}`),
    };
  }
  @Get(":voiceId/preview")
  public async preview(
    @Param("voiceId") voiceId: string,
    @Req() request: RequestWithAuth,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    await this.requireUser(request);
    const audio = approvedVoicePreview(voiceId);
    if (audio === undefined)
      throw new PublicError(
        "not_found",
        "The requested voice was not found.",
        404,
      );
    reply
      .header("cache-control", "private, max-age=86400")
      .header("content-type", audio.contentType)
      .send(Buffer.from(audio.bytes));
  }
  private async requireUser(request: RequestWithAuth): Promise<void> {
    const token = request.cookies[sessionCookieName];
    if (token === undefined || (await this.auth.currentSession(token)) === null)
      throw new PublicError("unauthorized", "Authentication is required.", 401);
  }
}

@Controller("projects")
class ProjectsController {
  public constructor(
    @Inject(AUTH_GATEWAY) private readonly auth: AuthGateway,
    @Inject(TRUSTED_ORIGIN) private readonly trustedOrigin: string | undefined,
    @Inject(PROJECT_SERVICE) private readonly projects: ProjectApiService,
    @Inject(SOURCE_UPLOAD_SERVICE)
    private readonly sourceUploads: SourceUploadApiService,
    @Inject(PROJECT_ASSET_SERVICE)
    private readonly projectAssets: ProjectAssetApiService,
    @Inject(ILLUSTRATION_GENERATION_SERVICE)
    private readonly illustrations: IllustrationGenerationApiService,
    @Inject(INGESTION_STATUS_SERVICE)
    private readonly ingestionStatus: IngestionStatusApiService,
    @Inject(PARSED_DOCUMENT_REVIEW_SERVICE)
    private readonly parsedDocumentReview: ParsedDocumentReviewApiService,
    @Inject(SOURCE_SECTION_SELECTION_SERVICE)
    private readonly sourceSectionSelection: SourceSectionSelectionApiService,
    @Inject(CONTENT_BLOCK_CORRECTION_SERVICE)
    private readonly contentBlockCorrections: ContentBlockCorrectionApiService,
    @Inject(FIGURE_INCLUSION_SERVICE)
    private readonly figureInclusion: FigureInclusionApiService,
    @Inject(LESSON_CONFIGURATION_SERVICE)
    private readonly lessonConfiguration: LessonConfigurationApiService,
    @Inject(SOURCE_SNAPSHOT_SERVICE)
    private readonly sourceSnapshots: SourceSnapshotApiService,
    @Inject(OBJECTIVES_SERVICE)
    private readonly objectives: ObjectivesApiService,
    @Inject(OUTLINE_SERVICE)
    private readonly outline: OutlineApiService,
    @Inject(NARRATION_SERVICE)
    private readonly narration: NarrationApiService,
    @Inject(STORYBOARD_SERVICE)
    private readonly storyboard: StoryboardApiService,
    @Inject(CITATION_SERVICE)
    private readonly citations: CitationApiService,
    @Inject(GROUNDING_SERVICE)
    private readonly grounding: GroundingApiService,
    @Inject(LESSON_VERSIONS_SERVICE)
    private readonly lessonVersions: LessonVersionsApiService,
    @Inject(VOICE_CONFIGURATION_SERVICE)
    private readonly voiceConfiguration: VoiceConfigurationApiService,
    @Inject(SCENE_AUDIO_SERVICE)
    private readonly sceneAudio: SceneAudioApiService,
    @Inject(PREVIEW_MANIFEST_SERVICE)
    private readonly previewManifests: PreviewManifestApiService,
    @Inject(LESSON_VALIDATION_SERVICE)
    private readonly validations: LessonValidationApiService,
    @Inject(RENDER_SERVICE)
    private readonly renders: RenderApiService,
    @Inject(EXPORT_SERVICE)
    private readonly exports: ExportApiService,
    @Inject(SHARE_LINK_SERVICE)
    private readonly shareLinks: ShareLinkApiService,
  ) {}

  @Post()
  public async create(
    @Body() input: unknown,
    @Req() request: RequestWithAuth,
  ): Promise<{ project: unknown }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const user = await this.authenticatedUser(request);
    return {
      project: await this.projects.create(
        user.id,
        input,
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
      ),
    };
  }

  @Get()
  public async list(
    @Req() request: RequestWithAuth & { query: unknown },
  ): Promise<unknown> {
    const user = await this.authenticatedUser(request);
    return this.projects.list(user.id, request.query);
  }

  @Get(":projectId")
  public async detail(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<{ project: unknown }> {
    const access = request.projectAccess;
    if (access === undefined || access.projectId !== projectId)
      throw new PublicError(
        "internal_error",
        "Project authorization is unavailable.",
        503,
        true,
      );
    const project = await this.projects.detail(
      access.ownerUserId,
      access.projectId,
    );
    if (project === null)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return { project };
  }

  @Post(":projectId/duplicate")
  public async duplicate(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<{ project: unknown }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const user = await this.authenticatedUser(request);
    const access = assertAuthorizedProject(request, projectId);
    return {
      project: await this.projects.duplicate(
        user.id,
        access.projectId,
        input,
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
        idempotencyKey,
      ),
    };
  }

  @Post(":projectId/source-upload")
  public async createSourceUpload(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const user = await this.authenticatedUser(request);
    const access = assertAuthorizedProject(request, projectId);
    return this.sourceUploads.create(user.id, access.projectId, input);
  }

  @Get(":projectId/source-document")
  public async sourceDocumentStatus(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.sourceUploads.status(access.ownerUserId, access.projectId);
  }

  @Get(":projectId/ingestion")
  public async ingestion(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.ingestionStatus.status(access.ownerUserId, access.projectId);
  }

  @Post(":projectId/ingestion/retry")
  @HttpCode(202)
  public async retryIngestion(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.ingestionStatus.retry({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/parsed-document")
  public async parsedDocument(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.parsedDocumentReview.review(
      access.ownerUserId,
      access.projectId,
    );
  }

  @Get(":projectId/parsed-document/sections/:sectionId")
  public async parsedDocumentSection(
    @Param("projectId") projectId: string,
    @Param("sectionId") sectionIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const sectionId = identifierSchema.safeParse(sectionIdInput);
    if (!sectionId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.parsedDocumentReview.section(
      access.ownerUserId,
      access.projectId,
      sectionId.data,
    );
  }

  @Get(":projectId/source-sections")
  public async sourceSections(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.sourceSectionSelection.list(
      access.ownerUserId,
      access.projectId,
    );
  }

  @Patch(":projectId/source-sections/:sectionId")
  public async updateSourceSection(
    @Param("projectId") projectId: string,
    @Param("sectionId") sectionIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sectionId = identifierSchema.safeParse(sectionIdInput);
    if (!sectionId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.sourceSectionSelection.update({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sectionId: sectionId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/source-blocks/:blockId")
  public async updateSourceBlock(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.contentBlockCorrections.update({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/source-blocks/:blockId/restore")
  @HttpCode(200)
  public async restoreSourceBlock(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.contentBlockCorrections.restore({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/source-figures/:figureId")
  public async updateSourceFigure(
    @Param("projectId") projectId: string,
    @Param("figureId") figureIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const figureId = identifierSchema.safeParse(figureIdInput);
    if (!figureId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.figureInclusion.update({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      figureId: figureId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/configuration")
  public async getConfiguration(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.lessonConfiguration.get(access.ownerUserId, access.projectId);
  }

  @Put(":projectId/configuration")
  public async saveConfiguration(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.lessonConfiguration.save({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/voice-configuration")
  public async getVoiceConfiguration(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.voiceConfiguration.get(
      assertAuthorizedProject(request, projectId),
    );
  }

  @Put(":projectId/voice-configuration")
  public async saveVoiceConfiguration(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.voiceConfiguration.save({
      ...assertAuthorizedProject(request, projectId),
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/audio/generate")
  @HttpCode(202)
  public async generateSceneAudio(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.sceneAudio.generate({
      ...assertAuthorizedProject(request, projectId),
      sceneId: identifierSchema.parse(sceneId),
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/scenes/:sceneId/audio-status")
  public async sceneAudioStatus(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.sceneAudio.status({
      ...assertAuthorizedProject(request, projectId),
      sceneId: identifierSchema.parse(sceneId),
    });
  }

  @Get(":projectId/preview-manifest")
  public async previewManifest(
    @Param("projectId") projectId: string,
    @Query("quality") quality: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    if (quality !== undefined && quality !== "standard" && quality !== "low")
      throw new PublicError(
        "validation_failed",
        "Preview quality must be standard or low.",
        400,
      );
    return this.previewManifests.get({
      ...assertAuthorizedProject(request, projectId),
      ...(quality === undefined ? {} : { quality }),
    });
  }

  @Post(":projectId/validation-runs")
  @HttpCode(200)
  public async runValidation(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.validations.run({
      ...assertAuthorizedProject(request, projectId),
      body,
    });
  }

  @Get(":projectId/validation-runs/latest")
  public async latestValidation(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<{ run: unknown | null }> {
    return {
      run: await this.validations.latest(
        assertAuthorizedProject(request, projectId),
      ),
    };
  }

  @Get(":projectId/validation")
  public async validation(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<{ run: unknown | null }> {
    return {
      run: await this.validations.latest(
        assertAuthorizedProject(request, projectId),
      ),
    };
  }

  @Post(":projectId/validation/run")
  @HttpCode(200)
  public async runValidationAlias(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.validations.run({
      ...assertAuthorizedProject(request, projectId),
      body,
    });
  }

  @Post(":projectId/validation/issues/:issueId/acknowledge")
  @HttpCode(200)
  public async acknowledgeValidationIssue(
    @Param("projectId") projectId: string,
    @Param("issueId") issueId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.validations.acknowledge({
      ...assertAuthorizedProject(request, projectId),
      issueId: identifierSchema.parse(issueId),
      body,
    });
  }

  @Post(":projectId/renders")
  @HttpCode(202)
  public async startRender(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.renders.start({
      ...assertAuthorizedProject(request, projectId),
      body,
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/renders")
  public async listRenders(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.renders.list(assertAuthorizedProject(request, projectId));
  }

  @Get(":projectId/renders/:renderId")
  public async renderDetail(
    @Param("projectId") projectId: string,
    @Param("renderId") renderId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.renders.detail({
      ...assertAuthorizedProject(request, projectId),
      renderId: identifierSchema.parse(renderId),
    });
  }

  @Post(":projectId/renders/:renderId/retry")
  @HttpCode(202)
  public async retryRender(
    @Param("projectId") projectId: string,
    @Param("renderId") renderId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.renders.retry({
      ...assertAuthorizedProject(request, projectId),
      renderId: identifierSchema.parse(renderId),
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/renders/:renderId/download")
  public async downloadRender(
    @Param("projectId") projectId: string,
    @Param("renderId") renderId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const download = await this.exports.signedVideoDownload({
      ...assertAuthorizedProject(request, projectId),
      renderId: identifierSchema.parse(renderId),
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
    reply.code(302).redirect(download.url);
  }

  @Get(":projectId/exports/:lessonVersionId/:type")
  public async downloadExport(
    @Param("projectId") projectId: string,
    @Param("lessonVersionId") lessonVersionId: string,
    @Param("type") type: string,
    @Query("format") format: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    const defaults: Record<string, string> = {
      captions: "srt",
      narration: "markdown",
      storyboard: "markdown",
    };
    const exported = await this.exports.build({
      ...assertAuthorizedProject(request, projectId),
      lessonVersionId: identifierSchema.parse(lessonVersionId),
      type,
      format: format ?? defaults[type] ?? "",
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
    reply
      .type(exported.contentType)
      .header(
        "content-disposition",
        `attachment; filename="${exported.fileName}"`,
      )
      .send(exported.body);
  }

  @Post(":projectId/share-links")
  @HttpCode(201)
  public async createShareLink(
    @Param("projectId") projectId: string,
    @Body() body: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    return this.shareLinks.create({
      ...assertAuthorizedProject(request, projectId),
      body,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/share-links")
  public async listShareLinks(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.shareLinks.list(assertAuthorizedProject(request, projectId));
  }

  @Delete(":projectId/share-links/:shareLinkId")
  @HttpCode(204)
  public async revokeShareLink(
    @Param("projectId") projectId: string,
    @Param("shareLinkId") shareLinkId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<void> {
    assertTrustedOrigin(request, this.trustedOrigin);
    await this.shareLinks.revoke({
      ...assertAuthorizedProject(request, projectId),
      shareLinkId: identifierSchema.parse(shareLinkId),
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/source-review")
  public async sourceApprovalStatus(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.sourceSnapshots.status({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Post(":projectId/source-review/approve")
  @HttpCode(200)
  public async approveSourceReview(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.sourceSnapshots.approve({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/source-snapshots/:snapshotId")
  public async sourceSnapshotMetadata(
    @Param("projectId") projectId: string,
    @Param("snapshotId") snapshotIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const snapshotId = identifierSchema.safeParse(snapshotIdInput);
    if (!snapshotId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.sourceSnapshots.metadata({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      snapshotId: snapshotId.data,
    });
  }

  @Get(":projectId/objectives")
  public async getObjectives(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.objectives.current({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Post(":projectId/objectives/generate")
  @HttpCode(202)
  public async generateObjectives(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.objectives.generate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/objectives")
  @HttpCode(200)
  public async addObjective(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.objectives.add({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/objectives/:objectiveId")
  @HttpCode(200)
  public async updateObjective(
    @Param("projectId") projectId: string,
    @Param("objectiveId") objectiveIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const objectiveId = identifierSchema.safeParse(objectiveIdInput);
    if (!objectiveId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.objectives.update({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      objectiveId: objectiveId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Delete(":projectId/objectives/:objectiveId")
  @HttpCode(200)
  public async removeObjective(
    @Param("projectId") projectId: string,
    @Param("objectiveId") objectiveIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const objectiveId = identifierSchema.safeParse(objectiveIdInput);
    if (!objectiveId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.objectives.remove({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      objectiveId: objectiveId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/objectives/reorder")
  @HttpCode(200)
  public async reorderObjectives(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.objectives.reorder({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/objectives/approve")
  @HttpCode(200)
  public async approveObjectives(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.objectives.approve({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/outline")
  public async getOutline(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.outline.current({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Post(":projectId/outline/generate")
  @HttpCode(202)
  public async generateOutline(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.outline.generate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/outline/items")
  @HttpCode(200)
  public async addOutlineItem(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.outline.add({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/outline/items/:itemId")
  @HttpCode(200)
  public async updateOutlineItem(
    @Param("projectId") projectId: string,
    @Param("itemId") itemIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const itemId = identifierSchema.safeParse(itemIdInput);
    if (!itemId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.outline.update({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      itemId: itemId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Delete(":projectId/outline/items/:itemId")
  @HttpCode(200)
  public async removeOutlineItem(
    @Param("projectId") projectId: string,
    @Param("itemId") itemIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const itemId = identifierSchema.safeParse(itemIdInput);
    if (!itemId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.outline.remove({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      itemId: itemId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/outline/reorder")
  @HttpCode(200)
  public async reorderOutlineItems(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.outline.reorder({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/outline/approve")
  @HttpCode(200)
  public async approveOutline(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.outline.approve({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/narration")
  public async getNarration(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.narration.current({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Post(":projectId/narration/generate")
  @HttpCode(202)
  public async generateNarration(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.narration.generate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/narration/approve")
  @HttpCode(200)
  public async approveNarration(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.narration.approve({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/narration/blocks/:blockId")
  @HttpCode(200)
  public async updateNarrationBlock(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.updateBlock({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/narration-blocks/:blockId/regenerate")
  @HttpCode(202)
  public async regenerateNarrationBlock(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.regenerateBlock({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      body: input,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/narration/blocks/:blockId/revisions")
  @HttpCode(200)
  public async narrationBlockRevisions(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.listBlockRevisions({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
    });
  }

  @Post(":projectId/narration/blocks/:blockId/candidates/:candidateId/accept")
  @HttpCode(200)
  public async acceptNarrationCandidate(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Param("candidateId") candidateIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    const candidateId = identifierSchema.safeParse(candidateIdInput);
    if (!blockId.success || !candidateId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.acceptCandidate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      candidateId: candidateId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/narration/blocks/:blockId/candidates/:candidateId/reject")
  @HttpCode(200)
  public async rejectNarrationCandidate(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Param("candidateId") candidateIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    const candidateId = identifierSchema.safeParse(candidateIdInput);
    if (!blockId.success || !candidateId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.rejectCandidate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      candidateId: candidateId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/narration/blocks/:blockId/restore")
  @HttpCode(200)
  public async restoreNarrationBlockRevision(
    @Param("projectId") projectId: string,
    @Param("blockId") blockIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const blockId = identifierSchema.safeParse(blockIdInput);
    if (!blockId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.narration.restoreBlockRevision({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      blockId: blockId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/storyboard")
  public async getStoryboard(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.storyboard.current({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Get(":projectId/storyboard/scenes")
  public async getStoryboardScenes(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.storyboard.scenes({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Get(":projectId/storyboard/scenes/:sceneId")
  public async getStoryboardSceneDetail(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.sceneDetail({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
    });
  }

  @Get(":projectId/assets")
  public async getApprovedAssets(
    @Param("projectId") projectId: string,
    @Query("query") query: unknown,
    @Query("tags") tags: unknown,
    @Query("template") template: unknown,
    @Query("slot") slot: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertAuthorizedProject(request, projectId);
    return searchApprovedAssets(
      approvedAssetCatalogFilters({ query, tags, template, slot }),
    );
  }

  @Get(":projectId/teacher-assets")
  public async listTeacherAssets(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.projectAssets.list(access.ownerUserId, access.projectId);
  }

  @Post(":projectId/teacher-assets/uploads")
  public async createTeacherAssetUpload(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.projectAssets.create(
      access.ownerUserId,
      access.projectId,
      input,
    );
  }

  @Post(":projectId/teacher-assets/uploads/:sessionId/complete")
  public async completeTeacherAssetUpload(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sessionId = identifierSchema.safeParse(sessionIdInput);
    if (!sessionId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.projectAssets.complete(
      access.ownerUserId,
      access.projectId,
      sessionId.data,
      input,
      request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    );
  }

  @Delete(":projectId/teacher-assets/:assetId")
  @HttpCode(204)
  public async removeTeacherAsset(
    @Param("projectId") projectId: string,
    @Param("assetId") assetIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<void> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const assetId = identifierSchema.safeParse(assetIdInput);
    if (!assetId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    await this.projectAssets.remove(
      access.ownerUserId,
      access.projectId,
      assetId.data,
      request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    );
  }

  @Post(":projectId/scenes/:sceneId/assets/:slot/generate")
  @HttpCode(202)
  public async generateSceneIllustration(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Param("slot") slot: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.illustrations.request({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      slot,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/scenes/:sceneId/illustration-candidates")
  public async illustrationCandidates(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const candidates = await this.illustrations.list({
      ...access,
      sceneId: sceneId.data,
    });
    return {
      candidates: await Promise.all(
        candidates.map(async (candidate) => ({
          ...candidate,
          previewUrl:
            candidate.assetId === null
              ? null
              : await this.projectAssets.reviewPreview(
                  access.ownerUserId,
                  access.projectId,
                  candidate.assetId,
                ),
        })),
      ),
    };
  }

  @Post(":projectId/illustration-candidates/:candidateId/reject")
  public async rejectIllustrationCandidate(
    @Param("projectId") projectId: string,
    @Param("candidateId") candidateIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const candidateId = identifierSchema.parse(candidateIdInput);
    return this.illustrations.reject({
      ...access,
      candidateId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/illustration-candidates/:candidateId/accept")
  public async acceptIllustrationCandidate(
    @Param("projectId") projectId: string,
    @Param("candidateId") candidateIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const candidateId = identifierSchema.parse(candidateIdInput);
    return this.storyboard.acceptIllustrationCandidate({
      ...access,
      candidateId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Put(":projectId/scenes/:sceneId/asset-bindings/:slot")
  public async bindStoryboardCatalogAsset(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Param("slot") slot: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.bindCatalogAsset({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      slot,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Delete(":projectId/scenes/:sceneId/asset-bindings/:slot")
  @HttpCode(200)
  public async unbindStoryboardCatalogAsset(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Param("slot") slot: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.unbindCatalogAsset({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      slot,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes")
  @HttpCode(200)
  public async addStoryboardScene(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.storyboard.addScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/reorder")
  @HttpCode(200)
  public async reorderStoryboardScenes(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.storyboard.reorderScenes({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Patch(":projectId/scenes/:sceneId")
  public async updateStoryboardScene(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.updateScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/change-template")
  @HttpCode(200)
  public async switchStoryboardSceneTemplate(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.switchSceneTemplate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/duplicate")
  @HttpCode(200)
  public async duplicateStoryboardScene(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.duplicateScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Delete(":projectId/scenes/:sceneId")
  @HttpCode(200)
  public async deleteStoryboardScene(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.deleteScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/storyboard/generate")
  @HttpCode(202)
  public async generateStoryboard(
    @Param("projectId") projectId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.storyboard.generate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/regenerate")
  @HttpCode(202)
  public async regenerateStoryboardScene(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.storyboard.regenerateScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      body: input,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/apply-candidate")
  @HttpCode(200)
  public async applyStoryboardSceneCandidate(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const candidateId = readCandidateId(input);
    return this.storyboard.applySceneCandidate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      candidateId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Post(":projectId/scenes/:sceneId/reject-candidate")
  @HttpCode(200)
  public async rejectStoryboardSceneCandidate(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    const candidateId = readCandidateId(input);
    return this.storyboard.rejectSceneCandidate({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
      candidateId,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/scenes/:sceneId/citations")
  public async sceneCitations(
    @Param("projectId") projectId: string,
    @Param("sceneId") sceneIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    const sceneId = identifierSchema.safeParse(sceneIdInput);
    if (!sceneId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.citations.forScene({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      sceneId: sceneId.data,
    });
  }

  @Post(":projectId/grounding-checks")
  @HttpCode(202)
  public async requestGroundingCheck(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.grounding.check({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
      body: input,
      idempotencyKey,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/grounding-checks/latest")
  public async latestGroundingCheck(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const access = assertAuthorizedProject(request, projectId);
    return this.grounding.current({
      ownerUserId: access.ownerUserId,
      projectId: access.projectId,
    });
  }

  @Post(":projectId/source-upload/:sessionId/complete")
  @HttpCode(202)
  public async completeSourceUpload(
    @Param("projectId") projectId: string,
    @Param("sessionId") sessionIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const user = await this.authenticatedUser(request);
    const access = assertAuthorizedProject(request, projectId);
    const sessionId = identifierSchema.safeParse(sessionIdInput);
    if (!sessionId.success)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );
    return this.sourceUploads.complete(
      user.id,
      access.projectId,
      sessionId.data,
      input,
      request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    );
  }

  @Post(":projectId/versions")
  public async createLessonVersion(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const access = assertAuthorizedProject(request, projectId);
    return this.lessonVersions.create({
      ...access,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Get(":projectId/versions")
  public async listLessonVersions(
    @Param("projectId") projectId: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    return this.lessonVersions.list(
      assertAuthorizedProject(request, projectId),
    );
  }

  @Get(":projectId/versions/:versionId")
  public async lessonVersionDetail(
    @Param("projectId") projectId: string,
    @Param("versionId") versionIdInput: string,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    const versionId = identifierSchema.safeParse(versionIdInput);
    if (!versionId.success)
      throw new PublicError(
        "not_found",
        "The requested lesson version was not found.",
        404,
      );
    return this.lessonVersions.detail({
      ...assertAuthorizedProject(request, projectId),
      versionId: versionId.data,
    });
  }

  @Post(":projectId/versions/:versionId/restore")
  public async restoreLessonVersion(
    @Param("projectId") projectId: string,
    @Param("versionId") versionIdInput: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<unknown> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const versionId = identifierSchema.safeParse(versionIdInput);
    if (!versionId.success)
      throw new PublicError(
        "not_found",
        "The requested lesson version was not found.",
        404,
      );
    return this.lessonVersions.restore({
      ...assertAuthorizedProject(request, projectId),
      versionId: versionId.data,
      body: input,
      correlationId:
        request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    });
  }

  @Delete(":projectId")
  public async delete(
    @Param("projectId") projectId: string,
    @Body() input: unknown,
    @Req() request: RequestWithAuth & AuthorizedProjectRequest,
  ): Promise<{ deleted: true }> {
    assertTrustedOrigin(request, this.trustedOrigin);
    const user = await this.authenticatedUser(request);
    const access = assertAuthorizedProject(request, projectId);
    await this.projects.delete(
      user.id,
      access.projectId,
      input,
      request.correlationId ?? "00000000-0000-7000-8000-000000000000",
    );
    return { deleted: true };
  }

  private async authenticatedUser(request: RequestWithAuth) {
    const token = request.cookies[sessionCookieName];
    const user =
      token === undefined ? null : await this.auth.currentSession(token);
    if (user === null)
      throw new PublicError("unauthorized", "Authentication is required.", 401);
    return user;
  }
}

@Controller("share")
class PublicShareController {
  public constructor(
    @Inject(SHARE_LINK_SERVICE)
    private readonly shareLinks: ShareLinkApiService,
  ) {}

  @Get(":token")
  public async resolve(
    @Param("token") token: string,
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<unknown> {
    reply.header("cache-control", "no-store");
    return this.shareLinks.resolve({ token, network: request.ip });
  }
}

function assertAuthorizedProject(
  request: AuthorizedProjectRequest,
  projectId: string,
): { ownerUserId: Identifier; projectId: Identifier } {
  const access = request.projectAccess;
  if (access === undefined || access.projectId !== projectId)
    throw new PublicError(
      "internal_error",
      "Project authorization is unavailable.",
      503,
      true,
    );
  return access;
}

function readCandidateId(input: unknown): Identifier {
  const parsed = identifierSchema.safeParse(
    typeof input === "object" &&
      input !== null &&
      "candidateId" in input &&
      typeof input.candidateId === "string"
      ? input.candidateId
      : undefined,
  );
  if (!parsed.success)
    throw new PublicError(
      "validation_failed",
      "The request body must include a valid candidateId.",
      400,
      false,
      { candidateId: "Provide the scene regeneration candidate id." },
    );
  return parsed.data;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
  };
}

function setSessionCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: Date,
): void {
  reply.setCookie(sessionCookieName, token, {
    ...sessionCookieOptions(),
    expires: expiresAt,
  });
}

function assertTrustedOrigin(
  request: FastifyRequest,
  trustedOrigin: string | undefined,
): void {
  if (trustedOrigin === undefined) return;
  if (request.headers.origin !== trustedOrigin)
    throw new PublicError("forbidden", "Request origin is not allowed.", 403);
}

function assertRateLimit(
  limiter: InMemoryAuthRateLimiter,
  operation: "register" | "login" | "password_reset",
  email: string,
  network: string,
): void {
  if (!limiter.check({ operation, email, network }))
    throw new PublicError(
      "rate_limited",
      "Too many attempts. Please try again later.",
      429,
    );
}

@Injectable()
class DatabaseShutdown implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly database: ApiDatabaseConnection,
    @Inject(TELEMETRY_SHUTDOWN)
    private readonly telemetryShutdown: () => Promise<void>,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.close();
    await this.telemetryShutdown();
  }
}

@Module({
  controllers: [
    HealthController,
    AuthController,
    AssetsController,
    VoicesController,
    ProjectsController,
    PublicShareController,
  ],
  providers: [HealthService, DatabaseShutdown],
})
class AppModule {}

const healthyDatabase: ApiDatabaseConnection = {
  healthCheck: () => Promise.resolve(),
  close: () => Promise.resolve(),
};

function createAppModule(
  database: ApiDatabaseConnection,
  telemetryShutdown: () => Promise<void>,
  authGateway: AuthGateway,
  trustedOrigin: string | undefined,
  authRateLimiter: InMemoryAuthRateLimiter,
  projectService: ProjectApiService,
  sourceUploadService: SourceUploadApiService,
  projectAssetService: ProjectAssetApiService,
  illustrationGenerationService: IllustrationGenerationApiService,
  ingestionStatusService: IngestionStatusApiService,
  parsedDocumentReviewService: ParsedDocumentReviewApiService,
  sourceSectionSelectionService: SourceSectionSelectionApiService,
  contentBlockCorrectionService: ContentBlockCorrectionApiService,
  figureInclusionService: FigureInclusionApiService,
  lessonConfigurationService: LessonConfigurationApiService,
  sourceSnapshotService: SourceSnapshotApiService,
  objectivesService: ObjectivesApiService,
  outlineService: OutlineApiService,
  narrationService: NarrationApiService,
  storyboardService: StoryboardApiService,
  citationService: CitationApiService,
  groundingService: GroundingApiService,
  lessonVersionsService: LessonVersionsApiService,
  voiceConfigurationService: VoiceConfigurationApiService,
  sceneAudioService: SceneAudioApiService,
  previewManifestService: PreviewManifestApiService,
  lessonValidationService: LessonValidationApiService,
  renderService: RenderApiService,
  exportService: ExportApiService,
  shareLinkService: ShareLinkApiService,
): DynamicModule {
  return {
    module: AppModule,
    providers: [
      { provide: DATABASE_CONNECTION, useValue: database },
      { provide: TELEMETRY_SHUTDOWN, useValue: telemetryShutdown },
      { provide: AUTH_GATEWAY, useValue: authGateway },
      { provide: TRUSTED_ORIGIN, useValue: trustedOrigin },
      { provide: AUTH_RATE_LIMITER, useValue: authRateLimiter },
      { provide: PROJECT_SERVICE, useValue: projectService },
      { provide: SOURCE_UPLOAD_SERVICE, useValue: sourceUploadService },
      { provide: PROJECT_ASSET_SERVICE, useValue: projectAssetService },
      {
        provide: ILLUSTRATION_GENERATION_SERVICE,
        useValue: illustrationGenerationService,
      },
      { provide: INGESTION_STATUS_SERVICE, useValue: ingestionStatusService },
      {
        provide: PARSED_DOCUMENT_REVIEW_SERVICE,
        useValue: parsedDocumentReviewService,
      },
      {
        provide: SOURCE_SECTION_SELECTION_SERVICE,
        useValue: sourceSectionSelectionService,
      },
      {
        provide: CONTENT_BLOCK_CORRECTION_SERVICE,
        useValue: contentBlockCorrectionService,
      },
      { provide: FIGURE_INCLUSION_SERVICE, useValue: figureInclusionService },
      {
        provide: LESSON_CONFIGURATION_SERVICE,
        useValue: lessonConfigurationService,
      },
      { provide: SOURCE_SNAPSHOT_SERVICE, useValue: sourceSnapshotService },
      { provide: OBJECTIVES_SERVICE, useValue: objectivesService },
      { provide: OUTLINE_SERVICE, useValue: outlineService },
      { provide: NARRATION_SERVICE, useValue: narrationService },
      { provide: STORYBOARD_SERVICE, useValue: storyboardService },
      { provide: CITATION_SERVICE, useValue: citationService },
      { provide: GROUNDING_SERVICE, useValue: groundingService },
      { provide: LESSON_VERSIONS_SERVICE, useValue: lessonVersionsService },
      {
        provide: VOICE_CONFIGURATION_SERVICE,
        useValue: voiceConfigurationService,
      },
      { provide: SCENE_AUDIO_SERVICE, useValue: sceneAudioService },
      { provide: PREVIEW_MANIFEST_SERVICE, useValue: previewManifestService },
      { provide: LESSON_VALIDATION_SERVICE, useValue: lessonValidationService },
      { provide: RENDER_SERVICE, useValue: renderService },
      { provide: EXPORT_SERVICE, useValue: exportService },
      { provide: SHARE_LINK_SERVICE, useValue: shareLinkService },
    ],
  };
}

export type CreateAppOptions = {
  database?: ApiDatabaseConnection;
  logger?: StructuredLogger;
  telemetryShutdown?: () => Promise<void>;
  authGateway?: AuthGateway;
  trustedOrigin?: string;
  authRateLimiter?: InMemoryAuthRateLimiter;
  projectAuthorizer?: ProjectRouteAuthorizer;
  projectService?: ProjectService;
  sourceUploadService?: SourceUploadApiService;
  projectAssetService?: ProjectAssetApiService;
  illustrationGenerationService?: IllustrationGenerationApiService;
  ingestionStatusService?: IngestionStatusApiService;
  parsedDocumentReviewService?: ParsedDocumentReviewApiService;
  sourceSectionSelectionService?: SourceSectionSelectionApiService;
  contentBlockCorrectionService?: ContentBlockCorrectionApiService;
  figureInclusionService?: FigureInclusionApiService;
  lessonConfigurationService?: LessonConfigurationApiService;
  sourceSnapshotService?: SourceSnapshotApiService;
  objectivesService?: ObjectivesApiService;
  outlineService?: OutlineApiService;
  narrationService?: NarrationApiService;
  storyboardService?: StoryboardApiService;
  citationService?: CitationApiService;
  groundingService?: GroundingApiService;
  lessonVersionsService?: LessonVersionsApiService;
  voiceConfigurationService?: VoiceConfigurationApiService;
  sceneAudioService?: SceneAudioApiService;
  previewManifestService?: PreviewManifestApiService;
  lessonValidationService?: LessonValidationApiService;
  renderService?: RenderApiService;
  exportService?: ExportApiService;
  shareLinkService?: ShareLinkApiService;
  configure?: (app: NestFastifyApplication) => void | Promise<void>;
};

const unavailableAuthGateway: AuthGateway = {
  register: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
  signIn: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
  currentSession: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
  signOut: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
  requestPasswordReset: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
  confirmPasswordReset: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Authentication is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableProjectAuthorizer: ProjectRouteAuthorizer = {
  assertProjectAccess: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project authorization is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableProjectService: ProjectApiService = {
  create: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project service is unavailable.",
        503,
        true,
      ),
    ),
  list: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project service is unavailable.",
        503,
        true,
      ),
    ),
  detail: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project service is unavailable.",
        503,
        true,
      ),
    ),
  duplicate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project service is unavailable.",
        503,
        true,
      ),
    ),
  delete: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Project service is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableSourceUploadService: SourceUploadApiService = {
  create: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Document upload is unavailable.",
        503,
        true,
      ),
    ),
  complete: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Document upload is unavailable.",
        503,
        true,
      ),
    ),
  status: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Document upload is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableProjectAssetService: ProjectAssetApiService = {
  reviewPreview: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Image preview is unavailable.",
        503,
        true,
      ),
    ),
  create: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Image upload is unavailable.",
        503,
        true,
      ),
    ),
  complete: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Image upload is unavailable.",
        503,
        true,
      ),
    ),
  list: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Image upload is unavailable.",
        503,
        true,
      ),
    ),
  remove: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Image upload is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableIllustrationGenerationService: IllustrationGenerationApiService =
  {
    list: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Illustration generation is unavailable.",
          503,
          true,
        ),
      ),
    request: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Illustration generation is unavailable.",
          503,
          true,
        ),
      ),
    reject: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Illustration generation is unavailable.",
          503,
          true,
        ),
      ),
  };

const unavailableIngestionStatusService: IngestionStatusApiService = {
  status: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Ingestion status is unavailable.",
        503,
        true,
      ),
    ),
  retry: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Ingestion retry is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableParsedDocumentReviewService: ParsedDocumentReviewApiService = {
  review: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Document review is unavailable.",
        503,
        true,
      ),
    ),
  section: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Document review is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableSourceSectionSelectionService: SourceSectionSelectionApiService =
  {
    list: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Source section selection is unavailable.",
          503,
          true,
        ),
      ),
    update: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Source section selection is unavailable.",
          503,
          true,
        ),
      ),
  };

const unavailableContentBlockCorrectionService: ContentBlockCorrectionApiService =
  {
    update: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Content block correction is unavailable.",
          503,
          true,
        ),
      ),
    restore: () =>
      Promise.reject(
        new PublicError(
          "internal_error",
          "Content block correction is unavailable.",
          503,
          true,
        ),
      ),
  };

const unavailableFigureInclusionService: FigureInclusionApiService = {
  update: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Figure inclusion is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableLessonConfigurationService: LessonConfigurationApiService = {
  get: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson configuration is unavailable.",
        503,
        true,
      ),
    ),
  save: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson configuration is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableSourceSnapshotService: SourceSnapshotApiService = {
  approve: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Source review approval is unavailable.",
        503,
        true,
      ),
    ),
  metadata: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Source snapshots are unavailable.",
        503,
        true,
      ),
    ),
  status: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Source review status is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableObjectivesService: ObjectivesApiService = {
  generate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective generation is unavailable.",
        503,
        true,
      ),
    ),
  current: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective generation is unavailable.",
        503,
        true,
      ),
    ),
  add: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective editing is unavailable.",
        503,
        true,
      ),
    ),
  update: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective editing is unavailable.",
        503,
        true,
      ),
    ),
  remove: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective editing is unavailable.",
        503,
        true,
      ),
    ),
  reorder: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective editing is unavailable.",
        503,
        true,
      ),
    ),
  approve: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Objective approval is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableOutlineService: OutlineApiService = {
  generate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline generation is unavailable.",
        503,
        true,
      ),
    ),
  current: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline generation is unavailable.",
        503,
        true,
      ),
    ),
  add: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline editing is unavailable.",
        503,
        true,
      ),
    ),
  update: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline editing is unavailable.",
        503,
        true,
      ),
    ),
  remove: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline editing is unavailable.",
        503,
        true,
      ),
    ),
  reorder: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline editing is unavailable.",
        503,
        true,
      ),
    ),
  approve: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Outline approval is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableNarrationService: NarrationApiService = {
  approve: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration approval is unavailable.",
        503,
        true,
      ),
    ),
  generate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration generation is unavailable.",
        503,
        true,
      ),
    ),
  current: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration generation is unavailable.",
        503,
        true,
      ),
    ),
  updateBlock: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
  regenerateBlock: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
  acceptCandidate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
  rejectCandidate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
  listBlockRevisions: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
  restoreBlockRevision: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Narration editing is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableStoryboardService: StoryboardApiService = {
  generate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard generation is unavailable.",
        503,
        true,
      ),
    ),
  current: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard generation is unavailable.",
        503,
        true,
      ),
    ),
  regenerateScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene regeneration is unavailable.",
        503,
        true,
      ),
    ),
  applySceneCandidate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene regeneration is unavailable.",
        503,
        true,
      ),
    ),
  rejectSceneCandidate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene regeneration is unavailable.",
        503,
        true,
      ),
    ),
  scenes: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "The storyboard scene list is unavailable.",
        503,
        true,
      ),
    ),
  sceneDetail: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "The storyboard scene detail is unavailable.",
        503,
        true,
      ),
    ),
  addScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  duplicateScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  deleteScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  reorderScenes: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  updateScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  switchSceneTemplate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard scene editing is unavailable.",
        503,
        true,
      ),
    ),
  bindCatalogAsset: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard asset selection is unavailable.",
        503,
        true,
      ),
    ),
  unbindCatalogAsset: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard asset selection is unavailable.",
        503,
        true,
      ),
    ),
  acceptIllustrationCandidate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Storyboard editing is unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableCitationService: CitationApiService = {
  forScene: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Scene citations are unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableGroundingService: GroundingApiService = {
  check: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Grounding checks are unavailable.",
        503,
        true,
      ),
    ),
  current: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Grounding checks are unavailable.",
        503,
        true,
      ),
    ),
};

const unavailableLessonVersionsService: LessonVersionsApiService = {
  create: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson versioning is unavailable.",
        503,
        true,
      ),
    ),
  list: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson versioning is unavailable.",
        503,
        true,
      ),
    ),
  detail: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson versioning is unavailable.",
        503,
        true,
      ),
    ),
  restore: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Lesson versioning is unavailable.",
        503,
        true,
      ),
    ),
};
const unavailableVoiceConfigurationService: VoiceConfigurationApiService = {
  get: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Voice configuration is unavailable.",
        503,
        true,
      ),
    ),
  save: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Voice configuration is unavailable.",
        503,
        true,
      ),
    ),
};
const unavailableSceneAudioService: SceneAudioApiService = {
  generate: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Audio generation is unavailable.",
        503,
        true,
      ),
    ),
  status: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Audio generation is unavailable.",
        503,
        true,
      ),
    ),
};
const unavailablePreviewManifestService: PreviewManifestApiService = {
  get: () =>
    Promise.reject(
      new PublicError("internal_error", "Preview is unavailable.", 503, true),
    ),
};
const unavailableLessonValidationService: LessonValidationApiService = {
  latest: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Validation is unavailable.",
        503,
        true,
      ),
    ),
  run: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Validation is unavailable.",
        503,
        true,
      ),
    ),
  acknowledge: () =>
    Promise.reject(
      new PublicError(
        "internal_error",
        "Validation is unavailable.",
        503,
        true,
      ),
    ),
};
const unavailableRenderService: RenderApiService = {
  start: () =>
    Promise.reject(
      new PublicError("internal_error", "Rendering is unavailable.", 503, true),
    ),
  list: () =>
    Promise.reject(
      new PublicError("internal_error", "Rendering is unavailable.", 503, true),
    ),
  detail: () =>
    Promise.reject(
      new PublicError("internal_error", "Rendering is unavailable.", 503, true),
    ),
  retry: () =>
    Promise.reject(
      new PublicError("internal_error", "Rendering is unavailable.", 503, true),
    ),
};
const unavailableExportService: ExportApiService = {
  build: () =>
    Promise.reject(
      new PublicError("internal_error", "Exports are unavailable.", 503, true),
    ),
  signedVideoDownload: () =>
    Promise.reject(
      new PublicError("internal_error", "Exports are unavailable.", 503, true),
    ),
};
const unavailableShareLinkService: ShareLinkApiService = {
  create: () =>
    Promise.reject(
      new PublicError("internal_error", "Sharing is unavailable.", 503, true),
    ),
  list: () =>
    Promise.reject(
      new PublicError("internal_error", "Sharing is unavailable.", 503, true),
    ),
  revoke: () =>
    Promise.reject(
      new PublicError("internal_error", "Sharing is unavailable.", 503, true),
    ),
  resolve: () =>
    Promise.reject(
      new PublicError("not_found", "This shared lesson is unavailable.", 404),
    ),
};

export async function createApp(
  options: CreateAppOptions = {},
): Promise<NestFastifyApplication> {
  const logger = options.logger ?? createStructuredLogger({ service: "api" });
  const app = await NestFactory.create<NestFastifyApplication>(
    createAppModule(
      options.database ?? healthyDatabase,
      options.telemetryShutdown ?? (() => Promise.resolve()),
      options.authGateway ?? unavailableAuthGateway,
      options.trustedOrigin,
      options.authRateLimiter ??
        new InMemoryAuthRateLimiter("development-only-rate-limit-key"),
      options.projectService ?? unavailableProjectService,
      options.sourceUploadService ?? unavailableSourceUploadService,
      options.projectAssetService ?? unavailableProjectAssetService,
      options.illustrationGenerationService ??
        unavailableIllustrationGenerationService,
      options.ingestionStatusService ?? unavailableIngestionStatusService,
      options.parsedDocumentReviewService ??
        unavailableParsedDocumentReviewService,
      options.sourceSectionSelectionService ??
        unavailableSourceSectionSelectionService,
      options.contentBlockCorrectionService ??
        unavailableContentBlockCorrectionService,
      options.figureInclusionService ?? unavailableFigureInclusionService,
      options.lessonConfigurationService ??
        unavailableLessonConfigurationService,
      options.sourceSnapshotService ?? unavailableSourceSnapshotService,
      options.objectivesService ?? unavailableObjectivesService,
      options.outlineService ?? unavailableOutlineService,
      options.narrationService ?? unavailableNarrationService,
      options.storyboardService ?? unavailableStoryboardService,
      options.citationService ?? unavailableCitationService,
      options.groundingService ?? unavailableGroundingService,
      options.lessonVersionsService ?? unavailableLessonVersionsService,
      options.voiceConfigurationService ?? unavailableVoiceConfigurationService,
      options.sceneAudioService ?? unavailableSceneAudioService,
      options.previewManifestService ?? unavailablePreviewManifestService,
      options.lessonValidationService ?? unavailableLessonValidationService,
      options.renderService ?? unavailableRenderService,
      options.exportService ?? unavailableExportService,
      options.shareLinkService ?? unavailableShareLinkService,
    ),
    new FastifyAdapter({
      logger: {
        level: "info",
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.headers.x-api-key",
            "req.url",
            "req.body",
            "res.headers.set-cookie",
          ],
          censor: "[REDACTED]",
        },
      },
    }),
    { logger: false },
  );
  await app.register(
    fastifyCookie as unknown as Parameters<typeof app.register>[0],
  );
  if (options.trustedOrigin !== undefined)
    await app.register(
      fastifyCors as unknown as Parameters<typeof app.register>[0],
      {
        origin: options.trustedOrigin,
        credentials: true,
        methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      },
    );
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", (request, reply, done) => {
      const correlationRequest = request as typeof request & {
        correlationId?: string;
      };
      const header = request.headers["x-correlation-id"];
      correlationRequest.correlationId = correlationIdFromHeader(header);
      reply.header("x-correlation-id", correlationRequest.correlationId);
      logger.info("api.request_received", {
        correlationId: correlationRequest.correlationId,
        method: request.method,
        route: request.routeOptions.url,
      });
      withCorrelationContext(
        { correlationId: correlationRequest.correlationId },
        done,
      );
    });
  app
    .getHttpAdapter()
    .getInstance()
    .addHook("onRequest", async (request, reply) => {
      try {
        await authorizeProjectRoute(
          request as unknown as AuthorizedProjectRequest,
          options.authGateway ?? unavailableAuthGateway,
          options.projectAuthorizer ?? unavailableProjectAuthorizer,
          sessionCookieName,
        );
      } catch (error) {
        const correlationId = (request as unknown as RequestWithAuth)
          .correlationId;
        const safeCorrelationId =
          correlationId ?? correlationIdFromHeader(undefined);
        const statusCode =
          error instanceof PublicError ? error.statusCode : 500;
        if (
          error instanceof PublicError &&
          ["forbidden", "not_found", "unauthorized"].includes(error.code)
        )
          logger.warn("api.project_access_denied", {
            correlationId: safeCorrelationId,
            method: request.method,
            route: request.routeOptions.url,
            code: error.code,
          });
        await reply
          .header("x-correlation-id", safeCorrelationId)
          .status(statusCode)
          .send(toApiErrorEnvelope(error, safeCorrelationId));
      }
    });
  app.useGlobalFilters(new ApiExceptionFilter());
  await options.configure?.(app);
  await app.init();
  return app;
}
