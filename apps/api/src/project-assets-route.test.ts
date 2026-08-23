import { afterEach, describe, expect, it, vi } from "vitest";
import type { NestFastifyApplication } from "@nestjs/platform-fastify";
import type { DatabaseClient } from "@avlp/database";
import type { ObjectStorage } from "@avlp/storage";
import {
  InMemoryOwnerScopedProjectRepository,
  ProjectAuthorizationService,
  createCrossUserProjectFixture,
  type AuthGateway,
} from "@avlp/auth";
import { createApp, sessionCookieName } from "./app.js";
import { ProjectAssetService } from "./project-assets.js";

describe("teacher asset routes", () => {
  let app: NestFastifyApplication | undefined;
  afterEach(async () => {
    await app?.close();
  });

  it("does not issue private asset previews to another project owner", async () => {
    const fixture = createCrossUserProjectFixture();
    const auth: AuthGateway = {
      register: async () => {
        throw new Error("not used");
      },
      signIn: async () => null,
      currentSession: async (token) =>
        token === "other"
          ? {
              id: fixture.otherUserId,
              email: "other@example.test",
              displayName: "Other",
            }
          : null,
      signOut: async () => {},
      requestPasswordReset: async () => {},
      confirmPasswordReset: async () => {},
    };
    const createSignedDownload = vi.fn<ObjectStorage["createSignedDownload"]>();
    const projectAssetService = new ProjectAssetService(
      {} as DatabaseClient,
      { createSignedDownload } as unknown as ObjectStorage,
    );
    app = await createApp({
      authGateway: auth,
      projectAuthorizer: new ProjectAuthorizationService(
        new InMemoryOwnerScopedProjectRepository([fixture.project]),
      ),
      projectAssetService,
    });
    const response = await app
      .getHttpAdapter()
      .getInstance()
      .inject({
        method: "GET",
        url: `/projects/${fixture.projectId}/teacher-assets`,
        cookies: { [sessionCookieName]: "other" },
      });
    expect(response.statusCode).toBe(404);
    expect(createSignedDownload).not.toHaveBeenCalled();
  });
});
