"""Exercise direct PDF modification and merging with real PDF bytes."""

import json
from io import BytesIO

import pymupdf
import pytest
from PIL import Image


def make_pdf(labels, rotation=0):
    with pymupdf.open() as document:
        for label in labels:
            page = document.new_page()
            page.insert_text((72, 72), label, fontsize=16)
            page.set_rotation(rotation)
        return document.tobytes()


def edit_request(client, content=None, pages=None, edits=None):
    return client.post(
        "/api/pdf-edit",
        files={"files": ("Original.pdf", content or make_pdf(["ORIGINAL", "SECOND", "THIRD"]))},
        data={
            "pages": json.dumps(pages if pages is not None else [0]),
            "edits": json.dumps(edits if edits is not None else []),
        },
    )


def test_merge_real_order_and_original_name(client):
    response = client.post(
        "/api/pdf-merge",
        files=[
            ("files", ("First.pdf", make_pdf(["FIRST", "SECOND"]))),
            ("files", ("Other.pdf", make_pdf(["THIRD"]))),
        ],
    )
    assert response.status_code == 200, response.text
    assert 'filename="First.pdf"' in response.headers["content-disposition"]
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        assert [page.get_text().strip() for page in document] == ["FIRST", "SECOND", "THIRD"]


def test_merge_requires_multiple_valid_pdfs(client):
    assert (
        client.post("/api/pdf-merge", files={"files": ("one.pdf", make_pdf(["ONE"]))}).status_code
        == 422
    )
    response = client.post(
        "/api/pdf-merge",
        files=[("files", ("one.pdf", make_pdf(["ONE"]))), ("files", ("bad.pdf", b"fake pdf"))],
    )
    assert response.status_code == 422


def test_merge_combined_page_limit(client, monkeypatch):
    monkeypatch.setenv("MAX_PAGES", "2")
    response = client.post(
        "/api/pdf-merge",
        files=[
            ("files", ("one.pdf", make_pdf(["ONE", "TWO"]))),
            ("files", ("two.pdf", make_pdf(["THREE"]))),
        ],
    )
    assert response.status_code == 422
    assert "page limit" in response.json()["detail"]


def test_edit_reorder_and_delete_pages(client):
    response = edit_request(client, pages=[2, 0])
    assert response.status_code == 200, response.text
    assert 'filename="Original.pdf"' in response.headers["content-disposition"]
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        assert [page.get_text().strip() for page in document] == ["THIRD", "ORIGINAL"]


def test_add_unicode_text_and_highlight(client):
    edits = [
        {
            "page": 0,
            "kind": "text",
            "rect": [0.1, 0.2, 0.9, 0.4],
            "text": "New editable résumé",
            "font_size": 18,
        },
        {"page": 0, "kind": "highlight", "rect": [0.1, 0.05, 0.6, 0.12], "color": "#e3b735"},
    ]
    response = edit_request(client, edits=edits)
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        page = document[0]
        assert "ORIGINAL" in page.get_text()
        assert "New editable résumé" in page.get_text()
        assert len(list(page.annots())) == 1
        assert not page.get_images(), "The page must not be rasterized"


