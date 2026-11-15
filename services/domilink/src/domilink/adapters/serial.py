from __future__ import annotations

import re
import threading
import time
from typing import Any, Mapping, Optional

from ..config import ConfigError
from .base import (
    BarcodeAdapter,
    DeviceOffline,
    DeviceTimeout,
    ScaleAdapter,
    ScaleReading,
    UnsupportedOperation,
)
from .protocols import PROTOCOLS, parse_weight

WEIGHT_PATTERN = re.compile(r"([-+]?\s*\d+(?:[.,]\d+)?)\s*(kg|g)?", re.IGNORECASE)


def parse_weight_line(line: str) -> ScaleReading:
    """Perfil legado line: número sem unidade continua significando kg."""
    match = WEIGHT_PATTERN.search(line.strip())
    if match is None:
        raise ValueError("Leitura de peso não reconhecida")
    value = float(match.group(1).replace(" ", "").replace(",", "."))
    if (match.group(2) or "kg").lower() == "g":
        value /= 1000
    stable = not any(marker in line.upper() for marker in ("US", "UNSTABLE", "?"))
    return ScaleReading(round(value, 3), stable=stable)


def pop_frame(buffer: bytes) -> tuple[Optional[bytes], bytes]:
    """Framing EcoTray corrigido: preserva ETX/CR para o parser UPX."""
    for index, byte in enumerate(buffer):
        if byte in (3, 10, 13):
            return buffer[: index + 1], buffer[index + 1 :]
    return None, buffer


class _SerialMixin:
    def __init__(self, options: Mapping[str, Any]) -> None:
        self.options = options
        self._lock = threading.Lock()
        if not isinstance(options.get("port"), str) or not options["port"].strip():
            raise ConfigError("Escolha a porta serial local do dispositivo")

    def _open(self, timeout_seconds: float) -> Any:
        try:
            import serial  # type: ignore[import-untyped]
        except ImportError as exc:
            raise DeviceOffline("Instale o suporte serial do DomiLink") from exc
        try:
            return serial.Serial(
                port=str(self.options["port"]),
                baudrate=int(self.options.get("baudrate", 9600)),
                bytesize=int(self.options.get("bytesize", 8)),
                parity=str(self.options.get("parity", "N")),
                stopbits=float(self.options.get("stopbits", 1)),
                timeout=min(timeout_seconds, 0.1),
                write_timeout=timeout_seconds,
            )
        except (KeyError, OSError, ValueError, serial.SerialException) as exc:
            raise DeviceOffline(
                "Porta serial indisponível; confira a conexão e a configuração"
            ) from exc

    def probe(self) -> bool:
        if not self._lock.acquire(blocking=False):
            return True
        try:
            connection = self._open(0.2)
            connection.close()
            return True
        except (DeviceOffline, OSError):
            return False
        finally:
            self._lock.release()

    @staticmethod
    def _close(connection: Any) -> None:
        try:
            connection.close()
        except OSError as exc:
            raise DeviceOffline("Falha ao encerrar a comunicação serial") from exc


