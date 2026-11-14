from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Dict, List, Optional


class AdapterError(RuntimeError):
    code = "adapter_error"


class DeviceOffline(AdapterError):
    code = "device_offline"


class DeviceTimeout(AdapterError):
    code = "device_timeout"


class UnsupportedOperation(AdapterError):
    code = "unsupported_operation"


@dataclass(frozen=True)
class PrintPayload:
    content: bytes
    format: str
    copies: int = 1
    title: str = "Documento DomiLink"


@dataclass(frozen=True)
class ScaleReading:
    weight_kg: float
    stable: bool
    unit: str = "kg"


class DeviceAdapter(ABC):
    def __init__(self, device_id: str, label: str) -> None:
        self.device_id = device_id
        self.label = label

    @property
    @abstractmethod
    def kind(self) -> str:
        raise NotImplementedError

    @abstractmethod
    def probe(self) -> bool:
        raise NotImplementedError

    def capabilities(self) -> Dict[str, object]:
        """Contrato público mínimo; não expõe porta, host ou configuração privada."""
        return {}


class PrintAdapter(DeviceAdapter, ABC):
    @property
    def kind(self) -> str:
        return "printer"

    @property
    @abstractmethod
    def supported_formats(self) -> List[str]:
        raise NotImplementedError

    def capabilities(self) -> Dict[str, object]:
        return {"print_formats": self.supported_formats}

    @abstractmethod
    def print(self, payload: PrintPayload, timeout_seconds: float = 15.0) -> None:
        raise NotImplementedError


class ScaleAdapter(DeviceAdapter, ABC):
    @property
    def kind(self) -> str:
        return "scale"

    def capabilities(self) -> Dict[str, object]:
        return {"actions": ["read", "tare", "stream"], "unit": "kg"}

    @abstractmethod
    def read(self, timeout_seconds: float = 2.0) -> ScaleReading:
        raise NotImplementedError

    @abstractmethod
    def tare(self, timeout_seconds: float = 2.0) -> None:
        raise NotImplementedError


class BarcodeAdapter(DeviceAdapter, ABC):
    @property
    def kind(self) -> str:
        return "barcode"

    def capabilities(self) -> Dict[str, object]:
        return {"actions": ["read"]}

    @abstractmethod
    def read(self, timeout_seconds: float = 10.0) -> Optional[str]:
        raise NotImplementedError
