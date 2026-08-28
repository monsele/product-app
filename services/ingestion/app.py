"""Isolated, resource-bounded Docling ingestion boundary."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from hashlib import sha256
from multiprocessing import get_context
from pathlib import Path
from queue import Empty
from tempfile import TemporaryDirectory
from time import monotonic
from typing import Any, AsyncIterator, Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json
import os
import zipfile

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from pydantic.alias_generators import to_camel


MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_PARSE_SECONDS = int(os.getenv("MAX_PARSE_SECONDS", "600"))
MAX_PARSE_MEMORY_BYTES = int(os.getenv("MAX_PARSE_MEMORY_BYTES", str(3 * 1024 * 1024 * 1024)))
MAX_PARSE_CPU_SECONDS = int(os.getenv("MAX_PARSE_CPU_SECONDS", "550"))
PARSER_VERSION = "docling-v1"


os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"


class IngestionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", alias_generator=to_camel, populate_by_name=True)

    schema_version: int = Field(default=1, ge=1, le=1)
    job_id: str = Field(min_length=36, max_length=36)
    source_document_id: str = Field(min_length=36, max_length=36)
    source_download_url: HttpUrl
    media_type: str = Field(pattern=r"^application/(pdf|vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$")
    parser_version: str = Field(min_length=1, max_length=200)
    correlation_id: str = Field(min_length=36, max_length=36)


class IngestionFailure(Exception):
    def __init__(self, code: str, classification: str):
        super().__init__(code)
        self.code = code
        self.classification = classification


class DoclingAdapter(Protocol):
    def convert(self, source_path: Path) -> tuple[dict[str, Any], str, list[str]]: ...


def classify_parser_exception(error: BaseException) -> IngestionFailure:
    """Map parser failures without returning parser or source details to callers."""
    if isinstance(error, (MemoryError, TimeoutError)):
        return IngestionFailure("RESOURCE_EXHAUSTED", "terminal")
    if isinstance(error, (zipfile.BadZipFile, EOFError, UnicodeDecodeError, ValueError)):
        return IngestionFailure("CORRUPT_SOURCE", "terminal")
    if isinstance(error, ImportError):
        return IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable")
    return IngestionFailure("PARSER_FAILED", "terminal")


def _apply_child_limits(memory_bytes: int, cpu_seconds: int) -> None:
    """Linux containers enforce hard limits; this supplies a second per-conversion guard."""
    try:
        import resource

        current_memory_limit, hard_memory_limit = resource.getrlimit(resource.RLIMIT_AS)
        effective_memory_limit = memory_bytes
        if hard_memory_limit != resource.RLIM_INFINITY:
            effective_memory_limit = min(effective_memory_limit, hard_memory_limit)
        if current_memory_limit != resource.RLIM_INFINITY:
            effective_memory_limit = min(effective_memory_limit, current_memory_limit)
        resource.setrlimit(resource.RLIMIT_AS, (effective_memory_limit, effective_memory_limit))
        current_cpu_limit, hard_cpu_limit = resource.getrlimit(resource.RLIMIT_CPU)
        effective_cpu_limit = cpu_seconds
        if hard_cpu_limit != resource.RLIM_INFINITY:
            effective_cpu_limit = min(effective_cpu_limit, hard_cpu_limit)
        if current_cpu_limit != resource.RLIM_INFINITY:
            effective_cpu_limit = min(effective_cpu_limit, current_cpu_limit)
        resource.setrlimit(resource.RLIMIT_CPU, (effective_cpu_limit, effective_cpu_limit))
    except (ImportError, OSError, ValueError):
        # The deployed service is Linux-container-only; the parent wall-clock guard
        # remains active for local Windows development.
        return


def _convert_in_child(
    source_path: str,
    memory_bytes: int,
    cpu_seconds: int,
    output: Any,
) -> None:
    try:
        _apply_child_limits(memory_bytes, cpu_seconds)
        from docling.document_converter import DocumentConverter

        result = DocumentConverter().convert(Path(source_path))
        canonical = result.document.export_to_dict()
        markdown = result.document.export_to_markdown()
        if not isinstance(canonical, dict) or not isinstance(markdown, str):
            output.put(("failure", "SCHEMA_NORMALIZATION_DEFECT", "terminal"))
            return
        output.put(("success", canonical, markdown))
    except BaseException as error:
        import traceback
        print(f"[_convert_in_child ERROR] {type(error).__name__}: {error}", flush=True)
        traceback.print_exc()
        failure = classify_parser_exception(error)
        output.put(("failure", failure.code, failure.classification))


class DefaultDoclingAdapter:
    """Runs Docling outside the API process and keeps Docling types out of the contract."""

    def __init__(
        self,
        *,
        max_parse_seconds: int = MAX_PARSE_SECONDS,
        max_memory_bytes: int = MAX_PARSE_MEMORY_BYTES,
        max_cpu_seconds: int = MAX_PARSE_CPU_SECONDS,
    ) -> None:
        if min(max_parse_seconds, max_memory_bytes, max_cpu_seconds) < 1:
            raise ValueError("Docling limits must be positive.")
        self._max_parse_seconds = max_parse_seconds
        self._max_memory_bytes = max_memory_bytes
        self._max_cpu_seconds = max_cpu_seconds

    def convert(self, source_path: Path) -> tuple[dict[str, Any], str, list[str]]:
        output = get_context("spawn").Queue(maxsize=1)
        process = get_context("spawn").Process(
            target=_convert_in_child,
            args=(str(source_path), self._max_memory_bytes, self._max_cpu_seconds, output),
            daemon=True,
        )
        try:
            process.start()
            try:
                result = output.get(timeout=self._max_parse_seconds)
            except Empty as error:
                if process.is_alive():
                    process.terminate()
                raise IngestionFailure("RESOURCE_EXHAUSTED", "terminal") from error
            if result[0] == "failure":
                raise IngestionFailure(result[1], result[2])
            return result[1], result[2], []
        except IngestionFailure:
            raise
        except (OSError, RuntimeError) as error:
            raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error
        finally:
            if process.is_alive():
                process.terminate()
            process.join()
            output.close()


DownloadSource = Callable[[str, Path], None]


def download_source(url: str, destination: Path) -> None:
    try:
        request = Request(url, headers={"User-Agent": "avlp-ingestion/1"})
        with urlopen(request, timeout=30) as response, destination.open("wb") as output:
            content_length = response.headers.get("Content-Length")
            if content_length is not None and int(content_length) > MAX_SOURCE_BYTES:
                raise IngestionFailure("RESOURCE_EXHAUSTED", "terminal")
            total = 0
            while chunk := response.read(64 * 1024):
                total += len(chunk)
                if total > MAX_SOURCE_BYTES:
                    raise IngestionFailure("RESOURCE_EXHAUSTED", "terminal")
                output.write(chunk)
    except IngestionFailure:
        raise
    except (HTTPError, URLError, TimeoutError, OSError, ValueError) as error:
        import traceback
        print(f"[download_source ERROR] {type(error).__name__}: {error}", flush=True)
        traceback.print_exc()
        raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error


def configuration_hash(parser_version: str) -> str:
    configuration = json.dumps(
        {
            "adapter": "docling",
            "maxMemoryBytes": MAX_PARSE_MEMORY_BYTES,
            "maxParseCpuSeconds": MAX_PARSE_CPU_SECONDS,
            "maxParseSeconds": MAX_PARSE_SECONDS,
            "parserVersion": parser_version,
        },
        sort_keys=True,
        separators=(",", ":"),
    )
    return sha256(configuration.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class ParsedOutput:
    canonical_json: dict[str, Any]
    markdown: str
    warnings: list[str]
    processing_time_ms: int


def parse_request(request: IngestionRequest, adapter: DoclingAdapter, downloader: DownloadSource = download_source) -> ParsedOutput:
    if request.parser_version != PARSER_VERSION:
        raise IngestionFailure("PARSER_UNSUPPORTED", "terminal")
    suffix = ".pdf" if request.media_type == "application/pdf" else ".docx"
    started_at = monotonic()
    with TemporaryDirectory(prefix="avlp-ingestion-") as workspace:
        source_path = Path(workspace) / f"source{suffix}"
        downloader(str(request.source_download_url), source_path)
        canonical_json, markdown, warnings = adapter.convert(source_path)
    return ParsedOutput(canonical_json, markdown, warnings, round((monotonic() - started_at) * 1000))


def create_app(adapter: DoclingAdapter | None = None, downloader: DownloadSource = download_source, service_token: str | None = None) -> FastAPI:
    required_token = service_token if service_token is not None else os.getenv("INGESTION_SERVICE_TOKEN")

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if not required_token:
            raise RuntimeError("INGESTION_SERVICE_TOKEN must be configured before startup.")
        yield

    app = FastAPI(title="AVLP ingestion", lifespan=lifespan)
    selected_adapter = adapter or DefaultDoclingAdapter()

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok", "service": "ingestion", "parserVersion": PARSER_VERSION}

    @app.post("/v1/ingestion-jobs")
    def ingest(request: IngestionRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
        if not required_token:
            raise HTTPException(status_code=503, detail="Ingestion service authentication is not configured.")
        if authorization != f"Bearer {required_token}":
            raise HTTPException(status_code=401, detail="Unauthorized internal caller.")
        try:
            output = parse_request(request, selected_adapter, downloader)
        except IngestionFailure as error:
            print(f"[ingest FAILED] code={error.code}, classification={error.classification}", flush=True)
            raise HTTPException(status_code=422, detail={"code": error.code, "classification": error.classification}) from error
        except Exception as error:
            import traceback
            print(f"[ingest UNEXPECTED ERROR] {type(error).__name__}: {error}", flush=True)
            traceback.print_exc()
            raise HTTPException(status_code=500, detail=str(error)) from error
        return {
            "schemaVersion": 1,
            "parserVersion": request.parser_version,
            "configurationHash": configuration_hash(request.parser_version),
            "processingTimeMs": output.processing_time_ms,
            "canonicalJson": output.canonical_json,
            "markdown": output.markdown,
            "warnings": output.warnings,
        }

    return app


app = create_app()
