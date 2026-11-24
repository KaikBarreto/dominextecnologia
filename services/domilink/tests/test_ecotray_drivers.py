from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from domilink.adapters.base import DeviceOffline, DeviceTimeout, PrintPayload, UnsupportedOperation
from domilink.adapters.protocols import parse_weight, upx
from domilink.adapters.serial import SerialBarcode, SerialScale
from domilink.adapters.system_pdf import SystemPdfPrinter
from domilink.adapters.windows_gdi import _compute_target_w
from domilink.config import ConfigError
from domilink.jobs import JobQueueFull, PrintJobStore


class FakeSerial:
    def __init__(self, chunks: list[bytes]) -> None:
        self.chunks = chunks
        self.writes: list[bytes] = []
        self.closed = False
        self.timeout = 0.1

    @property
    def in_waiting(self) -> int:
        return len(self.chunks[0]) if self.chunks else 0

    def read(self, size: int) -> bytes:
        if not self.chunks:
            return b""
        chunk = self.chunks.pop(0)
        if len(chunk) > size:
            self.chunks.insert(0, chunk[size:])
        return chunk[:size]

    def write(self, content: bytes) -> None:
        self.writes.append(content)

    def flush(self) -> None:
        pass

    def close(self) -> None:
        self.closed = True


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        (b"\x02 01250\r", "1.250"),
        (b"noise\x02-00500\x03tail", "-0.500"),
        (b"\x0201.250\r", "1.250"),
        (b"\x02-0.500\x03", "-0.500"),
        (b"\x02 01250", None),
        (b"01250\r", None),
    ],
)
def test_original_upx_frames(raw: bytes, expected: str | None) -> None:
    assert upx.parse(raw) == expected


@pytest.mark.parametrize(
    ("protocol", "raw", "weight", "stable"),
    [
        ("toledo", b"ST,GS,- 00012.450 kg\r\n", -12.45, True),
        ("toledo", b"US,NT,+ 00250.000 g\r", 0.25, False),
        ("filizola", b"F:00000500\r", 0.5, False),
        ("filizola", b"P:00012 kg\r", 12.0, False),
        ("filizola", b"F:-000500 g\r", -0.5, False),
        ("filizola", b"\x0201250\x03", 1.25, False),
        ("generic", b"-1,250 kg\r", -1.25, False),
        ("generic", b"00500\r", 0.5, False),
        ("generic", b"ST 500 g\r", 0.5, True),
        ("auto", b"\x02 01250\x03", 1.25, False),
        ("auto", b"ST,GS,+ 001.250 kg\r", 1.25, True),
    ],
)
def test_protocols_preserve_sign_unit_and_explicit_stability(
    protocol: str, raw: bytes, weight: float, stable: bool
) -> None:
    reading = parse_weight(raw, protocol)
    assert reading is not None
    assert reading.weight_kg == weight
    assert reading.stable is stable


@pytest.mark.parametrize(
    "raw",
    [b"ERR 12345\r", b"ERR 1.250kg\r", b"ERR F:12345\r", b"\xff1.250kg\r", b"\r", b"no weight"],
)
def test_auto_rejects_garbage(raw: bytes) -> None:
    assert parse_weight(raw, "auto") is None


