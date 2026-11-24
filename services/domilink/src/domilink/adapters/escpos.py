from __future__ import annotations

import math
import threading
import time
from contextlib import suppress
from typing import Any, Mapping

from .base import DeviceOffline, DeviceTimeout, PrintAdapter, PrintPayload, UnsupportedOperation


class EscposPrinter(PrintAdapter):
    """ESC/POS genérico; transporte e perfil são explícitos e opcionais."""

    def __init__(
        self, device_id: str, label: str, transport: str, options: Mapping[str, Any]
    ) -> None:
        super().__init__(device_id, label)
        self.transport = transport
        self.options = options
        self._lock = threading.Lock()

    def _connect(self, timeout_seconds: float = 5.0) -> Any:
        try:
            from escpos.printer import Network, Serial, Usb  # type: ignore
        except ImportError as exc:
            raise DeviceOffline("Extra escpos não instalado") from exc
        profile = str(self.options.get("profile", "default"))
        printer = None
        try:
            timeout = min(float(self.options.get("timeout", 5)), timeout_seconds)
            if not math.isfinite(timeout) or timeout <= 0:
                raise ValueError("timeout inválido")
            if self.transport == "network":
                printer = Network(
                    str(self.options["host"]),
                    port=int(self.options.get("port", 9100)),
                    timeout=timeout,
                    profile=profile,
                )
            elif self.transport == "usb":
                printer = Usb(
                    int(str(self.options["vendor_id"]), 0),
                    int(str(self.options["product_id"]), 0),
                    timeout=max(1, math.ceil(timeout * 1000)),  # PyUSB usa milissegundos.
                    profile=profile,
                )
            elif self.transport == "serial":
                printer = Serial(
                    devfile=str(self.options["port"]),
                    baudrate=int(self.options.get("baudrate", 9600)),
                    timeout=timeout,
                    profile=profile,
                )
            else:
                raise UnsupportedOperation("Transporte ESC/POS desconhecido")
            # A biblioteca só abre na primeira operação. A sondagem precisa
            # verificar a conexão configurada, sem enviar dados ou imprimir.
            printer.open()
            if self.transport == "serial":
                # python-escpos 3.1 só configura timeout de LEITURA.
                printer.device.write_timeout = timeout
            return printer
        except UnsupportedOperation:
            raise
        except Exception as exc:
            if printer is not None:
                with suppress(Exception):
                    printer.close()
            # Bibliotecas opcionais lançam erros próprios (USB/backend/perfil).
            # Não deixar mensagem nativa/caminho/documento escapar para logs/API.
            raise DeviceOffline("Não foi possível abrir a impressora ESC/POS") from exc

    @property
    def supported_formats(self) -> list[str]:
        return ["text", "escpos"]

    def probe(self) -> bool:
        if not self._lock.acquire(blocking=False):
            return True
        try:
            printer = self._connect()
            printer.close()
            return True
        except (DeviceOffline, UnsupportedOperation, OSError):
            return False
        finally:
            self._lock.release()

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        if payload.format not in {"text", "escpos"}:
            raise UnsupportedOperation("ESC/POS aceita texto UTF-8 ou bytes ESC/POS")
        if not self._lock.acquire(timeout=timeout_seconds):
            raise DeviceTimeout("Impressora em uso; tente novamente")
        printer = None
        try:
            deadline = time.monotonic() + timeout_seconds
            printer = self._connect(timeout_seconds)
            for _ in range(payload.copies):
                if time.monotonic() >= deadline:
                    raise DeviceTimeout("Tempo limite da impressora excedido")
                if payload.format == "text":
                    printer.text(payload.content.decode("utf-8"))
                    printer.cut()
                else:
                    printer._raw(payload.content)
        except TimeoutError as exc:
            raise DeviceTimeout("Tempo limite da impressora excedido") from exc
        except (DeviceOffline, DeviceTimeout, UnsupportedOperation):
            raise
        except Exception as exc:
            raise DeviceOffline("Falha de comunicação com a impressora") from exc
        finally:
            try:
                if printer is not None:
                    # Falha ao fechar não apaga resultado de envio já aceito.
                    with suppress(Exception):
                        printer.close()
            finally:
                self._lock.release()
