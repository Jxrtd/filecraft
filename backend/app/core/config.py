import os
from pathlib import Path


def positive(name: str, default: int) -> int:
    value = int(os.getenv(name, default))
    if value < 1:
        raise ValueError(f"{name} must be positive")
    return value


MAX_FILE_BYTES = positive("MAX_FILE_MB", 20) * 1024 * 1024
MAX_REQUEST_BYTES = positive("MAX_REQUEST_MB", 64) * 1024 * 1024
MAX_FILES = positive("MAX_FILES", 20)
MAX_PAGES = positive("MAX_PAGES", 100)
MAX_PIXELS = positive("MAX_IMAGE_PIXELS", 25000000)
TIMEOUT = positive("PROCESSING_TIMEOUT_SECONDS", 180)
RETENTION = max(positive("TEMP_RETENTION_SECONDS", 900), TIMEOUT + 60)
CONCURRENT = positive("MAX_CONCURRENT_JOBS", 2)
REQUESTS_PER_MINUTE = positive("REQUESTS_PER_MINUTE", 20)
TEMP_ROOT = Path(
    os.getenv("TEMP_ROOT", "/tmp/filecraft" if os.name != "nt" else ".runtime")
).resolve()
CORS_ORIGINS = [
    x.strip() for x in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if x.strip()
]
MAX_RENDER_PIXELS = positive("MAX_RENDER_PIXELS", 100000000)
MAX_TEXT_CHARS = positive("MAX_TEXT_CHARS", 20000)


def libreoffice_binary() -> str:
    """Prefer the Windows console launcher, which waits for conversion to finish."""
    configured = os.getenv("LIBREOFFICE_BINARY")
    if configured:
        binary = Path(configured)
        if os.name == "nt" and binary.name.lower() == "soffice.exe":
            console = binary.with_suffix(".com")
            if console.is_file():
                return str(console)
        return configured
    if os.name == "nt":
        directories = [
            Path(os.getenv("PROGRAMFILES", "C:/Program Files")) / "LibreOffice/program",
            Path(__file__).resolve().parents[3] / ".runtime/libreoffice-local/program",
        ]
        for directory in directories:
            for name in ("soffice.com", "soffice.exe"):
                binary = directory / name
                if binary.is_file():
                    return str(binary)
    return "soffice"
