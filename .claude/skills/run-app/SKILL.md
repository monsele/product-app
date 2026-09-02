---
name: run-app
description: Launch the AI Visual Learning Platform locally (infra, API, web, workers, Docling ingestion) and drive it end to end to confirm a change works in the real app. Use when asked to run, start, boot, or screenshot the app, to reproduce behaviour in a browser, or to verify a change outside the test suite.
---

# Run the app

Five processes plus three containers. Bring them up in the order below — each
step depends on the one before it. Verified on Windows 11 / Node 24 / pnpm 10.19.

Send all process logs to `.runtime-logs/` (untracked, already in use). Start every
long-running process detached so it survives the command that launched it.

## 0. Preconditions

- Docker Desktop must be running (`docker ps` must exit 0).
- `.env` must exist at the repo root. Every app is launched with
  `--env-file=../../.env`, and the Python service calls `load_dotenv()`, so the
  root `.env` is the single source of config for all five processes.
- `services/ingestion/.venv` must exist. If it does not, create it per
  [services/ingestion/README.md](../../../services/ingestion/README.md).

## 1. Infrastructure

```sh
docker compose up -d
```

Postgres publishes on **5433**, not 5432 (`POSTGRES_PORT` in `.env`). Redis 6379,
MinIO 9000/9001. `minio-init` creates the `visual-learning-private` bucket and
exits — that is success, not a crash. Wait for postgres to report `healthy`
(`docker inspect --format '{{.State.Health.Status}}' product-app-postgres-1`)
before migrating.

## 2. Rebuild workspace packages — do not skip

Apps import `@avlp/*` from `dist/`, and the `dev` task in `turbo.json` has **no**
`dependsOn`, so `pnpm dev` never rebuilds them. If any `packages/*/src` file has
changed since the last build, the running app silently uses stale compiled code.

```sh
pnpm turbo build --filter='./packages/*'
```

Takes ~1 minute cold, seconds when the turbo cache is warm. Run it whenever
`git status` shows modified files under `packages/`.

## 3. Migrations

```sh
pnpm --filter @avlp/database db:migrate
```

Prints nothing on success. Confirm with:

```sh
docker exec product-app-postgres-1 psql -U postgres -d visual_learning -c "\dt"
```

A healthy schema is 40+ tables. If you see only `database_metadata`, the migration
did not run.

## 4. Node services

```sh
pnpm --filter @avlp/api dev              # :3001
pnpm --filter @avlp/web dev              # :3000
pnpm --filter @avlp/pipeline-worker dev  # no port
pnpm --filter @avlp/renderer dev         # no port
```

The API logs nothing while `tsx` compiles — anywhere from ~30s to ~80s, and it is
the slowest of the four — then prints `Server listening at http://127.0.0.1:3001`.
Next.js reaches its first `Ready` in ~30-45s. Poll `/health` rather than guessing;
do not conclude the API is broken until well past a minute. The worker and renderer are headless queue pollers — they bind no port
and log nothing at idle, so a silent log is normal. Verify them with
`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` rather than `netstat`.

## 5. Docling ingestion service

