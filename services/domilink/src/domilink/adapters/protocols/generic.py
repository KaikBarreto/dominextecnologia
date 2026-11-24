"""Adaptado de EcoTray protocols/generic.py; formato explícito, sem números de status."""

from __future__ import annotations

import re

GENERIC_PATTERN = re.compile(
    r"(?:ST|US)?\s*([+\-]?\s*\d{1,7}(?:[.,]\d{1,3})?)\s*(kg|g)?", re.IGNORECASE
)


def parse(raw: bytes) -> str | None:
    try:
        text = raw.decode("ascii").strip(" \r\n\x02\x03")
    except UnicodeError:
        return None
    match = GENERIC_PATTERN.fullmatch(text)
    if match is None:
        return None
    number = match.group(1).replace(" ", "").replace(",", ".")
    value = float(number)
    unit = (match.group(2) or "").lower()
    if unit == "g" or (not unit and "." not in number):
        value /= 1000
    if abs(value) > 9999.999:
        return None
    return f"{value:.3f}"
