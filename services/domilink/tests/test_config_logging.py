from __future__ import annotations

import logging
from pathlib import Path

import pytest

from domilink.config import ConfigError, load_settings
from domilink.logging_utils import RedactionFilter, redact_value


def test_config_refuses_non_loopback_host(tmp_path: Path) -> None:
    config = tmp_path / "unsafe.toml"
    config.write_text(
        '[server]\nhost = "0.0.0.0"\nallowed_origins = ["https://pdv.example.invalid"]\n',
        encoding="utf-8",
    )
    with pytest.raises(ConfigError, match="127.0.0.1"):
        load_settings(config)


def test_redaction_removes_tokens_codes_content_and_paths() -> None:
    payload = {
        "token": "secret-token",
        "authorization": "Bearer abc.def",
        "pairing_code": "123456",
        "content_base64": "sensitive-document",
        "path": "/private/document.pdf",
        "device_id": "printer-1",
    }
    redacted = redact_value(payload)
    assert redacted["device_id"] == "printer-1"
    assert all(redacted[key] == "[REDACTED]" for key in payload if key != "device_id")

    record = logging.LogRecord(
        "domilink", logging.INFO, __file__, 1, "token=abc pairing_code=123456", (), None
    )
    assert RedactionFilter().filter(record)
    assert "abc" not in record.msg
    assert "123456" not in record.msg
