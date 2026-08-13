# Initial render worker

`@avlp/renderer` consumes `lesson.render` payload version 1 from the shared
`render` queue. The proof-stage payload names the immutable
`photosynthesis-three-minute-v1` fixture, carries its LessonSpec SHA-256, the
full composition SHA-256, the asset manifest, the fixed 1080p profile, an
explicit renderer/template implementation version, and a hash of all
render-affecting inputs. The result stores the same render identity, verified
video metadata, and either thumbnail metadata or the safe non-blocking
`THUMBNAIL_FAILED` status in the authoritative job result.

The worker renders outside HTTP requests in an isolated temporary directory,
uses H.264/AAC at 1920×1080 and 30 fps, verifies the output with FFprobe, uploads
through the private storage abstraction, meters render seconds, and removes
temporary files on success or failure. Deterministic tenant-scoped object keys
and the shared job idempotency key prevent duplicate authoritative outputs.
The worker rejects a LessonSpec whose project ID differs from the authoritative
job tenant before it performs storage or rendering work. Failure logs retain
only bounded diagnostic categories, stages, and system error codes.

## Local commands

Build the scene library before starting the worker, then provide PostgreSQL,
Redis, and private S3-compatible storage configuration:

```powershell
pnpm --filter @avlp/renderer... build
pnpm --filter @avlp/renderer dev
```

Set `RENDER_BROWSER_EXECUTABLE` when the worker must use a pinned Chromium
binary. Enqueue the immutable proof fixture through the shared job/outbox path:

```powershell
pnpm --filter @avlp/renderer enqueue:fixture
```

Run fast contract/worker tests and the explicit real-media CI tier separately:

```powershell
pnpm --filter @avlp/renderer test
pnpm --filter @avlp/renderer test:smoke
```

The smoke tier renders one second from the manual composition and verifies the
actual MP4 codec, audio codec, dimensions, frame rate, duration, non-zero file
length, and thumbnail. Production project render APIs, authorization, UI,
cancellation, and autoscaling remain owned by ST-068.
