import shutil
import time
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import pymupdf as fitz
import pytest
from PIL import Image, ImageDraw, ImageFont

from app.core import config
from app.core.config import libreoffice_binary
from app.core.jobs import ACTIVE, cleanup
from app.services.validation import InvalidFile, validate


def image_bytes(fmt="PNG", color="white"):
    buffer = BytesIO()
    Image.new("RGB", (100, 80), color).save(buffer, format=fmt)
    return buffer.getvalue()


def pdf_bytes(pages=2):
    doc = fitz.open()
    for number in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"FileCraft page {number + 1}")
    result = doc.tobytes()
    doc.close()
    return result


def test_config_and_health(client):
    assert client.get("/api/health").json() == {"status": "ok"}
    assert client.get("/api/config").json()["max_file_bytes"] > 0


@pytest.mark.parametrize(
    "operation,name,content",
    [
        ("ocr", "picture.png", b"not an image"),
        ("ocr", "picture.jpg", image_bytes()),
        ("images-pdf", "picture.webp", image_bytes("WEBP")),
        ("pdf-images", "document.pdf", b"not pdf"),
        ("office-pdf", "document.docx", b"not zip"),
        ("office-pdf", "document.doc", b"not ole"),
        ("ocr", "script.svg", b"<svg/>"),
        ("ocr", "empty.png", b""),
    ],
)
def test_reject_invalid_uploads(client, operation, name, content):
    response = client.post(f"/api/{operation}", files={"files": (name, content)})
    assert response.status_code == 422
    assert "detail" in response.json()
    assert str(config.TEMP_ROOT) not in response.text


def test_missing_multiple_and_options(client):
    assert client.post("/api/ocr").status_code == 422
    files = [("files", ("a.png", image_bytes())), ("files", ("b.png", image_bytes()))]
    assert client.post("/api/ocr", files=files).status_code == 422
    assert (
        client.post("/api/images-pdf", files=files, data={"page_size": "huge"}).status_code == 422
    )


