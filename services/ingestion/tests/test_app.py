import json
import importlib.util
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
import zipfile
from io import BytesIO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app import (  # noqa: E402
    IngestionFailure,
    IngestionRequest,
    DefaultDoclingAdapter,
    PARSER_VERSION,
    classify_parser_exception,
    create_app,
    parse_request,
)
from fastapi.testclient import TestClient  # noqa: E402


FIXTURE = Path(__file__).parent / "fixtures" / "docling-output.json"
DOCX_FIXTURE = Path(__file__).parent / "fixtures" / "docling-output-docx.json"
IDENTIFIER = "018d449c-5b9d-7000-8000-000000000001"


def request() -> IngestionRequest:
    return IngestionRequest(
        schemaVersion=1,
        jobId=IDENTIFIER,
        sourceDocumentId=IDENTIFIER,
        sourceDownloadUrl="https://storage.example.test/source.pdf",
        mediaType="application/pdf",
        parserVersion=PARSER_VERSION,
        correlationId=IDENTIFIER,
    )


class FixtureAdapter:
    def __init__(self) -> None:
        self.source_path: Path | None = None

    def convert(self, source_path: Path):
        self.source_path = source_path
        fixture = DOCX_FIXTURE if source_path.suffix == ".docx" else FIXTURE
        return json.loads(fixture.read_text()), "# The water cycle\n", []


def docx_fixture() -> bytes:
    contents = BytesIO()
    with zipfile.ZipFile(contents, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            """<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Default Extension=\"xml\" ContentType=\"application/xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>""",
        )
        archive.writestr(
            "_rels/.rels",
            """<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>""",
        )
        archive.writestr(
            "word/document.xml",
            """<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Water cycle</w:t></w:r></w:p><w:sectPr/></w:body></w:document>""",
        )
    return contents.getvalue()


