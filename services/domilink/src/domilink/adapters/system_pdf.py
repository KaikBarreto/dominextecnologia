from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .base import DeviceOffline, DeviceTimeout, PrintAdapter, PrintPayload, UnsupportedOperation


class SystemPdfPrinter(PrintAdapter):
    """Imprime PDF pelo spooler do SO sem shell e remove o arquivo temporário."""

    def __init__(self, device_id: str, label: str, printer_name: str = "") -> None:
        super().__init__(device_id, label)
        self.printer_name = printer_name

    def probe(self) -> bool:
        if sys.platform == "win32":
            return self._powershell() is not None
        return shutil.which("lp") is not None

    @property
    def supported_formats(self) -> list[str]:
        return ["pdf"]

    @staticmethod
    def _powershell() -> str | None:
        return shutil.which("powershell.exe") or shutil.which("pwsh.exe")

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        if payload.format != "pdf":
            raise UnsupportedOperation("O adaptador do sistema aceita somente PDF")
        if not self.probe():
            raise DeviceOffline("Spooler de impressão não encontrado")
        temp_path: Path
        with tempfile.NamedTemporaryFile(prefix="domilink-", suffix=".pdf", delete=False) as handle:
            handle.write(payload.content)
            temp_path = Path(handle.name)
        try:
            if sys.platform == "win32":  # pragma: no cover - depende do SO
                powershell = self._powershell()
                if powershell is None:
                    raise DeviceOffline("PowerShell não encontrado")
                # O script é constante e o caminho segue como argumento separado.
                command = [
                    powershell,
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    "$p=Start-Process -FilePath $args[0] -Verb Print -PassThru;"
                    "if($p){$p|Wait-Process}",
                    str(temp_path),
                ]
            else:
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
            except subprocess.TimeoutExpired as exc:
                raise DeviceTimeout("Tempo limite do spooler excedido") from exc
            if result.returncode != 0:
                raise DeviceOffline("Spooler recusou o trabalho de impressão")
        finally:
            temp_path.unlink(missing_ok=True)
