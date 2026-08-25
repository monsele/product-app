# ST-071 MVP acceptance

## Canonical exercise

The release fixture is the five-page science document **How plants make food** in `@avlp/test-fixtures`. It resolves every scene citation against immutable normalized parser output and produces a six-scene, 180-second `LessonSpec` with deterministic captions and preview narration tracks.

The automated release path registers these 17 ordered checkpoints:

1. Register
2. Sign in
3. Create a project
4. Upload the source
5. Ingest the source
6. Review and approve the source
7. Configure the lesson
8. Generate, edit, and approve objectives
9. Generate, edit, and approve the outline
10. Generate, edit, and approve narration
11. Generate and edit the storyboard and assets
12. Generate per-scene audio and captions
13. Preview the complete lesson
14. Validate the lesson
15. Render a 1080p MP4 and thumbnail
16. Export captions, narration, and storyboard; create and revoke a share link
17. Restore a historic immutable lesson version as a new active version

The fixture contract and release traceability are enforced by `packages/test-fixtures/src/mvp-acceptance.test.ts` and `release-traceability.test.ts`. Each service also retains focused contract, authorization, idempotency, concurrency, and failure-path coverage; the release fixture does not replace those lower-level proofs.

## Failure and recovery evidence

| Failure               | Required recovery                               | Focused evidence                                                 |
| --------------------- | ----------------------------------------------- | ---------------------------------------------------------------- |
| Ingestion failure     | Retry idempotently                              | ingestion worker and status service tests                        |
| Invalid AI output     | Repair or retry; never persist invalid output   | provider adapter structured-output tests and prompt evals        |
| One-scene TTS failure | Retry only the failed scene                     | pipeline worker and scene-audio tests                            |
| Stale edit            | Return conflict with latest revision            | objectives, outline, narration, and storyboard concurrency tests |
| Missing asset         | Block render and identify scene                 | validation-engine tests                                          |
| Render failure        | Retry the same approved lesson version          | render service and renderer tests                                |
| Revoked share         | Return not found without project data           | share-link service and public route tests                        |
| Deleted project       | Deny access and schedule owned artifact cleanup | project deletion tests and storage cleanup runbook               |

## Quota gates

Release limits are pinned by the fixture. Page, duration, and scene bounds are versioned schema invariants; provider, regeneration, upload, and render limits are parsed at the configuration boundary:

| Quota                           |                  Default |
| ------------------------------- | -----------------------: |
| Source pages                    |                       20 |
| Lesson duration                 | 180, 300, or 420 seconds |
| Scenes                          |                      100 |
| Regenerations per project/hour  |                       10 |
| Provider calls per project/hour |                       60 |
| Upload size                     |                   25 MiB |
| Concurrent renders per project  |                        1 |
| Render starts per project/hour  |                       12 |

Production boot additionally requires `AUTH_RATE_LIMIT_MODE=shared-edge`. This is an operational assertion that authentication throttling is enforced at a shared ingress or gateway rather than relying only on the process-local defense-in-depth limiter.

## Content reuse

The release gate covers unchanged source, audio, captions, asset, preview, and render content hashes. Focused repository tests prove the associated idempotency keys, immutable versions, selective invalidation, and retry behavior. A changed narration or scene hash invalidates only dependent artifacts; identical hashes remain eligible for reuse.

## PRD metric sources

All nine product metrics and eight quality metrics have a named authoritative source in `mvpMetricCatalog`. The sources are audit events, immutable job/artifact timestamps, usage records, grounding results, lesson validation results, prompt evaluations, and visual regression results. No source text or provider payload is copied into analytics.

## Release commands

Run from the repository root:

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @avlp/evals eval
pnpm exec playwright test
pnpm --filter @avlp/renderer test:smoke
```

PostgreSQL integration evidence requires `TEST_DATABASE_URL`. Production-like browser evidence requires Chromium installed for Playwright.
