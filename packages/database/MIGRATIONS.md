# Database migrations

`@avlp/database` is the only workspace that owns schema migrations.

- Name schema objects and migration files with lowercase `snake_case`.
- Generate a migration with `pnpm --filter @avlp/database db:generate` and review the SQL and journal together.
- Apply pending migrations with `DATABASE_URL=... pnpm --filter @avlp/database db:migrate`.
- Migrations already applied outside a disposable environment are immutable. Add a forward compatibility migration instead of editing history.
- Applied migrations are not rolled back in place unless a reviewed operation can preserve the exact journal state and proves that no newer migration is applied. Otherwise, include compatibility notes and use a reviewed forward migration or restore plan. `0000_dark_phalanx` through `0005_smooth_flatman` follow the compatibility-note path.
- Never hold a transaction open across storage, AI, TTS, or rendering calls. Repositories accept `DatabaseExecutor` so the caller can supply the current transaction.
- Store timestamps with timezone and pass UTC `Date` values. Use normalized rows for permissions, list/status/order queries; reserve JSONB for versioned snapshots or opaque metadata.
