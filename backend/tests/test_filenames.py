from urllib.parse import unquote

import pytest
from test_tools import image_bytes, pdf_bytes

from app.core.filenames import download_name


@pytest.mark.parametrize(
    "original, extension, expected",
    [
        ("Annual Report.pdf", "docx", "Annual Report.docx"),
        ("Budget.final.DOCX", "pdf", "Budget.final.pdf"),
        ("résumé 2026.pdf", "docx", "résumé 2026.docx"),
        ("../../private/photo.jpg", "png", "photo.png"),
        (r"C:\private\photo.jpg", "pdf", "photo.pdf"),
        ("bad\r\nname.pdf", "docx", "bad__name.docx"),
        (".pdf", "docx", "filecraft.docx"),
    ],
)
def test_download_names_preserve_safe_stems(original, extension, expected):
    assert download_name(original, extension) == expected


def test_images_pdf_uses_first_image_name(client):
    response = client.post(
        "/api/images-pdf",
        files=[
            ("files", ("Holiday.final.png", image_bytes())),
            ("files", ("second.png", image_bytes())),
        ],
    )
    assert response.status_code == 200
    assert 'filename="Holiday.final.pdf"' in response.headers["content-disposition"]


def test_pdf_zip_preserves_unicode_name(client):
    response = client.post("/api/pdf-images", files={"files": ("résumé 2026.pdf", pdf_bytes(1))})
    assert response.status_code == 200
    assert "filename*=utf-8''" in response.headers["content-disposition"]
    assert "résumé 2026.zip" in unquote(response.headers["content-disposition"])