def test_replace_existing_text_without_converting(client):
    response = edit_request(
        client,
        edits=[
            {
                "page": 0,
                "kind": "replace",
                "rect": [0.08, 0.04, 0.85, 0.14],
                "text": "REPLACEMENT",
                "font_size": 16,
            }
        ],
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        assert "REPLACEMENT" in document[0].get_text()
        assert "ORIGINAL" not in document[0].get_text()


@pytest.mark.parametrize("rotation", [90, 180, 270])
def test_edit_rotated_pdf_coordinates(client, rotation):
    response = edit_request(
        client,
        content=make_pdf(["SOURCE"], rotation),
        edits=[
            {
                "page": 0,
                "kind": "text",
                "rect": [0.15, 0.2, 0.8, 0.5],
                "text": "Rotated page addition",
            }
        ],
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        page = document[0]
        assert page.rotation == rotation
        words = [word for word in page.get_text("words") if word[4] == "Rotated"]
        assert words
        visible = pymupdf.Rect(words[0][:4]) * page.rotation_matrix
        assert visible.x0 >= page.rect.width * 0.14
        assert visible.y0 >= page.rect.height * 0.19


@pytest.mark.parametrize(
    "pages,edits",
    [
        ([], []),
        ([99], []),
        ([0, 0], []),
        ([True], []),
        ([0], [{"page": 1, "kind": "text", "rect": [0.1, 0.1, 0.9, 0.2], "text": "missing page"}]),
        ([0], [{"page": 0, "kind": "text", "rect": [0.8, 0.1, 0.2, 0.3], "text": "bad rectangle"}]),
        ([0], [{"page": 0, "kind": "text", "rect": [-1, 0.1, 0.9, 0.2], "text": "out of bounds"}]),
        (
            [0],
            [
                {
                    "page": 0,
                    "kind": "text",
                    "rect": [0.1, 0.1, 0.9, 0.2],
                    "text": "bad font",
                    "font_size": 999,
                }
            ],
        ),
        ([0], [{"page": 0, "kind": "unknown", "rect": [0.1, 0.1, 0.9, 0.2]}]),
        (
            [0],
            [
                {
                    "page": 0,
                    "kind": "text",
                    "rect": [0.1, 0.1, 0.9, 0.2],
                    "text": "bad color",
                    "color": "url(evil)",
                }
            ],
        ),
    ],
)
def test_reject_invalid_edit_metadata(client, pages, edits):
    response = edit_request(client, pages=pages, edits=edits)
    assert response.status_code == 422
    assert "detail" in response.json()


def test_text_that_does_not_fit_is_rejected(client):
    response = edit_request(
        client,
        edits=[
            {
                "page": 0,
                "kind": "text",
                "rect": [0.1, 0.1, 0.11, 0.11],
                "text": "This cannot fit",
                "font_size": 72,
            }
        ],
    )
    assert response.status_code == 422
    assert "fit" in response.json()["detail"]


def test_merge_preserves_images_annotations_and_widgets(client):
    image = BytesIO()
    Image.new("RGB", (40, 40), "red").save(image, format="PNG")
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_image(pymupdf.Rect(20, 20, 60, 60), stream=image.getvalue())
        page.add_text_annot((80, 80), "Keep this note")
        widget = pymupdf.Widget()
        widget.field_name = "example"
        widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
        widget.rect = pymupdf.Rect(100, 100, 200, 130)
        widget.field_value = "Form value"
        page.add_widget(widget)
        original = document.tobytes()
    response = client.post(
        "/api/pdf-merge",
        files=[("files", ("form.pdf", original)), ("files", ("second.pdf", make_pdf(["SECOND"])))],
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        assert document[0].get_images()
        assert list(document[0].annots())[0].info["content"] == "Keep this note"
        assert list(document[0].widgets())[0].field_value == "Form value"


def test_replace_does_not_apply_unrelated_pending_redactions(client):
    with pymupdf.open(stream=make_pdf(["ORIGINAL"]), filetype="pdf") as document:
        document[0].add_redact_annot(pymupdf.Rect(50, 50, 200, 90))
        content = document.tobytes()
    response = edit_request(
        client,
        content=content,
        edits=[{"page": 0, "kind": "replace", "rect": [0.1, 0.2, 0.8, 0.4], "text": "Replacement"}],
    )
    assert response.status_code == 422
    assert "pending redactions" in response.json()["detail"]


def test_document_formatting_survives_pdf_export(client):
    response = edit_request(
        client,
        edits=[
            {
                "page": 0,
                "kind": "text",
                "rect": [0.1, 0.2, 0.9, 0.4],
                "text": "Styled document text",
                "font_size": 20,
                "font_family": "serif",
                "bold": True,
                "italic": True,
                "underline": True,
                "align": "center",
                "color": "#cc2200",
            }
        ],
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        page = document[0]
        spans = [
            span
            for block in page.get_text("dict")["blocks"]
            if "lines" in block
            for line in block["lines"]
            for span in line["spans"]
            if "Styled" in span["text"]
        ]
        assert spans
        span = spans[0]
        assert span["flags"] & pymupdf.TEXT_FONT_BOLD
        assert span["flags"] & pymupdf.TEXT_FONT_ITALIC
        assert span["size"] == pytest.approx(20, abs=0.2)
        assert span["color"] == 0xCC2200
        assert span["bbox"][0] > page.rect.width * 0.15, "Text should be centered inside its box"
        assert page.get_drawings(), "Underline should be drawn in the saved PDF"


def test_replacement_source_rectangle_does_not_erase_neighboring_text(client):
    with pymupdf.open() as document:
        page = document.new_page()
        page.insert_text((72, 72), "REPLACE ME", fontsize=16)
        page.insert_text((72, 115), "KEEP THIS NEIGHBOR", fontsize=16)
        original = document.tobytes()
    response = edit_request(
        client,
        content=original,
        edits=[
            {
                "page": 0,
                "kind": "replace",
                "source_rect": [0.10, 0.06, 0.7, 0.095],
                "rect": [0.10, 0.06, 0.9, 0.25],
                "text": "Updated",
                "font_size": 16,
            }
        ],
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        text = document[0].get_text()
        assert "REPLACE ME" not in text
        assert "KEEP THIS NEIGHBOR" in text
        assert "Updated" in text


def test_delete_existing_text_by_clearing_its_block(client):
    response = edit_request(
        client, edits=[{"page": 0, "kind": "replace", "rect": [0.08, 0.04, 0.85, 0.14], "text": ""}]
    )
    assert response.status_code == 200, response.text
    with pymupdf.open(stream=response.content, filetype="pdf") as document:
        assert "ORIGINAL" not in document[0].get_text()


@pytest.mark.parametrize(
    "change",
    [
        {"bold": "yes"},
        {"align": "justify"},
        {"font_family": "url(evil)"},
        {"source_rect": [-1, 0, 1, 1]},
    ],
)
def test_document_style_metadata_is_validated(client, change):
    edit = {"page": 0, "kind": "replace", "rect": [0.1, 0.1, 0.9, 0.3], "text": "Test", **change}
    assert edit_request(client, edits=[edit]).status_code == 422
