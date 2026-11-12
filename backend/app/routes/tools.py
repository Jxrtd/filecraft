import asyncio
import json
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from starlette.responses import FileResponse, JSONResponse

from app.core import config
from app.core.filenames import download_name
from app.core.jobs import create_job, delete_job, run_job
from app.services.text_tools import detect, humanize

router = APIRouter(prefix="/api")


class TextRequest(BaseModel):
    text: str


class EphemeralFileResponse(FileResponse):
    def __init__(self, path: Path, job: Path, **kwargs):
        super().__init__(path, **kwargs)
        self.job = job

    async def __call__(self, scope, receive, send):
        try:
            await super().__call__(scope, receive, send)
        finally:
            await asyncio.to_thread(delete_job, self.job)


@router.get("/config")
async def limits():
    return {
        "max_file_bytes": config.MAX_FILE_BYTES,
        "max_request_bytes": config.MAX_REQUEST_BYTES,
        "max_files": config.MAX_FILES,
        "max_pages": config.MAX_PAGES,
        "abandoned_retention_seconds": config.RETENTION,
        "max_text_chars": config.MAX_TEXT_CHARS,
    }


def validated_text(payload: TextRequest) -> str:
    text = payload.text.strip()
    if not text:
        raise HTTPException(422, "Enter some text first.")
    if len(text) > config.MAX_TEXT_CHARS:
        raise HTTPException(413, f"Text must be {config.MAX_TEXT_CHARS:,} characters or less.")
    return text


@router.post("/humanize-text")
async def humanize_text(payload: TextRequest):
    text = validated_text(payload)
    return JSONResponse(
        {"text": await asyncio.to_thread(humanize, text)},
        headers={"Cache-Control": "no-store"},
    )


@router.post("/detect-ai-text")
async def detect_ai_text(payload: TextRequest):
    text = validated_text(payload)
    return JSONResponse(
        await asyncio.to_thread(detect, text),
        headers={"Cache-Control": "no-store"},
    )


@router.post("/{operation}")
async def process(operation: str, request: Request):
    if operation not in {
        "images-pdf",
        "office-pdf",
        "word-pdf",
        "pdf-word",
        "pdf-images",
        "pdf-edit",
        "pdf-merge",
        "ocr",
        "remove-background",
    }:
        raise HTTPException(404, "Tool not found.")
    job = create_job()
    transferred = False
    try:
        async with request.form(
            max_files=config.MAX_FILES, max_fields=4, max_part_size=256 * 1024
        ) as form:
            files = form.getlist("files")
            if (
                not files
                or len(files) > config.MAX_FILES
                or (operation not in {"images-pdf", "pdf-merge"} and len(files) != 1)
                or (operation == "pdf-merge" and len(files) < 2)
            ):
                raise HTTPException(422, "Choose the correct number of files for this tool.")
            size, fmt = str(form.get("page_size", "a4")), str(form.get("image_format", "png"))
            if size not in {"a4", "letter", "original"} or fmt not in {"png", "jpg"}:
                raise HTTPException(422, "Invalid conversion options.")
            edits = str(form.get("edits", "[]"))
            pages = str(form.get("pages", "[]"))
            original_name = ""
            names = []
            for upload in files:
                if not hasattr(upload, "filename") or not hasattr(upload, "read"):
                    raise HTTPException(422, "Please upload a file.")
                if not names:
                    original_name = upload.filename or ""
                extension = Path(upload.filename or "").suffix.lower()
                if extension not in {
                    ".jpg",
                    ".jpeg",
                    ".png",
                    ".webp",
                    ".pdf",
                    ".doc",
                    ".docx",
                    ".xls",
                    ".xlsx",
                    ".ppt",
                    ".pptx",
                }:
                    raise HTTPException(422, "Unsupported file extension.")
                name = uuid4().hex + extension
                count = 0
                with (job / name).open("wb") as output:
                    while chunk := await upload.read(1024 * 1024):
                        count += len(chunk)
                        if count > config.MAX_FILE_BYTES:
                            raise HTTPException(413, "A file exceeds the upload limit.")
                        await asyncio.to_thread(output.write, chunk)
                if count == 0:
                    raise HTTPException(422, "Empty files cannot be processed.")
                names.append(name)
        await run_job(
            job,
            {
                "operation": operation,
                "inputs": names,
                "page_size": size,
                "image_format": fmt,
                "edits": edits,
                "pages": pages,
            },
        )
        if operation == "ocr":
            return JSONResponse(
                json.loads((job / "result.json").read_text(encoding="utf-8")),
                headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
            )
        ext, mime = {
            "pdf-images": ("zip", "application/zip"),
            "remove-background": ("png", "image/png"),
            "pdf-word": (
                "docx",
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            ),
        }.get(operation, ("pdf", "application/pdf"))
        response = EphemeralFileResponse(
            job / f"result.{ext}",
            job,
            media_type=mime,
            filename=download_name(original_name, ext),
            headers={"Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"},
        )
        transferred = True
        return response
    finally:
        if not transferred:
            await asyncio.to_thread(delete_job, job)
