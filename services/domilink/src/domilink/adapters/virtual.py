from __future__ import annotations

import hashlib
import threading
from collections import deque
from typing import Deque, List, Optional

from .base import (
    BarcodeAdapter,
    DeviceOffline,
    PrintAdapter,
    PrintPayload,
    ScaleAdapter,
    ScaleReading,
)


class VirtualPrinter(PrintAdapter):
    def __init__(self, device_id: str, label: str, online: bool = True) -> None:
        super().__init__(device_id, label)
        self.online = online
        self.jobs: List[dict[str, object]] = []
        self._lock = threading.Lock()

    def probe(self) -> bool:
        return self.online

    @property
    def supported_formats(self) -> List[str]:
        return ["pdf", "text", "escpos"]

    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        del timeout_seconds
        if not self.online:
            raise DeviceOffline("Impressora indisponível")
        # O mock registra somente metadados/digest, nunca conteúdo de documento.
        with self._lock:
            self.jobs.append(
                {
                    "sha256": hashlib.sha256(payload.content).hexdigest(),
                    "bytes": len(payload.content),
                    "format": payload.format,
                    "copies": payload.copies,
                }
            )


class VirtualScale(ScaleAdapter):
    def __init__(
        self, device_id: str, label: str, weight_kg: float = 0.0, online: bool = True
    ) -> None:
        super().__init__(device_id, label)
        self.online = online
        self.weight_kg = weight_kg
        self.tare_offset = 0.0

    def probe(self) -> bool:
        return self.online

    def read(self, timeout_seconds: float = 2.0) -> ScaleReading:
        del timeout_seconds
        if not self.online:
            raise DeviceOffline("Balança indisponível")
        return ScaleReading(round(self.weight_kg - self.tare_offset, 3), stable=True)

    def tare(self, timeout_seconds: float = 2.0) -> None:
        del timeout_seconds
        if not self.online:
            raise DeviceOffline("Balança indisponível")
        self.tare_offset = self.weight_kg


class VirtualBarcode(BarcodeAdapter):
    def __init__(
        self, device_id: str, label: str, codes: Optional[List[str]] = None, online: bool = True
    ) -> None:
        super().__init__(device_id, label)
        self.online = online
        self.codes: Deque[str] = deque(codes or [])

    def probe(self) -> bool:
        return self.online

    def read(self, timeout_seconds: float = 10.0) -> Optional[str]:
        del timeout_seconds
        if not self.online:
            raise DeviceOffline("Leitor indisponível")
        return self.codes.popleft() if self.codes else None
