# Ingestion service

This isolated Python service is the sole Docling boundary. It accepts a versioned,
internal job request at `POST /v1/ingestion-jobs`, downloads a short-lived authorized
source URL into a temporary workspace, and returns canonical Docling JSON plus Markdown.
It never writes application database rows or logs source content.

Create a virtual environment, install dependencies, and run the service:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Set `INGESTION_SERVICE_TOKEN` before starting the service. Startup fails without it;
the TypeScript worker sends it as a bearer token and stores the returned artifacts in
private object storage.

## Process model

Docling conversions run in a **long-lived child process** that is started once and
reused. Importing Docling and loading the layout and table models costs minutes on a
cold cache; the previous design spawned a fresh process per document and paid that
cost on every upload. The child is warmed in the background at startup, so the first
real upload does not sit behind the model load.

Isolation is preserved:

- The parent enforces a wall-clock budget (`MAX_PARSE_SECONDS`) per conversion. A
  conversion that exceeds it kills the worker, which is respawned on the next request.
- The child sets `RLIMIT_AS` to `MAX_PARSE_MEMORY_BYTES`.
- Docling's own `document_timeout` (`MAX_DOCUMENT_SECONDS`) bounds a single document.
  This replaces the previous `RLIMIT_CPU` guard, which measures cumulative CPU and so
  cannot bound one conversion once the process is reused.
- The worker is recycled after `DOCLING_WORKER_MAX_CONVERSIONS` documents, and
  immediately after a `MemoryError`.

Production must still run this service in a Linux container with matching container
CPU and memory limits.

## Parse settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `MAX_PARSE_SECONDS` | `600` | Parent wall clock per conversion. |
| `MAX_PARSE_MEMORY_BYTES` | `3 GiB` | Child `RLIMIT_AS`. |
| `MAX_DOCUMENT_SECONDS` | `550` | Docling per-document timeout. |
| `DOCLING_STARTUP_SECONDS` | `900` | Budget for the one-time model load. |
| `DOCLING_WORKER_MAX_CONVERSIONS` | `100` | Documents before the worker recycles. |
| `DOCLING_NUM_THREADS` | half the CPUs | Inference threads. |
| `DOCLING_OCR_MODE` | `auto` | `auto`, `always`, or `never`. |
| `DOCLING_TABLE_MODE` | `fast` | TableFormer `fast` or `accurate`. |
| `DOCLING_OCR_FALLBACK_MIN_CHARS_PER_PAGE` | `24` | Yield below which a PDF is treated as scanned. |

`DOCLING_OCR_MODE=auto` parses without OCR first. OCR is the dominant cost on a
text-layer PDF and adds nothing there. Only when the first pass yields almost no text
— a scanned document — is the document re-read with OCR, and a warning records it.

Every setting above feeds the `configurationHash` returned to the worker, so a
settings change is visible in the stored ingestion artifact.

## Warnings

`warnings` carries real findings: Docling's own `ConversionResult.errors`, a note when
OCR fallback was used, and a note when the conversion was a partial success. Messages
are redacted of filesystem paths and capped at 100 entries of 500 characters. A
`FAILURE` or `SKIPPED` conversion status is a failure, not an empty document.
