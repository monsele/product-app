/**
 * ST-096 — the curated pilot test lessons.
 *
 * The pilot is restricted to two validated subjects, and a tester needs those
 * subjects as ordinary projects: openable in the workspace, configurable,
 * previewable, validatable and renderable through the product's own screens.
 * This service creates one.
 *
 * **What it does and does not claim.** It writes the immutable records the
 * existing pipeline would have produced — source document, parser artifact,
 * parsed document, sections and blocks, approved snapshot, configuration,
 * objectives, outline, narration, storyboard, scenes, scene audio and
 * captions — into the same tables, under the same contracts, with the same
 * content hashes. It does **not** drive ingestion, AI generation or
 * text-to-speech, and it does not pretend to: the fixtures' narration is a
 * pre-recorded measured take from ST-095, the facts are authored rather than
 * extracted, and running a paid provider to reproduce content we already have
 * would be exactly the unmetered spend the repository rules forbid. Each
 * `model_calls` row it writes records `provider: "none"` and a zero cost,
 * because that is what actually happened.
 *
 * Everything downstream of the seed is the real product: validation is the
 * deterministic engine, the render is the production worker, and the
 * comparison is the pilot API. Nothing here shortcuts those.
 *
 * **Timing identity is preserved, not recreated.** The seeded scenes keep
 * ST-095's stable scene IDs, and each scene's audio is the exact WAV that
 * story measured, stored under its own checksum. That is what lets
 * `pilot-bindings` rebuild the proven plan against the project's own audio and
 * get the same plan back.
 */

import { createHash } from "node:crypto";
import { Buffer } from "node:buffer";
import {
  createId,
  PublicError,
  serializeUtcTimestamp,
  type Identifier,
} from "@avlp/config";
import {
  captionCues,
  captionTracks,
  contentBlocks,
  ingestionQualityReports,
  learningObjectiveSets,
  learningObjectives,
  lessonConfigurations,
  lessonOutlineItems,
  lessonOutlineSets,
  lessonSpecs,
  modelCalls,
  narrationBlocks,
  narrationSets,
  outlineObjectiveLinks,
  parsedDocuments,
  parsedSections,
  projects,
  sceneAudio,
  scenes,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  sourceSnapshots,
  type DatabaseClient,
  type DatabaseExecutor,
} from "@avlp/database";
import { PostgresAuditWriter } from "@avlp/observability";
import {
  normalizedDocumentSchema,
  normalizedDocumentVersion,
  sourceSnapshotSchema,
  sourceSnapshotVersion,
  lessonStoryboardSchema,
  lessonSpecVersion,
  type SceneSpec,
} from "@avlp/schemas";
import {
  demonstrationPilotBindings,
  type DemonstrationPilotBinding,
} from "@avlp/scene-library/demonstration-proof";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, eq } from "drizzle-orm";

type Scope = { ownerUserId: Identifier };

export interface DemonstrationTestLessonService {
  catalogue(): readonly { subject: string; label: string; title: string }[];
  create(
    input: Scope & { subject: string; correlationId: Identifier },
  ): Promise<{ projectId: Identifier; subject: string; title: string }>;
}

function sha256(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The curated source document, as a real one-page PDF.
 *
 * The fact inventory *is* the source for these lessons: every statement either
 * clip makes is on this sheet, which is what makes the two approaches
 * comparable on content. It is written as an actual PDF rather than as text
 * labelled `application/pdf`, because the ingestion-review screens and the
 * export path will open it, and a source document whose bytes do not match its
 * recorded media type is a provenance trail that lies at the first place anyone
 * looks.
 *
 * The generator is deliberately minimal - one page, one font, no compression -
 * because its job is to be a readable, verifiable artefact, not to demonstrate
 * PDF authoring.
 */
function escapePdfText(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/\(/gu, "\\(")
    .replace(/\)/gu, "\\)")
    // The base-14 WinAnsi font cannot show the naira sign or a typographic
    // dash; transliterating is honest about the limitation, where a missing
    // glyph would silently drop part of a stated fact.
    .replace(/\u20a6/gu, "NGN ")
    .replace(/[\u2013\u2014]/gu, "-")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201c\u201d]/gu, '"')
    .replace(/[^\x20-\x7e]/gu, "?");
}

