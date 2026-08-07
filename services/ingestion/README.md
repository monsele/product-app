# Ingestion service

This isolated Python service reserves the Docling boundary; no document parsing is implemented yet.

Create a virtual environment, install dependencies, and run the health service:

```sh
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

`GET /health` returns `{"status":"ok","service":"ingestion"}`.
