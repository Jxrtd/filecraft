"""Direct PDF page editing and merging; no rasterization or format conversion."""

import html
import json
from pathlib import Path
from typing import Literal

import pymupdf
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator

from app.core import config
from app.services.validation import InvalidFile


class Edit(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, strict=True)
    page: int = Field(ge=0)
    kind: Literal["text", "highlight", "replace"]
    rect: tuple[float, float, float, float]
    text: str = Field(default="", max_length=2000)
    font_size: float = Field(default=14, ge=6, le=72)
    source_rect: tuple[float, float, float, float] | None = None
    font_family: Literal["sans-serif", "serif", "monospace"] = "sans-serif"
    bold: bool = False
    italic: bool = False
    underline: bool = False
    align: Literal["left", "center", "right"] = "left"
    color: str = Field(default="#263e34", pattern=r"^#[0-9a-fA-F]{6}$")

    @model_validator(mode="after")
    def check_rect(self):
        x0, y0, x1, y1 = self.rect
        if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
            raise ValueError("Invalid rectangle")
        if self.source_rect is not None:
            left, top, right, bottom = self.source_rect
            if not (0 <= left < right <= 1 and 0 <= top < bottom <= 1):
                raise ValueError("Invalid source rectangle")
        if self.kind == "text" and not self.text.strip():
            raise ValueError("Text is required")
        return self


def merge_pdfs(inputs: list[Path], output: Path) -> None:
    if not 2 <= len(inputs) <= config.MAX_FILES:
        raise InvalidFile("Choose at least two PDFs to combine.")
    with pymupdf.open() as result:
        for path in inputs:
            with pymupdf.open(path) as source:
                if len(result) + len(source) > config.MAX_PAGES:
                    raise InvalidFile("The combined PDF exceeds the page limit.")
                result.insert_pdf(source, widgets=True)
        result.save(output, garbage=4, deflate=True)


def edit_pdf(source: Path, output: Path, raw_pages: str, raw_edits: str) -> None:
    try:
        pages = json.loads(raw_pages)
        payload = json.loads(raw_edits)
        if not isinstance(payload, list) or len(payload) > 100:
            raise ValueError()
        # JSON tuples become lists; validate_json retains strict numeric validation.
        edits = [Edit.model_validate_json(json.dumps(item)) for item in payload]
        if not isinstance(pages, list) or not 1 <= len(pages) <= config.MAX_PAGES:
            raise ValueError()
        if any(type(index) is not int for index in pages) or len(set(pages)) != len(pages):
            raise ValueError()
    except (ValueError, TypeError, ValidationError):
        raise InvalidFile("Invalid PDF edits. Select valid pages and up to 100 changes.") from None

    with pymupdf.open(source) as document:
        if any(index < 0 or index >= len(document) for index in pages):
            raise InvalidFile("A selected page does not exist.")
        if any(edit.page not in pages for edit in edits):
            raise InvalidFile("An edit targets a removed or missing page.")
        for edit in edits:
            page = document[edit.page]
            bounds = page.rect
            x0, y0, x1, y1 = edit.rect
            rect = (
                pymupdf.Rect(
                    x0 * bounds.width, y0 * bounds.height, x1 * bounds.width, y1 * bounds.height
                )
                * page.derotation_matrix
            )
            if edit.kind == "highlight":
                annotation = page.add_rect_annot(rect)
                rgb = tuple(int(edit.color[i : i + 2], 16) / 255 for i in (1, 3, 5))
                annotation.set_colors(stroke=rgb, fill=rgb)
                annotation.set_opacity(0.3)
                annotation.set_border(width=0)
                annotation.update()
            else:
                if edit.kind == "replace":
                    if any(
                        annotation.type[0] == pymupdf.PDF_ANNOT_REDACT
                        for annotation in page.annots() or []
                    ):
                        raise InvalidFile(
                            "This page contains pending redactions. Apply or remove them before replacing text."
                        )
                    source_rect = rect
                    if edit.source_rect is not None:
                        left, top, right, bottom = edit.source_rect
                        source_rect = (
                            pymupdf.Rect(
                                left * bounds.width,
                                top * bounds.height,
                                right * bounds.width,
                                bottom * bounds.height,
                            )
                            * page.derotation_matrix
                        )
                    page.add_redact_annot(source_rect, fill=(1, 1, 1), cross_out=False)
                    page.apply_redactions(images=0, graphics=0, text=0)
                if edit.kind == "replace" and not edit.text:
                    continue
                text = html.escape(edit.text).replace("\n", "<br>")
                if edit.bold:
                    text = f"<b>{text}</b>"
                if edit.italic:
                    text = f"<i>{text}</i>"
                if edit.underline:
                    text = f"<u>{text}</u>"
                css = f"* {{font-family: {edit.font_family}; font-size: {edit.font_size}pt; color: {edit.color}; text-align: {edit.align}; line-height:1.2; margin:0; padding:0;}}"
                remaining, _ = page.insert_htmlbox(
                    rect, text, css=css, scale_low=1, rotate=page.rotation
                )
                if remaining < 0:
                    raise InvalidFile(
                        "Text does not fit its box. Make the text box larger or choose a smaller font."
                    )
        document.select(pages)
        document.save(output, garbage=4, deflate=True)
