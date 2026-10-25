import { createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { createId } from "@avlp/config";
import {
  migrateDatabase,
  users,
  projects,
  designSystems,
  designSystemAssets,
  designSystemInterpretations,
  designSystemVersions,
  jobs,
  usageRecords,
  modelCalls,
} from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  emptyDesignSystemDefinition,
  designSystemContentHash,
  designSystemInterpretationInputSchema,
} from "@avlp/schemas";
import {
  StaticPromptRegistry,
  repositoryPrompts,
  ProviderCallError,
  type LanguageModelProvider,
} from "@avlp/provider-adapters";
import { storageKeys, type ObjectStorage } from "@avlp/storage";
import { and, eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import sharp from "sharp";
import { createDesignSystemInterpretationJobHandler } from "./design-system-interpretation-job.js";
import { inspectIsolatedDesignSystemPdf } from "./design-system-pdf-isolation.js";
import {
  loadApprovedDesignGuidance,
  illustrationPromptWithDesignGuidance,
} from "./design-system-guidance.js";

const server = process.env.TEST_DATABASE_URL;
describe.skipIf(!server)(
  "ST-124 interpretation receipts and owner boundaries (PostgreSQL)",
  () => {
    let db: TestDatabase;
    const owner = createId(),
      other = createId(),
      project = createId();
    beforeAll(async () => {
      db = await createTestDatabase(server!);
      await migrateDatabase(db.client);
      await db.client.insert(users).values([
        {
          id: owner,
          emailNormalized: "interpret-owner@example.test",
          displayName: "Owner",
        },
        {
          id: other,
          emailNormalized: "interpret-other@example.test",
          displayName: "Other",
        },
      ]);
      await db.client.insert(projects).values({
        id: project,
        ownerUserId: owner,
        title: "Origin",
        stage: "draft",
      });
    }, 60000);
    afterAll(async () => {
      await db?.destroy();
    });
    async function harness(material?: {
      kind: "guide" | "reference" | "tokens";
      type: string;
      bytes: Uint8Array;
    }) {
      const systemId = createId(),
        jobId = createId(),
        id = createId();
      const objects = new Map<string, Uint8Array>();
      const pins: { id: string; sha256: string }[] = [];
      await db.client.insert(designSystems).values({
        id: systemId,
        ownerUserId: owner,
        name: "Journal",
        definition: emptyDesignSystemDefinition,
      });
      if (material) {
        const assetId = createId(),
          hash = createHash("sha256").update(material.bytes).digest("hex");
        const key = storageKeys.designSystemAsset({
          userId: owner,
          systemId,
          assetId,
          stage: "validated",
          contentHash: hash,
        });
        objects.set(key, material.bytes);
        pins.push({ id: assetId, sha256: hash });
        await db.client.insert(designSystemAssets).values({
          id: assetId,
          systemId,
          ownerUserId: owner,
          projectId: project,
          kind: material.kind,
          mediaType: material.type,
          originalName: "material",
          sizeBytes: material.bytes.length,
          sha256: hash,
          uploadKey: key,
          storageKey: key,
          validatedSha256: hash,
          status: "active",
          inspection: {},
          expiresAt: new Date(),
        });
      }
      const input = designSystemInterpretationInputSchema.parse({
        schemaVersion: "1.0",
        definition: emptyDesignSystemDefinition,
        request: "Avoid decorative icons",
        assets: pins,
        promptId: "design-system-interpretation",
        promptVersion: "v1",
        providerApproval: {
          approvalReference: jobId,
          providerId: "fixture",
          model: "mock-model-1",
          estimatedCostUsd: 1.08,
          selectionReason: "explicit_job_request",
        },
      });
      const inputHash = designSystemContentHash(input);
      await db.client.insert(jobs).values({
        id: jobId,
        projectId: project,
        ownerUserId: owner,
        jobType: "design-system.interpret",
        queueName: "pipeline",
        inputVersion: inputHash,
        idempotencyKey: id,
        correlationId: createId(),
        payloadVersion: 1,
        payload: { schemaVersion: 1, interpretationId: id },
      });
      await db.client.insert(designSystemInterpretations).values({
        id,
        ownerUserId: owner,
        systemId,
        projectId: project,
        jobId,
        inputRevision: 1,
        inputHash,
        input,
      });
      const complete = vi.fn<LanguageModelProvider["complete"]>(async () => ({
        providerId: "fixture",
        model: "mock-model-1",
        text: JSON.stringify({
          philosophy: "Field journal",
          rules: [
            {
              rule: {
                id: "imagery",
                category: "imagery",
                instruction: "Avoid decorative icons",
                enforcement: "guidance",
                origin: "supplied",
              },
              sourceId: "request",
              quote: "Avoid decorative icons",
            },
          ],
          presentation: null,
          conflicts: [],
          unsupported: [],
        }),
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 30 },
        latencyMs: 20,
        retries: 0,
      }));
      const quota = vi.fn(async () => {});
      const handler = createDesignSystemInterpretationJobHandler({
        database: db.client,
        provider: {
          providerId: "fixture",
          supportedModels: ["mock-model-1"],
          complete,
        },
        promptRegistry: new StaticPromptRegistry(repositoryPrompts),
        quotaGuard: { assertCanGenerate: quota },
        storage: {
          getBytes: async (key: string) => ({ body: objects.get(key)! }),
        } as unknown as ObjectStorage,
      });
      const context = {
        jobId,
        projectId: project,
        ownerUserId: owner,
        correlationId: createId(),
        idempotencyKey: id,
        attempt: 1,
        heartbeat: async () => {},
        reportProgress: async () => {},
      };
      const payload = { schemaVersion: 1 as const, interpretationId: id };
      return {
        systemId,
        id,
        jobId,
        complete,
        quota,
        context,
        payload,
        run: () => handler.handler(payload, context),
        handler,
        objects,
        pins,
      };
    }
    it("supports inspiration-only input, meters once, reuses confirmed output and passes published guidance only", async () => {
      const h = await harness();
      await h.run();
      await h.run();
      expect(h.complete).toHaveBeenCalledTimes(1);
      const [row] = await db.client
        .select()
        .from(designSystemInterpretations)
        .where(eq(designSystemInterpretations.id, h.id));
      expect(row?.proposal).toMatchObject({
        definition: { philosophy: "Field journal" },
        provenance: [{ origin: "supplied", sourceId: "request" }],
      });
      const usage = await db.client
        .select()
        .from(usageRecords)
        .where(
          and(
            eq(usageRecords.ownerUserId, owner),
            eq(
              usageRecords.idempotencyKey,
              `design-interpret:${h.id}:attempt:1`,
            ),
          ),
        );
      expect(usage).toHaveLength(1);
      expect(usage[0]?.inputUnits).toBe(100);
      expect(Number(usage[0]?.estimatedCostUsd)).toBeGreaterThan(0);
      const snapshot = {
        schemaVersion: "1.0",
        name: "Journal",
        definition: {
          ...emptyDesignSystemDefinition,
          philosophy: "Field journal",
        },
        assets: [],
      };
      const version = createId();
      await db.client.insert(designSystemVersions).values({
        id: version,
        ownerUserId: owner,
        systemId: h.systemId,
        sourceRevision: 1,
        snapshot,
        contentHash: designSystemContentHash(snapshot),
      });
      const guidance = await loadApprovedDesignGuidance(
        db.client,
        owner,
        version,
      );
      expect(
        illustrationPromptWithDesignGuidance("A plant cell", guidance),
      ).toContain("Field journal");
      await expect(
        loadApprovedDesignGuidance(db.client, other, version),
      ).rejects.toMatchObject({ code: "DESIGN_GUIDANCE_NOT_FOUND" });
      await db.client
        .update(designSystemInterpretations)
        .set({ proposal: null })
        .where(eq(designSystemInterpretations.id, h.id));
      await h.run();
      expect(h.complete).toHaveBeenCalledTimes(1); // durable receipt survives finalization retries
    });
    it("sends validated guide/token text and downscaled reference bytes, never signed URLs", async () => {
      for (const material of [
        {
          kind: "guide" as const,
          type: "text/markdown",
          bytes: new TextEncoder().encode(
            "# Journal\nUse warm paper and quiet motion.",
          ),
        },
        {
          kind: "tokens" as const,
          type: "application/json",
          bytes: new TextEncoder().encode('{"background":"#fbf8f3"}'),
        },
        {
          kind: "reference" as const,
          type: "image/png",
          bytes: await sharp({
            create: {
              width: 30,
              height: 20,
              channels: 3,
              background: "#fbf8f3",
            },
          })
            .png()
            .toBuffer(),
        },
      ]) {
        const h = await harness(material);
        await h.run();
        const request = h.complete.mock.calls[0]![0];
        expect(request.messages[1]?.content).toContain(h.pins[0]!.id);
        if (material.kind === "reference")
          expect(request.referenceImages?.[0]).toMatch(
            /^data:image\/jpeg;base64,/,
          );
        else
          expect(request.messages[1]?.content).toContain(
            material.kind === "guide" ? "warm paper" : "background",
          );
        expect(request.messages[1]?.content).not.toContain("https://");
        expect(h.complete.mock.calls[0]![1]).toEqual({
          disableRetries: true,
          redactResponse: true,
        });
      }
    });
    it("rejects foreign jobs, invalid checksums, stale work and quota failures before spending", async () => {
      const h = await harness();
      await expect(
        h.handler.handler(h.payload, { ...h.context, ownerUserId: other }),
      ).rejects.toMatchObject({ code: "DESIGN_INTERPRETATION_NOT_FOUND" });
      h.quota.mockRejectedValueOnce(new Error("quota"));
      await expect(h.run()).rejects.toThrow("quota");
      expect(h.complete).not.toHaveBeenCalled();
      await db.client
        .update(designSystems)
        .set({ revision: 2 })
        .where(eq(designSystems.id, h.systemId));
      await expect(h.run()).rejects.toMatchObject({
        code: "DESIGN_INTERPRETATION_STALE",
      });
      expect(h.complete).not.toHaveBeenCalled();
      const bad = await harness({
        kind: "guide",
        type: "text/markdown",
        bytes: new TextEncoder().encode("Guide"),
      });
      bad.objects.set(
        [...bad.objects.keys()][0]!,
        new TextEncoder().encode("Changed"),
      );
      await expect(bad.run()).rejects.toMatchObject({
        code: "DESIGN_IMPORT_CHECKSUM_MISMATCH",
      });
      expect(bad.complete).not.toHaveBeenCalled();
    });
    it("preserves concurrent edits, rejects invalid provenance and records paid invalid output", async () => {
      const h = await harness();
      const original = h.complete.getMockImplementation()!;
      h.complete.mockImplementationOnce(async (...args) => {
        const response = await original(...args);
        await db.client
          .update(designSystems)
          .set({ revision: 2 })
          .where(eq(designSystems.id, h.systemId));
        return response;
      });
      await expect(h.run()).rejects.toMatchObject({
        code: "DESIGN_INTERPRETATION_STALE",
      });
      const invalid = await harness();
      invalid.complete.mockImplementationOnce(async (...args) => {
        const response = await original(...args);
        return {
          ...response,
          text: response.text.replace(
            '"quote":"Avoid decorative icons"',
            '"quote":"invented"',
          ),
        };
      });
      await expect(invalid.run()).rejects.toMatchObject({
        code: "DESIGN_OUTPUT_INVALID",
      });
      const records = await db.client
        .select()
        .from(modelCalls)
        .where(
          eq(
            modelCalls.idempotencyKey,
            `design-interpret:${invalid.id}:attempt:1`,
          ),
        );
      expect(records[0]?.validationStatus).toBe("invalid");
      await expect(invalid.run()).rejects.toMatchObject({
        code: "DESIGN_OUTPUT_INVALID",
      });
      expect(invalid.complete).toHaveBeenCalledTimes(1);
    });
    it("records ambiguous provider failure conservatively and never automatically recharges it", async () => {
      const h = await harness();
      h.complete.mockRejectedValueOnce(
        new ProviderCallError({
          code: "PROVIDER_TRANSPORT_FAILED",
          message: "Unconfirmed",
          retryable: true,
        }),
      );
      await expect(h.run()).rejects.toMatchObject({
        code: "DESIGN_PROVIDER_DISPATCH_FAILED",
      });
      await expect(h.run()).rejects.toMatchObject({
        code: "DESIGN_INTERPRETATION_FAILED",
      });
      expect(h.complete).toHaveBeenCalledTimes(1);
      const [usage] = await db.client
        .select()
        .from(usageRecords)
        .where(
          eq(usageRecords.idempotencyKey, `design-interpret:${h.id}:attempt:1`),
        );
      expect(usage?.metadata).toMatchObject({ dispatchUncertain: true });
      expect(Number(usage?.estimatedCostUsd)).toBe(1.08);
      const [call] = await db.client
        .select()
        .from(modelCalls)
        .where(
          eq(modelCalls.idempotencyKey, `design-interpret:${h.id}:attempt:1`),
        );
      expect(call?.status).toBe("failed");
    });
    it("retries explicit rate limits, claims concurrent calls once, and stops ambiguous redispatch", async () => {
      const h = await harness();
      h.complete.mockRejectedValueOnce(
        new ProviderCallError({
          code: "PROVIDER_RATE_LIMITED",
          message: "Limited",
          retryable: true,
        }),
      );
      await expect(h.run()).rejects.toMatchObject({
        classification: "retryable",
      });
      h.context.attempt = 2;
      await h.run();
      expect(h.complete).toHaveBeenCalledTimes(2);
      const concurrent = await harness();
      const results = await Promise.allSettled([
        concurrent.run(),
        concurrent.run(),
      ]);
      expect(results.some((r) => r.status === "fulfilled")).toBe(true);
      expect(concurrent.complete).toHaveBeenCalledTimes(1);
      const uncertain = await harness();
      await db.client
        .update(designSystemInterpretations)
        .set({ dispatchState: "calling" })
        .where(eq(designSystemInterpretations.id, uncertain.id));
      await expect(uncertain.run()).rejects.toMatchObject({
        code: "DESIGN_DISPATCH_UNCERTAIN",
      });
      expect(uncertain.complete).not.toHaveBeenCalled();
    });
  },
);
describe("isolated PDF guide text", () => {
  it("extracts bounded text for formal-guide interpretation without executing imported content", async () => {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    pdf
      .addPage()
      .drawText("Use warm paper. Reveal relationships before labels.", {
        x: 50,
        y: 500,
        font,
        size: 12,
      });
    const result = await inspectIsolatedDesignSystemPdf(await pdf.save(), {
      extractText: true,
    });
    expect(result.text).toContain("Reveal relationships");
  }, 15000);
});
