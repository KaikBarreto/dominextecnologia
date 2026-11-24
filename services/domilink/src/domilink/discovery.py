"""Descoberta local passiva inspirada no EcoTray; nunca abre nem escreve em portas."""

from __future__ import annotations

import importlib
import shutil
import subprocess
import sys
from typing import Any

from .adapters.base import DeviceOffline

_SKIP_PORT_KEYWORDS = (
    "printer",
    "print",
    "receipt",
    "thermal",
    "epson",
    "star",
    "bixolon",
    "citizen",
    "custom",
    "sewoo",
    "anydesk",
    "bluetooth",
    "bth",
    "gps",
    "modem",
    "fax",
)
COMMON_BAUDRATES = (9600, 4800, 19200, 2400, 38400)


def serial_ports() -> list[dict[str, Any]]:
    try:
        ports = importlib.import_module("serial.tools.list_ports")
    except ImportError as exc:
        raise DeviceOffline("Instale o suporte serial do DomiLink para listar portas") from exc
    return [
        {
            "port": port.device,
            "description": port.description or "",
            "scale_candidate": not any(
                keyword in ((port.description or "") + " " + (port.hwid or "")).lower()
                for keyword in _SKIP_PORT_KEYWORDS
            ),
        }
        for port in ports.comports()
    ]


def printer_queues() -> list[str]:
    if sys.platform == "win32":
        try:
            printing = importlib.import_module("win32print")
            return sorted(
                {
                    str(item[2])
                    for item in printing.EnumPrinters(
                        printing.PRINTER_ENUM_LOCAL | printing.PRINTER_ENUM_CONNECTIONS, None, 1
                    )
                }
            )
        except ImportError as exc:
            raise DeviceOffline("Instale o suporte de impressão Windows do DomiLink") from exc
        except Exception as exc:
            raise DeviceOffline("Não foi possível consultar as filas do Windows") from exc
    executable = shutil.which("lpstat")
    if executable is None:
        raise DeviceOffline("Spooler CUPS não encontrado")
    try:
        result = subprocess.run(
            [executable, "-a"], capture_output=True, text=True, timeout=5, check=False
        )
        if result.returncode:
            raise DeviceOffline("Não foi possível consultar as filas do CUPS")
        return [line.split()[0] for line in result.stdout.splitlines() if line.strip()]
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise DeviceOffline("Não foi possível consultar as filas do CUPS") from exc
