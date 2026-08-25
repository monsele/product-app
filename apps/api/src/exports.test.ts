import { describe, expect, it, vi } from "vitest";
import { createId, type Identifier } from "@avlp/config";
import type { DatabaseClient } from "@avlp/database";
import type { AuthorizedProjectStorage } from "@avlp/storage";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import { ExportService } from "./exports.js";

function fixture() {
  const at = new Date("2026-08-25T08:00:00.000Z");
  const ownerUserId = createId(at);
  const projectId = createId(new Date(at.getTime() + 1));
  const lessonVersionId = createId(new Date(at.getTime() + 2));
  const sceneId = createId(new Date(at.getTime() + 3));
  const sourceDocumentId = createId(new Date(at.getTime() + 4));
  const blockId = createId(new Date(at.getTime() + 5));
  const snapshot = {
    lessonSpec: {
      schemaVersion: "1.8",
      lessonId: lessonVersionId,
      projectId,
      title: "States of matter",
      subject: "Science",
      audience: {
        ageBand: "11-13",
        difficulty: "introductory",
        priorKnowledge: [],
      },
      targetDurationSeconds: 180,
      tone: "friendly",
      themeId: "mvp-default",
      objectiveIds: [blockId],
      voice: { providerVoiceId: "mvp-default", speakingRate: 1 },
      scenes: [
        {
          id: sceneId,
          order: 1,
          narration: "Water changes state.",
          durationSeconds: 180,
          onScreenText: ["States of matter"],
          transition: "cut",
          assetBindings: [],
          sourceRefs: [
            {
              documentId: sourceDocumentId,
              parsedDocumentVersion: 1,
              pageStart: 1,
              blockIds: [blockId],
            },
          ],
          generatedAdditions: [],
          template: "definition",
          visual: { term: "State", definition: "A form of matter." },
        },
      ],
    },
    narration: { blocks: [{ order: 1, text: "Water changes state." }] },
  };
  return {
    at,
    ownerUserId: ownerUserId as Identifier,
    projectId: projectId as Identifier,
    lessonVersionId: lessonVersionId as Identifier,
    snapshot,
    version: {
      id: lessonVersionId,
      versionNumber: 2,
      contentHash: "a".repeat(64),
      snapshot,
    },
  };
}

function database(rows: unknown[][], writes: unknown[]): DatabaseClient {
  const select = () => {
    const result = rows.shift() ?? [];
    const query = {
      from: () => query,
      innerJoin: () => query,
      where: () => query,
      orderBy: () => query,
      limit: () => query,
      then: <T1 = unknown, T2 = never>(
        resolve?: ((value: unknown[]) => T1 | PromiseLike<T1>) | null,
        reject?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
      ) => Promise.resolve(result).then(resolve, reject),
    };
    return query;
  };
  return {
    select,
    insert: () => ({
      values: (value: unknown) => {
        writes.push(value);
        return {
          returning: async () => [
            { id: createId(new Date("2026-08-25T08:00:09.000Z")) },
          ],
        };
      },
    }),
  } as unknown as DatabaseClient;
}

