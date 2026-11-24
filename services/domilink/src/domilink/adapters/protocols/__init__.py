"""Protocolos ASCII adaptados de EcoTray. Veja ECOTRAY_PROVENANCE.md."""

from __future__ import annotations

from typing import Callable, Dict, Optional

from ..base import ScaleReading
from . import filizola, generic, toledo, upx

PROTOCOLS: Dict[str, Callable[[bytes], Optional[str]]] = {
    "upx": upx.parse,
    "toledo": toledo.parse,
    "filizola": filizola.parse,
    "generic": generic.parse,
}


def parse_weight(raw: bytes, protocol: str) -> Optional[ScaleReading]:
    names: tuple[str, ...]
    if protocol == "auto":
        # UPX antes dos regex: seus dígitos não podem virar outro protocolo.
        if b"\x02" in raw:
            names = ("upx", "filizola", "toledo", "generic")
        else:
            names = ("filizola", "toledo", "generic")
    else:
        names = (protocol,)
    for name in names:
        value = PROTOCOLS[name](raw)
        if value is not None:
            # Ausência de um indicador explícito de estabilidade não confirma estabilidade.
            text = raw.decode("ascii", errors="ignore").upper().strip("\x02\x03\r\n ")
            stable = text.startswith("ST") and "US" not in text and "?" not in text
            return ScaleReading(float(value), stable=stable)
    return None
