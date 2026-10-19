import { describe, expect, it } from "vitest";
import {
  createDesignSystemUploadInputSchema,
  designSystemDefinitionSchema,
  emptyDesignSystemDefinition,
  designSystemContentHash,
  designSystemVersionPageInputSchema,
} from "./design-systems.js";
const id = "019ffbf1-aaaa-7000-8000-000000000102";
describe("design-system boundaries", () => {
  it("bounds history pagination before querying PostgreSQL", () => {
    expect(
      designSystemVersionPageInputSchema.parse({
        beforeRevision: "201",
        limit: "200",
      }),
    ).toEqual({ beforeRevision: 201, limit: 200 });
    expect(designSystemVersionPageInputSchema.parse({})).toEqual({ limit: 50 });
    for (const query of [
      { beforeRevision: "oops" },
      { beforeRevision: 2147483648 },
      { beforeRevision: 0 },
      { limit: 201 },
      { limit: -1 },
      { limit: 1.5 },
    ])
      expect(designSystemVersionPageInputSchema.safeParse(query).success).toBe(
        false,
      );
  });
  it("requires ownership-compatible typed uploads and explicit rights confirmation", () => {
    const input = {
      projectId: id,
      kind: "font",
      mediaType: "font/woff2",
      originalName: "custom.woff2",
      sizeBytes: 100,
      sha256: "a".repeat(64),
      rightsConfirmed: true,
    };
    expect(createDesignSystemUploadInputSchema.safeParse(input).success).toBe(
      true,
    );
    for (const invalid of [
      { ...input, rightsConfirmed: false },
      { ...input, mediaType: "image/svg+xml" },
      { ...input, mediaType: "image/png" },
      { ...input, sizeBytes: 6 * 1024 * 1024 },
      { ...input, originalName: "../font" },
    ]) {
      expect(
        createDesignSystemUploadInputSchema.safeParse(invalid).success,
      ).toBe(false);
    }
  });
  it("rejects executable fields, duplicate references and ambiguous rule IDs", () => {
    expect(
      designSystemDefinitionSchema.safeParse({
        ...emptyDesignSystemDefinition,
        css: "body{}",
      }).success,
    ).toBe(false);
    expect(
      designSystemDefinitionSchema.safeParse({
        ...emptyDesignSystemDefinition,
        assetIds: [id, id],
      }).success,
    ).toBe(false);
    const rule = {
      id: "type",
      category: "typography",
      instruction: "Use serif",
      enforcement: "locked",
      origin: "supplied",
    };
    expect(
      designSystemDefinitionSchema.safeParse({
        ...emptyDesignSystemDefinition,
        rules: [rule, rule],
      }).success,
    ).toBe(false);
  });
  it("hashes canonical objects without erasing meaningful content differences", () => {
    expect(designSystemContentHash({ b: 2, a: { y: 1, x: 0 } })).toBe(
      designSystemContentHash({ a: { x: 0, y: 1 }, b: 2 }),
    );
    expect(designSystemContentHash({ a: "one" })).not.toBe(
      designSystemContentHash({ a: "two" }),
    );
  });
});
