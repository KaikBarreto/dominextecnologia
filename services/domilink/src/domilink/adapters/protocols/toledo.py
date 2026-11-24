"""Adaptado de EcoTray protocols/toledo.py; preserva sinal, unidade e status."""

from __future__ import annotations

import re

TOLEDO_PATTERN = re.compile(
    r"(?:\b(?:ST|US),(?:GS|NT),)?\s*([+\-]?\s*\d+[.,]\d+)\s*(kg|g)?",
    re.IGNORECASE,
)


def parse(raw: bytes) -> str | None:
    try:
        text = raw.decode("ascii").strip(" \r\n\x02\x03")
    except UnicodeError:
        return None
    match = TOLEDO_PATTERN.fullmatch(text)
    if match is None:
        return None
    value = float(match.group(1).replace(" ", "").replace(",", "."))
    if (match.group(2) or "kg").lower() == "g":
        value /= 1000
    return f"{value:.3f}"
