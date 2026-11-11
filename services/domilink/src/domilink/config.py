from __future__ import annotations

import ipaddress
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional

if sys.version_info >= (3, 11):  # pragma: no cover - ambiente atual usa 3.9
    import tomllib
else:
    import tomli as tomllib


LOOPBACK_HOST = "127.0.0.1"


class ConfigError(ValueError):
    """Configuração insegura ou inválida."""


@dataclass(frozen=True)
class DeviceConfig:
    id: str
    kind: str
    adapter: str
    label: str
    options: Mapping[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class Settings:
    port: int = 8765
    allowed_origins: tuple[str, ...] = ("http://127.0.0.1:5173",)
    session_ttl_seconds: int = 900
    pairing_ttl_seconds: int = 120
    max_body_bytes: int = 8 * 1024 * 1024
    rate_limit_requests: int = 120
    rate_limit_window_seconds: int = 60
    job_retention: int = 500
    devices: tuple[DeviceConfig, ...] = ()

    @property
    def host(self) -> str:
        return LOOPBACK_HOST


def _bounded_int(value: Any, name: str, minimum: int, maximum: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"{name} deve ser inteiro") from exc
    if not minimum <= parsed <= maximum:
        raise ConfigError(f"{name} deve ficar entre {minimum} e {maximum}")
    return parsed


def _validate_origin(origin: Any) -> str:
    if not isinstance(origin, str) or not origin:
        raise ConfigError("allowed_origins aceita somente origens explícitas")
    if origin == "*" or "/" in origin.split("://", 1)[-1]:
        raise ConfigError("origem curinga ou com caminho não é permitida")
    if not origin.startswith(("http://", "https://")):
        raise ConfigError("origem deve começar com http:// ou https://")
    return origin.rstrip("/")


def _parse_device(raw: Mapping[str, Any]) -> DeviceConfig:
    required = ("id", "kind", "adapter", "label")
    if any(not isinstance(raw.get(key), str) or not raw[key] for key in required):
        raise ConfigError("cada dispositivo exige id, kind, adapter e label")
    kind = str(raw["kind"])
    if kind not in {"printer", "scale", "barcode"}:
        raise ConfigError(f"tipo de dispositivo desconhecido: {kind}")
    options = {key: value for key, value in raw.items() if key not in required}
    return DeviceConfig(
        id=str(raw["id"]),
        kind=kind,
        adapter=str(raw["adapter"]),
        label=str(raw["label"]),
        options=options,
    )


def load_settings(path: Optional[Path] = None) -> Settings:
    data: Dict[str, Any] = {}
    if path is not None:
        with path.open("rb") as handle:
            data = tomllib.load(handle)
    server = data.get("server", {})
    if not isinstance(server, Mapping):
        raise ConfigError("[server] inválido")

    # Nem mesmo uma configuração local pode ampliar o bind para a rede.
    configured_host = server.get("host", LOOPBACK_HOST)
    try:
        host_ip = ipaddress.ip_address(str(configured_host))
    except ValueError as exc:
        raise ConfigError("host deve ser 127.0.0.1") from exc
    if str(host_ip) != LOOPBACK_HOST:
        raise ConfigError("DomiLink aceita bind somente em 127.0.0.1")

    origins_raw = server.get("allowed_origins", ["http://127.0.0.1:5173"])
    if not isinstance(origins_raw, list) or not origins_raw:
        raise ConfigError("configure ao menos uma origem permitida")
    origins = tuple(_validate_origin(value) for value in origins_raw)

    devices_raw = data.get("devices", [])
    if not isinstance(devices_raw, list):
        raise ConfigError("devices deve ser uma lista")
    devices = tuple(_parse_device(raw) for raw in devices_raw)
    ids = [device.id for device in devices]
    if len(ids) != len(set(ids)):
        raise ConfigError("IDs de dispositivos devem ser únicos")

    return Settings(
        port=_bounded_int(server.get("port", 8765), "port", 1024, 65535),
        allowed_origins=origins,
        session_ttl_seconds=_bounded_int(
            server.get("session_ttl_seconds", 900), "session_ttl_seconds", 60, 3600
        ),
        pairing_ttl_seconds=_bounded_int(
            server.get("pairing_ttl_seconds", 120), "pairing_ttl_seconds", 30, 600
        ),
        max_body_bytes=_bounded_int(
            server.get("max_body_bytes", 8 * 1024 * 1024),
            "max_body_bytes",
            1024,
            32 * 1024 * 1024,
        ),
        rate_limit_requests=_bounded_int(
            server.get("rate_limit_requests", 120), "rate_limit_requests", 10, 10_000
        ),
        rate_limit_window_seconds=_bounded_int(
            server.get("rate_limit_window_seconds", 60),
            "rate_limit_window_seconds",
            1,
            3600,
        ),
        job_retention=_bounded_int(server.get("job_retention", 500), "job_retention", 10, 5000),
        devices=devices,
    )
