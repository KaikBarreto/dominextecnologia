from __future__ import annotations

import asyncio
import base64
from typing import Any, Callable, cast

import pytest
from fastapi.testclient import TestClient

from domilink.api import _scale_events, create_app
from domilink.config import Settings
from domilink.security import SessionManager


def valid_test_pdf() -> bytes:
    stream = b"BT /F1 12 Tf 20 50 Td (Teste DomiLink) Tj ET\n"
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        (
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] "
            b"/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>"
        ),
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    document = bytearray(b"%PDF-1.4\n")
    offsets = []
    for index, obj in enumerate(objects, start=1):
        offsets.append(len(document))
        document.extend(f"{index} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(document)
    document.extend(f"xref\n0 {len(objects) + 1}\n0000000000 65535 f \n".encode())
    for offset in offsets:
        document.extend(f"{offset:010d} 00000 n \n".encode())
    document.extend(
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    )
    return bytes(document)


def test_origin_and_preflight_are_restricted(settings: Settings) -> None:
    client = TestClient(create_app(settings))
    denied = client.get("/health", headers={"Origin": "https://evil.example.invalid"})
    assert denied.status_code == 403

    preflight = client.options(
        "/v1/pair",
        headers={
            "Origin": "https://pdv.example.invalid",
            "Access-Control-Request-Method": "POST",
        },
    )
    assert preflight.status_code == 204
    assert preflight.headers["access-control-allow-origin"] == "https://pdv.example.invalid"
    assert "*" not in preflight.headers["access-control-allow-headers"]

    invalid = client.post(
        "/v1/pair",
        json={"code": "backend-detail-must-not-leak"},
        headers={"Origin": "https://pdv.example.invalid"},
    )
    assert invalid.status_code == 422
    assert invalid.json() == {
        "error": {
            "code": "invalid_request",
            "message": "Revise os dados enviados e tente novamente",
        }
    }


def test_pair_rotate_and_authenticated_routes(settings: Settings) -> None:
    sessions = SessionManager(120, 900)
    code, _ = sessions.create_pairing_code()
    client = TestClient(create_app(settings, sessions=sessions))
    origin = {"Origin": "https://pdv.example.invalid"}
    paired = client.post(
        "/v1/pair", json={"code": code, "client_name": "Caixa"}, headers=origin
    )
    token = paired.json()["token"]
    auth = {**origin, "Authorization": f"Bearer {token}"}
    assert client.get("/v1/devices", headers=auth).status_code == 200

    rotated = client.post("/v1/session/rotate", headers=auth)
    assert rotated.status_code == 200
    assert client.get("/v1/version", headers=auth).status_code == 401
    new_auth = {**origin, "Authorization": f"Bearer {rotated.json()['token']}"}
    assert client.get("/v1/version", headers=new_auth).status_code == 200


def test_body_and_rate_limits(settings: Settings) -> None:
    limited = Settings(
        allowed_origins=settings.allowed_origins,
        max_body_bytes=1024,
        rate_limit_requests=10,
        rate_limit_window_seconds=60,
    )
    client = TestClient(create_app(limited))
    too_large = client.post(
        "/v1/pair",
        content=b"{}",
        headers={"Content-Length": "2048", "Content-Type": "application/json"},
    )
    assert too_large.status_code == 413

    async def chunked_without_length() -> tuple[int, int]:
        app = create_app(limited)
        chunks = [b"x" * 400 for _ in range(8)]
        consumed = 0
        response_status = 0

        async def receive() -> dict[str, object]:
            nonlocal consumed
            if consumed >= len(chunks):
                return {"type": "http.request", "body": b"", "more_body": False}
            chunk = chunks[consumed]
            consumed += 1
            return {"type": "http.request", "body": chunk, "more_body": consumed < len(chunks)}

        async def send(message: dict[str, object]) -> None:
            nonlocal response_status
            if message["type"] == "http.response.start":
                response_status = cast(int, message["status"])

        scope = {
            "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
            "method": "POST", "scheme": "http", "path": "/v1/pair",
            "raw_path": b"/v1/pair", "query_string": b"", "root_path": "",
            "headers": [(b"content-type", b"application/json")],
            "client": ("127.0.0.1", 12345), "server": ("127.0.0.1", 8765),
        }
        await app(scope, receive, send)  # type: ignore[arg-type]
        return response_status, consumed

    status, consumed = asyncio.run(chunked_without_length())
    assert status == 413
    assert consumed == 3

    fresh = TestClient(create_app(limited))
    statuses = [fresh.get("/health").status_code for _ in range(11)]
    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


def test_print_idempotency_and_status(
    paired_client: tuple[TestClient, dict[str, str]],
) -> None:
    client, headers = paired_client
    payload = {
        "device_id": "printer",
        "format": "pdf",
        "content_base64": base64.b64encode(valid_test_pdf()).decode(),
        "copies": 1,
    }
    job_headers = {**headers, "Idempotency-Key": "job-key-0001"}
    created = client.post("/v1/print/jobs", json=payload, headers=job_headers)
    assert created.status_code == 202
    job_id = created.json()["job"]["id"]
    status = client.get(f"/v1/print/jobs/{job_id}", headers=headers)
    assert status.json()["job"]["status"] == "completed"

    rotated = client.post("/v1/session/rotate", headers=headers)
    rotated_headers = {
        "Origin": headers["Origin"],
        "Authorization": f"Bearer {rotated.json()['token']}",
        "Idempotency-Key": "job-key-0001",
    }
    replay = client.post("/v1/print/jobs", json=payload, headers=rotated_headers)
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    assert replay.json()["job"]["id"] == job_id

    changed = {**payload, "copies": 2}
    conflict = client.post("/v1/print/jobs", json=changed, headers=rotated_headers)
    assert conflict.status_code == 409


def test_printer_capabilities_and_unsupported_format(
    paired_client: tuple[TestClient, dict[str, str]],
) -> None:
    client, headers = paired_client
    devices = client.get("/v1/devices", headers=headers).json()["devices"]
    by_id = {device["id"]: device for device in devices}
    assert by_id["pdf-printer"]["capabilities"]["print_formats"] == ["pdf"]
    assert by_id["printer"]["capabilities"]["print_formats"] == [
        "pdf",
        "text",
        "escpos",
    ]
    unsupported = client.post(
        "/v1/print/jobs",
        json={
            "device_id": "pdf-printer",
            "format": "text",
            "content_base64": base64.b64encode(b"texto").decode(),
        },
        headers={**headers, "Idempotency-Key": "unsupported-0001"},
    )
    assert unsupported.status_code == 400
    assert unsupported.json()["error"]["code"] == "unsupported_format"


def test_invalid_pdf_without_page_is_rejected(
    paired_client: tuple[TestClient, dict[str, str]],
) -> None:
    client, headers = paired_client
    invalid = client.post(
        "/v1/print/jobs",
        json={
            "device_id": "printer",
            "format": "pdf",
            "content_base64": base64.b64encode(b"%PDF-1.4\n%%EOF").decode(),
        },
        headers={**headers, "Idempotency-Key": "invalid-pdf-0001"},
    )
    assert invalid.status_code == 400
    assert invalid.json()["error"]["code"] == "invalid_pdf"


def test_virtual_devices_and_offline_failure(
    paired_client: tuple[TestClient, dict[str, str]],
) -> None:
    client, headers = paired_client
    reading = client.get("/v1/scales/scale/read", headers=headers)
    assert reading.json()["reading"] == {"weight_kg": 2.5, "stable": True, "unit": "kg"}
    assert client.post("/v1/scales/scale/tare", headers=headers).status_code == 204
    assert client.get("/v1/scales/scale/read", headers=headers).json()["reading"]["weight_kg"] == 0
    barcode = client.get("/v1/barcodes/barcode/read", headers=headers)
    assert barcode.json()["code"] == "7891234567890"

    payload = {
        "device_id": "offline-printer",
        "format": "text",
        "content_base64": base64.b64encode(b"conteudo ficticio").decode(),
    }
    queued = client.post(
        "/v1/print/jobs",
        json=payload,
        headers={**headers, "Idempotency-Key": "offline-0001"},
    )
    job_id = queued.json()["job"]["id"]
    failed = client.get(f"/v1/print/jobs/{job_id}", headers=headers).json()["job"]
    assert failed["status"] == "failed"
    assert failed["error_code"] == "device_offline"


def test_blocking_device_calls_leave_event_loop(
    paired_client: tuple[TestClient, dict[str, str]], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, headers = paired_client
    calls: list[str] = []
    original = asyncio.to_thread

    async def tracked(function: Callable[..., Any], *args: Any, **kwargs: Any) -> Any:
        calls.append(function.__name__)
        return await original(function, *args, **kwargs)

    monkeypatch.setattr("domilink.api.asyncio.to_thread", tracked)
    assert client.get("/v1/devices", headers=headers).status_code == 200
    assert client.get("/v1/scales/scale/read", headers=headers).status_code == 200
    assert client.get("/v1/barcodes/barcode/read", headers=headers).status_code == 200
    printed = client.post(
        "/v1/print/jobs",
        json={
            "device_id": "printer",
            "format": "text",
            "content_base64": base64.b64encode(b"teste").decode(),
        },
        headers={**headers, "Idempotency-Key": "thread-print-0001"},
    )
    assert printed.status_code == 202
    assert calls.count("probe") >= 1
    assert calls.count("read") >= 2
    assert calls.count("execute") == 1


def test_scale_stream_stops_after_session_revocation(settings: Settings) -> None:
    sessions = SessionManager(120, 900)
    code, _ = sessions.create_pairing_code()
    token, _ = sessions.pair(code, "Caixa")
    scale = create_app(settings).state.registry.scale("scale")

    async def scenario() -> None:
        stream = _scale_events(scale, sessions, token, 0)
        first = await stream.__anext__()
        assert '"weight_kg":2.5' in first
        sessions.revoke(token)
        ended = await stream.__anext__()
        assert "event: session-ended" in ended
        try:
            await stream.__anext__()
        except StopAsyncIteration:
            return
        raise AssertionError("stream continuou depois da revogação")

    asyncio.run(scenario())
