import { createId, PublicError, type Identifier } from "@avlp/config";
import {
  designSystems,
  designSystemVersions,
  designSystemAssets,
  designSystemInterpretations,
  users,
  projects,
  jobs,
  outboxEvents,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { createJobEnvelope, createIdempotencyKey } from "@avlp/jobs";
import {
  createDesignSystemInputSchema,
  updateDesignSystemInputSchema,
  designSystemRevisionInputSchema,
  createDesignSystemUploadInputSchema,
  designSystemAssetValidationPayloadSchema,
  designSystemDefinitionSchema,
  emptyDesignSystemDefinition,
  designSystemContentHash,
  designSystemVersionSnapshotSchema,
  designSystemVersionPageInputSchema,
  requestDesignSystemInterpretationSchema,
  designSystemInterpretationPayloadSchema,
  designSystemInterpretationInputSchema,
  designSystemInterpretationProposalSchema,
} from "@avlp/schemas";
import { createModelCallProviderApproval } from "./model-call-approval.js";
import {
  storageKeys,
  StorageObjectNotFoundError,
  type ObjectStorage,
} from "@avlp/storage";
import { and, eq, desc, isNull, inArray, lt, gte } from "drizzle-orm";
import { z } from "zod";

export function parseDesignSystemBoundary<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new PublicError(
      "validation_failed",
      "Check the design-system fields.",
      400,
      false,
      Object.fromEntries(
        result.error.issues.map((issue) => [
          issue.path.join(".") || "root",
          issue.message,
        ]),
      ),
    );
  return result.data;
}
const missing = () =>
  new PublicError(
    "not_found",
    "The requested design-system resource was not found.",
    404,
  );
const conflict = () =>
  new PublicError(
    "edit_conflict",
    "The design system changed or was archived. Reload before continuing.",
    409,
  );
const invalid = (message: string) =>
  new PublicError("validation_failed", message, 400);
