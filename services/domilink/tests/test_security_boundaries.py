from __future__ import annotations

import base64
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from domilink.adapters.base import PrintPayload
from domilink.config import ConfigError, load_settings
from domilink.jobs import IdempotencyConflict, PrintJobStore


def test_copy_count_and_content_cannot_alias_idempotency_fingerprint() -> None:
    store = PrintJobStore(10)
    store.create("session", "same-intent", "printer", PrintPayload(b"23", "text", copies=1))
    with pytest.raises(IdempotencyConflict):
        store.create("session", "same-intent", "printer", PrintPayload(b"3", "text", copies=12))


def test_print_job_status_is_private_to_pairing_and_survives_rotation(
    paired_client: tuple[TestClient, dict[str, str]],
) -> None:
    client, owner = paired_client
    created = client.post(
        "/v1/print/jobs",
        json={
            "device_id": "printer",
            "format": "text",
            "content_base64": base64.b64encode(b"Documento QA").decode(),
        },
        headers={**owner, "Idempotency-Key": "private-job-0001"},
    )
    assert created.status_code == 202
    job_id = created.json()["job"]["id"]
    code, _ = client.app.state.sessions.create_pairing_code()  # type: ignore[union-attr]
    paired = client.post(
        "/v1/pair",
        json={"code": code, "client_name": "Outra sessão QA"},
        headers={"Origin": owner["Origin"]},
    )
    other = {"Origin": owner["Origin"], "Authorization": f"Bearer {paired.json()['token']}"}
    assert client.get(f"/v1/print/jobs/{job_id}", headers=other).status_code == 404
    rotated = client.post("/v1/session/rotate", headers=owner)
    owner["Authorization"] = f"Bearer {rotated.json()['token']}"
    assert client.get(f"/v1/print/jobs/{job_id}", headers=owner).status_code == 200
    replay = client.post(
        "/v1/print/jobs",
        json={
            "device_id": "printer",
            "format": "text",
            "content_base64": base64.b64encode(b"Documento QA").decode(),
        },
        headers={**owner, "Idempotency-Key": "private-job-0001"},
    )
    assert replay.status_code == 200
    assert replay.json()["job"]["id"] == job_id


@pytest.mark.parametrize(
    "origin",
    [
        "https://",
        "https://*.example.invalid",
        "https://user:fake@example.invalid",
        "https://example.invalid/path",
        "https://example.invalid?query=1",
        "https://example.invalid#fragment",
        "https://example.invalid:99999",
        "https://exa mple.invalid",
        "file://example.invalid",
    ],
)
def test_invalid_configured_origins_fail_before_start(tmp_path: Path, origin: str) -> None:
    config = tmp_path / "config.toml"
    config.write_text(f'[server]\nallowed_origins = ["{origin}"]\n')
    with pytest.raises(ConfigError):
        load_settings(config)
