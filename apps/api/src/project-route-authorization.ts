import type { FastifyRequest } from "fastify";
import { PublicError, identifierSchema, type Identifier } from "@avlp/config";
import type { AuthGateway, AuthenticatedUser } from "@avlp/auth";

export interface ProjectRouteAuthorizer {
  assertProjectAccess(
    ownerUserId: Identifier,
    projectId: Identifier,
  ): Promise<unknown>;
}

export type AuthorizedProjectRequest = FastifyRequest & {
  authenticatedUser?: AuthenticatedUser;
  projectAccess?: {
    ownerUserId: Identifier;
    projectId: Identifier;
  };
};

export async function authorizeProjectRoute(
  request: AuthorizedProjectRequest,
  auth: AuthGateway,
  authorizer: ProjectRouteAuthorizer,
  sessionCookieName: string,
): Promise<void> {
  const encodedProjectId = projectIdSegment(request.url);
  if (encodedProjectId === undefined) return;

  const sessionToken = request.cookies[sessionCookieName];
  const user =
    sessionToken === undefined ? null : await auth.currentSession(sessionToken);
  if (user === null)
    throw new PublicError("unauthorized", "Authentication is required.", 401);

  const projectId = parseProjectId(encodedProjectId);
  await authorizer.assertProjectAccess(user.id, projectId);
  request.authenticatedUser = user;
  request.projectAccess = { ownerUserId: user.id, projectId };
}

function projectIdSegment(url: string): string | undefined {
  const path = url.split("?", 1)[0] ?? "";
  const segments = path.split("/").filter((segment) => segment.length > 0);
  if (segments[0] !== "projects" || segments.length < 2) return undefined;
  return segments[1];
}

function parseProjectId(encodedProjectId: string): Identifier {
  let decodedProjectId: string;
  try {
    decodedProjectId = decodeURIComponent(encodedProjectId);
  } catch {
    throw inaccessibleProjectError();
  }
  const result = identifierSchema.safeParse(decodedProjectId);
  if (!result.success) throw inaccessibleProjectError();
  return result.data;
}

function inaccessibleProjectError(): PublicError {
  return new PublicError(
    "not_found",
    "The requested resource was not found.",
    404,
  );
}
