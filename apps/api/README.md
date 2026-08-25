# Application API

All routes beneath `/projects/{projectId}/...` pass through the shared project
authorization hook before a controller or raw Fastify handler runs. The hook:

1. requires a valid `avlp_session` cookie;
2. validates the UUIDv7 project identifier;
3. calls `ProjectAuthorizationService.assertProjectAccess` with the internal
   authenticated user ID; and
4. attaches the verified `{ ownerUserId, projectId }` scope to the request.

Foreign and missing project identifiers both use the standard `not_found`
error envelope. Authentication failures use `unauthorized`. Future project
routes must retain the `/projects/{projectId}` prefix so the mandatory guard
cannot be bypassed, and project repositories must still scope their database
queries by owner; route authorization is defense in depth, not the ownership
source of truth.