def test_scale_retains_upx_terminator_and_polls_demand(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeSerial([b"garbage\r", b"\x02 ", b"01250", b"\x03"])
    scale = SerialScale("s", "Balança", {"port": "FAKE", "protocol": "upx"})
    monkeypatch.setattr(scale, "_open", lambda timeout: connection)
    assert scale.read().weight_kg == 1.25
    assert connection.writes == [b"\x05"]
    assert connection.closed
    assert "tare" not in scale.capabilities()["actions"]  # type: ignore[operator]
    with pytest.raises(UnsupportedOperation):
        scale.tare()


def test_scale_timeout_closes_and_unblocks(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeSerial([b"ERR\r", b"\x02 01250"])
    scale = SerialScale("s", "Balança", {"port": "FAKE", "protocol": "upx"})
    monkeypatch.setattr(scale, "_open", lambda timeout: connection)
    with pytest.raises(DeviceTimeout):
        scale.read(0.002)
    assert connection.closed
    assert not scale._lock.locked()


def test_serial_configuration_fails_early() -> None:
    with pytest.raises(ConfigError):
        SerialScale("s", "Balança", {"port": "FAKE", "protocol": "unknown"})
    with pytest.raises(ConfigError):
        SerialBarcode("b", "Leitor", {})


def test_barcode_fragmented_frames_and_batched_scans(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeSerial([b"\x027890", b"000000011\r\nABC\x03"])
    scanner = SerialBarcode("b", "Leitor", {"port": "FAKE"})
    monkeypatch.setattr(scanner, "_open", lambda timeout: connection)
    assert scanner.read() == "7890000000011"
    assert scanner.read() == "ABC"
    assert connection.closed


def test_barcode_never_returns_truncated_or_incomplete_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scanner = SerialBarcode("b", "Leitor", {"port": "FAKE"})
    monkeypatch.setattr(scanner, "_open", lambda timeout: FakeSerial([b"incomplete"]))
    with pytest.raises(DeviceTimeout):
        scanner.read(0.002)
    monkeypatch.setattr(scanner, "_open", lambda timeout: FakeSerial([b"x" * 4200]))
    with pytest.raises(DeviceOffline):
        scanner.read()
    monkeypatch.setattr(scanner, "_open", lambda timeout: FakeSerial([]))
    assert scanner.read(0.002) is None


@pytest.mark.parametrize(
    ("paper", "page", "horz", "dpi", "expected"),
    [
        (80, 80, 576, 203, 576),
        (80, 80, 640, 203, 640),
        (58, 58, 0, 96, 384),
        (80, 80, 0, 203, 576),
        (80, 80, 0, 300, 851),
        (None, 80, 576, 203, 576),
        (None, 0, 0, 0, 576),
    ],
)
def test_ecotray_thermal_width(
    paper: float | None, page: float, horz: int, dpi: int, expected: int
) -> None:
    assert _compute_target_w(paper, page, horz, dpi)[0] == expected


def test_cups_preserves_named_queue_copies_and_temp_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    printer = SystemPdfPrinter("p", "Fila", "Fila Fictícia")
    monkeypatch.setattr("domilink.adapters.system_pdf.sys.platform", "darwin")
    monkeypatch.setattr(printer, "probe", lambda: True)
    seen: list[str] = []

    def run(command: list[str], **kwargs: Any) -> SimpleNamespace:
        seen.extend(command)
        assert Path(command[-1]).read_bytes() == b"synthetic pdf"
        return SimpleNamespace(returncode=0)

    monkeypatch.setattr("domilink.adapters.system_pdf.subprocess.run", run)
    printer.print(PrintPayload(b"synthetic pdf", "pdf", copies=2))
    assert seen[:5] == ["lp", "-d", "Fila Fictícia", "-n", "2"]
    assert not Path(seen[-1]).exists()


def test_queue_never_discards_active_jobs_or_recent_idempotency() -> None:
    now = [0.0]
    jobs = PrintJobStore(10, clock=lambda: now[0])
    payload = PrintPayload(b"synthetic", "text")
    first, _ = jobs.create("scope", "first", "p", payload)
    for number in range(9):
        jobs.create("scope", str(number), "p", payload)
    now[0] = 7200
    with pytest.raises(JobQueueFull):
        jobs.create("scope", "overflow", "p", payload)
    replay, created = jobs.create("scope", "first", "p", payload)
    assert not created and replay.id == first.id
    from domilink.adapters.virtual import VirtualPrinter

    printer = VirtualPrinter("p", "Printer")
    jobs.execute(first.id, printer, payload)
    assert jobs.get(first.id).status == "completed"
    now[0] += 3599
    with pytest.raises(JobQueueFull):
        jobs.create("scope", "overflow", "p", payload)
    assert jobs.create("scope", "first", "p", payload)[0].id == first.id
    now[0] += 1
    jobs.create("scope", "new", "p", payload)
    assert len(printer.jobs) == 1


def fake_gdi_modules(driver: str = "POS Fictícia") -> tuple[tuple[Any, ...], list[object]]:
    events: list[object] = []

    class Document:
        def __len__(self) -> int:
            return 1

        def __iter__(self) -> Any:
            page = SimpleNamespace(
                rect=SimpleNamespace(width=226, height=100),
                get_pixmap=lambda **kwargs: SimpleNamespace(width=904, height=400, samples=b"x"),
            )
            return iter([page])

        def close(self) -> None:
            events.append("close-pdf")

    class DC:
        def CreatePrinterDC(self, name: str) -> None:
            events.append(("queue", name))

        def GetDeviceCaps(self, code: int) -> int:
            return {8: 576, 88: 203, 112: 10, 113: 5}[code]

        def StartDoc(self, title: str) -> None:
            events.append("start-doc")

        def StartPage(self) -> None:
            events.append("page")

        def GetHandleOutput(self) -> int:
            return 42

        def EndPage(self) -> None:
            events.append("end-page")

        def EndDoc(self) -> None:
            events.append("end-doc")

        def AbortDoc(self) -> None:
            events.append("abort-doc")

        def DeleteDC(self) -> None:
            events.append("delete-dc")

    printing = SimpleNamespace(
        GetDefaultPrinter=lambda: "Default Fictícia",
        OpenPrinter=lambda name: name,
        GetPrinter=lambda handle, level: {"pDriverName": driver},
        ClosePrinter=lambda handle: events.append("close-printer"),
    )
    image = SimpleNamespace(
        frombytes=lambda *args: SimpleNamespace(
            size=(904, 400), close=lambda: events.append("close-image")
        )
    )
    imagewin = SimpleNamespace(
        Dib=lambda image: SimpleNamespace(draw=lambda handle, rect: events.append(("draw", rect)))
    )
    fitz = SimpleNamespace(open=lambda **kwargs: Document(), Matrix=lambda x, y: (x, y), csGRAY=1)
    return (printing, SimpleNamespace(CreateDC=DC), image, imagewin, fitz), events


def test_gdi_ecotray_path_honors_copies_named_queue_and_cleanup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from domilink.adapters import windows_gdi

    modules, events = fake_gdi_modules()
    monkeypatch.setattr(windows_gdi, "_modules", lambda: modules)
    windows_gdi.print_pdf(PrintPayload(b"synthetic", "pdf", 2), "Fila Fictícia", 80, 15)
    assert ("queue", "Fila Fictícia") in events
    assert events.count("page") == 2
    assert ("draw", (-10, -5, 566, 249)) in events
    assert events[-2:] == ["delete-dc", "close-pdf"]
    assert "abort-doc" not in events


def test_gdi_rejects_text_only_driver_before_raster(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from domilink.adapters import windows_gdi

    modules, events = fake_gdi_modules("Generic / Text Only")
    monkeypatch.setattr(windows_gdi, "_modules", lambda: modules)
    with pytest.raises(UnsupportedOperation):
        windows_gdi.print_pdf(PrintPayload(b"synthetic", "pdf"), "Fila", 58, 15)
    assert "start-doc" not in events
    assert events == ["close-printer"]


def test_gdi_failure_aborts_job_and_closes_resources(monkeypatch: pytest.MonkeyPatch) -> None:
    from domilink.adapters import windows_gdi

    modules, events = fake_gdi_modules()
    modules[2].frombytes = lambda *args: (_ for _ in ()).throw(ValueError("private-driver-details"))
    monkeypatch.setattr(windows_gdi, "_modules", lambda: modules)
    with pytest.raises(DeviceOffline) as error:
        windows_gdi.print_pdf(PrintPayload(b"synthetic", "pdf"), "Fila", 80, 15)
    assert "private-driver-details" not in str(error.value)
    assert events[-3:] == ["abort-doc", "delete-dc", "close-pdf"]


def test_serial_protocols_through_authenticated_http(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi.testclient import TestClient

    from domilink.api import create_app
    from domilink.config import DeviceConfig, Settings
    from domilink.security import SessionManager

    settings = Settings(
        allowed_origins=("https://pdv.example.invalid",),
        devices=(
            DeviceConfig(
                "s", "scale", "serial-scale", "Balança", {"port": "FAKE", "protocol": "upx"}
            ),
            DeviceConfig("b", "barcode", "serial-barcode", "Leitor", {"port": "FAKE"}),
        ),
    )
    sessions = SessionManager(120, 900)
    code, _ = sessions.create_pairing_code()
    app = create_app(settings, sessions=sessions)
    scale = app.state.registry.scale("s")
    barcode = app.state.registry.barcode("b")
    monkeypatch.setattr(scale, "_open", lambda timeout: FakeSerial([b"\x02-00500\r"]))
    monkeypatch.setattr(barcode, "_open", lambda timeout: FakeSerial([b"7890000000011\r"]))
    client = TestClient(app)
    assert client.get("/v1/scales/s/read").status_code == 401
    origin = {"Origin": settings.allowed_origins[0]}
    token = client.post(
        "/v1/pair", headers=origin, json={"code": code, "client_name": "Teste"}
    ).json()["token"]
    auth = {**origin, "Authorization": f"Bearer {token}"}
    assert client.get("/v1/scales/s/read", headers=auth).json()["reading"] == {
        "weight_kg": -0.5,
        "stable": False,
        "unit": "kg",
    }
    assert client.get("/v1/barcodes/b/read", headers=auth).json()["code"] == "7890000000011"
    assert client.post("/v1/scales/s/tare", headers=auth).status_code == 503


def test_queue_full_http_preserves_replay(monkeypatch: pytest.MonkeyPatch) -> None:
    import base64

    from fastapi.testclient import TestClient

    from domilink.api import create_app
    from domilink.config import DeviceConfig, Settings
    from domilink.security import SessionManager

    settings = Settings(
        job_retention=10, devices=(DeviceConfig("p", "printer", "virtual", "P", {}),)
    )
    sessions = SessionManager(120, 900)
    code, _ = sessions.create_pairing_code()
    client = TestClient(create_app(settings, sessions=sessions))
    token = client.post("/v1/pair", json={"code": code, "client_name": "Teste"}).json()["token"]
    auth = {"Authorization": f"Bearer {token}"}
    payload = {
        "device_id": "p",
        "format": "text",
        "content_base64": base64.b64encode(b"synthetic").decode(),
    }
    for index in range(10):
        response = client.post(
            "/v1/print/jobs", headers={**auth, "Idempotency-Key": f"job-{index:08}"}, json=payload
        )
        assert response.status_code == 202
    replay = client.post(
        "/v1/print/jobs", headers={**auth, "Idempotency-Key": "job-00000000"}, json=payload
    )
    assert replay.status_code == 200
    assert replay.json()["replayed"] is True
    full = client.post(
        "/v1/print/jobs", headers={**auth, "Idempotency-Key": "job-overflow"}, json=payload
    )
    assert full.status_code == 503
    assert full.headers["Retry-After"] == "30"
    assert full.json()["error"]["code"] == "print_queue_full"


def test_serial_disconnect_is_safe_and_releases_lock(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeSerial([])
    scale = SerialScale("s", "Balança", {"port": "FAKE", "protocol": "upx"})
    monkeypatch.setattr(scale, "_open", lambda timeout: connection)

    def disconnected(size: int) -> bytes:
        raise OSError("private device path")

    monkeypatch.setattr(connection, "read", disconnected)
    with pytest.raises(DeviceOffline) as error:
        scale.read()
    assert "private" not in str(error.value)
    assert connection.closed
    assert not scale._lock.locked()


def test_auto_protocol_does_not_write_commands(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = FakeSerial([b"ST 1.250 kg\r"])
    scale = SerialScale("s", "Balança", {"port": "FAKE", "protocol": "auto"})
    monkeypatch.setattr(scale, "_open", lambda timeout: connection)
    assert scale.read().weight_kg == 1.25
    assert connection.writes == []


def test_discovery_only_lists_ports_without_opening(monkeypatch: pytest.MonkeyPatch) -> None:
    from domilink import discovery

    port_module = SimpleNamespace(
        comports=lambda: [
            SimpleNamespace(device="FAKE1", description="USB Serial", hwid=""),
            SimpleNamespace(device="FAKE2", description="EPSON thermal printer", hwid=""),
        ]
    )
    monkeypatch.setattr(discovery.importlib, "import_module", lambda name: port_module)
    assert discovery.serial_ports() == [
        {"port": "FAKE1", "description": "USB Serial", "scale_candidate": True},
        {"port": "FAKE2", "description": "EPSON thermal printer", "scale_candidate": False},
    ]


def test_discovery_cli_returns_before_server_start(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from domilink import cli

    monkeypatch.setattr(cli, "serial_ports", lambda: [{"port": "FAKE"}])
    monkeypatch.setattr(cli.uvicorn, "run", lambda *args, **kwargs: pytest.fail("server started"))
    assert cli.main(["--list-ports"]) == 0
    assert "FAKE" in capsys.readouterr().out
