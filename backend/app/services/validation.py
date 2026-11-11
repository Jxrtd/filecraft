import warnings
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import BadZipFile, ZipFile

import olefile
import pymupdf as fitz
from PIL import Image

from app.core.config import MAX_FILE_BYTES, MAX_PAGES, MAX_PIXELS, MAX_RENDER_PIXELS

IMAGES = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}
OFFICE = {".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"}


class InvalidFile(ValueError):
    pass


def validate(path: Path, operation: str) -> None:
    ext = path.suffix.lower()
    allowed = {".jpg", ".jpeg", ".png"} if operation == "images-pdf" else set(IMAGES)
    if operation == "office-pdf":
        allowed = OFFICE
    if operation == "word-pdf":
        allowed = {".doc", ".docx"}
    if operation in {"pdf-images", "pdf-word", "pdf-edit", "pdf-merge"}:
        allowed = {".pdf"}
    if ext not in allowed:
        raise InvalidFile("This file extension is not supported by the selected tool.")
    if not 0 < path.stat().st_size <= MAX_FILE_BYTES:
        raise InvalidFile("The file is empty or exceeds the upload limit.")
    try:
        if ext in IMAGES:
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(path) as im:
                    if im.format != IMAGES[ext] or im.width * im.height > MAX_PIXELS:
                        raise InvalidFile(
                            "Image content does not match its extension or is too large."
                        )
                    if getattr(im, "n_frames", 1) != 1:
                        raise InvalidFile("Please upload a single-frame image.")
                    im.verify()
        elif ext == ".pdf":
            if not path.read_bytes()[:1024].lstrip().startswith(b"%PDF-"):
                raise InvalidFile("Please upload a valid PDF.")
            with fitz.open(path) as doc:
                if doc.needs_pass or not 0 < len(doc) <= MAX_PAGES:
                    raise InvalidFile("PDF must be unlocked and within the page limit.")
                total_pixels = sum(page.rect.width * page.rect.height * 4 for page in doc)
                if total_pixels > MAX_RENDER_PIXELS:
                    raise InvalidFile(
                        "This PDF is too large to render. Split it into smaller files."
                    )
                for page in doc:
                    if page.rect.width * page.rect.height * 4 > MAX_PIXELS:
                        raise InvalidFile("A PDF page is too large to render safely.")
        elif ext.endswith("x"):
            folder, tag = {
                ".docx": ("word", "document"),
                ".xlsx": ("xl", "workbook"),
                ".pptx": ("ppt", "presentation"),
            }[ext]
            with ZipFile(path) as z:
                infos = z.infolist()
                if len(infos) > 10000 or sum(i.file_size for i in infos) > 100 * 1024 * 1024:
                    raise InvalidFile("The Office document expands beyond the safety limit.")
                if "[Content_Types].xml" not in z.namelist():
                    raise InvalidFile("Invalid Office document.")
                root = ET.fromstring(z.read(f"{folder}/{tag}.xml"))
                namespaces = {
                    "word": "http://schemas.openxmlformats.org/wordprocessingml/2006/main",
                    "xl": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
                    "ppt": "http://schemas.openxmlformats.org/presentationml/2006/main",
                }
                if root.tag != f"{{{namespaces[folder]}}}{tag}":
                    raise InvalidFile("Office document content does not match its extension.")
        else:
            with olefile.OleFileIO(path) as ole:
                streams = {
                    ".doc": ["WordDocument"],
                    ".xls": ["Workbook", "Book"],
                    ".ppt": ["PowerPoint Document"],
                }[ext]
                if not any(ole.exists(s) for s in streams):
                    raise InvalidFile("Office document content does not match its extension.")
    except InvalidFile:
        raise
    except (
        OSError,
        ValueError,
        KeyError,
        BadZipFile,
        ET.ParseError,
        Image.DecompressionBombWarning,
        Image.DecompressionBombError,
        RuntimeError,
    ) as exc:
        raise InvalidFile(
            "The file is damaged or its contents do not match its extension."
        ) from exc