function wrapPdfLine(value: string, maximum: number): string[] {
  const words = value.split(/\s+/u).filter((word) => word.length > 0);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current.length === 0 ? word : `${current} ${word}`;
    if (candidate.length > maximum && current.length > 0) {
      lines.push(current);
      current = word;
    } else current = candidate;
  }
  if (current.length > 0) lines.push(current);
  return lines;
}

function sourcePdf(binding: DemonstrationPilotBinding): Buffer {
  const lines: string[] = [
    binding.lessonTitle,
    "",
    `Curated pilot source for the ST-096 demonstration experiment (${binding.bindingId}).`,
    "Every statement below is carried by both the standard and the demonstration video.",
    "",
  ];
  for (const fact of binding.facts)
    for (const [index, wrapped] of wrapPdfLine(fact, 88).entries())
      lines.push(index === 0 ? `- ${wrapped}` : `  ${wrapped}`);

  const content = [
    "BT",
    "/F1 11 Tf",
    "14 TL",
    "48 780 Td",
    ...lines.map((line) => `(${escapePdfText(line)}) Tj T*`),
    "ET",
  ].join("\n");
  const stream = Buffer.from(content, "latin1");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${stream.byteLength} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets)
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

type SeedIds = Readonly<{
  blockIds: readonly Identifier[];
  sectionId: Identifier;
  parsedDocumentId: Identifier;
  sourceDocumentId: Identifier;
}>;

