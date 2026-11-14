from __future__ import annotations

import logging
import re
from typing import Any, Dict

SENSITIVE_KEYS = {
    "authorization",
    "code",
    "content",
    "content_base64",
    "document",
    "pairing_code",
    "path",
    "token",
}
TOKEN_PATTERN = re.compile(r"(?i)(bearer\s+|token[=: ]+)[A-Za-z0-9._~+/=-]+")
PAIRING_PATTERN = re.compile(r"(?i)(pairing(?:_code)?[=: ]+)\d{6}")


def redact_value(value: Any, key: str = "") -> Any:
    if key.lower() in SENSITIVE_KEYS:
        return "[REDACTED]"
    if isinstance(value, dict):
        return {str(k): redact_value(v, str(k)) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [redact_value(item) for item in value]
    if isinstance(value, str):
        redacted = TOKEN_PATTERN.sub(lambda match: f"{match.group(1)}[REDACTED]", value)
        return PAIRING_PATTERN.sub(lambda match: f"{match.group(1)}[REDACTED]", redacted)
    return value


class RedactionFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = str(redact_value(record.msg))
        if record.args:
            if isinstance(record.args, dict):
                record.args = redact_value(record.args)
            else:
                record.args = tuple(redact_value(value) for value in record.args)
        return True


def configure_logging(verbose: bool = False) -> logging.Logger:
    logger = logging.getLogger("domilink")
    logger.setLevel(logging.DEBUG if verbose else logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
        handler.addFilter(RedactionFilter())
        logger.addHandler(handler)
    logger.propagate = False
    return logger


def safe_event(event: str, **fields: Any) -> Dict[str, Any]:
    return {"event": event, **redact_value(fields)}
