from __future__ import annotations

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

    def _connect(self) -> Any:
        try:
            from escpos.printer import Network, Serial, Usb  # type: ignore[import-not-found]
        except ImportError as exc:
            raise DeviceOffline("Extra escpos não instalado") from exc
        profile = str(self.options.get("profile", "default"))
        try:
            if self.transport == "network":
                return Network(
                    str(self.options["host"]),
                    port=int(self.options.get("port", 9100)),
                    timeout=float(self.options.get("timeout", 5)),
                    profile=profile,
                )
            if self.transport == "usb":
                return Usb(
                    int(str(self.options["vendor_id"]), 0),
                    int(str(self.options["product_id"]), 0),
                    profile=profile,
                )
            if self.transport == "serial":
                return Serial(
                    devfile=str(self.options["port"]),
                    baudrate=int(self.options.get("baudrate", 9600)),
                    timeout=float(self.options.get("timeout", 5)),
                    profile=profile,
                )
        except (KeyError, OSError, ValueError) as exc:
            raise DeviceOffline("Não foi possível abrir a impressora ESC/POS") from exc
        raise UnsupportedOperation("Transporte ESC/POS desconhecido")

    @property
    def supported_formats(self) -> list[str]:
        return ["text", "escpos"]

    def probe(self) -> bool:
        try:
            printer = self._connect()
            printer.close()
            return True
        except (DeviceOffline, UnsupportedOperation, OSError):
            return False

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        del timeout_seconds
        if payload.format not in {"text", "escpos"}:
            raise UnsupportedOperation("ESC/POS aceita texto UTF-8 ou bytes ESC/POS")
        printer = self._connect()
        try:
            for _ in range(payload.copies):
                if payload.format == "text":
                    printer.text(payload.content.decode("utf-8"))
                    printer.cut()
                else:
                    printer._raw(payload.content)
        except TimeoutError as exc:
            raise DeviceTimeout("Tempo limite da impressora excedido") from exc
        except (OSError, UnicodeError) as exc:
            raise DeviceOffline("Falha de comunicação com a impressora") from exc
        finally:
            printer.close()
