# 0007 steep preak compatibility notes

This forward-only migration adds `password_reset_tokens` for application-managed
credentials. Reset secrets are stored only as keyed hashes and consumed by an
atomic conditional update. Deploy the migration before enabling password-reset
endpoints; rollback consists of disabling those endpoints rather than removing
token audit history.