type SystemRow = typeof designSystems.$inferSelect;
type AssetRow = typeof designSystemAssets.$inferSelect;
function assetResponse(row: AssetRow) {
  return {
    id: row.id,
    kind: row.kind,
    mediaType: row.mediaType,
    originalName: row.originalName,
    sizeBytes: row.sizeBytes,
    sha256: row.sha256,
    validatedSha256: row.validatedSha256,
    status: row.status,
    inspection: row.inspection,
    rejectionCode: row.rejectionCode,
    jobId: row.jobId,
  };
}
export class DesignSystemService {
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly now = () => new Date(),
  ) {}

  public async interpret(
    ownerUserId: Identifier,
    systemId: Identifier,
    body: unknown,
    correlationId: Identifier,
  ) {
    const command = parseDesignSystemBoundary(
      requestDesignSystemInterpretationSchema,
      body,
    );
    return this.database.transaction(async (tx) => {
      // Serialize reservations per owner, including across origin projects.
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, ownerUserId))
        .for("update");
      const system = await this.system(ownerUserId, systemId, tx, true);
      this.writable(system, command.expectedRevision);
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(
          and(
            eq(projects.id, command.projectId),
            eq(projects.ownerUserId, ownerUserId),
            isNull(projects.deletedAt),
          ),
        )
        .limit(1);
      if (!project) throw missing();
      const assets = await this.validateReferences(
        tx,
        ownerUserId,
        systemId,
        command.assetIds,
      );
      if (assets.some((a) => a.status !== "active"))
        throw invalid("Select only imports that passed validation.");
      if (
        assets.filter((a) => a.kind === "reference" || a.kind === "logo")
          .length > 4
      )
        throw invalid(
          "Choose at most four reference images or logos per interpretation.",
        );
      const definition = designSystemDefinitionSchema.parse(system.definition);
      const pins = assets
        .map((a) => ({ id: a.id, sha256: a.validatedSha256! }))
        .sort((a, b) => a.id.localeCompare(b.id));
      const inputHash = designSystemContentHash({
        systemId,
        revision: system.revision,
        request: command.request,
        assets: pins,
        prompt: "design-system-interpretation@v1",
        model: "moonshotai/Kimi-K3",
      });
      const [previous] = await tx
        .select()
        .from(designSystemInterpretations)
        .where(
          and(
            eq(designSystemInterpretations.ownerUserId, ownerUserId),
            eq(designSystemInterpretations.systemId, systemId),
            eq(designSystemInterpretations.inputHash, inputHash),
          ),
        )
        .limit(1);
      if (previous) return { id: previous.id, jobId: previous.jobId };
      const recent = await tx
        .select({ state: jobs.state })
        .from(jobs)
        .where(
          and(
            eq(jobs.ownerUserId, ownerUserId),
            eq(jobs.jobType, "design-system.interpret"),
            gte(jobs.createdAt, new Date(this.now().getTime() - 3600000)),
          ),
        );
      if (
        recent.length >= 20 ||
        recent.filter((j) =>
          ["queued", "running", "retry_wait"].includes(j.state),
        ).length >= 2
      )
        throw new PublicError(
          "rate_limited",
          "Interpretation quota reached. Wait for current requests to finish or retry later.",
          429,
          true,
        );
      const id = createId(),
        jobId = createId();
      const input = designSystemInterpretationInputSchema.parse({
        schemaVersion: "1.0",
        definition,
        request: command.request,
        assets: pins,
        promptId: "design-system-interpretation",
        promptVersion: "v1",
        providerApproval: createModelCallProviderApproval({
          jobId,
          model: "moonshotai/Kimi-K3",
        }),
      });
      const envelope = createJobEnvelope(
        designSystemInterpretationPayloadSchema,
        {
          jobId,
          jobType: "design-system.interpret",
          projectId: command.projectId,
          ownerUserId,
          inputVersion: inputHash,
          idempotencyKey: createIdempotencyKey({
            jobType: "design-system.interpret",
            projectId: command.projectId,
            inputVersion: inputHash,
            options: {},
          }),
          correlationId,
          payloadVersion: 1,
          payload: { schemaVersion: 1, interpretationId: id },
          requestedAt: this.now(),
        },
      );
      await tx
        .insert(jobs)
        .values({
          id: jobId,
          projectId: command.projectId,
          ownerUserId,
          jobType: envelope.jobType,
          queueName: "pipeline",
          inputVersion: inputHash,
          idempotencyKey: envelope.idempotencyKey,
          correlationId,
          payloadVersion: 1,
          payload: envelope.payload,
        });
      await tx
        .insert(designSystemInterpretations)
        .values({
          id,
          ownerUserId,
          systemId,
          projectId: command.projectId,
          jobId,
          inputRevision: system.revision,
          inputHash,
          input,
        });
      await tx
        .insert(outboxEvents)
        .values({
          id: createId(),
          jobId,
          eventType: "design_system.interpretation.requested.v1",
          queueName: "pipeline",
          envelope,
          deliveryOptions: { maxAttempts: 3, retryDelayMs: 5000 },
        });
      return { id, jobId };
    });
  }
  public async interpretation(
    ownerUserId: Identifier,
    systemId: Identifier,
    id: Identifier,
  ) {
    const system = await this.system(ownerUserId, systemId);
    const [row] = await this.database
      .select({ proposal: designSystemInterpretations, job: jobs })
      .from(designSystemInterpretations)
      .innerJoin(
        jobs,
        and(
          eq(jobs.id, designSystemInterpretations.jobId),
          eq(jobs.ownerUserId, ownerUserId),
          eq(jobs.projectId, designSystemInterpretations.projectId),
        ),
      )
      .where(
        and(
          eq(designSystemInterpretations.id, id),
          eq(designSystemInterpretations.ownerUserId, ownerUserId),
          eq(designSystemInterpretations.systemId, systemId),
        ),
      )
      .limit(1);
    if (!row) throw missing();
    const failure = z
      .object({ code: z.string() })
      .safeParse(row.job.errorMetadata);
    return {
      id,
      inputRevision: row.proposal.inputRevision,
      state: row.job.state,
      stale:
        system.archivedAt !== null ||
        (row.proposal.acceptedRevision === null &&
          system.revision !== row.proposal.inputRevision),
      acceptedRevision: row.proposal.acceptedRevision,
      errorCode: failure.success ? failure.data.code : null,
      proposal:
        row.proposal.proposal === null
          ? null
          : designSystemInterpretationProposalSchema.parse(
              row.proposal.proposal,
            ),
    };
  }
  public async listInterpretations(
    ownerUserId: Identifier,
    systemId: Identifier,
  ) {
    await this.system(ownerUserId, systemId);
    return this.database
      .select({
        id: designSystemInterpretations.id,
        inputRevision: designSystemInterpretations.inputRevision,
      })
      .from(designSystemInterpretations)
      .where(
        and(
          eq(designSystemInterpretations.ownerUserId, ownerUserId),
          eq(designSystemInterpretations.systemId, systemId),
        ),
      )
      .orderBy(desc(designSystemInterpretations.createdAt))
      .limit(20);
  }
  public async acceptInterpretation(
    ownerUserId: Identifier,
    systemId: Identifier,
    id: Identifier,
    body: unknown,
  ) {
    const command = parseDesignSystemBoundary(
      designSystemRevisionInputSchema,
      body,
    );
    return this.database.transaction(async (tx) => {
      const system = await this.system(ownerUserId, systemId, tx, true);
      const [row] = await tx
        .select()
        .from(designSystemInterpretations)
        .where(
          and(
            eq(designSystemInterpretations.id, id),
            eq(designSystemInterpretations.ownerUserId, ownerUserId),
            eq(designSystemInterpretations.systemId, systemId),
          ),
        )
        .for("update");
      if (!row) throw missing();
      if (row.acceptedRevision !== null)
        return { revision: row.acceptedRevision };
      this.writable(system, command.expectedRevision);
      if (system.revision !== row.inputRevision || row.proposal === null)
        throw conflict();
      const [completed] = await tx
        .select({ id: jobs.id })
        .from(jobs)
        .where(
          and(
            eq(jobs.id, row.jobId),
            eq(jobs.ownerUserId, ownerUserId),
            eq(jobs.projectId, row.projectId),
            eq(jobs.state, "succeeded"),
          ),
        )
        .limit(1);
      if (!completed)
        throw invalid(
          "Wait for interpretation to finish successfully before accepting its proposal.",
        );
      const proposal = designSystemInterpretationProposalSchema.parse(
        row.proposal,
      );
      await this.validateReferences(
        tx,
        ownerUserId,
        systemId,
        proposal.definition.assetIds,
      );
      await tx
        .update(designSystems)
        .set({
          definition: proposal.definition,
          revision: system.revision + 1,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(designSystems.id, systemId),
            eq(designSystems.ownerUserId, ownerUserId),
          ),
        );
      await tx
        .update(designSystemInterpretations)
        .set({ acceptedRevision: system.revision + 1, updatedAt: this.now() })
        .where(
          and(
            eq(designSystemInterpretations.id, id),
            eq(designSystemInterpretations.ownerUserId, ownerUserId),
          ),
        );
      return { revision: system.revision + 1 };
    });
  }

  private async system(
    ownerUserId: Identifier,
    systemId: Identifier,
    db: DatabaseExecutor = this.database,
    lock = false,
  ) {
    const query = db
      .select()
      .from(designSystems)
      .where(
        and(
          eq(designSystems.id, systemId),
          eq(designSystems.ownerUserId, ownerUserId),
        ),
      )
      .limit(1);
    const [row] = await (lock ? query.for("update") : query);
    if (!row) throw missing();
    return row;
  }
  private writable(row: SystemRow, revision?: number) {
    if (
      row.archivedAt !== null ||
      (revision !== undefined && row.revision !== revision)
    )
      throw conflict();
  }
  private async asset(
    ownerUserId: Identifier,
    systemId: Identifier,
    assetId: Identifier,
  ) {
    await this.system(ownerUserId, systemId);
    const [row] = await this.database
      .select()
      .from(designSystemAssets)
      .where(
        and(
          eq(designSystemAssets.id, assetId),
          eq(designSystemAssets.ownerUserId, ownerUserId),
          eq(designSystemAssets.systemId, systemId),
        ),
      )
      .limit(1);
    if (!row) throw missing();
    return row;
  }
  public async list(ownerUserId: Identifier) {
    return this.database
      .select({
        id: designSystems.id,
        name: designSystems.name,
        revision: designSystems.revision,
        archivedAt: designSystems.archivedAt,
      })
      .from(designSystems)
      .where(eq(designSystems.ownerUserId, ownerUserId))
      .orderBy(desc(designSystems.createdAt))
      .limit(200);
  }
  public async create(ownerUserId: Identifier, body: unknown) {
    const input = parseDesignSystemBoundary(
      createDesignSystemInputSchema,
      body,
    );
    const [row] = await this.database
      .insert(designSystems)
      .values({
        id: createId(),
        ownerUserId,
        name: input.name,
        definition: emptyDesignSystemDefinition,
      })
      .returning();
    return row!;
  }
  public async get(ownerUserId: Identifier, systemId: Identifier) {
    const system = await this.system(ownerUserId, systemId);
    const assets = await this.database
      .select({
        asset: designSystemAssets,
        jobState: jobs.state,
        attempts: jobs.attempts,
      })
      .from(designSystemAssets)
      .leftJoin(
        jobs,
        and(
          eq(jobs.id, designSystemAssets.jobId),
          eq(jobs.ownerUserId, ownerUserId),
          eq(jobs.projectId, designSystemAssets.projectId),
        ),
      )
      .where(
        and(
          eq(designSystemAssets.ownerUserId, ownerUserId),
          eq(designSystemAssets.systemId, systemId),
        ),
      )
      .orderBy(desc(designSystemAssets.createdAt))
      .limit(200);
    const history = await this.listVersions(ownerUserId, systemId, {
      limit: 200,
    });
    return {
      system,
      assets: assets.map((row) => ({
        ...assetResponse(row.asset),
        validationJob:
          row.jobState === null
            ? null
            : { state: row.jobState, attempts: row.attempts },
        recovery:
          row.asset.status === "rejected" ||
          (row.asset.status === "uploading" &&
            row.asset.expiresAt <= this.now()) ||
          (row.asset.status === "pending_validation" &&
            (row.jobState === "failed" || row.jobState === "cancelled"))
            ? "upload_again"
            : null,
      })),
      ...history,
    };
  }
  public async listVersions(
    ownerUserId: Identifier,
    systemId: Identifier,
    query: unknown = {},
  ) {
    const input = parseDesignSystemBoundary(
      designSystemVersionPageInputSchema,
      query,
    );
    await this.system(ownerUserId, systemId);
    const rows = await this.database
      .select()
      .from(designSystemVersions)
      .where(
        and(
          eq(designSystemVersions.ownerUserId, ownerUserId),
          eq(designSystemVersions.systemId, systemId),
          input.beforeRevision === undefined
            ? undefined
            : lt(designSystemVersions.sourceRevision, input.beforeRevision),
        ),
      )
      .orderBy(desc(designSystemVersions.sourceRevision))
      .limit(input.limit + 1);
    const versions = rows.slice(0, input.limit);
    return {
      versions,
      nextBeforeRevision:
        rows.length > input.limit ? versions.at(-1)!.sourceRevision : null,
    };
  }
  public async getVersion(
    ownerUserId: Identifier,
    systemId: Identifier,
    versionId: Identifier,
  ) {
    await this.system(ownerUserId, systemId);
    const [version] = await this.database
      .select()
      .from(designSystemVersions)
      .where(
        and(
          eq(designSystemVersions.ownerUserId, ownerUserId),
          eq(designSystemVersions.systemId, systemId),
          eq(designSystemVersions.id, versionId),
        ),
      )
      .limit(1);
    if (!version) throw missing();
    return version;
  }
  public async update(
    ownerUserId: Identifier,
    systemId: Identifier,
    body: unknown,
  ) {
    const input = parseDesignSystemBoundary(
      updateDesignSystemInputSchema,
      body,
    );
    return this.database.transaction(async (tx) => {
      const row = await this.system(ownerUserId, systemId, tx, true);
      this.writable(row, input.expectedRevision);
      await this.validateReferences(
        tx,
        ownerUserId,
        systemId,
        input.definition.assetIds,
      );
      const [saved] = await tx
        .update(designSystems)
        .set({
          name: input.name,
          definition: input.definition,
          revision: row.revision + 1,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(designSystems.id, systemId),
            eq(designSystems.ownerUserId, ownerUserId),
          ),
        )
        .returning();
      return saved!;
    });
  }
  private async validateReferences(
    db: DatabaseExecutor,
    ownerUserId: Identifier,
    systemId: Identifier,
    ids: string[],
  ) {
    if (ids.length === 0) return [];
    const rows = await db
      .select()
      .from(designSystemAssets)
      .where(
        and(
          eq(designSystemAssets.ownerUserId, ownerUserId),
          eq(designSystemAssets.systemId, systemId),
          inArray(designSystemAssets.id, ids),
        ),
      );
    if (rows.length !== ids.length)
      throw invalid("A referenced asset is unavailable in this design system.");
    return rows;
  }
  public async publish(
    ownerUserId: Identifier,
    systemId: Identifier,
    body: unknown,
  ) {
    const { expectedRevision } = parseDesignSystemBoundary(
      designSystemRevisionInputSchema,
      body,
    );
    return this.database.transaction(async (tx) => {
      const row = await this.system(ownerUserId, systemId, tx, true);
      this.writable(row, expectedRevision);
      const [previous] = await tx
        .select()
        .from(designSystemVersions)
        .where(
          and(
            eq(designSystemVersions.ownerUserId, ownerUserId),
            eq(designSystemVersions.systemId, systemId),
            eq(designSystemVersions.sourceRevision, expectedRevision),
          ),
        )
        .limit(1);
      if (previous) return previous;
      const definition = designSystemDefinitionSchema.parse(row.definition);
      const assets = await this.validateReferences(
        tx,
        ownerUserId,
        systemId,
        definition.assetIds,
      );
      if (assets.some((asset) => asset.status !== "active"))
        throw invalid(
          "Wait for every referenced import to pass validation before publishing.",
        );
      const snapshot = designSystemVersionSnapshotSchema.parse({
        schemaVersion: "1.0",
        name: row.name,
        definition,
        assets: assets
          .sort((a, b) => a.id.localeCompare(b.id))
          .map((asset) => ({
            id: asset.id,
            kind: asset.kind,
            mediaType: asset.mediaType,
            sha256: asset.validatedSha256,
            inspection: asset.inspection,
          })),
      });
      const [version] = await tx
        .insert(designSystemVersions)
        .values({
          id: createId(),
          ownerUserId,
          systemId,
          sourceRevision: expectedRevision,
          snapshot,
          contentHash: designSystemContentHash(snapshot),
        })
        .returning();
      return version!;
    });
  }
  public async archive(
    ownerUserId: Identifier,
    systemId: Identifier,
    body: unknown,
  ) {
    const { expectedRevision } = parseDesignSystemBoundary(
      designSystemRevisionInputSchema,
      body,
    );
    return this.database.transaction(async (tx) => {
      const row = await this.system(ownerUserId, systemId, tx, true);
      this.writable(row, expectedRevision);
      await tx
        .update(designSystems)
        .set({
          archivedAt: this.now(),
          revision: row.revision + 1,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(designSystems.id, systemId),
            eq(designSystems.ownerUserId, ownerUserId),
          ),
        );
      return { archived: true };
    });
  }
  public async createUpload(
    ownerUserId: Identifier,
    systemId: Identifier,
    body: unknown,
  ) {
    const input = parseDesignSystemBoundary(
      createDesignSystemUploadInputSchema,
      body,
    );
    this.writable(await this.system(ownerUserId, systemId));
    const [project] = await this.database
      .select({ id: projects.id })
      .from(projects)
      .where(
        and(
          eq(projects.id, input.projectId),
          eq(projects.ownerUserId, ownerUserId),
          isNull(projects.deletedAt),
        ),
      )
      .limit(1);
    if (!project) throw missing();
    const assetId = createId();
    const uploadKey = storageKeys.designSystemAsset({
      userId: ownerUserId,
      systemId,
      assetId,
      stage: "upload",
    });
    const signed = await this.storage.createSignedUpload({
      key: uploadKey,
      contentType: input.mediaType,
      contentLength: input.sizeBytes,
      checksumSha256: input.sha256,
      expiresInSeconds: 300,
    });
    await this.database.transaction(async (tx) => {
      this.writable(await this.system(ownerUserId, systemId, tx, true));
      await tx.insert(designSystemAssets).values({
        id: assetId,
        ownerUserId,
        systemId,
        projectId: input.projectId,
        kind: input.kind,
        mediaType: input.mediaType,
        originalName: input.originalName,
        sizeBytes: input.sizeBytes,
        sha256: input.sha256,
        uploadKey,
        expiresAt: new Date(this.now().getTime() + 300000),
      });
    });
    return {
      assetId,
      upload: {
        url: signed.url,
        method: signed.method,
        expiresAt: signed.expiresAt,
        requiredHeaders: signed.requiredHeaders,
      },
    };
  }
  public async completeUpload(
    ownerUserId: Identifier,
    systemId: Identifier,
    assetId: Identifier,
    correlationId: Identifier,
  ) {
    const asset = await this.asset(ownerUserId, systemId, assetId);
    if (asset.status !== "uploading") return assetResponse(asset);
    if (asset.expiresAt <= this.now())
      throw invalid("This upload expired. Start a new upload.");
    let metadata;
    try {
      metadata = await this.storage.getMetadata(asset.uploadKey);
    } catch (error) {
      if (error instanceof StorageObjectNotFoundError)
        throw invalid("The uploaded file was not found. Retry the upload.");
      throw new PublicError(
        "internal_error",
        "Import storage is temporarily unavailable.",
        503,
        true,
      );
    }
    if (
      metadata.sizeBytes !== asset.sizeBytes ||
      metadata.contentType !== asset.mediaType ||
      metadata.checksumSha256 !== asset.sha256
    )
      throw invalid(
        "The uploaded file does not match the requested size, type or checksum.",
      );
    await this.database.transaction(async (tx) => {
      this.writable(await this.system(ownerUserId, systemId, tx, true));
      const [locked] = await tx
        .select()
        .from(designSystemAssets)
        .where(
          and(
            eq(designSystemAssets.id, assetId),
            eq(designSystemAssets.ownerUserId, ownerUserId),
            eq(designSystemAssets.systemId, systemId),
          ),
        )
        .for("update");
      if (!locked) throw missing();
      if (locked.status !== "uploading") return;
      if (locked.expiresAt <= this.now())
        throw invalid("This upload expired. Start a new upload.");
      const payload = { schemaVersion: 1 as const, assetId, systemId };
      const inputVersion = `design-system:${assetId}:${locked.sha256}`;
      const envelope = createJobEnvelope(
        designSystemAssetValidationPayloadSchema,
        {
          jobId: createId(),
          jobType: "design-system.validation",
          projectId: locked.projectId,
          ownerUserId,
          inputVersion,
          idempotencyKey: createIdempotencyKey({
            jobType: "design-system.validation",
            projectId: locked.projectId,
            inputVersion,
            options: {},
          }),
          correlationId,
          payloadVersion: 1,
          payload,
          requestedAt: this.now(),
        },
      );
      await tx.insert(jobs).values({
        id: envelope.jobId,
        projectId: locked.projectId,
        ownerUserId,
        jobType: envelope.jobType,
        queueName: "pipeline",
        inputVersion,
        idempotencyKey: envelope.idempotencyKey,
        correlationId,
        payloadVersion: 1,
        payload,
      });
      await tx.insert(outboxEvents).values({
        id: createId(),
        jobId: envelope.jobId,
        eventType: "design_system.validation.requested.v1",
        queueName: "pipeline",
        envelope,
        deliveryOptions: { maxAttempts: 3, retryDelayMs: 5000 },
      });
      await tx
        .update(designSystemAssets)
        .set({
          status: "pending_validation",
          jobId: envelope.jobId,
          updatedAt: this.now(),
        })
        .where(
          and(
            eq(designSystemAssets.id, assetId),
            eq(designSystemAssets.ownerUserId, ownerUserId),
          ),
        );
    });
    return assetResponse(await this.asset(ownerUserId, systemId, assetId));
  }
  public async download(
    ownerUserId: Identifier,
    systemId: Identifier,
    assetId: Identifier,
  ) {
    const asset = await this.asset(ownerUserId, systemId, assetId);
    if (asset.status !== "active" || !asset.storageKey)
      throw invalid("This import has not passed validation.");
    const signed = await this.storage.createSignedDownload({
      key: asset.storageKey,
      expiresInSeconds: 300,
      downloadFileName: asset.originalName,
    });
    return { url: signed.url, expiresAt: signed.expiresAt };
  }
}
