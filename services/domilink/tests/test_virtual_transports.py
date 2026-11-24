"""Transportes simulados: PTY do SO, socket fake e USB mock; nunca hardware físico."""
from __future__ import annotations

import os
import select
import sys
import threading
from types import SimpleNamespace
from typing import Any
from unittest.mock import Mock

import pytest

from domilink.adapters.base import DeviceOffline, PrintPayload
from domilink.adapters.escpos import EscposPrinter
from domilink.adapters.serial import SerialScale


@pytest.mark.skipif(sys.platform == "win32", reason="PTY POSIX; Windows usa serial fake")
def test_real_pyserial_roundtrip_over_virtual_pty() -> None:
    pytest.importorskip("serial")
    master, slave = os.openpty()
    seen: list[bytes] = []

    def respond() -> None:
        if select.select([master], [], [], 3)[0]:
            seen.append(os.read(master, 1))
            os.write(master, b"\x02 01250\x03")

    thread = threading.Thread(target=respond, daemon=True)
    try:
        scale = SerialScale("qa-pty", "Balança virtual PTY", {
            "port": os.ttyname(slave), "protocol": "upx",
        })
        thread.start()
        assert scale.read(2).weight_kg == 1.25
        thread.join(3)
        assert seen == [b"\x05"]
    finally:
        thread.join(4)
        os.close(slave)
        os.close(master)


def fake_escpos(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    captured: dict[str, Any] = {}

    class Printer:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            captured["args"] = args
            captured["options"] = kwargs
            self.device = SimpleNamespace(write_timeout=None)

        def open(self) -> None:
            captured["opened"] = True

        def _raw(self, content: bytes) -> None:
            captured["content"] = content
            captured["write_timeout"] = self.device.write_timeout

        def close(self) -> None:
            captured["closed"] = True

    module = SimpleNamespace(Network=Printer, Usb=Printer, Serial=Printer)
    monkeypatch.setitem(sys.modules, "escpos", SimpleNamespace(printer=module))
    monkeypatch.setitem(sys.modules, "escpos.printer", module)
    return captured


def test_usb_mock_has_finite_millisecond_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = fake_escpos(monkeypatch)
    printer = EscposPrinter("usb", "USB QA", "usb", {
        "vendor_id": "0x1234", "product_id": "0x5678", "timeout": 2.5,
    })
    printer.print(PrintPayload(b"USB-QA", "escpos"))
    assert seen["options"]["timeout"] == 2500
    assert seen["opened"] and seen["closed"]
    assert seen["content"] == b"USB-QA"


def test_serial_escpos_write_timeout_is_not_infinite(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = fake_escpos(monkeypatch)
    printer = EscposPrinter("serial", "Serial QA", "serial", {"port": "FAKE", "timeout": 3})
    printer.print(PrintPayload(b"SERIAL-QA", "escpos"))
    assert seen["write_timeout"] == 3
    assert seen["closed"]


def test_escpos_network_uses_socket_with_timeout_and_closes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    pytest.importorskip("escpos")
    from escpos.printer import network

    sock = Mock()
    monkeypatch.setattr(network.socket, "socket", lambda *args: sock)
    printer = EscposPrinter("network", "Rede QA", "network", {
        "host": "192.0.2.10", "port": 9100, "timeout": 2,
    })
    printer.print(PrintPayload(b"NETWORK-QA", "escpos"))
    sock.settimeout.assert_called_with(2)
    sock.connect.assert_called_with(("192.0.2.10", 9100))
    sock.sendall.assert_called_with(b"NETWORK-QA")
    sock.close.assert_called()


def test_native_driver_error_is_safe_and_probe_fails_closed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def unavailable(*args: Any, **kwargs: Any) -> Any:
        raise RuntimeError("private-path-and-native-error")

    module = SimpleNamespace(Network=unavailable, Usb=unavailable, Serial=unavailable)
    monkeypatch.setitem(sys.modules, "escpos", SimpleNamespace(printer=module))
    monkeypatch.setitem(sys.modules, "escpos.printer", module)
    printer = EscposPrinter("qa", "Impressora QA", "usb", {
        "vendor_id": "0x1234", "product_id": "0x5678",
    })
    assert printer.probe() is False
    with pytest.raises(DeviceOffline) as error:
        printer.print(PrintPayload(b"QA", "escpos"))
    assert "private-path" not in str(error.value)
    assert not printer._lock.locked()
