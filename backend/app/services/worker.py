"""One disposable process per job. Never print file content or exception details."""

import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

import img2pdf
import pymupdf as fitz
from PIL import Image, ImageOps

from app.core.config import MAX_PIXELS, TIMEOUT, libreoffice_binary
from app.services.validation import InvalidFile, validate


def process(job: Path) -> None:
    spec = json.loads((job / "job.json").read_text())
    operation = spec["operation"]
    inputs = [job / name for name in spec["inputs"]]
    for path in inputs:
        validate(path, operation)
    if operation == "pdf-merge":
        from app.services.pdf_tools import merge_pdfs

        merge_pdfs(inputs, job / "result.pdf")
    elif operation == "pdf-edit":
        from app.services.pdf_tools import edit_pdf

        edit_pdf(inputs[0], job / "result.pdf", spec["pages"], spec["edits"])
    elif operation == "images-pdf":
        images = []
        for index, path in enumerate(inputs):
            normalized = job / f"normalized-{index}.jpg"
            with Image.open(path) as im:
                image = ImageOps.exif_transpose(im).convert("RGBA")
                canvas = Image.new("RGB", image.size, "white")
                canvas.paste(image, mask=image.getchannel("A"))
                canvas.save(normalized, quality=95)
            images.append(str(normalized))
        size = spec["page_size"]
        layout = (
            None
            if size == "original"
            else img2pdf.get_layout_fun(
                tuple(
                    img2pdf.mm_to_pt(x)
                    for x in ({"a4": (210, 297), "letter": (215.9, 279.4)}[size])
                )
            )
        )
        (job / "result.pdf").write_bytes(img2pdf.convert(images, layout_fun=layout))
    elif operation in {"office-pdf", "word-pdf"}:
        profile = (job / "lo-profile").as_uri()
        subprocess.run(
            [
                libreoffice_binary(),
                f"-env:UserInstallation={profile}",
                "--headless",
                "--nologo",
                "--nodefault",
                "--norestore",
                "--convert-to",
                "pdf",
                "--outdir",
                str(job),
                str(inputs[0]),
            ],
            timeout=TIMEOUT - 1 if TIMEOUT > 1 else 1,
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        output = inputs[0].with_suffix(".pdf")
        if not output.exists():
            raise InvalidFile(
                "LibreOffice could not convert this document. Check that it is not encrypted."
            )
        output.rename(job / "result.pdf")
    elif operation == "pdf-word":
        from app.services.word import pdf_to_word

        pdf_to_word(inputs[0], job / "result.docx")
    elif operation == "pdf-images":
        with fitz.open(inputs[0]) as doc, ZipFile(job / "result.zip", "w", ZIP_DEFLATED) as archive:
            for number, page in enumerate(doc, 1):
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                ext = spec["image_format"]
                archive.writestr(
                    f"page-{number:03d}.{ext}", pix.tobytes("jpeg" if ext == "jpg" else "png")
                )
    elif operation == "ocr":
        if not shutil.which(os.getenv("TESSERACT_BINARY", "tesseract")):
            raise FileNotFoundError("OCR executable is not installed")
        import pytesseract

        if os.getenv("TESSERACT_BINARY"):
            pytesseract.pytesseract.tesseract_cmd = os.environ["TESSERACT_BINARY"]
        with Image.open(inputs[0]) as im:
            text = pytesseract.image_to_string(
                ImageOps.exif_transpose(im).convert("RGB"), lang="eng", timeout=TIMEOUT
            )
        (job / "result.json").write_text(json.dumps({"text": text.strip()}), encoding="utf-8")
    elif operation == "remove-background":
        from rembg import new_session, remove

        with Image.open(inputs[0]) as im:
            image = ImageOps.exif_transpose(im).convert("RGBA")
            if image.width * image.height > MAX_PIXELS:
                raise InvalidFile("This image is too large.")
            result = remove(image, session=new_session("u2netp"))
            result.save(job / "result.png")


if __name__ == "__main__":
    target = Path(sys.argv[1])
    try:
        process(target)
    except InvalidFile as exc:
        (target / "error.json").write_text(json.dumps({"detail": str(exc), "status": 422}))
        sys.exit(2)
    except FileNotFoundError:
        (target / "error.json").write_text(
            json.dumps(
                {
                    "detail": "A required processing dependency is unavailable. Contact the server operator.",
                    "status": 503,
                }
            )
        )
        sys.exit(3)
    except Exception:
        (target / "error.json").write_text(
            json.dumps(
                {
                    "detail": "Processing failed. Try another file or contact the server operator.",
                    "status": 422,
                }
            )
        )
        sys.exit(4)
