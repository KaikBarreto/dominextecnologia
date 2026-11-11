from __future__ import annotations

from typing import Dict, Iterable, List

from .adapters.base import BarcodeAdapter, DeviceAdapter, PrintAdapter, ScaleAdapter
from .adapters.escpos import EscposPrinter
from .adapters.serial import SerialBarcode, SerialScale
from .adapters.system_pdf import SystemPdfPrinter
from .adapters.virtual import VirtualBarcode, VirtualPrinter, VirtualScale
from .config import ConfigError, DeviceConfig


class DeviceRegistry:
    def __init__(self, devices: Iterable[DeviceConfig]) -> None:
        self._devices: Dict[str, DeviceAdapter] = {}
        for config in devices:
            self._devices[config.id] = self._build(config)

    def _build(self, config: DeviceConfig) -> DeviceAdapter:
        options = config.options
        if config.adapter == "virtual":
            online = bool(options.get("online", True))
            if config.kind == "printer":
                return VirtualPrinter(config.id, config.label, online=online)
            if config.kind == "scale":
                return VirtualScale(
                    config.id,
                    config.label,
                    weight_kg=float(options.get("weight_kg", 0)),
                    online=online,
                )
            return VirtualBarcode(
                config.id,
                config.label,
                codes=[str(code) for code in options.get("codes", [])],
                online=online,
            )
        if config.adapter == "system-pdf" and config.kind == "printer":
            return SystemPdfPrinter(
                config.id, config.label, printer_name=str(options.get("printer_name", ""))
            )
        if config.adapter.startswith("escpos-") and config.kind == "printer":
            return EscposPrinter(
                config.id,
                config.label,
                transport=config.adapter.removeprefix("escpos-"),
                options=options,
            )
        if config.adapter == "serial-scale" and config.kind == "scale":
            return SerialScale(config.id, config.label, options)
        if config.adapter == "serial-barcode" and config.kind == "barcode":
            return SerialBarcode(config.id, config.label, options)
        raise ConfigError(
            f"adapter {config.adapter!r} não é compatível com dispositivo {config.kind!r}"
        )

    def list(self) -> List[DeviceAdapter]:
        return list(self._devices.values())

    def printer(self, device_id: str) -> PrintAdapter:
        adapter = self._devices.get(device_id)
        if adapter is None or not isinstance(adapter, PrintAdapter):
            raise KeyError(device_id)
        return adapter

    def scale(self, device_id: str) -> ScaleAdapter:
        adapter = self._devices.get(device_id)
        if adapter is None or not isinstance(adapter, ScaleAdapter):
            raise KeyError(device_id)
        return adapter

    def barcode(self, device_id: str) -> BarcodeAdapter:
        adapter = self._devices.get(device_id)
        if adapter is None or not isinstance(adapter, BarcodeAdapter):
            raise KeyError(device_id)
        return adapter
