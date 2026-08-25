import { describe, expect, it } from "vitest";
import { PublicError } from "@avlp/config";
import {
  ProjectAuthorizationService,
  type OwnerScopedProjectRepository,
} from "./project-access.js";
import {
  InMemoryOwnerScopedProjectRepository,
  createCrossUserProjectFixture,
} from "./project-access-testing.js";

describe("ProjectAuthorizationService", () => {
  it("loads a project only through its owner scope", async () => {
    const fixture = createCrossUserProjectFixture();
    const service = new ProjectAuthorizationService(
      new InMemoryOwnerScopedProjectRepository([fixture.project]),
    );

    await expect(
      service.loadOwnedProject(fixture.ownerUserId, fixture.projectId),
    ).resolves.toEqual(fixture.project);
  });

  it("makes foreign and missing identifiers indistinguishable", async () => {
    const fixture = createCrossUserProjectFixture();
    const service = new ProjectAuthorizationService(
      new InMemoryOwnerScopedProjectRepository([fixture.project]),
    );

    const capture = async (
      userId: typeof fixture.ownerUserId,
      projectId: typeof fixture.projectId,
    ) => {
      try {
        await service.assertProjectAccess(userId, projectId);
      } catch (error) {
        return error;
      }
      throw new Error("Expected access to be denied.");
    };
    const foreign = await capture(fixture.otherUserId, fixture.projectId);
    const missing = await capture(
      fixture.ownerUserId,
      fixture.missingProjectId,
    );

    expect(foreign).toBeInstanceOf(PublicError);
    expect(foreign).toMatchObject({
      code: "not_found",
      statusCode: 404,
      message: "The requested resource was not found.",
    });
    expect(missing).toMatchObject({
      code: "not_found",
      statusCode: 404,
      message: "The requested resource was not found.",
    });
  });

  it("fails closed when an intentionally unscoped repository returns another owner's row", async () => {
    const fixture = createCrossUserProjectFixture();
    const intentionallyUnscopedRepository: OwnerScopedProjectRepository = {
      loadOwnedProject: async ({ projectId }) =>
        projectId === fixture.projectId ? fixture.project : null,
    };
    const service = new ProjectAuthorizationService(
      intentionallyUnscopedRepository,
    );

    await expect(
      service.assertProjectAccess(fixture.otherUserId, fixture.projectId),
    ).rejects.toMatchObject({ code: "not_found", statusCode: 404 });
  });
});