class SerialScale(_SerialMixin, ScaleAdapter):
    def __init__(self, device_id: str, label: str, options: Mapping[str, Any]) -> None:
        ScaleAdapter.__init__(self, device_id, label)
        _SerialMixin.__init__(self, options)
        self.protocol = str(options.get("protocol", "line"))
        if self.protocol not in {*PROTOCOLS, "auto", "line"}:
            raise ConfigError(
                "Protocolo de balança desconhecido; escolha line, upx, toledo, filizola ou generic"
            )

    def capabilities(self) -> dict[str, object]:
        actions = ["read", "stream"]
        if self.options.get("tare_command"):
            actions.append("tare")
        return {"actions": actions, "unit": "kg"}

    def read(self, timeout_seconds: float = 2.0) -> ScaleReading:
        if not self._lock.acquire(timeout=timeout_seconds):
            raise DeviceTimeout("Balança em uso; tente novamente")
        connection = None
        try:
            connection = self._open(timeout_seconds)
            deadline = time.monotonic() + timeout_seconds
            buffer = b""
            last_request = 0.0
            # Polling UPX EcoTray: ENQ a cada 280ms, somente em perfil explícito UPX.
            command = str(
                self.options.get("read_command", "\x05" if self.protocol == "upx" else "")
            )
            while time.monotonic() < deadline:
                now = time.monotonic()
                if command and now - last_request >= 0.28:
                    connection.write(command.encode("ascii"))
                    connection.flush()
                    last_request = now
                connection.timeout = min(0.1, max(0.001, deadline - now))
                buffer += connection.read(max(1, min(int(connection.in_waiting), 64)))
                if len(buffer) > 4096:
                    raise DeviceOffline("Resposta da balança excedeu o limite; confira o protocolo")
                while True:
                    frame, buffer = pop_frame(buffer)
                    if frame is None:
                        break
                    if self.protocol == "line":
                        try:
                            return parse_weight_line(
                                frame.decode(str(self.options.get("encoding", "ascii")))
                            )
                        except ValueError:
                            continue
                    reading = parse_weight(frame, self.protocol)
                    if reading is not None:
                        return reading
            raise DeviceTimeout("Balança não enviou um peso válido; confira o protocolo e a porta")
        except (OSError, UnicodeError, LookupError) as exc:
            raise DeviceOffline("Falha de comunicação com a balança; confira a conexão") from exc
        finally:
            try:
                if connection is not None:
                    self._close(connection)
            finally:
                self._lock.release()

    def tare(self, timeout_seconds: float = 2.0) -> None:
        command = str(self.options.get("tare_command", ""))
        if not command:
            raise UnsupportedOperation("Tara não disponível para esta balança")
        if not self._lock.acquire(timeout=timeout_seconds):
            raise DeviceTimeout("Balança em uso; tente novamente")
        connection = None
        try:
            connection = self._open(timeout_seconds)
            connection.write(command.encode("ascii"))
            connection.flush()
        except (OSError, UnicodeError) as exc:
            raise DeviceOffline("Não foi possível enviar a tara; confira a conexão") from exc
        finally:
            try:
                if connection is not None:
                    self._close(connection)
            finally:
                self._lock.release()


class SerialBarcode(_SerialMixin, BarcodeAdapter):
    def __init__(self, device_id: str, label: str, options: Mapping[str, Any]) -> None:
        BarcodeAdapter.__init__(self, device_id, label)
        _SerialMixin.__init__(self, options)
        self._buffer = b""

    def read(self, timeout_seconds: float = 10.0) -> Optional[str]:
        if not self._lock.acquire(timeout=timeout_seconds):
            raise DeviceTimeout("Leitor em uso; tente novamente")
        connection = None
        try:
            deadline = time.monotonic() + timeout_seconds
            while time.monotonic() < deadline:
                frame, self._buffer = pop_frame(self._buffer)
                if frame is not None:
                    code = (
                        frame.strip(b"\x02\x03\r\n")
                        .decode(str(self.options.get("encoding", "utf-8")))
                        .strip()
                    )
                    if not code:
                        continue
                    if any(ord(character) < 32 or ord(character) == 127 for character in code):
                        raise DeviceOffline("Leitura inválida; configure o sufixo Enter no leitor")
                    return code
                if connection is None:
                    connection = self._open(timeout_seconds)
                connection.timeout = min(0.1, max(0.001, deadline - time.monotonic()))
                self._buffer += connection.read(max(1, min(int(connection.in_waiting), 256)))
                if len(self._buffer) > 4096:
                    self._buffer = b""
                    raise DeviceOffline("Código muito longo ou sem terminador; configure o leitor")
            if self._buffer:
                self._buffer = b""
                raise DeviceTimeout("Leitura incompleta; configure Enter, CR ou ETX no leitor")
            return None
        except (OSError, UnicodeError, LookupError) as exc:
            self._buffer = b""
            raise DeviceOffline("Falha de comunicação com o leitor; confira a conexão") from exc
        finally:
            try:
                if connection is not None:
                    self._close(connection)
            finally:
                self._lock.release()
