import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PublicError } from "@avlp/config";
import { migrateDatabase } from "@avlp/database";
import { createTestDatabase, type TestDatabase } from "@avlp/database/testing";
import {
  eligibleCinemaCompositions,
  isCreativeDesignManifestV2,
  sceneSpecSchema,
} from "@avlp/schemas";
import { now, processScene, sceneA, sceneB, scope, seed } from "./cinema-lesson.fixture.js";
import { PostgresCreativeDesignService } from "./creative-design.js";

const serverUrl = process.env.TEST_DATABASE_URL;
const describeWithPostgres = serverUrl === undefined ? describe.skip : describe;

describeWithPostgres("PostgresCreativeDesignService v2 drafts (ADR-015, Postgres)", () => {
  let database: TestDatabase | undefined;
  let service: PostgresCreativeDesignService;

  beforeAll(async () => {
    database = await createTestDatabase(serverUrl!);
    await migrateDatabase(database.client);
  });

  beforeEach(async () => {
    await seed(database!.client);
    service = new PostgresCreativeDesignService(database!.client, () => now);
  });

  afterAll(async () => {
    await database?.destroy();
  });

  it("upgrades a v1 draft to v2 only on request, then lists, applies and keeps it", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "field-notes", expectedRevision: 0 } });
    expect(planned.manifest.manifestVersion).toBe("1.0");

    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    expect(upgraded.revision).toBe(planned.revision + 1);
    expect(isCreativeDesignManifestV2(upgraded.manifest)).toBe(true);
    if (!isCreativeDesignManifestV2(upgraded.manifest)) return;
    expect(upgraded.manifest.pack.id).toBe("field-notes");
    expect(upgraded.manifest.variationSeed).toMatch(/^[0-9a-f]{16}$/u);
    expect(Object.keys(upgraded.manifest.scenes).sort()).toEqual([sceneA, sceneB].sort());

    const draft = await service.getDraft(scope);
    expect(draft?.manifest).toEqual(upgraded.manifest);
    expect(draft?.eligibility).toEqual([]);
    expect(draft?.applied).toBe(false);

    const alternatives = await service.alternatives({ ...scope, sceneId: sceneB });
    const expected = eligibleCinemaCompositions(sceneSpecSchema.parse(processScene)).map((entry) => entry.id);
    expect(alternatives.map((entry) => entry.treatmentId)).toEqual(expected);
    expect(expected.length).toBeGreaterThanOrEqual(2);

    const applied = await service.apply({ ...scope, expectedRevision: upgraded.revision });
    expect(applied.manifestHash).toMatch(/^[0-9a-f]{64}$/u);
    expect((await service.getDraft(scope))?.applied).toBe(true);

    // Upgrading again is a no-op; a stale revision is a conflict.
    await expect(service.upgrade({ ...scope, body: { expectedRevision: upgraded.revision } })).resolves.toEqual({
      revision: upgraded.revision,
      manifest: upgraded.manifest,
    });
    const stale = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(PublicError);
    expect((stale as PublicError).statusCode).toBe(409);
  });

  it("switches pack on a v2 draft without falling back to v1", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "essential", expectedRevision: 0 } });
    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    if (!isCreativeDesignManifestV2(upgraded.manifest)) throw new Error("expected a v2 draft");
    const switched = await service.plan({ ...scope, body: { packId: "systems", expectedRevision: upgraded.revision } });
    expect(isCreativeDesignManifestV2(switched.manifest)).toBe(true);
    if (!isCreativeDesignManifestV2(switched.manifest)) return;
    expect(switched.manifest.pack.id).toBe("systems");
    expect(switched.manifest.variationSeed).toBe(upgraded.manifest.variationSeed);
    // The new pack's own look, not the previous pack's colours.
    expect(switched.manifest.settings.colors).not.toEqual(upgraded.manifest.settings.colors);
  });

  it("saves a v2 draft edit and refuses a composition that cannot present the scene", async () => {
    const planned = await service.plan({ ...scope, body: { packId: "prism", expectedRevision: 0 } });
    const upgraded = await service.upgrade({ ...scope, body: { expectedRevision: planned.revision } });
    if (!isCreativeDesignManifestV2(upgraded.manifest)) throw new Error("expected a v2 draft");
    const manifest = upgraded.manifest;
    const other = eligibleCinemaCompositions(sceneSpecSchema.parse(processScene)).find(
      (entry) => entry.id !== manifest.scenes[sceneB]!.compositionId,
    )!;
    const locked = await service.createOrUpdateDraft({
      ...scope,
      body: {
        expectedRevision: upgraded.revision,
        manifest: {
          ...manifest,
          scenes: { ...manifest.scenes, [sceneB]: { ...manifest.scenes[sceneB]!, compositionId: other.id, locked: true } },
        },
      },
    });
    expect(isCreativeDesignManifestV2(locked.manifest) && locked.manifest.scenes[sceneB]?.compositionId).toBe(other.id);

    const refused = await service
      .createOrUpdateDraft({
        ...scope,
        body: {
          expectedRevision: locked.revision,
          manifest: {
            ...manifest,
            // A before/after comparison cannot present a definition.
            scenes: { ...manifest.scenes, [sceneA]: { ...manifest.scenes[sceneA]!, compositionId: "comparison-stacked" } },
          },
        },
      })
      .catch((error: unknown) => error);
    expect(refused).toBeInstanceOf(PublicError);
    expect((refused as PublicError).statusCode).toBe(422);
    expect((await service.getDraft(scope))?.revision).toBe(locked.revision);
  });
});