Must listen on **8000** — the worker hardcodes `http://127.0.0.1:8000` as its dev
fallback ([apps/pipeline-worker/src/runtime.ts:266](../../../apps/pipeline-worker/src/runtime.ts#L266)).

```sh
services/ingestion/.venv/Scripts/python.exe -m uvicorn app:app \
  --host 127.0.0.1 --port 8000 --app-dir services/ingestion
```

Run it **from the repo root** so `load_dotenv()` finds the root `.env`;
`INGESTION_SERVICE_TOKEN` must be set or startup aborts. On non-Windows the
interpreter is `.venv/bin/python`.

Startup emits a wall of pydantic `UnsupportedFieldAttributeWarning` lines — those
are harmless. Wait for `Application startup complete.` The Docling layout models
load lazily in a warmed child process; the **first** ingestion after boot takes
~25-55s depending on how cold the model cache is, later ones land in under 5s.

## Drive it

Launching proves nothing. Exercise the path the change touches.

### API

Every mutating route enforces the request origin. Without the header you get
`403 {"code":"forbidden","message":"Request origin is not allowed."}` — that is
the guard working, not a broken server. Always send `Origin: http://localhost:3000`
and keep a cookie jar for the session:

```sh
O='Origin: http://localhost:3000'
curl -s http://localhost:3001/health                     # {"status":"ok","service":"api"}
curl -s -c jar.txt -X POST http://localhost:3001/auth/register \
  -H "$O" -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","password":"CorrectHorse!9batt"}'
curl -s -b jar.txt -H "$O" http://localhost:3001/auth/session
curl -s -b jar.txt -H "$O" -X POST http://localhost:3001/projects \
  -H 'content-type: application/json' -d '{"title":"Smoke lesson"}'
```

There is no `/healthz`; the route is `/health`.

### Browser

`/` is only a health stub with no links — never navigate from it. Go straight to
the route you need: `/register`, `/sign-in`, `/workspace`, or
`/workspace/<projectId>/{upload,review,configuration,objectives,outline,narration,storyboard,preview,render}`.

Playwright is a root devDependency and its Chromium is already installed. Import
from `@playwright/test`, and keep the script **inside the repo** — Node resolves
modules from the script's own location, so a driver in the system temp dir cannot
find Playwright. `.claude/skills/run-app/smoke.mjs` is a working end-to-end
driver; run it from the repo root:

```sh
node .claude/skills/run-app/smoke.mjs
```

It registers a fresh user, creates a lesson, uploads a generated PDF, waits for
ingestion to reach "ready for review", opens the review page, and screenshots
each step into `.runtime-logs/`. It exits 0 on `SMOKE PASS`, 1 otherwise, so it
works as a gate. **Look at the screenshots anyway** — a blank frame is a failed
launch, not a pass.

When polling ingestion yourself, match the status panel's sentence
`Your document is ready for review`, not a bare "ready for review" — the upload
toast reads "Source document uploaded and ready for review." and fires instantly,
which will make you call success before the worker has even claimed the job.
Failure reads `We could not finish reading your document` / `Extraction failed`
([ingestion-status-panel.tsx:125-157](../../../apps/web/app/workspace/%5BprojectId%5D/upload/ingestion-status-panel.tsx#L125-L157)).

### Watching the pipeline

Background jobs surface in the `jobs` table. The columns are `job_type` and
`state` (not `type`/`status`):

```sh
docker exec product-app-postgres-1 psql -U postgres -d visual_learning \
  -c "select job_type, state, attempts, progress, error_metadata from jobs order by created_at desc limit 8;"
```

A document upload should produce `document.validation` → `succeeded`, then
`document.ingestion` → `succeeded`. If ingestion sits in `queued`, the worker is
not running; if it fails immediately, the Python service on 8000 is down.

## Known quirks

- `Refused to set unsafe header "content-length"` in the browser console during
  upload is benign.
- `/workspace` logs a React hydration mismatch on the "Project title" input
  (`style={{caret-color:"transparent"}}` present on the client, absent from the
  SSR HTML). Pre-existing and non-fatal; `smoke.mjs` classifies it as benign
  noise. Do not treat it as a regression from your change unless the offending
  element is one you touched.
- The app shell shows a hardcoded `teacher@school.org` instead of the signed-in
  user's email on every authenticated page (`userEmail="teacher@school.org"` in
  `apps/web/app/workspace/**`). The session itself is correct — do not chase this
  as an auth bug.

## Teardown

```sh
docker compose stop          # resume later with: docker compose start
```

Use `stop`, not `down`. **Postgres declares no volume**, so its data lives in the
container's writable layer and `docker compose down` destroys the database — you
lose the schema and have to re-run migrations. Only MinIO has a named volume
(`minio-data`). Reach for `down` (or `down -v`) solely when you deliberately want
a clean slate.

Stop the Node and Python processes by PID — there are ~10, since `tsx watch` and
uvicorn each hold a parent plus a child. Filter on the repo path so you do not
kill unrelated Node processes:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe' OR Name='python.exe'" |
  Where-Object { $_.CommandLine -like '*product-app*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```
