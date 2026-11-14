from __future__ import annotations

import re
from typing import Any, Mapping, Optional

from .base import BarcodeAdapter, DeviceOffline, DeviceTimeout, ScaleAdapter, ScaleReading

WEIGHT_PATTERN = re.compile(r"([-+]?\d+(?:[.,]\d+)?)\s*(kg|g)?", re.IGNORECASE)


def parse_weight_line(line: str) -> ScaleReading:
    match = WEIGHT_PATTERN.search(line.strip())
    if match is None:
        raise ValueError("leitura de peso não reconhecida")
    value = float(match.group(1).replace(",", "."))
    unit = (match.group(2) or "kg").lower()
    if unit == "g":
        value /= 1000
    unstable_markers = ("US", "UNSTABLE", "?")
    stable = not any(marker in line.upper() for marker in unstable_markers)
    return ScaleReading(round(value, 3), stable=stable)


class _SerialMixin:
    def __init__(self, options: Mapping[str, Any]) -> None:
        self.options = options

    def _open(self, timeout_seconds: float) -> Any:
        try:
            import serial  # type: ignore[import-untyped]
        except ImportError as exc:
            raise DeviceOffline("Extra serial não instalado") from exc
        try:
            return serial.Serial(
                port=str(self.options["port"]),
                baudrate=int(self.options.get("baudrate", 9600)),
                bytesize=int(self.options.get("bytesize", 8)),
                parity=str(self.options.get("parity", "N")),
                stopbits=float(self.options.get("stopbits", 1)),
                timeout=timeout_seconds,
            )
        except (KeyError, OSError, ValueError, serial.SerialException) as exc:
            raise DeviceOffline("Porta serial indisponível") from exc


class SerialScale(_SerialMixin, ScaleAdapter):
    def __init__(self, device_id: str, label: str, options: Mapping[str, Any]) -> None:
        ScaleAdapter.__init__(self, device_id, label)
        _SerialMixin.__init__(self, options)

    def probe(self) -> bool:
        try:
            connection = self._open(0.2)
            connection.close()
            return True
        except DeviceOffline:
            return False

    def read(self, timeout_seconds: float = 2.0) -> ScaleReading:
        connection = self._open(timeout_seconds)
        try:
            request = str(self.options.get("read_command", ""))
            if request:
                connection.write(request.encode("ascii"))
            raw = connection.readline()
            if not raw:
                raise DeviceTimeout("Balança não respondeu")
            return parse_weight_line(raw.decode(str(self.options.get("encoding", "ascii"))))
        except UnicodeError as exc:
            raise DeviceOffline("Resposta inválida da balança") from exc
        finally:
            connection.close()

    def tare(self, timeout_seconds: float = 2.0) -> None:
        command = str(self.options.get("tare_command", ""))
        if not command:
            raise DeviceOffline("Comando de tara não configurado para este protocolo")
        connection = self._open(timeout_seconds)
        try:
            connection.write(command.encode("ascii"))
            connection.flush()
        finally:
            connection.close()


class SerialBarcode(_SerialMixin, BarcodeAdapter):
    def __init__(self, device_id: str, label: str, options: Mapping[str, Any]) -> None:
        BarcodeAdapter.__init__(self, device_id, label)
        _SerialMixin.__init__(self, options)

    def probe(self) -> bool:
        try:
            connection = self._open(0.2)
            connection.close()
            return True
        except DeviceOffline:
            return False

    def read(self, timeout_seconds: float = 10.0) -> Optional[str]:
        connection = self._open(timeout_seconds)
        try:
            raw = connection.readline()
            if not raw:
                return None
            code = raw.decode(str(self.options.get("encoding", "utf-8"))).strip()
            return code[:4096] or None
        except UnicodeError as exc:
            raise DeviceOffline("Resposta inválida do leitor") from exc
        finally:
            connection.close()
