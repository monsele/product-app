import { describe, expect, it, vi } from "vitest";
import type { DatabaseClient } from "@avlp/database";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
  type AuthenticatedUser,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import { PostgresSourceVisualsService } from "./source-visuals.js";

const ownerUserId = "019ffbf1-aaaa-7000-8000-000000000900";
const projectId = "019ffbf1-ffff-7000-8000-000000000901";
const parsedDocumentId = "019ffbf1-eeee-7000-8000-000000000902";
const ingestionArtifactId = "019ffbf1-eeee-7000-8000-000000000903";
const figureId = "019ffbf1-eeee-7000-8000-000000000904";
const tableId = "019ffbf1-eeee-7000-8000-000000000905";
const snapshotId = "019ffbf1-eeee-7000-8000-000000000906";
const sectionId = "019ffbf1-eeee-7000-8000-000000000907";

function databaseFor(
  parsedDocumentRows: unknown[],
  figureRows: unknown[],
  sectionRows: unknown[] = [],
): DatabaseClient {
  let selectCount = 0;
  const select = () => {
    selectCount += 1;
    // Call order: parsedDocuments lookup, extractedFigures lookup, then
    // parsedSections lookup.
    const rows =
      selectCount === 1
        ? parsedDocumentRows
        : selectCount === 2
          ? figureRows
          : sectionRows;
    const query = {
      from: () => query,
      where: () => query,
      limit: () => query,
      then: <T,>(resolve: (value: unknown[]) => T) =>
        Promise.resolve(rows).then(resolve),
    };
    return query;
  };
  return { select } as unknown as DatabaseClient;
}

describe("PostgresSourceVisualsService", () => {
  it("returns an empty response when no snapshot has been approved yet", async () => {
    const service = new PostgresSourceVisualsService(
      databaseFor([], []),
      { latestApprovedVisuals: vi.fn(async () => undefined) },
      undefined,
    );
    const result = await service.list({ ownerUserId, projectId });
    expect(result).toEqual({ entries: [], snapshotId: null });
  });

  it("lists approved figures and tables from the current snapshot only", async () => {
    const database = databaseFor(
      [{ id: parsedDocumentId, ingestionArtifactId }],
      [
        {
          id: figureId,
          parsedDocumentId,
          contentType: "image/png",
          thumbnailStorageKey: "users/x/projects/y/thumb.png",
        },
      ],
      [{ id: sectionId, heading: "Group 1: Alkali metals" }],
    );
    const createSignedDownload = vi
      .fn()
      .mockResolvedValue({ url: "https://storage.example.test/thumb" });
    const service = new PostgresSourceVisualsService(
      database,
      {
        latestApprovedVisuals: vi.fn(async () => ({
          snapshotId,
          parsedDocumentId,
          figures: [
            {
              figureId,
              sectionId,
              order: 1,
              pageStart: 3,
              altText: "Sodium atom diagram",
              revision: 0,
            },
          ],
          tables: [
            {
              tableId,
              sectionId,
              order: 1,
              pageStart: 4,
              columns: ["Name", "Value"],
              rows: [["Sodium", "11"]],
            },
          ],
        })),
      },
      { createSignedDownload } as never,
    );
    const result = await service.list({ ownerUserId, projectId });
    expect(result.snapshotId).toBe(snapshotId);
    expect(result.entries).toHaveLength(2);
    const figureEntry = result.entries.find((entry) => entry.kind === "figure");
    expect(figureEntry).toMatchObject({
      figureId,
      pageStart: 3,
      caption: "Sodium atom diagram",
      sectionHeading: "Group 1: Alkali metals",
      thumbnailUrl: "https://storage.example.test/thumb",
    });
    const tableEntry = result.entries.find((entry) => entry.kind === "table");
    expect(tableEntry).toMatchObject({
      tableId,
      pageStart: 4,
      columns: ["Name", "Value"],
      rowCount: 1,
      sectionHeading: "Group 1: Alkali metals",
    });
    // The thumbnail must be signed from the figure's own stored key, never
    // reconstructed from the requesting project's id — the stored key is
    // the only one that resolves to the real object for a same-owner reused
    // ingestion artifact (see PostgresSourceVisualsService.signThumbnail).
    expect(createSignedDownload).toHaveBeenCalledWith({
      key: "users/x/projects/y/thumb.png",
      expiresInSeconds: 300,
    });
  });

  it("lists a table with no image query and no signed-URL dependency", async () => {
    const database = databaseFor([], []);
    const service = new PostgresSourceVisualsService(
      database,
      {
        latestApprovedVisuals: vi.fn(async () => ({
          snapshotId,
          parsedDocumentId,
          figures: [],
          tables: [
            {
              tableId,
              sectionId,
              order: 1,
              pageStart: 1,
              columns: ["A", "B"],
              rows: [
                ["1", "2"],
                ["3", "4"],
              ],
            },
          ],
        })),
      },
      undefined,
    );
    const result = await service.list({ ownerUserId, projectId });
    expect(result.entries).toEqual([
      {
        kind: "table",
        tableId,
        sectionId,
        pageStart: 1,
        columns: ["A", "B"],
        rowCount: 2,
      },
    ]);
  });
});

describe("GET /projects/:projectId/source-visuals", () => {
  it("authorizes the route before invoking the resolver", async () => {
    const fixture = createCrossUserProjectFixture();
    const users = new Map<string, AuthenticatedUser>([
      [
        "owner-session",
        {
          id: fixture.ownerUserId,
          email: "owner@example.test",
          displayName: "Owner",
        },
      ],
      [
        "other-session",
        {
          id: fixture.otherUserId,
          email: "other@example.test",
          displayName: "Other",
        },
      ],
    ]);
    const authGateway: AuthGateway = {
      register: async () => {
        throw new Error("Not used by this test.");
      },
      signIn: async () => null,
      currentSession: async (token) => users.get(token) ?? null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const list = vi.fn().mockResolvedValue({ entries: [], snapshotId: null });
    let app: NestFastifyApplication | undefined;
    try {
      app = await createApp({
        authGateway,
        projectAuthorizer: new ProjectAuthorizationService(
          new InMemoryOwnerScopedProjectRepository([fixture.project]),
        ),
        sourceVisualsService: { list },
      });
      const server = app.getHttpAdapter().getInstance();

      const foreign = await server.inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/source-visuals`,
        cookies: { [sessionCookieName]: "other-session" },
      });
      expect(foreign.statusCode).toBe(404);
      expect(list).not.toHaveBeenCalled();

      const owner = await server.inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/source-visuals`,
        cookies: { [sessionCookieName]: "owner-session" },
      });
      expect(owner.statusCode).toBe(200);
      expect(list).toHaveBeenCalledWith({
        ownerUserId: fixture.ownerUserId,
        projectId: fixture.projectId,
      });
    } finally {
      await app?.close();
    }
  });
});
