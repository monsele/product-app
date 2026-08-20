import "reflect-metadata";
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

const DATABASE_CONNECTION = Symbol("DATABASE_CONNECTION");
const TELEMETRY_SHUTDOWN = Symbol("TELEMETRY_SHUTDOWN");
const AUTH_GATEWAY = Symbol("AUTH_GATEWAY");
const TRUSTED_ORIGIN = Symbol("TRUSTED_ORIGIN");
const AUTH_RATE_LIMITER = Symbol("AUTH_RATE_LIMITER");
const SOURCE_UPLOAD_SERVICE = Symbol("SOURCE_UPLOAD_SERVICE");
const PROJECT_SERVICE = Symbol("PROJECT_SERVICE");
const INGESTION_STATUS_SERVICE = Symbol("INGESTION_STATUS_SERVICE");
const PARSED_DOCUMENT_REVIEW_SERVICE = Symbol("PARSED_DOCUMENT_REVIEW_SERVICE");
const SOURCE_SECTION_SELECTION_SERVICE = Symbol("SOURCE_SECTION_SELECTION_SERVICE");
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
  | "updateBlock"
  | "regenerateBlock"
  | "acceptCandidate"
  | "rejectCandidate"
  | "listBlockRevisions"
  | "restoreBlockRevision"
>;
type StoryboardApiService = Pick<StoryboardService, "generate" | "current">;

@Controller("projects")
class ProjectsController {
  public constructor(
    @Inject(AUTH_GATEWAY) private readonly auth: AuthGateway,
    @Inject(TRUSTED_ORIGIN) private readonly trustedOrigin: string | undefined,
    @Inject(PROJECT_SERVICE) private readonly projects: ProjectApiService,
    @Inject(SOURCE_UPLOAD_SERVICE)
    private readonly sourceUploads: SourceUploadApiService,
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
    return this.parsedDocumentReview.review(access.ownerUserId, access.projectId);
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
  controllers: [HealthController, AuthController, ProjectsController],
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
