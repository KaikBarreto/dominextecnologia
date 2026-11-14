from __future__ import annotations

from domilink.adapters.base import DeviceTimeout, PrintAdapter, PrintPayload
from domilink.adapters.serial import parse_weight_line
from domilink.adapters.virtual import VirtualBarcode, VirtualPrinter, VirtualScale
from domilink.jobs import PrintJobStore


class TimeoutPrinter(PrintAdapter):
    @property
    def supported_formats(self) -> list[str]:
        return ["text"]

    @property
    def kind(self) -> str:
        return "printer"

    def probe(self) -> bool:
        return True

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        raise DeviceTimeout("simulado")


def test_virtual_adapters_do_not_store_print_content() -> None:
    printer = VirtualPrinter("p", "Printer")
    printer.print(PrintPayload(b"documento-sensivel", "text"))
    assert printer.jobs[0]["bytes"] == 18
    assert "documento-sensivel" not in repr(printer.jobs)

    scale = VirtualScale("s", "Scale", 1.25)
    assert scale.read().weight_kg == 1.25
    scale.tare()
    assert scale.read().weight_kg == 0

    barcode = VirtualBarcode("b", "Barcode", ["ABC"])
    assert barcode.read() == "ABC"
    assert barcode.read() is None


def test_serial_weight_parser_supports_kg_g_and_unstable() -> None:
    assert parse_weight_line("ST,+ 1.250 kg").weight_kg == 1.25
    grams = parse_weight_line("US 250 g")
    assert grams.weight_kg == 0.25
    assert grams.stable is False


def test_timeout_becomes_safe_job_error() -> None:
    jobs = PrintJobStore(10)
    payload = PrintPayload(b"x", "text")
    job, _ = jobs.create("session", "key-00001", "p", payload)
    jobs.execute(job.id, TimeoutPrinter("p", "Printer"), payload)
    result = jobs.get(job.id)
    assert result.status == "failed"
    assert result.error_code == "device_timeout"
