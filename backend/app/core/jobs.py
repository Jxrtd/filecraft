import asyncio
import json
import os
import shutil
import signal
import sys
import tempfile
import time
from pathlib import Path

from fastapi import HTTPException

from app.core import config

ACTIVE: set[Path] = set()


def create_job() -> Path:
    config.TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    path = Path(tempfile.mkdtemp(prefix="job-", dir=config.TEMP_ROOT))
    ACTIVE.add(path)
    return path


def delete_job(path: Path) -> None:
    # Windows scanners/Office can hold a profile handle briefly after process exit.
    for delay in (0, 0.05, 0.2, 0.5, 1):
        if delay:
            time.sleep(delay)
        shutil.rmtree(path, ignore_errors=True)
        if not path.exists():
            break
    ACTIVE.discard(path)


def cleanup() -> None:
    config.TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    for path in config.TEMP_ROOT.glob("job-*"):
        if path.is_dir() and not path.is_symlink() and path not in ACTIVE:
            try:
                if time.time() - path.stat().st_mtime > config.RETENTION:
                    delete_job(path)
            except OSError:
                pass


async def run_job(path: Path, spec: dict) -> None:
    (path / "job.json").write_text(json.dumps(spec))
    proc = await asyncio.create_subprocess_exec(
        sys.executable,
        "-m",
        "app.services.worker",
        str(path),
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
        start_new_session=os.name != "nt",
    )
    try:
        await asyncio.wait_for(proc.wait(), config.TIMEOUT)
    except (TimeoutError, asyncio.CancelledError) as exc:
        if proc.returncode is None:
            if os.name == "nt":
                killer = await asyncio.create_subprocess_exec(
                    "taskkill",
                    "/PID",
                    str(proc.pid),
                    "/T",
                    "/F",
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL,
                )
                await killer.wait()
            else:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            await proc.wait()
        if isinstance(exc, asyncio.CancelledError):
            raise
        raise HTTPException(504, "Processing timed out. Try a smaller file.") from None
    if proc.returncode:
        error_path = path / "error.json"
        error = (
            json.loads(error_path.read_text())
            if error_path.exists()
            else {"status": 500, "detail": "The processing worker stopped unexpectedly."}
        )
        raise HTTPException(error["status"], error["detail"])
