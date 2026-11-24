from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from . import windows_gdi
from .base import DeviceOffline, DeviceTimeout, PrintAdapter, PrintPayload, UnsupportedOperation


class SystemPdfPrinter(PrintAdapter):
    """Imprime PDF pelo spooler do SO sem shell e remove o arquivo temporário."""

    def __init__(
        self,
        device_id: str,
        label: str,
        printer_name: str = "",
        paper_width_mm: float | None = None,
    ) -> None:
        super().__init__(device_id, label)
        self.printer_name = printer_name
        self.paper_width_mm = paper_width_mm

    def probe(self) -> bool:
        if sys.platform == "win32":
            return windows_gdi.available()
        return shutil.which("lp") is not None

    @property
    def supported_formats(self) -> list[str]:
        return ["pdf"]

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        if payload.format != "pdf":
            raise UnsupportedOperation("O adaptador do sistema aceita somente PDF")
        if sys.platform == "win32":
            windows_gdi.print_pdf(payload, self.printer_name, self.paper_width_mm, timeout_seconds)
            return
        if not self.probe():
            raise DeviceOffline("Spooler de impressão não encontrado")
        temp_path: Path
        with tempfile.NamedTemporaryFile(prefix="domilink-", suffix=".pdf", delete=False) as handle:
            handle.write(payload.content)
            temp_path = Path(handle.name)
        try:
            command = ["lp"]
            if self.printer_name:
                command.extend(["-d", self.printer_name])
            command.extend(["-n", str(payload.copies), str(temp_path)])
            try:
                result = subprocess.run(
                    command,
                    check=False,
                    capture_output=True,
                    timeout=timeout_seconds,
                )
            except OSError as exc:
                raise DeviceOffline("Spooler indisponível; confira a fila de impressão") from exc
            except subprocess.TimeoutExpired as exc:
                raise DeviceTimeout("Tempo limite do spooler excedido") from exc
            if result.returncode != 0:
                raise DeviceOffline("Spooler recusou o trabalho de impressão")
        finally:
            temp_path.unlink(missing_ok=True)
