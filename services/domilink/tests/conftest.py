from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from domilink.api import create_app  # noqa: E402
from domilink.config import DeviceConfig, Settings  # noqa: E402
from domilink.security import SessionManager  # noqa: E402


@pytest.fixture
def settings() -> Settings:
    return Settings(
        allowed_origins=("https://pdv.example.invalid",),
        devices=(
            DeviceConfig("printer", "printer", "virtual", "Impressora", {}),
            DeviceConfig("pdf-printer", "printer", "system-pdf", "PDF do sistema", {}),
            DeviceConfig("offline-printer", "printer", "virtual", "Offline", {"online": False}),
            DeviceConfig("scale", "scale", "virtual", "Balança", {"weight_kg": 2.5}),
            DeviceConfig(
                "barcode", "barcode", "virtual", "Leitor", {"codes": ["7891234567890"]}
            ),
        ),
    )


@pytest.fixture
def paired_client(settings: Settings) -> tuple[TestClient, dict[str, str]]:
    sessions = SessionManager(settings.pairing_ttl_seconds, settings.session_ttl_seconds)
    code, _ = sessions.create_pairing_code()
    client = TestClient(create_app(settings, sessions=sessions))
    origin = {"Origin": "https://pdv.example.invalid"}
    response = client.post(
        "/v1/pair", json={"code": code, "client_name": "Teste"}, headers=origin
    )
    assert response.status_code == 200
    headers = {**origin, "Authorization": f"Bearer {response.json()['token']}"}
    return client, headers