export class PostgresDemonstrationTestLessonService
  implements DemonstrationTestLessonService
{
  public constructor(
    private readonly database: DatabaseClient,
    private readonly storage: ObjectStorage,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public catalogue(): readonly {
    subject: string;
    label: string;
    title: string;
  }[] {
    return demonstrationPilotBindings.map((binding) => ({
      label: binding.label,
      subject: binding.subject,
      title: binding.lessonTitle,
    }));
  }

  public async create(
    input: Scope & { subject: string; correlationId: Identifier },
  ): Promise<{ projectId: Identifier; subject: string; title: string }> {
    const binding = demonstrationPilotBindings.find(
      (entry) => entry.subject === input.subject,
    );
    if (binding === undefined)
      throw new PublicError(
        "not_found",
        "The requested resource was not found.",
        404,
      );

    const now = this.now();
    const projectId = createId(now);
    const scope = { ownerUserId: input.ownerUserId, projectId };
    // One fresh stable scene ID per scene, minted here and used by the scene
    // row, the lesson spec, the audio row and the storage key alike.
    const lessonSceneIds = binding.scenes.map(() => createId(now));

    // Media is written to storage before any row references it, so a failure
    // part-way through never leaves a row pointing at bytes that do not exist.
    const media = await this.writeMedia(scope, binding, lessonSceneIds, now);

    await this.database.transaction(async (tx) => {
      await tx.insert(projects).values({
        id: projectId,
        ownerUserId: input.ownerUserId,
        title: binding.lessonTitle,
        stage: "narration_storyboard_review",
        createdAt: now,
        updatedAt: now,
      });

      const ids = await this.seedSource(tx, scope, binding, media, now);
      const snapshotId = await this.seedSnapshot(tx, scope, binding, ids, now);
      await this.seedConfiguration(tx, scope, binding, ids, now);
      const lessonSpecId = await this.seedLesson(
        tx,
        scope,
        binding,
        ids,
        snapshotId,
        lessonSceneIds,
        now,
      );
      await this.seedMediaRows(tx, scope, binding, media, lessonSpecId, now);

      await new PostgresAuditWriter(tx).write({
        ownerUserId: input.ownerUserId,
        projectId,
        actor: { type: "user", userId: input.ownerUserId },
        eventType: "demonstration.test_lesson_created",
        target: { type: "project", id: projectId },
        correlationId: input.correlationId,
        metadata: {
          bindingId: binding.bindingId,
          bindingVersion: binding.bindingVersion,
          subject: binding.subject,
        },
        occurredAt: now,
      });
    });

    return { projectId, subject: binding.subject, title: binding.lessonTitle };
  }

  // -------------------------------------------------------------------------
  // Storage
  // -------------------------------------------------------------------------

  private async writeMedia(
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    /** Minted per project: `scenes.stable_scene_id` is globally unique, so a
     * second project of the same curated subject cannot reuse the first's. */
    lessonSceneIds: readonly Identifier[],
    now: Date,
  ): Promise<{
    sourceDocumentId: Identifier;
    sourceKey: string;
    sourceSha256: string;
    sourceBytes: number;
    parsedDocumentId: Identifier;
    normalizedKey: string;
    assets: readonly {
      assetId: string;
      storageKey: string;
      sha256: string;
      bytes: number;
      contentType: string;
    }[];
    audio: readonly {
      sceneId: string;
      lessonSceneId: Identifier;
      storageKey: string;
      checksumSha256: string;
      durationMs: number;
      bytes: number;
    }[];
  }> {
    const sourceDocumentId = createId(now);
    const parsedDocumentId = createId(now);
    const original = sourcePdf(binding);
    const sourceKey = storageKeys.sourceOriginal({
      documentId: sourceDocumentId,
      extension: "pdf",
      projectId: scope.projectId,
      userId: scope.ownerUserId,
    });
    await this.storage.putBytes({
      body: new Uint8Array(original),
      contentType: "application/pdf",
      key: sourceKey,
    });

    const assets = await Promise.all(
      binding.assets.map(async (asset) => {
        const bytes = Buffer.from(
          asset.src.slice(asset.src.indexOf(",") + 1),
          "base64",
        );
        const key = storageKeys.demonstrationAsset({
          assetId: asset.assetId,
          extension: asset.contentType === "image/png" ? "png" : "svg",
          projectId: scope.projectId,
          userId: scope.ownerUserId,
        });
        const written = sha256(bytes);
        await this.storage.putBytes({
          body: new Uint8Array(bytes),
          contentType: asset.contentType,
          key,
          // The object carries its own checksum, exactly as the verified-upload
          // path records one. Without it `getMetadata` reports no checksum at
          // all, and every later integrity check would have nothing to compare
          // against - which reads as "verified" only if nobody looks.
          metadata: { sha256: written },
        });
        // The registered checksum is the one the runtime and the render
        // manifest both verify against, so a mismatch here means the bundled
        // artwork and its recorded identity have drifted apart — which must
        // stop the seed, not travel into a project.
        if (written !== asset.checksumSha256)
          throw new Error(
            `Demonstration asset ${asset.assetId} does not match its registered checksum.`,
          );
        return {
          assetId: asset.assetId,
          bytes: bytes.byteLength,
          contentType: asset.contentType,
          sha256: written,
          storageKey: key,
        };
      }),
    );

    const audio = await Promise.all(
      binding.scenes.map(async (scene, index) => {
        const lessonSceneId = lessonSceneIds[index]!;
        const record = narrationRecord(scene.narrationTrackId);
        const bytes = Buffer.from(
          record.src.slice(record.src.indexOf(",") + 1),
          "base64",
        );
        const written = sha256(bytes);
        if (written !== scene.narrationChecksumSha256)
          throw new Error(
            `Narration for scene ${scene.sceneId} does not match its registered checksum.`,
          );
        const key = storageKeys.sceneAudio({
          contentHash: written,
          extension: "wav",
          projectId: scope.projectId,
          sceneId: lessonSceneId,
          userId: scope.ownerUserId,
        });
        await this.storage.putBytes({
          body: new Uint8Array(bytes),
          contentType: "audio/wav",
          key,
          metadata: { sha256: written },
        });
        return {
          bytes: bytes.byteLength,
          checksumSha256: written,
          durationMs: scene.narrationDurationMs,
          lessonSceneId,
          sceneId: scene.sceneId,
          storageKey: key,
        };
      }),
    );

    const normalized = this.normalizedDocument(
      binding,
      sourceDocumentId,
      parsedDocumentId,
    );
    const normalizedKey = storageKeys.parsedNormalized({
      projectId: scope.projectId,
      userId: scope.ownerUserId,
      versionId: parsedDocumentId,
    });
    await this.storage.putBytes({
      body: new Uint8Array(Buffer.from(JSON.stringify(normalized), "utf8")),
      contentType: "application/json",
      key: normalizedKey,
    });

    return {
      assets,
      audio,
      normalizedKey,
      parsedDocumentId,
      sourceBytes: original.byteLength,
      sourceDocumentId,
      sourceKey,
      sourceSha256: sha256(original),
    };
  }

  private normalizedDocument(
    binding: DemonstrationPilotBinding,
    sourceDocumentId: Identifier,
    parsedDocumentId: Identifier,
  ): unknown {
    const now = this.now();
    const sectionId = seedIdentifier(`${binding.bindingId}:section`, now);
    const blocks = binding.facts.map((fact, index) => ({
      id: seedIdentifier(`${binding.bindingId}:block:${index}`, now),
      kind: "paragraph" as const,
      order: index + 1,
      pageStart: 1,
      sectionId,
      text: fact,
    }));
    return normalizedDocumentSchema.parse({
      blocks,
      figures: [],
      id: parsedDocumentId,
      language: "en",
      pageCount: 1,
      parsedDocumentVersion: 1,
      schemaVersion: normalizedDocumentVersion,
      sections: [
        {
          blockIds: blocks.map((block) => block.id),
          figureIds: [],
          heading: binding.lessonTitle,
          id: sectionId,
          level: 1,
          order: 1,
          pageStart: 1,
          tableIds: [],
        },
      ],
      sourceDocumentId,
      tables: [],
      title: binding.lessonTitle,
      warnings: [],
    });
  }

  // -------------------------------------------------------------------------
  // Rows
  // -------------------------------------------------------------------------

  private async seedSource(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    media: Awaited<ReturnType<typeof this.writeMedia>>,
    now: Date,
  ): Promise<SeedIds> {
    await tx.insert(sourceDocuments).values({
      id: media.sourceDocumentId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      originalName: `${binding.bindingId}-source.pdf`,
      mediaType: "application/pdf",
      sizeBytes: media.sourceBytes,
      sha256: media.sourceSha256,
      storageKey: media.sourceKey,
      pageCount: 1,
      scanStatus: "clean",
      validatedAt: now,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    const artifactId = createId(now);
    await tx.insert(sourceDocumentIngestionArtifacts).values({
      id: artifactId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      sourceDocumentId: media.sourceDocumentId,
      parserVersion: "st-096-curated-fixture",
      normalizedSchemaVersion: normalizedDocumentVersion,
      canonicalStorageKey: media.sourceKey,
      normalizedStorageKey: media.normalizedKey,
      state: "ready",
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(parsedDocuments).values({
      id: media.parsedDocumentId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      ingestionArtifactId: artifactId,
      sourceDocumentId: media.sourceDocumentId,
      version: 1,
      schemaVersion: normalizedDocumentVersion,
      parserVersion: "st-096-curated-fixture",
      adapterVersion: "st-096-curated-fixture",
      normalizedStorageKey: media.normalizedKey,
      title: binding.lessonTitle,
      language: "en",
      pageCount: 1,
      createdAt: now,
      updatedAt: now,
    });

    const normalized = normalizedDocumentSchema.parse(
      this.normalizedDocument(
        binding,
        media.sourceDocumentId,
        media.parsedDocumentId,
      ),
    );
    const section = normalized.sections[0]!;
    await tx.insert(parsedSections).values({
      id: section.id,
      parsedDocumentId: media.parsedDocumentId,
      order: 1,
      level: 1,
      heading: section.heading,
      pageStart: 1,
      pageEnd: 1,
      createdAt: now,
      updatedAt: now,
    });
    for (const block of normalized.blocks)
      await tx.insert(contentBlocks).values({
        id: block.id,
        parsedDocumentId: media.parsedDocumentId,
        sectionId: section.id,
        kind: block.kind,
        order: block.order,
        pageStart: block.pageStart,
        pageEnd: block.pageStart,
        content: block,
        createdAt: now,
        updatedAt: now,
      });

    await tx.insert(ingestionQualityReports).values({
      id: createId(now),
      parsedDocumentId: media.parsedDocumentId,
      score: 100,
      status: "ready",
      findings: {
        note: "Curated pilot source. The facts are authored for the ST-096 experiment, not extracted from an uploaded document.",
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      blockIds: normalized.blocks.map((block) => block.id as Identifier),
      parsedDocumentId: media.parsedDocumentId,
      sectionId: section.id as Identifier,
      sourceDocumentId: media.sourceDocumentId,
    };
  }

  private async seedSnapshot(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    ids: SeedIds,
    now: Date,
  ): Promise<Identifier> {
    const snapshotId = createId(now);
    const payloadWithoutHash = {
      approvedAt: serializeUtcTimestamp(now),
      approvedBy: scope.ownerUserId,
      blocks: binding.facts.map((fact, index) => ({
        blockId: ids.blockIds[index]!,
        corrected: false,
        kind: "paragraph" as const,
        order: index + 1,
        pageStart: 1,
        revision: 0,
        sectionId: ids.sectionId,
        text: fact,
      })),
      contentHash: "0".repeat(64),
      figures: [],
      id: snapshotId,
      parsedDocumentId: ids.parsedDocumentId,
      parsedDocumentVersion: 1,
      projectId: scope.projectId,
      schemaVersion: sourceSnapshotVersion,
      sections: [
        {
          blockIds: [...ids.blockIds],
          figureIds: [],
          heading: binding.lessonTitle,
          level: 1,
          order: 1,
          pageStart: 1,
          reviewOrder: null,
          sectionId: ids.sectionId,
          tableIds: [],
        },
      ],
      sourceDocumentId: ids.sourceDocumentId,
      tables: [],
    };
    const contentHash = sha256(
      JSON.stringify({
        blocks: payloadWithoutHash.blocks,
        figures: payloadWithoutHash.figures,
        sections: payloadWithoutHash.sections,
        tables: payloadWithoutHash.tables,
      }),
    );
    const payload = sourceSnapshotSchema.parse({
      ...payloadWithoutHash,
      contentHash,
    });
    await tx.insert(sourceSnapshots).values({
      id: snapshotId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      parsedDocumentId: ids.parsedDocumentId,
      parsedDocumentVersion: 1,
      snapshotVersion: 1,
      schemaVersion: sourceSnapshotVersion,
      contentHash,
      approvedBy: scope.ownerUserId,
      approvedAt: now,
      payload,
      createdAt: now,
      updatedAt: now,
    });
    return snapshotId;
  }

  private async seedConfiguration(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    _ids: SeedIds,
    now: Date,
  ): Promise<void> {
    await tx.insert(lessonConfigurations).values({
      id: createId(now),
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      version: 1,
      ageBand: "11-13",
      difficulty: "introductory",
      subject: binding.label,
      lessonTitle: binding.lessonTitle,
      targetDurationSeconds: 180,
      tone: "friendly",
      visualTheme: "mvp-default",
      // Seeded as demonstration because that is what a tester opens this
      // project to try. The selector still shows both options and the server
      // still re-checks eligibility before anything is generated.
      videoApproach: "demonstration",
      includeRecallQuestions: false,
      sourceParsedDocumentVersion: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  /**
   * A model-call record for content no model produced.
   *
   * The objective, outline, narration and storyboard tables all require one,
   * because in the ordinary pipeline each of those artefacts is a model
   * output and the record is how its cost and prompt version stay traceable.
   * Writing `provider: "none"` with zero units and zero cost keeps that trail
   * honest for curated content: it says plainly that nothing was generated and
   * nothing was billed, rather than inventing a provider that was never called.
   */
  private async seedModelCall(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    operationType: string,
    correlationId: Identifier,
    now: Date,
  ): Promise<Identifier> {
    const id = createId(now);
    await tx.insert(modelCalls).values({
      id,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      operationType,
      idempotencyKey: `st-096-curated:${operationType}:${scope.projectId}`,
      promptId: "st-096-curated-fixture",
      promptVersion: binding_version,
      provider: "none",
      model: "st-096-curated-fixture",
      inputVersion: "1",
      inputHash: sha256(`${scope.projectId}:${operationType}`),
      inputUnits: 0,
      outputUnits: 0,
      estimatedCostUsd: "0",
      latencyMs: 0,
      validationStatus: "passed",
      status: "succeeded",
      correlationId,
      createdAt: now,
      updatedAt: now,
    });
    return id;
  }

  private async seedLesson(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    ids: SeedIds,
    snapshotId: Identifier,
    lessonSceneIds: readonly Identifier[],
    now: Date,
  ): Promise<Identifier> {
    const correlationId = createId(now);
    const snapshotHash = sha256(`${snapshotId}`);
    const sourceRefs = [
      {
        blockIds: [...ids.blockIds],
        documentId: ids.parsedDocumentId,
        pageStart: 1,
        parsedDocumentVersion: 1,
        sectionId: ids.sectionId,
      },
    ];

    const objectiveCallId = await this.seedModelCall(
      tx,
      scope,
      "objectives",
      correlationId,
      now,
    );
    const objectiveSetId = createId(now);
    await tx.insert(learningObjectiveSets).values({
      id: objectiveSetId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: snapshotHash,
      configurationVersion: 1,
      promptId: "st-096-curated-fixture",
      promptVersion: binding.bindingVersion,
      model: "st-096-curated-fixture",
      modelCallId: objectiveCallId,
      status: "approved",
      revision: 1,
      idempotencyKey: `st-096-curated:objectives:${scope.projectId}`,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const objectiveIds = binding.scenes.map(() => createId(now));
    for (const [index, scene] of binding.scenes.entries())
      await tx.insert(learningObjectives).values({
        id: objectiveIds[index]!,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        setId: objectiveSetId,
        order: index + 1,
        statement: `Explain: ${scene.title}`,
        verb: "explain",
        confidence: 1,
        sourceRefs,
        generated: false,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });

    const outlineCallId = await this.seedModelCall(
      tx,
      scope,
      "outline",
      correlationId,
      now,
    );
    const outlineSetId = createId(now);
    const outlineHash = sha256(`${outlineSetId}`);
    await tx.insert(lessonOutlineSets).values({
      id: outlineSetId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: snapshotHash,
      objectiveSetId,
      objectiveSetContentHash: sha256(`${objectiveSetId}`),
      configurationVersion: 1,
      promptId: "st-096-curated-fixture",
      promptVersion: binding.bindingVersion,
      model: "st-096-curated-fixture",
      modelCallId: outlineCallId,
      status: "approved",
      revision: 1,
      idempotencyKey: `st-096-curated:outline:${scope.projectId}`,
      totalEstimatedSeconds: binding.scenes.reduce(
        (total, scene) => total + scene.durationSeconds,
        0,
      ),
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const outlineItemIds = binding.scenes.map(() => createId(now));
    for (const [index, scene] of binding.scenes.entries()) {
      await tx.insert(lessonOutlineItems).values({
        id: outlineItemIds[index]!,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        setId: outlineSetId,
        order: index + 1,
        kind: index === 0 ? "hook" : "explanation",
        title: scene.title,
        description: scene.narration.slice(0, 500),
        estimatedSeconds: scene.durationSeconds,
        sourceRefs,
        generated: false,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });
      await tx.insert(outlineObjectiveLinks).values({
        id: createId(now),
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        outlineItemId: outlineItemIds[index]!,
        objectiveId: objectiveIds[index]!,
        createdAt: now,
        updatedAt: now,
      });
    }

    const narrationCallId = await this.seedModelCall(
      tx,
      scope,
      "narration",
      correlationId,
      now,
    );
    const narrationSetId = createId(now);
    const narrationHash = sha256(`${narrationSetId}`);
    await tx.insert(narrationSets).values({
      id: narrationSetId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      sourceSnapshotId: snapshotId,
      sourceSnapshotContentHash: snapshotHash,
      outlineSetId,
      outlineSetContentHash: outlineHash,
      configurationVersion: 1,
      promptId: "st-096-curated-fixture",
      promptVersion: binding.bindingVersion,
      model: "st-096-curated-fixture",
      modelCallId: narrationCallId,
      status: "approved",
      revision: 1,
      idempotencyKey: `st-096-curated:narration:${scope.projectId}`,
      totalEstimatedSeconds: binding.scenes.reduce(
        (total, scene) => total + scene.durationSeconds,
        0,
      ),
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    const narrationBlockIds = binding.scenes.map(() => createId(now));
    for (const [index, scene] of binding.scenes.entries())
      await tx.insert(narrationBlocks).values({
        id: narrationBlockIds[index]!,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        setId: narrationSetId,
        outlineItemId: outlineItemIds[index]!,
        order: index + 1,
        text: scene.narration,
        estimatedWords: scene.narration.split(/\s+/u).length,
        targetSeconds: scene.durationSeconds,
        sourceRefs,
        generatedAdditions: [],
        generated: false,
        revision: 0,
        origin: "curated",
        createdAt: now,
        updatedAt: now,
      });

    const storyboardCallId = await this.seedModelCall(
      tx,
      scope,
      "storyboard",
      correlationId,
      now,
    );
    const lessonSpecId = createId(now);
    const sceneRowIds = binding.scenes.map(() => createId(now));
    const storyboardScenes = binding.standardScenes.map((scene, index) => ({
      assetRequirements: [],
      durationSeconds: scene.durationSeconds,
      id: sceneRowIds[index]!,
      narrationBlockIds: [narrationBlockIds[index]!],
      order: index + 1,
      // Every lesson scene must cite a source block, and for these lessons the
      // citation is true rather than decorative: the fact sheet in the seeded
      // PDF *is* where each scene's statements come from. ST-095's fixtures
      // carried no refs because they never passed through the production
      // grounding contract; a seeded lesson does, so the refs are attached
      // here rather than the contract being relaxed.
      scene: {
        ...scene,
        id: lessonSceneIds[index]!,
        sourceRefs,
      } as SceneSpec,
      stableSceneId: lessonSceneIds[index]!,
      template: scene.template,
    }));
    const totalDurationSeconds = storyboardScenes.reduce(
      (total, scene) => total + scene.durationSeconds,
      0,
    );
    const payloadWithoutHash = {
      basedOnNarrationSetId: narrationSetId,
      configurationVersion: 1,
      contentHash: "0".repeat(64),
      createdAt: serializeUtcTimestamp(now),
      generatedAt: serializeUtcTimestamp(now),
      id: lessonSpecId,
      model: "st-096-curated-fixture",
      modelCallId: storyboardCallId,
      narrationSetContentHash: narrationHash,
      objectiveIds,
      outlineSetContentHash: outlineHash,
      outlineSetId,
      projectId: scope.projectId,
      promptId: "st-096-curated-fixture",
      promptVersion: binding.bindingVersion,
      revision: 0,
      scenes: storyboardScenes,
      schemaVersion: 1 as const,
      status: "approved" as const,
      subject: binding.label,
      targetDurationSeconds: 180 as const,
      title: binding.lessonTitle,
      totalDurationSeconds,
    };
    const contentHash = sha256(JSON.stringify(payloadWithoutHash.scenes));
    const payload = lessonStoryboardSchema.parse({
      ...payloadWithoutHash,
      contentHash,
    });

    await tx.insert(lessonSpecs).values({
      id: lessonSpecId,
      ownerUserId: scope.ownerUserId,
      projectId: scope.projectId,
      schemaVersion: lessonSpecVersion,
      basedOnNarrationSetId: narrationSetId,
      narrationSetContentHash: narrationHash,
      outlineSetId,
      outlineSetContentHash: outlineHash,
      configurationVersion: 1,
      promptId: "st-096-curated-fixture",
      promptVersion: binding.bindingVersion,
      model: "st-096-curated-fixture",
      modelCallId: storyboardCallId,
      status: "approved",
      revision: 0,
      idempotencyKey: `st-096-curated:storyboard:${scope.projectId}`,
      title: binding.lessonTitle,
      subject: binding.label,
      targetDurationSeconds: 180,
      totalDurationSeconds,
      objectiveIds,
      contentHash,
      payload,
      generatedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    for (const [index, scene] of storyboardScenes.entries())
      await tx.insert(scenes).values({
        id: scene.id,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        lessonSpecId,
        stableSceneId: scene.stableSceneId,
        order: index + 1,
        template: scene.template,
        durationSeconds: scene.durationSeconds,
        narrationBlockIds: scene.narrationBlockIds,
        assetRequirements: [],
        sceneJson: scene.scene,
        revision: 0,
        createdAt: now,
        updatedAt: now,
      });

    return lessonSpecId;
  }

  private async seedMediaRows(
    tx: DatabaseExecutor,
    scope: Scope & { projectId: Identifier },
    binding: DemonstrationPilotBinding,
    media: Awaited<ReturnType<typeof this.writeMedia>>,
    lessonSpecId: Identifier,
    now: Date,
  ): Promise<void> {
    // The demonstration artwork needs no row: its key is derived from the
    // project and the registered asset ID, and the variant builder verifies the
    // stored bytes against the registered checksum before referencing them.
    // A row would be a second, drift-prone statement of the same fact.

    const sceneRows = await tx
      .select({ id: scenes.id, stableSceneId: scenes.stableSceneId })
      .from(scenes)
      .where(
        and(
          eq(scenes.lessonSpecId, lessonSpecId),
          eq(scenes.ownerUserId, scope.ownerUserId),
          eq(scenes.projectId, scope.projectId),
        ),
      );

    for (const [index, scene] of binding.scenes.entries()) {
      const audio = media.audio[index]!;
      const row = sceneRows.find(
        (entry) => entry.stableSceneId === audio.lessonSceneId,
      )!;
      const record = narrationRecord(scene.narrationTrackId);
      const audioId = createId(now);
      await tx.insert(sceneAudio).values({
        id: audioId,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        sceneId: row.id,
        status: "ready",
        voiceConfigurationVersion: 1,
        narrationHash: sha256(scene.narration),
        voiceConfigurationHash: sha256("st-096-curated-fixture"),
        contentHash: audio.checksumSha256,
        storageKey: audio.storageKey,
        checksumSha256: audio.checksumSha256,
        contentType: "audio/wav",
        durationMs: audio.durationMs,
        timing: { beats: record.beats },
        // Measured, not estimated: these boundaries are the cumulative sample
        // offsets ST-095 recorded when it synthesized each phrase separately.
        captionTimingSource: "measured-phrase-boundaries",
        plannedDurationMs: scene.durationSeconds * 1_000,
        createdAt: now,
        updatedAt: now,
      });

      const trackId = createId(now);
      await tx.insert(captionTracks).values({
        id: trackId,
        ownerUserId: scope.ownerUserId,
        projectId: scope.projectId,
        sceneAudioId: audioId,
        status: "ready",
        contentHash: sha256(`${audio.checksumSha256}:captions`),
        language: "en",
        createdAt: now,
        updatedAt: now,
      });
      for (const [index, beat] of record.beats.entries())
        await tx.insert(captionCues).values({
          id: createId(now),
          ownerUserId: scope.ownerUserId,
          projectId: scope.projectId,
          trackId,
          position: index + 1,
          startMs: beat.startMs,
          endMs: beat.endMs,
          text: beat.text,
          createdAt: now,
        });
    }
  }
}

/**
 * A deterministic UUIDv7-shaped identifier for seeded content.
 *
 * Section and block IDs appear inside the normalized document *and* inside the
 * approved snapshot's source references, and the two are written in separate
 * passes. Deriving them from the binding rather than minting them twice is what
 * keeps those references pointing at the same rows.
 */
function seedIdentifier(seed: string, now: Date): Identifier {
  const digest = createHash("sha256").update(seed).digest("hex");
  const timestamp = now.getTime().toString(16).padStart(12, "0").slice(-12);
  const variant = ((parseInt(digest.slice(16, 17), 16) & 0x3) | 0x8).toString(
    16,
  );
  return [
    timestamp.slice(0, 8),
    timestamp.slice(8, 12),
    `7${digest.slice(1, 4)}`,
    `${variant}${digest.slice(5, 8)}`,
    digest.slice(8, 20),
  ].join("-") as Identifier;
}

const binding_version = "st-096-binding-1";

let narrationLoader:
  | ((trackId: string) => {
      beats: readonly {
        beatId: string;
        startMs: number;
        endMs: number;
        text: string;
      }[];
      checksumSha256: string;
      durationMs: number;
      src: string;
    })
  | undefined;

function narrationRecord(trackId: string): {
  beats: readonly {
    beatId: string;
    startMs: number;
    endMs: number;
    text: string;
  }[];
  checksumSha256: string;
  durationMs: number;
  src: string;
} {
  if (narrationLoader === undefined)
    throw new Error(
      "The demonstration narration registry was not installed. Call installDemonstrationSeedNarration during API startup.",
    );
  return narrationLoader(trackId);
}

/** Injected for the same reason the pilot service injects its registry: the
 * generated narration module is fifteen megabytes, and an API process that
 * never seeds a test lesson should never load it. */
export function installDemonstrationSeedNarration(
  loader: (trackId: string) => {
    beats: readonly {
      beatId: string;
      startMs: number;
      endMs: number;
      text: string;
    }[];
    checksumSha256: string;
    durationMs: number;
    src: string;
  },
): void {
  narrationLoader = loader;
}
