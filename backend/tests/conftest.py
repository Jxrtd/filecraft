import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ["REQUESTS_PER_MINUTE"] = "1000"

import pytest
from fastapi.testclient import TestClient

from app.core import config
from app.main import app


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "TEMP_ROOT", tmp_path / "jobs")
    monkeypatch.setenv("TEMP_ROOT", str(tmp_path / "jobs"))
    with TestClient(app) as client:
        yield client
    assert not list(config.TEMP_ROOT.glob("job-*")), "Request files were not cleaned"
