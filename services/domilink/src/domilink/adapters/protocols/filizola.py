"""Adaptado de EcoTray protocols/filizola.py; ASCII, sem supor suporte BCD."""

from __future__ import annotations

import re

FILIZOLA_PATTERN = re.compile(r"[PF][\s:]*([+\-]?\d{4,8}(?:[.,]\d+)?)\s*(kg|g)?", re.IGNORECASE)
FILIZOLA_RAW_PATTERN = re.compile(rb"\x02([+\-]?\d{5,8})[\x03\r\n]")


def parse(raw: bytes) -> str | None:
    try:
        text = raw.decode("ascii").strip(" \r\n\x02\x03")
    except UnicodeError:
        return None
    match = FILIZOLA_PATTERN.fullmatch(text)
    if match:
        raw_value = match.group(1).replace(",", ".")
        value = float(raw_value)
        unit = (match.group(2) or "").lower()
        # Sem unidade, inteiro do perfil significa gramas, inclusive 0..1000g.
        if unit == "g" or (not unit and "." not in raw_value):
            value /= 1000
        return f"{value:.3f}"
    match_raw = FILIZOLA_RAW_PATTERN.fullmatch(raw)
    if match_raw:
        return f"{int(match_raw.group(1)) / 1000:.3f}"
    return None
