# Runbook: storage cleanup

## Scope

Cleanup is owner- and project-scoped. It covers original uploads, extracted figures, teacher assets, generated illustrations, audio, captions, previews, thumbnails, and renders. Database rows and immutable history follow the approved retention policy.

## Procedure

1. Verify the project is deleted and API authorization already denies access.
2. Resolve the exact `users/{ownerUserId}/projects/{projectId}/` prefix from trusted database identifiers.
3. List objects only within that prefix and compare them with retained artifact records.
4. Run the idempotent cleanup job. Never broaden the prefix or use a client-supplied storage key.
5. Retry partial batches with the same cleanup identity; absence is success.
6. Record counts, bytes, correlation ID, and sanitized failures without recording signed URLs.

## Verify

Confirm the project prefix is empty, old signed URLs fail, unrelated owner/project prefixes are unchanged, and retrying cleanup performs no additional destructive work.