describe("version-bound exports", () => {
  it("hides download and export endpoints from another tenant", async () => {
    const project = createCrossUserProjectFixture();
    const signedVideoDownload = vi.fn().mockResolvedValue({
      url: "https://storage.example.test/signed",
      expiresAt: "2026-08-25T08:05:00.000Z",
    });
    const build = vi.fn();
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("not used");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "owner"
          ? {
              id: project.ownerUserId,
              email: "owner@example.test",
              displayName: "Owner",
            }
          : token === "other"
            ? {
                id: project.otherUserId,
                email: "other@example.test",
                displayName: "Other",
              }
            : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([project.project]),
      ),
      exportService: { signedVideoDownload, build },
    });
    try {
      const server = app.getHttpAdapter().getInstance();
      const foreign = await server.inject({
        method: "GET",
        url: `/projects/${project.projectId}/renders/${project.projectId}/download`,
        cookies: { [sessionCookieName]: "other" },
      });
      expect(foreign.statusCode).toBe(404);
      expect(signedVideoDownload).not.toHaveBeenCalled();
      const foreignExport = await server.inject({
        method: "GET",
        url: `/projects/${project.projectId}/exports/${project.projectId}/narration`,
        cookies: { [sessionCookieName]: "other" },
      });
      expect(foreignExport.statusCode).toBe(404);
      expect(build).not.toHaveBeenCalled();
      const owner = await server.inject({
        method: "GET",
        url: `/projects/${project.projectId}/renders/${project.projectId}/download`,
        cookies: { [sessionCookieName]: "owner" },
      });
      expect(owner.statusCode).toBe(302);
      expect(owner.headers.location).toBe(
        "https://storage.example.test/signed",
      );
      expect(signedVideoDownload).toHaveBeenCalledWith(
        expect.objectContaining({
          ownerUserId: project.ownerUserId,
          projectId: project.projectId,
        }),
      );
    } finally {
      await app.close();
    }
  });

  it("creates golden narration and data-minimized storyboard exports from the immutable snapshot", async () => {
    const data = fixture();
    const writes: unknown[] = [];
    const service = new ExportService(
      database([[data.version], [data.version]], writes),
      { createSignedDownload: vi.fn() } as unknown as Pick<
        AuthorizedProjectStorage,
        "createSignedDownload"
      >,
      () => data.at,
    );
    const common = {
      ownerUserId: data.ownerUserId,
      projectId: data.projectId,
      lessonVersionId: data.lessonVersionId,
      correlationId: data.ownerUserId,
    };
    await expect(
      service.build({ ...common, type: "narration", format: "markdown" }),
    ).resolves.toMatchObject({
      body: "# States of matter\n\nWater changes state.",
      fileName: "states-of-matter-narration.md",
    });
    const storyboard = await service.build({
      ...common,
      type: "storyboard",
      format: "json",
    });
    expect(storyboard.body).toContain(
      '"schemaVersion": "storyboard-export-v1"',
    );
    expect(storyboard.body).toContain('"narration": "Water changes state."');
    expect(storyboard.body).not.toContain("storageKey");
    expect(storyboard.body).not.toContain(sourceDocumentIdText(data.snapshot));
    expect(writes).toHaveLength(2);
    expect(writes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ eventType: "export.downloaded" }),
      ]),
    );
  });

  it("uses captions frozen in the selected completed render manifest", async () => {
    const data = fixture();
    const service = new ExportService(
      database(
        [
          [data.version],
          [
            {
              manifest: {
                profile: { fps: 30 },
                captions: [
                  { startFrame: 0, endFrame: 90, text: "Water changes state." },
                ],
              },
            },
          ],
        ],
        [],
      ),
      { createSignedDownload: vi.fn() } as unknown as Pick<
        AuthorizedProjectStorage,
        "createSignedDownload"
      >,
      () => data.at,
    );
    const output = await service.build({
      ownerUserId: data.ownerUserId,
      projectId: data.projectId,
      lessonVersionId: data.lessonVersionId,
      correlationId: data.ownerUserId,
      type: "captions",
      format: "vtt",
    });
    expect(output.body).toBe(
      "WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nWater changes state.\n",
    );
  });

  it("only signs a verified completed tenant-scoped video and audits the download", async () => {
    const data = fixture();
    const createSignedDownload = vi.fn().mockResolvedValue({
      url: "https://storage.example.test/signed",
      method: "GET",
    });
    const service = new ExportService(
      database(
        [
          [
            {
              render: { id: data.lessonVersionId },
              video: {
                id: data.lessonVersionId,
                storageKey:
                  "users/foreign-user/projects/foreign-project/renders/foreign/lesson.mp4",
              },
              version: data.version,
            },
          ],
        ],
        [],
      ),
      { createSignedDownload } as unknown as Pick<
        AuthorizedProjectStorage,
        "createSignedDownload"
      >,
      () => data.at,
    );
    await expect(
      service.signedVideoDownload({
        ownerUserId: data.ownerUserId,
        projectId: data.projectId,
        renderId: data.lessonVersionId,
        correlationId: data.ownerUserId,
      }),
    ).resolves.toEqual({
      url: "https://storage.example.test/signed",
      expiresAt: "2026-08-25T08:05:00.000Z",
    });
    expect(createSignedDownload).toHaveBeenCalledWith(
      data.ownerUserId,
      expect.objectContaining({
        projectId: data.projectId,
        object: { kind: "render_video", renderJobId: data.lessonVersionId },
        expiresInSeconds: 300,
        downloadFileName: "states-of-matter-v2.mp4",
      }),
    );
  });
});

function sourceDocumentIdText(
  snapshot: ReturnType<typeof fixture>["snapshot"],
): string {
  return snapshot.lessonSpec.scenes[0]!.sourceRefs[0]!.documentId;
}
