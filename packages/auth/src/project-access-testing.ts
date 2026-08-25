import { createId, type Identifier } from "@avlp/config";
import type {
  OwnedProject,
  OwnerScopedProjectRepository,
  ProjectAccessScope,
} from "./project-access.js";

export type CrossUserProjectFixture = {
  ownerUserId: Identifier;
  otherUserId: Identifier;
  projectId: Identifier;
  missingProjectId: Identifier;
  project: OwnedProject;
};

/** Shared deterministic-shape fixture for every later project feature. */
export function createCrossUserProjectFixture(): CrossUserProjectFixture {
  const ownerUserId = createId(new Date("2026-08-13T10:00:00.000Z"));
  const otherUserId = createId(new Date("2026-08-13T10:00:01.000Z"));
  const projectId = createId(new Date("2026-08-13T10:00:02.000Z"));
  const missingProjectId = createId(new Date("2026-08-13T10:00:03.000Z"));
  return {
    ownerUserId,
    otherUserId,
    projectId,
    missingProjectId,
    project: { id: projectId, ownerUserId },
  };
}

export class InMemoryOwnerScopedProjectRepository implements OwnerScopedProjectRepository {
  readonly #projects: readonly OwnedProject[];

  public constructor(projects: readonly OwnedProject[]) {
    this.#projects = projects;
  }

  public async loadOwnedProject(
    scope: ProjectAccessScope,
  ): Promise<OwnedProject | null> {
    return (
      this.#projects.find(
        (project) =>
          project.id === scope.projectId &&
          project.ownerUserId === scope.ownerUserId,
      ) ?? null
    );
  }
}
