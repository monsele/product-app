# Storyboard recovery release verification

`STORYBOARD_RECOVERY_ENABLED=true` enables the preparation UI, independent preview
capability and durable coordinator. The default is off. Deploy migrations 0074–0078
and rebuild shared packages before enabling an API/worker pair. No lesson-document
migration is needed. Disable the flag to stop new workflow enrollment; already
authorized dispatched jobs retain their cancellation and spending guards.

## Contracts and authority

- `GET /projects/:id/readiness`: independent edit/preview/render capabilities,
  grouped tasks, bounded activity history and project-scoped release measurements.
- `GET /projects/:id/recovery/estimate`: current-revision preparation estimate.
- `POST /projects/:id/recovery`: expected revision, stable idempotency key,
  estimate fingerprint, accepted maximum and optional retry/top-up intent.
- `POST /projects/:id/recovery/stop`: expected revision and idempotency key;
  stops new repair dispatches and cancels pending generation preparation grants.
- `GET /projects/:id/recovery/generation-estimate`: free pre-generation quote.
- `POST /projects/:id/storyboard/generate`: existing idempotency header; optional
  preparation consent body (`estimateFingerprint`, `acceptedMaximumCostUsd`).
  Legacy empty requests create no paid preparation authority.

All routes retain project authorization and trusted-origin mutation checks. Page
opening and polling perform free checks only. A new prompt-to-video confirmation
includes preparation inside its existing cap. Its earmarked amount is unavailable
to other generation stages. Later additional approval adds to the same project
session. Unused or uncertain reservations are conservative; failed calls may have
incurred charges even when no output was recoverable. Recorded estimated usage and
held reservations are reported separately.

## Local release gate

From `apps/api`, after building packages, API and pipeline worker, run in PowerShell:

```powershell
$env:NODE_ENV = 'test'
$env:TOGETHER_API_KEY = ' '
node --import tsx --env-file=../../.env test-support/recovery-release.ts
```

Whitespace deliberately overrides the local provider key on Windows and is parsed
as absent. The driver refuses a configured provider key, creates and destroys its
own isolated PostgreSQL database, uses local Redis database 15, starts real API,
worker and Next processes on 3101/3100, and writes real fixture audio to private
MinIO storage. Reserve Redis database 15 for local release checks; it must differ
from the normal app database. It stops only its own child process trees and never
recreates the application's containers or database.

The six-scene fixture has five successful audio tracks and one failed Scene 6.
The gate verifies editing/partial preview before preparation, no authorization on
page open, explicit legacy allowance approval, automatic repair of only Scene 6,
current captions and source checking, preserved unsaved narration and focus,
238-second readiness against the 180-second target, and a usable completed preview.
No production provider or manually repaired technical state is used after the
initial reported failure is seeded.

Evidence is written to `.runtime-logs/recovery/live/`: incomplete and ready
storyboards, partial and complete previews, process logs and `result.json`.
`e2e/storyboard-recovery.spec.ts` additionally covers keyboard disclosure, axe,
mobile layout and 200% zoom using controlled API fixtures.

## Release measurements

Persisted milestones measure generation timestamp to first observed editable draft
and first successful preview manifest. Per-project readiness metrics expose those
latencies, successful repairs, current unresolved tasks, lifetime retry counts and
recorded estimated recovery cost. Task-state transitions form the technical activity
history; they contain no teaching text or media URLs.

OpenTelemetry exports aggregate mean edit/preview latency, successful/unresolved
task counts, retry totals and recorded cost under `avlp.preparation.*` and
`avlp.recovery.*`. These instruments have no tenant/project labels. Raw milestones
support distribution analysis without inventing progress percentages. Failed
dispatch reservations remain visible in the preparation allowance even when actual
provider usage is uncertain.

Final rendering still uses current-revision validation and immutable lesson
versions. Missing citations/media and stale validation remain blocking. Model
grounding judgments are advisory, and content-changing remedies still require
explicit generation and review/application through the existing candidate UI.
