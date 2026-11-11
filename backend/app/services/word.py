"""Layout-aware conversion of text-based PDFs into editable Word documents."""

import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import ZipFile

import pymupdf

from app.services.validation import InvalidFile


def pdf_to_word(source: Path, destination: Path) -> None:
    # A scan can be embedded as an image, but that would not yield editable words.
    # Avoid presenting such output as a successful editable conversion.
    with pymupdf.open(source) as pdf:
        if not any(page.get_text().strip() for page in pdf):
            raise InvalidFile(
                "No selectable text found. Scanned or image-only PDFs need OCR first. "
                "Export the pages as images and use Image to Text."
            )

    from pdf2docx import Converter

    converter = Converter(str(source))
    try:
        converter.convert(str(destination), multi_processing=False, ignore_page_error=False)
    finally:
        converter.close()

    # Catch a nominally successful converter which produced no editable content.
    with ZipFile(destination) as document:
        xml = ET.fromstring(document.read("word/document.xml"))
    namespace = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
    if not any((node.text or "").strip() for node in xml.iter(f"{namespace}t")):
        raise InvalidFile("This PDF could not be converted into editable text. Try another PDF.")
