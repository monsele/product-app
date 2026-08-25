import { PublicError, identifierSchema, type Identifier } from "@avlp/config";
import { z } from "zod";

export const projectAccessPolicySchema = z.object({
  version: z.literal("1"),
  unauthorizedProjectResponse: z
    .enum(["not_found", "forbidden"])
    .default("not_found"),
});
export type ProjectAccessPolicy = z.infer<typeof projectAccessPolicySchema>;

export const defaultProjectAccessPolicy: ProjectAccessPolicy = {
  version: "1",
  unauthorizedProjectResponse: "not_found",
};

export const projectAccessScopeSchema = z.object({
  ownerUserId: identifierSchema,
  projectId: identifierSchema,
});
export type ProjectAccessScope = z.infer<typeof projectAccessScopeSchema>;

export type OwnedProject = {
  id: Identifier;
  ownerUserId: Identifier;
};

/**
 * Project repositories must make ownership part of the database lookup. An
 * adapter that loads by project ID and checks ownership later does not satisfy
 * this contract.
 */
export interface OwnerScopedProjectRepository {
  loadOwnedProject(scope: ProjectAccessScope): Promise<OwnedProject | null>;
}

export class ProjectAuthorizationService {
  readonly #repository: OwnerScopedProjectRepository;
  readonly #policy: ProjectAccessPolicy;

  public constructor(
    repository: OwnerScopedProjectRepository,
    policy: ProjectAccessPolicy = defaultProjectAccessPolicy,
  ) {
    this.#repository = repository;
    this.#policy = projectAccessPolicySchema.parse(policy);
  }

  public async assertProjectAccess(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OwnedProject> {
    const scope = projectAccessScopeSchema.parse({ ownerUserId, projectId });
    const project = await this.#repository.loadOwnedProject(scope);

    // This defensive comparison makes an accidentally unscoped repository
    // fail closed even if it returns a real project owned by another tenant.
    if (
      project === null ||
      project.id !== scope.projectId ||
      project.ownerUserId !== scope.ownerUserId
    )
      throw this.#inaccessibleProjectError();

    return project;
  }

  public loadOwnedProject(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<OwnedProject> {
    return this.assertProjectAccess(ownerUserId, projectId);
  }

  #inaccessibleProjectError(): PublicError {
    if (this.#policy.unauthorizedProjectResponse === "forbidden")
      return new PublicError(
        "forbidden",
        "Access to this project is forbidden.",
        403,
      );
    return new PublicError(
      "not_found",
      "The requested resource was not found.",
      404,
    );
  }
}
