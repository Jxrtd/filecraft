"""Real conversion tests: inspect editable DOCX XML and round-trip through LibreOffice."""

import shutil
import xml.etree.ElementTree as ET
from io import BytesIO
from zipfile import ZipFile

import pymupdf
import pytest
from docx import Document

from app.core.config import libreoffice_binary


def sample_pdf():
    doc = pymupdf.open()
    for number in range(2):
        page = doc.new_page()
        page.insert_text((72, 72), f"Editable FileCraft page {number + 1}", fontsize=18)
        page.insert_text((72, 110), "A real paragraph that should survive PDF to Word.")
    data = doc.tobytes()
    doc.close()
    return data


def editable_text(data):
    with ZipFile(BytesIO(data)) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
        return " ".join(root.itertext())


def test_pdf_to_word_real_editable_multi_page(client):
    response = client.post("/api/pdf-word", files={"files": ("../../source.pdf", sample_pdf())})
    assert response.status_code == 200, response.text
    assert (
        response.headers["content-type"]
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    assert "source.docx" in response.headers["content-disposition"]
    assert response.headers["cache-control"] == "no-store"
    text = editable_text(response.content)
    assert "Editable FileCraft page 1" in text
    assert "Editable FileCraft page 2" in text
    assert "A real paragraph" in text
    doc = Document(BytesIO(response.content))
    doc.add_paragraph("I can edit this document.")
    edited = BytesIO()
    doc.save(edited)
    assert "I can edit this document." in editable_text(edited.getvalue())


@pytest.mark.parametrize(
    "name, data", [("fake.pdf", b"not a PDF"), ("image.png", b"not a PDF"), ("empty.pdf", b"")]
)
def test_pdf_word_rejects_bad_inputs(client, name, data):
    response = client.post("/api/pdf-word", files={"files": (name, data)})
    assert response.status_code == 422


def test_pdf_word_rejects_image_only_pdf(client):
    image = BytesIO()
    from PIL import Image

    Image.new("RGB", (100, 100), "red").save(image, format="PNG")
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_image(page.rect, stream=image.getvalue())
    response = client.post("/api/pdf-word", files={"files": ("scan.pdf", doc.tobytes())})
    doc.close()
    assert response.status_code == 422
    assert "OCR" in response.json()["detail"]


def test_pdf_word_rejects_encrypted_pdf(client):
    doc = pymupdf.open(stream=sample_pdf(), filetype="pdf")
    encrypted = doc.tobytes(
        encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner", user_pw="secret"
    )
    doc.close()
    response = client.post("/api/pdf-word", files={"files": ("locked.pdf", encrypted)})
    assert response.status_code == 422
    assert "unlocked" in response.json()["detail"]


def test_word_to_pdf_rejects_other_office_types(client):
    response = client.post("/api/word-pdf", files={"files": ("spreadsheet.xlsx", b"fake")})
    assert response.status_code == 422


def office_available():
    return shutil.which(libreoffice_binary()) is not None


@pytest.mark.skipif(not office_available(), reason="LibreOffice executable not installed")
def test_real_word_pdf_word_round_trip(client):
    document = Document()
    document.add_heading("FileCraft Word conversion", 0)
    document.add_paragraph("A Word document becomes a PDF and editable Word again.")
    buffer = BytesIO()
    document.save(buffer)
    response = client.post("/api/word-pdf", files={"files": ("original.docx", buffer.getvalue())})
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as pdf:
        assert "FileCraft Word conversion" in "".join(page.get_text() for page in pdf)
    restored = client.post("/api/pdf-word", files={"files": ("converted.pdf", response.content)})
    assert restored.status_code == 200, restored.text
    assert "FileCraft Word conversion" in editable_text(restored.content)


@pytest.mark.skipif(not office_available(), reason="LibreOffice executable not installed")
def test_concurrent_word_conversions_are_isolated(client):
    from concurrent.futures import ThreadPoolExecutor

    def convert(label):
        document = Document()
        document.add_paragraph(label)
        buffer = BytesIO()
        document.save(buffer)
        response = client.post(
            "/api/word-pdf", files={"files": ("same-name.docx", buffer.getvalue())}
        )
        assert response.status_code == 200, response.text
        with pymupdf.open(stream=response.content, filetype="pdf") as pdf:
            return "".join(page.get_text() for page in pdf)

    labels = ["First isolated document", "Second isolated document"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(convert, labels))
    for index, text in enumerate(results):
        assert labels[index] in text
        assert labels[1 - index] not in text
