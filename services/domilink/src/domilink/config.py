from __future__ import annotations

import ipaddress
import math
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Mapping, Optional
from urllib.parse import urlsplit

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
    if isinstance(value, bool) or isinstance(value, float):
        raise ConfigError(f"{name} deve ser inteiro")
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
    try:
        parsed = urlsplit(origin)
        valid = (
            parsed.scheme in {"http", "https"}
            and parsed.hostname
            and parsed.username is None
            and parsed.password is None
            and parsed.path in {"", "/"}
            and not parsed.query
            and not parsed.fragment
            and "*" not in origin
            and not any(character.isspace() for character in origin)
        )
        _ = parsed.port  # Valida porta/faixa e IPv6 antes de iniciar o serviço.
    except ValueError as exc:
        raise ConfigError(
            "Configure a origem exata do aplicativo, sem caminho ou credenciais"
        ) from exc
    if not valid:
        raise ConfigError("Configure a origem exata do aplicativo, sem caminho ou credenciais")
    return origin.rstrip("/")


def _parse_device(raw: Mapping[str, Any]) -> DeviceConfig:
    if not isinstance(raw, Mapping):
        raise ConfigError("cada dispositivo deve ser uma seção [[devices]]")
    required = ("id", "kind", "adapter", "label")
    if any(not isinstance(raw.get(key), str) or not raw[key] for key in required):
        raise ConfigError("cada dispositivo exige id, kind, adapter e label")
    kind = str(raw["kind"])
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,64}", str(raw["id"])):
        raise ConfigError("id do dispositivo deve usar até 64 letras, números, ponto ou hífen")
    if kind not in {"printer", "scale", "barcode"}:
        raise ConfigError(f"tipo de dispositivo desconhecido: {kind}")
    options = {key: value for key, value in raw.items() if key not in required}
    adapter = str(raw["adapter"])
    if adapter in {"serial-scale", "serial-barcode", "escpos-serial"}:
        _bounded_int(options.get("baudrate", 9600), "baudrate", 50, 4_000_000)
        if not isinstance(options.get("port"), str) or not str(options["port"]).strip():
            raise ConfigError("Escolha a porta serial local do dispositivo")
    if adapter in {"serial-scale", "serial-barcode"}:
        _bounded_int(options.get("bytesize", 8), "bytesize", 5, 8)
        if options.get("parity", "N") not in {"N", "E", "O", "M", "S"}:
            raise ConfigError("parity deve ser N, E, O, M ou S")
        if options.get("stopbits", 1) not in {1, 1.5, 2}:
            raise ConfigError("stopbits deve ser 1, 1.5 ou 2")
    if adapter == "escpos-network":
        if not isinstance(options.get("host"), str) or not re.fullmatch(
            r"[A-Za-z0-9_.:\[\]-]+", str(options["host"])
        ):
            raise ConfigError("Informe somente o endereço da impressora, sem URL ou credenciais")
        _bounded_int(options.get("port", 9100), "port da impressora", 1, 65535)
    for name in ("weight_kg", "paper_width_mm", "timeout"):
        if name not in options:
            continue
        value = options[name]
        if (
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
        ):
            raise ConfigError(f"{name} deve ser um número finito")
        if name != "weight_kg" and value <= 0:
            raise ConfigError(f"{name} deve ser maior que zero")
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
        try:
            with path.open("rb") as handle:
                data = tomllib.load(handle)
        except ValueError as exc:
            raise ConfigError("Arquivo TOML inválido; confira as seções e os valores") from exc
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
