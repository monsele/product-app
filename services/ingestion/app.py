"""Isolated Docling ingestion service placeholder; parsing begins in ST-033."""

from fastapi import FastAPI

app = FastAPI(title="AVLP ingestion")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "ingestion"}