def test_images_pdf_real_order_and_page_size(client):
    files = [
        ("files", ("../../red.png", image_bytes(color="red"))),
        ("files", ("blue.jpg", image_bytes("JPEG", "blue"))),
    ]
    response = client.post("/api/images-pdf", files=files, data={"page_size": "a4"})
    assert response.status_code == 200, response.text
    assert response.headers["content-type"] == "application/pdf"
    with fitz.open(stream=response.content, filetype="pdf") as doc:
        assert len(doc) == 2
        assert doc[0].rect.width == pytest.approx(595.28, abs=1)
        first = doc[0].get_pixmap()
        second = doc[1].get_pixmap()
        r, g, b = first.pixel(first.width // 2, first.height // 2)
        assert r > 200 and b < 20
        r, g, b = second.pixel(second.width // 2, second.height // 2)
        assert b > 200 and r < 20
    assert "attachment" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("fmt,signature", [("png", b"\x89PNG"), ("jpg", b"\xff\xd8")])
def test_pdf_images_real(client, fmt, signature):
    response = client.post(
        "/api/pdf-images", files={"files": ("input.pdf", pdf_bytes())}, data={"image_format": fmt}
    )
    assert response.status_code == 200, response.text
    with ZipFile(BytesIO(response.content)) as archive:
        assert archive.namelist() == [f"page-001.{fmt}", f"page-002.{fmt}"]
        assert archive.read(archive.namelist()[0]).startswith(signature)


def test_file_and_body_limits(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_FILE_BYTES", 5)
    assert client.post("/api/ocr", files={"files": ("x.png", image_bytes())}).status_code == 413
    monkeypatch.setattr(config, "MAX_REQUEST_BYTES", 10)
    assert client.post("/api/ocr", content=b"a" * 11).status_code == 413


def test_unlocked_pdf_page_limit(tmp_path, monkeypatch):
    path = tmp_path / "large.pdf"
    path.write_bytes(pdf_bytes(2))
    monkeypatch.setattr("app.services.validation.MAX_PAGES", 1)
    with pytest.raises(InvalidFile, match="page limit"):
        validate(path, "pdf-images")


def test_oversized_pixels(tmp_path, monkeypatch):
    path = tmp_path / "image.png"
    path.write_bytes(image_bytes())
    monkeypatch.setattr("app.services.validation.MAX_PIXELS", 100)
    with pytest.raises(InvalidFile, match="too large"):
        validate(path, "ocr")


def test_office_extension_content_mismatch(tmp_path):
    path = tmp_path / "fake.docx"
    with ZipFile(path, "w") as archive:
        archive.writestr("[Content_Types].xml", "<Types/>")
        archive.writestr("word/document.xml", "<wrong/>")
    with pytest.raises(InvalidFile):
        validate(path, "office-pdf")


def test_cleanup_abandoned_excludes_active(client):
    import os

    abandoned = config.TEMP_ROOT / "job-abandoned"
    active = config.TEMP_ROOT / "job-active"
    for path in [abandoned, active]:
        path.mkdir()
        os.utime(path, (time.time() - config.RETENTION - 5,) * 2)
    ACTIVE.add(active)
    try:
        cleanup()
        assert not abandoned.exists()
        assert active.exists()
    finally:
        ACTIVE.discard(active)
        active.rmdir()


def test_worker_timeout_cleans_up(client, monkeypatch):
    monkeypatch.setattr(config, "TIMEOUT", 0.001)
    response = client.post("/api/images-pdf", files={"files": ("x.png", image_bytes())})
    assert response.status_code == 504


def test_busy_limit(client, monkeypatch):
    monkeypatch.setattr(config, "CONCURRENT", 0)
    assert client.post("/api/ocr", files={"files": ("x.png", image_bytes())}).status_code == 429


def test_cors_on_error(client):
    response = client.post("/api/ocr", headers={"Origin": "http://localhost:3000"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:3000"


@pytest.mark.skipif(
    not (shutil.which("tesseract") or __import__("os").getenv("TESSERACT_BINARY")),
    reason="Tesseract executable not installed",
)
def test_real_ocr_and_no_text(client):
    buffer = BytesIO()
    im = Image.new("RGB", (1000, 200), "white")
    font_path = (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
        if Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf").exists()
        else "C:/Windows/Fonts/arial.ttf"
    )
    ImageDraw.Draw(im).text(
        (30, 45), "FILECRAFT HELLO WORLD", font=ImageFont.truetype(font_path, 48), fill="black"
    )
    im.save(buffer, format="PNG")
    response = client.post("/api/ocr", files={"files": ("text.png", buffer.getvalue())})
    assert response.status_code == 200
    assert "HELLO WORLD" in response.json()["text"]
    response = client.post("/api/ocr", files={"files": ("blank.png", image_bytes())})
    assert response.status_code == 200
    assert response.json()["text"] == ""


@pytest.mark.skipif(
    not shutil.which(libreoffice_binary()), reason="LibreOffice executable not installed"
)
def test_real_office_conversion(client):
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            "_rels/.rels",
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr(
            "word/document.xml",
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>FileCraft Office conversion</w:t></w:r></w:p></w:body></w:document>',
        )
    response = client.post("/api/office-pdf", files={"files": ("sample.docx", buffer.getvalue())})
    assert response.status_code == 200, response.text
    with fitz.open(stream=response.content, filetype="pdf") as doc:
        assert "FileCraft" in doc[0].get_text()


@pytest.mark.skipif(
    __import__("os").getenv("RUN_REMBG_TEST") != "1",
    reason="Set RUN_REMBG_TEST=1 to download/load the real model",
)
def test_real_background_removal(client):
    response = client.post(
        "/api/remove-background", files={"files": ("subject.png", image_bytes())}
    )
    assert response.status_code == 200, response.text
    with Image.open(BytesIO(response.content)) as im:
        assert im.format == "PNG" and im.mode == "RGBA"
        assert im.getchannel("A").getextrema()[0] < 255


def test_missing_system_dependency_is_service_error(client, monkeypatch):
    monkeypatch.setenv("TESSERACT_BINARY", "filecraft-nonexistent-tesseract")
    response = client.post("/api/ocr", files={"files": ("valid.png", image_bytes())})
    assert response.status_code == 503
    assert "dependency" in response.json()["detail"]
    assert "filecraft-nonexistent" not in response.text


def test_chunked_multipart_body_limit(client, monkeypatch):
    monkeypatch.setattr(config, "MAX_REQUEST_BYTES", 100)
    body = (
        b'--boundary\r\nContent-Disposition: form-data; name="files"; filename="x.png"\r\nContent-Type: image/png\r\n\r\n'
        + image_bytes()
        + b"\r\n--boundary--\r\n"
    )
    response = client.post(
        "/api/ocr",
        content=iter([body[:80], body[80:]]),
        headers={"Content-Type": "multipart/form-data; boundary=boundary"},
    )
    assert response.status_code == 413


def test_pdf_total_render_limit(tmp_path, monkeypatch):
    path = tmp_path / "pages.pdf"
    path.write_bytes(pdf_bytes())
    monkeypatch.setattr("app.services.validation.MAX_RENDER_PIXELS", 100)
    with pytest.raises(InvalidFile, match="too large to render"):
        validate(path, "pdf-images")
