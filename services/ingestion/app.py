"""Isolated, resource-bounded Docling ingestion boundary."""

from __future__ import annotations

from contextlib import asynccontextmanager
from dataclasses import dataclass
from hashlib import sha256
from multiprocessing import get_context
from pathlib import Path
from queue import Empty
from tempfile import TemporaryDirectory
from threading import Lock, Thread
from time import monotonic
from typing import Any, AsyncIterator, Callable, Protocol
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import json
import os
import re
import zipfile

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from pydantic.alias_generators import to_camel


MAX_SOURCE_BYTES = 25 * 1024 * 1024
MAX_PARSE_SECONDS = int(os.getenv("MAX_PARSE_SECONDS", "600"))
MAX_PARSE_MEMORY_BYTES = int(os.getenv("MAX_PARSE_MEMORY_BYTES", str(3 * 1024 * 1024 * 1024)))
# Per-document budget enforced inside Docling. It replaces the previous cumulative
# RLIMIT_CPU guard, which cannot bound a single conversion once the worker is reused.
MAX_DOCUMENT_SECONDS = int(os.getenv("MAX_DOCUMENT_SECONDS", os.getenv("MAX_PARSE_CPU_SECONDS", "550")))
# Model import plus layout/table weight loading is minutes-long on a cold cache.
WORKER_STARTUP_SECONDS = int(os.getenv("DOCLING_STARTUP_SECONDS", "900"))
# Recycling bounds native-allocator growth across a long-lived worker.
WORKER_MAX_CONVERSIONS = int(os.getenv("DOCLING_WORKER_MAX_CONVERSIONS", "100"))
DOCLING_NUM_THREADS = int(os.getenv("DOCLING_NUM_THREADS", str(max(1, (os.cpu_count() or 4) // 2))))
# "auto" parses without OCR and only re-parses scanned pages; "always"/"never" pin it.
DOCLING_OCR_MODE = os.getenv("DOCLING_OCR_MODE", "auto").strip().lower()
DOCLING_TABLE_MODE = os.getenv("DOCLING_TABLE_MODE", "fast").strip().lower()
# Below this average yield a PDF is treated as scanned rather than text-bearing.
OCR_FALLBACK_MIN_CHARS_PER_PAGE = int(os.getenv("DOCLING_OCR_FALLBACK_MIN_CHARS_PER_PAGE", "24"))
PARSER_VERSION = "docling-v1"

MAX_WARNINGS = 100
MAX_WARNING_LENGTH = 500


os.environ["HF_HUB_DISABLE_SYMLINKS_WARNING"] = "1"
os.environ.setdefault("OMP_NUM_THREADS", str(DOCLING_NUM_THREADS))


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


def worker_configuration() -> dict[str, Any]:
    """The parse settings that decide output; also the configuration-hash input."""
    return {
        "documentTimeoutSeconds": MAX_DOCUMENT_SECONDS,
        "numThreads": DOCLING_NUM_THREADS,
        "ocrFallbackMinCharsPerPage": OCR_FALLBACK_MIN_CHARS_PER_PAGE,
        "ocrMode": DOCLING_OCR_MODE,
        "tableMode": DOCLING_TABLE_MODE,
    }


def classify_parser_exception(error: BaseException) -> IngestionFailure:
    """Map parser failures without returning parser or source details to callers."""
    if isinstance(error, (MemoryError, TimeoutError)):
        return IngestionFailure("RESOURCE_EXHAUSTED", "terminal")
    if isinstance(error, (zipfile.BadZipFile, EOFError, UnicodeDecodeError, ValueError)):
        return IngestionFailure("CORRUPT_SOURCE", "terminal")
    if isinstance(error, ImportError):
        return IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable")
    return IngestionFailure("PARSER_FAILED", "terminal")


def _apply_child_memory_limit(memory_bytes: int) -> None:
    """Linux containers enforce hard limits; this supplies a second per-worker guard."""
    try:
        import resource

        current_limit, hard_limit = resource.getrlimit(resource.RLIMIT_AS)
        effective = memory_bytes
        if hard_limit != resource.RLIM_INFINITY:
            effective = min(effective, hard_limit)
        if current_limit != resource.RLIM_INFINITY:
            effective = min(effective, current_limit)
        resource.setrlimit(resource.RLIMIT_AS, (effective, effective))
    except (ImportError, OSError, ValueError):
        # The deployed service is Linux-container-only; the parent wall-clock guard
        # remains active for local Windows development.
        return


def _redact(message: str, workspace: str | None) -> str:
    """Parser messages may quote the temporary workspace path; never return it."""
    cleaned = message.replace("\n", " ").replace("\r", " ").strip()
    if workspace:
        cleaned = cleaned.replace(workspace, "<source>")
    cleaned = re.sub(r"[A-Za-z]:[\/][^\s\"']+|/(?:tmp|var|home|Users)/[^\s\"']+", "<path>", cleaned)
    return cleaned[:MAX_WARNING_LENGTH]


def _build_converter(*, ocr: bool):
    from docling.datamodel.base_models import InputFormat
    from docling.datamodel.accelerator_options import AcceleratorOptions
    from docling.datamodel.pipeline_options import (
        PdfPipelineOptions,
        TableFormerMode,
        TableStructureOptions,
    )
    from docling.document_converter import DocumentConverter, PdfFormatOption

    pipeline_options = PdfPipelineOptions(
        do_ocr=ocr,
        do_table_structure=True,
        table_structure_options=TableStructureOptions(
            mode=TableFormerMode.ACCURATE
            if DOCLING_TABLE_MODE == "accurate"
            else TableFormerMode.FAST,
            do_cell_matching=True,
        ),
        # Figures are only extractable downstream when their bytes are embedded.
        generate_picture_images=True,
        generate_page_images=False,
        images_scale=1.0,
        document_timeout=float(MAX_DOCUMENT_SECONDS),
        accelerator_options=AcceleratorOptions(num_threads=DOCLING_NUM_THREADS),
    )
    # Restricting formats avoids constructing backends and pipelines we never accept.
    return DocumentConverter(
        allowed_formats=[InputFormat.PDF, InputFormat.DOCX],
        format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)},
    )


def _worker_main(memory_bytes: int, requests: Any, responses: Any) -> None:
    """Long-lived child: builds Docling once, then serves conversions from a queue."""
    try:
        _apply_child_memory_limit(memory_bytes)
        import logging

        # Docling's per-page INFO chatter is noise on a service boundary.
        logging.getLogger("docling").setLevel(logging.WARNING)
        logging.getLogger("RapidOCR").setLevel(logging.WARNING)

        from docling.datamodel.base_models import ConversionStatus, InputFormat

        converters: dict[bool, Any] = {}

        def converter(ocr: bool) -> Any:
            if ocr not in converters:
                converters[ocr] = _build_converter(ocr=ocr)
            return converters[ocr]

        # Pay the model import and weight load once, before the first real request.
        converter(False).initialize_pipeline(InputFormat.PDF)
        responses.put({"kind": "ready"})
    except BaseException as error:  # noqa: BLE001 - startup diagnostics only
        responses.put({"kind": "fatal", "detail": type(error).__name__})
        return

    while True:
        message = requests.get()
        if message is None:
            return
        source_path = message["sourcePath"]
        workspace = message.get("workspace")
        try:
            warnings: list[str] = []

            def run(ocr: bool) -> tuple[dict[str, Any], str, Any]:
                result = converter(ocr).convert(Path(source_path))
                if result.status in (ConversionStatus.FAILURE, ConversionStatus.SKIPPED):
                    raise RuntimeError(f"Docling reported {result.status.value}.")
                return result.document.export_to_dict(), result.document.export_to_markdown(), result

            canonical, markdown, result = run(DOCLING_OCR_MODE == "always")
            if DOCLING_OCR_MODE == "auto" and Path(source_path).suffix.lower() == ".pdf":
                pages = max(1, len(canonical.get("pages") or {}))
                # A text-layer PDF yields text on the cheap pass; a scan yields almost none.
                if len(markdown.strip()) < OCR_FALLBACK_MIN_CHARS_PER_PAGE * pages:
                    warnings.append(
                        "The document had little machine-readable text, so it was re-read with OCR."
                    )
                    canonical, markdown, result = run(True)

            if not isinstance(canonical, dict) or not isinstance(markdown, str):
                responses.put(
                    {"kind": "failure", "code": "SCHEMA_NORMALIZATION_DEFECT", "classification": "terminal"}
                )
                continue
            for item in getattr(result, "errors", []) or []:
                if len(warnings) >= MAX_WARNINGS:
                    break
                page = getattr(item, "page_no", None)
                where = f"page {page}: " if isinstance(page, int) and page > 0 else ""
                warnings.append(
                    _redact(f"{where}{getattr(item, 'error_message', 'Parser reported an issue.')}", workspace)
                )
            if result.status == ConversionStatus.PARTIAL_SUCCESS and len(warnings) < MAX_WARNINGS:
                warnings.append("Some parts of the document could not be read and were skipped.")
            responses.put(
                {
                    "kind": "success",
                    "canonical": canonical,
                    "markdown": markdown,
                    "warnings": warnings[:MAX_WARNINGS],
                }
            )
        except BaseException as error:  # noqa: BLE001 - classified, never leaked verbatim
            failure = classify_parser_exception(error)
            responses.put(
                {
                    "kind": "failure",
                    "code": failure.code,
                    "classification": failure.classification,
                    "recycle": isinstance(error, MemoryError),
                }
            )


class DefaultDoclingAdapter:
    """Keeps one warm Docling worker so model load is paid once, not per document."""

    def __init__(
        self,
        *,
        max_parse_seconds: int = MAX_PARSE_SECONDS,
        max_memory_bytes: int = MAX_PARSE_MEMORY_BYTES,
        startup_seconds: int = WORKER_STARTUP_SECONDS,
        max_conversions: int = WORKER_MAX_CONVERSIONS,
    ) -> None:
        if min(max_parse_seconds, max_memory_bytes, startup_seconds, max_conversions) < 1:
            raise ValueError("Docling limits must be positive.")
        self._max_parse_seconds = max_parse_seconds
        self._max_memory_bytes = max_memory_bytes
        self._startup_seconds = startup_seconds
        self._max_conversions = max_conversions
        self._lock = Lock()
        self._process: Any = None
        self._requests: Any = None
        self._responses: Any = None
        self._conversions = 0

    @property
    def warm(self) -> bool:
        return self._process is not None and self._process.is_alive()

    def _stop(self) -> None:
        process, requests, responses = self._process, self._requests, self._responses
        self._process = self._requests = self._responses = None
        self._conversions = 0
        if process is None:
            return
        try:
            if process.is_alive():
                process.terminate()
            process.join(timeout=10)
        except (OSError, ValueError):
            pass
        for queue in (requests, responses):
            try:
                queue.close()
            except (OSError, ValueError, AttributeError):
                pass

    def _start(self) -> None:
        if self.warm:
            return
        self._stop()
        context = get_context("spawn")
        self._requests = context.Queue()
        self._responses = context.Queue()
        self._process = context.Process(
            target=_worker_main,
            args=(self._max_memory_bytes, self._requests, self._responses),
            daemon=True,
        )
        try:
            self._process.start()
            ready = self._responses.get(timeout=self._startup_seconds)
        except Empty as error:
            self._stop()
            raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error
        except Exception as error:
            # A worker that cannot be started is an infrastructure fault, never a
            # 500 that leaks the reason to the calling worker.
            self._stop()
            raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error
        if ready.get("kind") != "ready":
            self._stop()
            raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable")

    def prewarm(self) -> None:
        """Load models before the first upload rather than inside its latency budget."""
        with self._lock:
            try:
                self._start()
            except IngestionFailure:
                return

    def shutdown(self) -> None:
        with self._lock:
            if self._requests is not None:
                try:
                    self._requests.put(None)
                except (OSError, ValueError):
                    pass
            self._stop()

    def convert(self, source_path: Path) -> tuple[dict[str, Any], str, list[str]]:
        with self._lock:
            self._start()
            try:
                self._requests.put(
                    {"sourcePath": str(source_path), "workspace": str(source_path.parent)}
                )
                message = self._responses.get(timeout=self._max_parse_seconds)
            except Empty as error:
                # A conversion past its wall clock cannot be cancelled in place.
                self._stop()
                raise IngestionFailure("RESOURCE_EXHAUSTED", "terminal") from error
            except IngestionFailure:
                raise
            except Exception as error:
                self._stop()
                raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error
            self._conversions += 1
            if message.get("kind") == "failure":
                if message.get("recycle"):
                    self._stop()
                raise IngestionFailure(message["code"], message["classification"])
            if message.get("kind") != "success":
                self._stop()
                raise IngestionFailure("PARSER_FAILED", "terminal")
            if self._conversions >= self._max_conversions:
                self._stop()
            return message["canonical"], message["markdown"], list(message["warnings"])


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
        print(f"[download_source FAILED] {type(error).__name__}", flush=True)
        raise IngestionFailure("TEMPORARY_INFRASTRUCTURE", "retryable") from error


def configuration_hash(parser_version: str) -> str:
    configuration = json.dumps(
        {
            "adapter": "docling",
            "maxMemoryBytes": MAX_PARSE_MEMORY_BYTES,
            "maxParseSeconds": MAX_PARSE_SECONDS,
            "parserVersion": parser_version,
            **worker_configuration(),
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
    return ParsedOutput(
        canonical_json,
        markdown,
        [warning[:MAX_WARNING_LENGTH] for warning in warnings][:MAX_WARNINGS],
        round((monotonic() - started_at) * 1000),
    )


def create_app(adapter: DoclingAdapter | None = None, downloader: DownloadSource = download_source, service_token: str | None = None) -> FastAPI:
    required_token = service_token if service_token is not None else os.getenv("INGESTION_SERVICE_TOKEN")
    selected_adapter = adapter or DefaultDoclingAdapter()

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if not required_token:
            raise RuntimeError("INGESTION_SERVICE_TOKEN must be configured before startup.")
        prewarm = getattr(selected_adapter, "prewarm", None)
        # Warming off the event loop keeps the port bound while models load.
        if callable(prewarm):
            Thread(target=prewarm, name="docling-prewarm", daemon=True).start()
        try:
            yield
        finally:
            shutdown = getattr(selected_adapter, "shutdown", None)
            if callable(shutdown):
                shutdown()

    app = FastAPI(title="AVLP ingestion", lifespan=lifespan)

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": "ingestion",
            "parserVersion": PARSER_VERSION,
            "warm": bool(getattr(selected_adapter, "warm", True)),
            "configuration": worker_configuration(),
        }

    @app.post("/v1/ingestion-jobs")
    def ingest(request: IngestionRequest, authorization: str | None = Header(default=None)) -> dict[str, Any]:
        if not required_token:
            raise HTTPException(status_code=503, detail="Ingestion service authentication is not configured.")
        if authorization != f"Bearer {required_token}":
            raise HTTPException(status_code=401, detail="Unauthorized internal caller.")
        try:
            output = parse_request(request, selected_adapter, downloader)
        except IngestionFailure as error:
            print(f"[ingest FAILED] code={error.code} classification={error.classification}", flush=True)
            raise HTTPException(status_code=422, detail={"code": error.code, "classification": error.classification}) from error
        except Exception as error:
            print(f"[ingest UNEXPECTED] {type(error).__name__}", flush=True)
            raise HTTPException(status_code=500, detail="Ingestion failed unexpectedly.") from error
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
