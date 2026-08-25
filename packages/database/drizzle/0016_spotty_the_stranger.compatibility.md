# Migration 0016 compatibility notes

- Adds audit enum values for requested and rejected document validation events.
- No existing audit rows or workflow records are rewritten.
- Deploy this migration before application or worker binaries that emit these events.
