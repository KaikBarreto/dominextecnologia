"""Preparação manual e diagnóstico passivo, sem abrir portas nem imprimir."""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Any

from .config import Settings, _validate_origin


def initialize_config(path: Path, origin: str) -> None:
    allowed_origin = _validate_origin(origin)
    content = (
        "# Configuração local: nunca versionar. Dispositivos virtuais não usam hardware.\n"
        "[server]\nport = 8765\nallowed_origins = ["
        + json.dumps(allowed_origin, ensure_ascii=False)
        + "]\n\n"
        '[[devices]]\nid = "printer-demo"\nkind = "printer"\nadapter = "virtual"\n'
        'label = "Impressora virtual"\n\n'
        '[[devices]]\nid = "scale-demo"\nkind = "scale"\nadapter = "virtual"\n'
        'label = "Balança virtual"\nweight_kg = 1.25\n\n'
        '[[devices]]\nid = "barcode-demo"\nkind = "barcode"\nadapter = "virtual"\n'
        'label = "Leitor virtual"\ncodes = ["7890000000011"]\n'
    )
    # O_EXCL recusa também symlinks e nunca sobrescreve a configuração do operador.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(content)


def _module_available(name: str) -> bool:
    try:
        return importlib.util.find_spec(name) is not None
    except (ImportError, ValueError):
        return False


def diagnose(settings: Settings) -> dict[str, Any]:
    """Confere pré-requisitos locais; nunca sonda equipamento ou revela suas opções."""
    devices: list[dict[str, Any]] = []
    for device in settings.devices:
        missing: list[str] = []
        if device.adapter in {"serial-scale", "serial-barcode", "escpos-serial"}:
            if not _module_available("serial"):
                missing.append("Instale o extra serial")
        if device.adapter.startswith("escpos-") and not _module_available("escpos"):
            missing.append("Instale o extra escpos")
        if device.adapter == "escpos-usb" and not _module_available("usb"):
            missing.append("Instale o suporte PyUSB e o backend do sistema")
        if device.adapter == "system-pdf":
            if sys.platform == "win32":
                if not all(_module_available(name) for name in ("win32print", "win32ui", "fitz")):
                    missing.append("Instale o extra windows-print")
            elif shutil.which("lp") is None:
                missing.append("Instale e configure o spooler CUPS")
        devices.append({
            "id": device.id, "kind": device.kind, "adapter": device.adapter,
            "virtual": device.adapter == "virtual", "requirements_ready": not missing,
            "instructions": missing,
        })
    return {
        "configuration_valid": True,
        "hardware_tested": False,
        "requirements_ready": all(item["requirements_ready"] for item in devices),
        "devices": devices,
    }
