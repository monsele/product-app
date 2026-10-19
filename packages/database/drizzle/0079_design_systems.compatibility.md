# Migration 0079

Additive owner-scoped design-system drafts, immutable versions and import records.
No existing data is backfilled and no saved render/lesson contract changes.
Apply the migration before deploying API/worker code that uses these tables.
Rolling back the application is safe; retain tables and private bytes for history.
Destructive rollback requires separately reviewed owner retention/export handling.

Imports use `users/<owner>/design-systems/...`, outside project deletion prefixes.
`project_id` on imports is the originating job context, deliberately not a cascading
foreign key. Owner/system compound foreign keys prevent cross-owner row attachment.
Triggers reject updates/deletions of published versions and terminal imports.
Future owner-deletion tooling must explicitly account for these retention guards.

The migration is handwritten, like preceding recovery migrations. The Drizzle
schema generator includes design-system-tables.ts for future snapshot generation.
