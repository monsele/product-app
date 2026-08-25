# Ingestion service

This isolated Python service is the sole Docling boundary. It accepts a versioned,
internal job request at `POST /v1/ingestion-jobs`, downloads a short-lived authorized
source URL into a temporary workspace, and returns canonical Docling JSON plus Markdown.
It never writes application database rows or logs source content.

Create a virtual environment, install dependencies, and run the health service:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Set `INGESTION_SERVICE_TOKEN` before starting the service. Startup fails without it;
the TypeScript worker sends it as a bearer token and stores the returned artifacts in
private object storage. Docling conversions run in a separate process with a 120-second
wall-clock limit, a CPU limit, and a 1 GiB address-space limit; production must run this
service in a Linux container with matching container CPU and memory limits.
