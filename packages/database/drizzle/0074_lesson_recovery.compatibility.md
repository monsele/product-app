# 0074 — Lesson recovery

Additive migration; deploy before enabling STORYBOARD_RECOVERY_ENABLED. No existing
lesson, audio, validation or render row is rewritten. Old binaries ignore these
tables. Run the migrator twice to verify idempotency. Roll back application code
with the flag disabled; retain task history and reservations for in-flight work.
Project/owner scope is mandatory on every query. Active run uniqueness prevents
separate editor and prompt-to-video allowances for the same project. Task identity
spans runs to preserve attempt limits across browser retries. Recovery tables must
be included in project deletion. Currency is numeric(12,6), as in one-shot budgets.
