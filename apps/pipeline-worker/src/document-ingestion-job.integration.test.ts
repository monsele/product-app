import { createId } from "@avlp/config";
import {
  auditEvents,
  contentBlocks,
  extractedFigures,
  ingestionQualityReports,
  ingestionWarnings,
  migrateDatabase,
  parsedDocuments,
  parsedSections,
  parsedTableCells,
  parsedTables,
  projects,
  sourceDocumentIngestionArtifacts,
  sourceDocuments,
  usageRecords,
  users,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import { documentIngestionJobPayloadSchema } from "@avlp/schemas";
import { currentIngestionCompatibility } from "@avlp/schemas";
import { storageKeys } from "@avlp/storage";
import { eq } from "drizzle-orm";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { DoclingIngestionError } from "./docling-ingestion-client.js";
import { createDocumentIngestionJobHandler } from "./document-ingestion-job.js";
import { normalizeDoclingOutput } from "./docling-normalizer.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;
const ownerUserId = createId(new Date("2026-08-14T10:00:00.000Z"));
const projectId = createId(new Date("2026-08-14T10:00:01.000Z"));
const documentId = createId(new Date("2026-08-14T10:00:02.000Z"));
const correlationId = createId(new Date("2026-08-14T10:00:03.000Z"));

describeWithPostgres("document ingestion job", () => {
  let database: TestDatabase | undefined;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await database!.client.delete(parsedTableCells);
    await database!.client.delete(parsedTables);
    await database!.client.delete(extractedFigures);
    await database!.client.delete(ingestionQualityReports);
    await database!.client.delete(ingestionWarnings);
    await database!.client.delete(contentBlocks);
    await database!.client.delete(parsedSections);
    await database!.client.delete(parsedDocuments);
    await database!.client.delete(usageRecords);
    await database!.client.delete(auditEvents);
    await database!.client.delete(sourceDocumentIngestionArtifacts);
    await database!.client.delete(sourceDocuments);
    await database!.client.delete(projects);
    await database!.client.delete(users);
    await database!.client.insert(users).values({
      id: ownerUserId,
      emailNormalized: "ingestion@example.test",
      displayName: "Ingestion owner",
    });
    await database!.client.insert(projects).values({
      id: projectId,
      ownerUserId,
      title: "Water cycle",
      stage: "ingesting",
    });
    await database!.client.insert(sourceDocuments).values({
      id: documentId,
      projectId,
      ownerUserId,
      originalName: "water-cycle.pdf",
      mediaType: "application/pdf",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      storageKey: `users/${ownerUserId}/projects/${projectId}/source/${documentId}/original.pdf`,
      status: "active",
      scanStatus: "safe",
    });
  });

  afterAll(async () => database?.destroy());

  const context = {
    attempt: 1,
    correlationId,
    heartbeat: vi.fn(async () => undefined),
    idempotencyKey: "document-ingestion",
    jobId: createId(new Date("2026-08-14T10:00:04.000Z")),
    ownerUserId,
    projectId,
    reportProgress: vi.fn(async () => undefined),
  };

  it("stores immutable canonical outputs and is safe for duplicate delivery", async () => {
    const stored = new Map<string, Uint8Array>();
    const ingest = vi.fn(async () => ({
      schemaVersion: 1 as const,
      parserVersion: "docling-v1",
      configurationHash: "b".repeat(64),
      processingTimeMs: 42,
      canonicalJson: {
        texts: [
          { label: "heading", text: "Water cycle", page: 1 },
          {
            label: "picture",
            caption: { text: "Figure 1: Evaporation" },
            image:
              "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL1nAAAAABJRU5ErkJggg==",
            page: 1,
          },
          {
            label: "table",
            text: "Table 1: Water states",
            data: {
              table_cells: [
                ["State", "Energy"],
                ["Ice", "Low"],
              ],
            },
            page: 1,
          },
        ],
      },
      markdown: "# Water cycle\n",
      warnings: [],
    }));
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: { ingest },
      now: () => new Date("2026-08-14T10:00:05.000Z"),
      storage: {
        createSignedDownload: async () =>
          ({ url: "https://storage.example.test/source" }) as never,
        getBytes: async (key) => ({ body: stored.get(key)! }) as never,
        putBytes: async (input) => {
          stored.set(input.key, input.body);
          return {} as never;
        },
        copy: async ({ sourceKey, destinationKey }) => {
          const source = stored.get(sourceKey);
          if (source === undefined) throw new Error("staged object is missing");
          stored.set(destinationKey, source);
          return {} as never;
        },
        delete: async (key) => {
          stored.delete(key);
        },
      },
    });
    const payload = documentIngestionJobPayloadSchema.parse({
      schemaVersion: 1,
      sourceDocumentId: documentId,
    });

    await expect(handler.handler(payload, context)).resolves.toMatchObject({
      ingestion: "completed",
    });
    await expect(handler.handler(payload, context)).resolves.toEqual({
      ingestion: "already_completed",
    });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(stored.size).toBe(4);
    expect(
      await database!.client.select().from(sourceDocumentIngestionArtifacts),
    ).toMatchObject([
      {
        sourceDocumentId: documentId,
        parserVersion: "docling-v1",
        state: "ready",
        normalizedStorageKey: expect.stringContaining("/normalized.json"),
      },
    ]);
    const [project] = await database!.client
      .select()
      .from(projects)
      .where(eq(projects.id, projectId));
    expect(project?.stage).toBe("ingestion_review");
    expect(
      await database!.client.select().from(extractedFigures),
    ).toMatchObject([
      {
        storageKey: expect.stringContaining("/figures/"),
        checksumSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
        width: 1,
        height: 1,
      },
    ]);
    expect(await database!.client.select().from(parsedTables)).toMatchObject([
      {
        columns: ["Column 1", "Column 2"],
        rows: [
          ["State", "Energy"],
          ["Ice", "Low"],
        ],
      },
    ]);
    expect(await database!.client.select().from(parsedTableCells)).toHaveLength(
      4,
    );
    expect(await database!.client.select().from(ingestionWarnings)).toEqual([]);
    expect(
      await database!.client.select().from(ingestionQualityReports),
    ).toMatchObject([{ score: 100, status: "ready", findings: [] }]);
    expect(
      (await database!.client.select().from(auditEvents)).some(
        (event) => event.eventType === "document.ingestion_completed",
      ),
    ).toBe(true);
    expect(await database!.client.select().from(usageRecords)).toMatchObject([
      {
        operationType: "document.ingestion",
        status: "succeeded",
        latencyMs: 42,
      },
    ]);
    await expect(
      handler.handler(
        documentIngestionJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
          configurationVersion: "retry-v1",
        }),
        context,
      ),
    ).resolves.toMatchObject({ ingestion: "completed" });
    expect(ingest).toHaveBeenCalledTimes(2);
    expect(
      await database!.client.select().from(sourceDocumentIngestionArtifacts),
    ).toHaveLength(2);
    const versions = await database!.client.select().from(parsedDocuments);
    expect(versions).toHaveLength(2);
    expect(new Set(versions.map((version) => version.version)).size).toBe(2);
  });

  it("preserves the classified parser failure for the job platform", async () => {
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: {
        ingest: async () => {
          throw new DoclingIngestionError("terminal", "PARSER_UNSUPPORTED");
        },
      },
      storage: {
        createSignedDownload: async () =>
          ({ url: "https://storage.example.test/source" }) as never,
        getBytes: async () => ({ body: new Uint8Array() }) as never,
        putBytes: async () => ({}) as never,
        copy: async () => ({}) as never,
        delete: async () => undefined,
      },
    });
    await expect(
      handler.handler(
        documentIngestionJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toMatchObject({
      classification: "terminal",
      code: "PARSER_UNSUPPORTED",
    });
    expect(await database!.client.select().from(usageRecords)).toMatchObject([
      {
        operationType: "document.ingestion",
        status: "failed",
        metadata: { code: "PARSER_UNSUPPORTED" },
      },
    ]);
  });

  it("promotes a staged artifact after a simulated crash before finalization", async () => {
    const stagedArtifactId = createId(new Date("2026-08-14T10:00:06.000Z"));
    const scope = {
      userId: ownerUserId,
      projectId,
      versionId: stagedArtifactId,
    };
    const stagedCanonical = storageKeys.parsedStagingDocling(scope);
    const stagedMarkdown = storageKeys.parsedStagingMarkdown(scope);
    const stagedNormalized = storageKeys.parsedStagingNormalized(scope);
    const stored = new Map<string, Uint8Array>([
      [stagedCanonical, new TextEncoder().encode('{"body":"Water cycle"}')],
      [stagedMarkdown, new TextEncoder().encode("# Water cycle\n")],
      [
        stagedNormalized,
        new TextEncoder().encode(
          JSON.stringify(
            normalizeDoclingOutput({
              artifactId: stagedArtifactId,
              sourceDocumentId: documentId,
              pageCount: 1,
              canonicalJson: { body: { text: "Water cycle" } },
            }),
          ),
        ),
      ],
    ]);
    await database!.client.insert(sourceDocumentIngestionArtifacts).values({
      id: stagedArtifactId,
      projectId,
      ownerUserId,
      sourceDocumentId: documentId,
      parserVersion: currentIngestionCompatibility.parserVersion,
      normalizedSchemaVersion:
        currentIngestionCompatibility.normalizedSchemaVersion,
      canonicalStorageKey: storageKeys.parsedDocling(scope),
      markdownStorageKey: storageKeys.parsedMarkdown(scope),
      configurationHash: "c".repeat(64),
      processingTimeMs: 17,
      warnings: [],
      state: "staging",
      normalizedStorageKey: null,
    });
    const ingest = vi.fn();
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: { ingest },
      storage: {
        createSignedDownload: async () => {
          throw new Error("A staged result must not download or parse again.");
        },
        getBytes: async (key) => ({ body: stored.get(key)! }) as never,
        putBytes: async () => {
          throw new Error("A staged result must not be uploaded again.");
        },
        copy: async ({ sourceKey, destinationKey }) => {
          const source = stored.get(sourceKey);
          if (source === undefined) throw new Error("staged object is missing");
          stored.set(destinationKey, source);
          return {} as never;
        },
        delete: async (key) => {
          stored.delete(key);
        },
      },
    });

    await expect(
      handler.handler(
        documentIngestionJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).resolves.toMatchObject({
      ingestion: "completed",
      artifactId: stagedArtifactId,
    });
    expect(ingest).not.toHaveBeenCalled();
    expect(stored.size).toBe(3);
    expect(
      await database!.client
        .select({ state: sourceDocumentIngestionArtifacts.state })
        .from(sourceDocumentIngestionArtifacts),
    ).toEqual([{ state: "ready" }]);
  });

  it("keeps immutable parser artifacts when the normalized metadata transaction fails", async () => {
    const stored = new Map<string, Uint8Array>();
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: {
        ingest: async () => ({
          schemaVersion: 1 as const,
          parserVersion: "docling-v1",
          configurationHash: "e".repeat(64),
          processingTimeMs: 11,
          canonicalJson: { body: { text: "Water cycle" } },
          markdown: "# Water cycle\n",
          warnings: [],
        }),
      },
      storage: {
        createSignedDownload: async () =>
          ({ url: "https://storage.example.test/source" }) as never,
        getBytes: async (key) => ({ body: stored.get(key)! }) as never,
        putBytes: async (input) => {
          stored.set(input.key, input.body);
          return {} as never;
        },
        copy: async ({ sourceKey, destinationKey }) => {
          const source = stored.get(sourceKey);
          if (source === undefined) throw new Error("staged object is missing");
          stored.set(destinationKey, source);
          return {} as never;
        },
        delete: async (key) => {
          stored.delete(key);
        },
      },
    });
    const transaction = vi
      .spyOn(database!.client, "transaction")
      .mockRejectedValueOnce(new Error("metadata write failed"));

    await expect(
      handler.handler(
        documentIngestionJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toThrow("metadata write failed");
    transaction.mockRestore();
    expect(
      await database!.client
        .select({ state: sourceDocumentIngestionArtifacts.state })
        .from(sourceDocumentIngestionArtifacts),
    ).toEqual([{ state: "staging" }]);
    expect(
      [...stored.keys()].some((key) => key.endsWith("/docling.json")),
    ).toBe(true);
    expect(
      [...stored.keys()].some((key) => key.endsWith("/normalized.json")),
    ).toBe(true);
  });

  it("retains canonical parser output when normalization is terminally invalid", async () => {
    const stored = new Map<string, Uint8Array>();
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: {
        ingest: async () => ({
          schemaVersion: 1 as const,
          parserVersion: "docling-v1",
          configurationHash: "f".repeat(64),
          processingTimeMs: 1,
          canonicalJson: {
            texts: [{ label: "text", text: "Out of range", page: 2 }],
          },
          markdown: "# invalid\n",
          warnings: [],
        }),
      },
      storage: {
        createSignedDownload: async () =>
          ({ url: "https://storage.example.test/source" }) as never,
        getBytes: async (key) => ({ body: stored.get(key)! }) as never,
        putBytes: async (input) => {
          stored.set(input.key, input.body);
          return {} as never;
        },
        copy: async () => ({}) as never,
        delete: async (key) => {
          stored.delete(key);
        },
      },
    });

    await expect(
      handler.handler(
        documentIngestionJobPayloadSchema.parse({
          schemaVersion: 1,
          sourceDocumentId: documentId,
        }),
        context,
      ),
    ).rejects.toMatchObject({ code: "SCHEMA_NORMALIZATION_DEFECT" });
    expect(
      await database!.client
        .select({ state: sourceDocumentIngestionArtifacts.state })
        .from(sourceDocumentIngestionArtifacts),
    ).toEqual([{ state: "staging" }]);
    expect(
      [...stored.keys()].some((key) => key.endsWith("/docling.json")),
    ).toBe(true);
  });

  it("does not create conflicting artifacts when duplicate deliveries overlap", async () => {
    const stored = new Map<string, Uint8Array>();
    const handler = createDocumentIngestionJobHandler({
      database: database!.client,
      client: {
        ingest: async () => ({
          schemaVersion: 1 as const,
          parserVersion: "docling-v1",
          configurationHash: "d".repeat(64),
          processingTimeMs: 9,
          canonicalJson: { body: { text: "Water cycle" } },
          markdown: "# Water cycle\n",
          warnings: [],
        }),
      },
      storage: {
        createSignedDownload: async () =>
          ({ url: "https://storage.example.test/source" }) as never,
        getBytes: async (key) => ({ body: stored.get(key)! }) as never,
        putBytes: async (input) => {
          stored.set(input.key, input.body);
          return {} as never;
        },
        copy: async ({ sourceKey, destinationKey }) => {
          const source = stored.get(sourceKey);
          if (source === undefined) throw new Error("staged object is missing");
          stored.set(destinationKey, source);
          return {} as never;
        },
        delete: async (key) => {
          stored.delete(key);
        },
      },
    });
    const payload = documentIngestionJobPayloadSchema.parse({
      schemaVersion: 1,
      sourceDocumentId: documentId,
    });

    await expect(
      Promise.all([
        handler.handler(payload, context),
        handler.handler(payload, context),
      ]),
    ).resolves.toHaveLength(2);
    expect(
      await database!.client.select().from(sourceDocumentIngestionArtifacts),
    ).toHaveLength(1);
    expect(stored.size).toBe(3);
  });
});