def pdf_fixture() -> bytes:
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        b"<< /Length 44 >>\nstream\nBT /F1 18 Tf 72 720 Td (Water cycle) Tj ET\nendstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    output = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for index, content in enumerate(objects, start=1):
        offsets.append(len(output))
        output.extend(f"{index} 0 obj\n".encode())
        output.extend(content)
        output.extend(b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    output.extend(b"".join(f"{offset:010d} 00000 n \n".encode() for offset in offsets[1:]))
    output.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return bytes(output)


class IngestionServiceTests(unittest.TestCase):
    def test_recorded_fixture_is_returned_and_source_workspace_is_removed(self):
        adapter = FixtureAdapter()

        def downloader(_: str, destination: Path) -> None:
            destination.write_bytes(b"%PDF-fixture")

        output = parse_request(request(), adapter, downloader)

        self.assertEqual(output.canonical_json["version"], "fixture")
        self.assertEqual(output.markdown, "# The water cycle\n")
        self.assertIsNotNone(adapter.source_path)
        self.assertFalse(adapter.source_path.exists())
        self.assertFalse(adapter.source_path.parent.exists())

    def test_workspace_is_removed_when_parser_fails(self):
        captured: list[Path] = []

        class FailingAdapter:
            def convert(self, source_path: Path):
                captured.append(source_path)
                raise IngestionFailure("PARSER_FAILED", "terminal")

        with self.assertRaisesRegex(IngestionFailure, "PARSER_FAILED"):
            parse_request(
                request(),
                FailingAdapter(),
                lambda _, destination: destination.write_bytes(b"bad"),
            )
        self.assertFalse(captured[0].exists())
        self.assertFalse(captured[0].parent.exists())

    def test_unsupported_parser_version_is_a_terminal_failure(self):
        invalid = request().model_copy(update={"parser_version": "docling-v0"})
        with self.assertRaisesRegex(IngestionFailure, "PARSER_UNSUPPORTED"):
            parse_request(invalid, FixtureAdapter())

    def test_recorded_pdf_and_docx_fixtures_preserve_the_declared_type(self):
        for media_type, content, suffix in [
            ("application/pdf", b"%PDF-1.4\n%fixture\n", ".pdf"),
            (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                docx_fixture(),
                ".docx",
            ),
        ]:
            with self.subTest(media_type=media_type):
                adapter = FixtureAdapter()
                output = parse_request(
                    request().model_copy(update={"media_type": media_type}),
                    adapter,
                    lambda _, destination: destination.write_bytes(content),
                )
                self.assertEqual(output.canonical_json["version"], "fixture")
                self.assertTrue(str(adapter.source_path).endswith(suffix))

    def test_classifies_corrupt_and_resource_failures_without_parser_detail(self):
        corrupt = classify_parser_exception(zipfile.BadZipFile("fixture"))
        exhausted = classify_parser_exception(MemoryError())
        self.assertEqual((corrupt.code, corrupt.classification), ("CORRUPT_SOURCE", "terminal"))
        self.assertEqual((exhausted.code, exhausted.classification), ("RESOURCE_EXHAUSTED", "terminal"))

    def test_ingestion_endpoint_requires_a_configured_bearer_token(self):
        app = create_app(
            FixtureAdapter(),
            downloader=lambda _, destination: destination.write_bytes(b"%PDF-fixture"),
            service_token="test-token",
        )
        body = request().model_dump(by_alias=True, mode="json")
        with TestClient(app) as client:
            self.assertEqual(client.post("/v1/ingestion-jobs", json=body).status_code, 401)
            self.assertEqual(
                client.post(
                    "/v1/ingestion-jobs",
                    json=body,
                    headers={"authorization": "Bearer test-token"},
                ).status_code,
                200,
            )

    def test_service_refuses_to_start_without_an_internal_token(self):
        with self.assertRaisesRegex(RuntimeError, "INGESTION_SERVICE_TOKEN"):
            with TestClient(create_app(FixtureAdapter())):
                pass

    @unittest.skipUnless(importlib.util.find_spec("docling"), "Docling is not installed")
    def test_pinned_docling_parses_golden_pdf_and_docx_inputs(self):
        # The warm worker pays model load once, so only the first convert needs the
        # long startup budget; the per-conversion wall clock stays tight.
        adapter = DefaultDoclingAdapter(max_parse_seconds=180)
        self.addCleanup(adapter.shutdown)
        for media_type, content, suffix in [
            ("application/pdf", pdf_fixture(), ".pdf"),
            (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                docx_fixture(),
                ".docx",
            ),
        ]:
            with self.subTest(media_type=media_type), TemporaryDirectory() as workspace:
                source = Path(workspace) / f"fixture{suffix}"
                source.write_bytes(content)
                canonical, markdown, warnings = adapter.convert(source)
                self.assertIsInstance(canonical, dict)
                self.assertIsInstance(markdown, str)
                self.assertTrue(canonical)
                self.assertTrue(markdown.strip())
                # Warnings are now real parser findings, not a hardcoded empty list.
                self.assertIsInstance(warnings, list)
                self.assertTrue(all(isinstance(warning, str) for warning in warnings))
                self.assertLessEqual(len(warnings), 100)

    @unittest.skipUnless(importlib.util.find_spec("docling"), "Docling is not installed")
    def test_warm_worker_is_reused_across_conversions(self):
        adapter = DefaultDoclingAdapter(max_parse_seconds=180)
        self.addCleanup(adapter.shutdown)
        with TemporaryDirectory() as workspace:
            source = Path(workspace) / "fixture.pdf"
            source.write_bytes(pdf_fixture())
            adapter.convert(source)
            self.assertTrue(adapter.warm)
            first_worker = adapter._process.pid
            adapter.convert(source)
            self.assertTrue(adapter.warm)
            self.assertEqual(adapter._process.pid, first_worker)

    def test_the_configuration_hash_covers_the_parse_settings(self):
        import app as ingestion_app

        baseline = ingestion_app.configuration_hash(PARSER_VERSION)
        original = ingestion_app.DOCLING_OCR_MODE
        try:
            ingestion_app.DOCLING_OCR_MODE = "always"
            self.assertNotEqual(baseline, ingestion_app.configuration_hash(PARSER_VERSION))
        finally:
            ingestion_app.DOCLING_OCR_MODE = original
        self.assertEqual(baseline, ingestion_app.configuration_hash(PARSER_VERSION))


if __name__ == "__main__":
    unittest.main()
