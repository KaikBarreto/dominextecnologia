from __future__ import annotations

import json
import os
import stat
from pathlib import Path
from typing import Any

import pytest

from domilink.cli import main, pairing_console
from domilink.config import ConfigError, DeviceConfig, Settings, load_settings
from domilink.security import SessionManager
from domilink.setup import diagnose, initialize_config


def test_initialize_creates_private_virtual_config_without_overwriting(tmp_path: Path) -> None:
    path = tmp_path / "config.toml"
    initialize_config(path, "https://app.example.invalid/")
    settings = load_settings(path)
    assert settings.allowed_origins == ("https://app.example.invalid",)
    assert len(settings.devices) == 3
    assert all(device.adapter == "virtual" for device in settings.devices)
    if os.name == "posix":
        assert stat.S_IMODE(path.stat().st_mode) & 0o077 == 0
    before = path.read_bytes()
    with pytest.raises(FileExistsError):
        initialize_config(path, "https://other.example.invalid")
    assert path.read_bytes() == before


def test_initialize_rejects_unsafe_origin_before_creating_file(tmp_path: Path) -> None:
    path = tmp_path / "config.toml"
    with pytest.raises(ConfigError):
        initialize_config(path, "https://user:password@example.invalid/path")
    assert not path.exists()


def test_check_config_is_passive_and_never_starts_server(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: Any
) -> None:
    path = tmp_path / "config.toml"
    initialize_config(path, "https://app.example.invalid")

    def unexpected(*args: Any, **kwargs: Any) -> None:
        pytest.fail("Diagnóstico não pode iniciar servidor nem sondar hardware")

    monkeypatch.setattr("domilink.cli.uvicorn.run", unexpected)
    monkeypatch.setattr("domilink.adapters.virtual.VirtualPrinter.probe", unexpected)
    assert main(["--config", str(path), "--check-config"]) == 0
    report = json.loads(capsys.readouterr().out)
    assert report["configuration_valid"] is True
    assert report["hardware_tested"] is False
    assert report["requirements_ready"] is True
    assert len(report["devices"]) == 3


def test_diagnostic_reports_missing_dependency_without_private_options(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr("domilink.setup._module_available", lambda name: False)
    settings = Settings(devices=(DeviceConfig(
        "scale", "scale", "serial-scale", "Balança", {"port": "/private/local-device"}
    ),))
    report = diagnose(settings)
    assert report["requirements_ready"] is False
    assert report["devices"][0]["instructions"] == ["Instale o extra serial"]
    assert "/private/local-device" not in json.dumps(report)


@pytest.mark.parametrize("content", [
    "[server\n", "devices = [1]\n", '[server]\nport = true\n',
    '[server]\nport = 8765.5\n',
    '[[devices]]\nid="p"\nkind="printer"\nadapter="virtual"\nlabel="p"\nweight_kg=nan',
    '[[devices]]\nid="p"\nkind="printer"\nadapter="system-pdf"\nlabel="p"\npaper_width_mm=-1',
    '[[devices]]\nid="p"\nkind="scale"\nadapter="serial-scale"\nlabel="p"\nport="serial"\nbaudrate=0',
])
def test_invalid_file_stops_cleanly_before_start(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, content: str
) -> None:
    path = tmp_path / "config.toml"
    path.write_text(content)
    monkeypatch.setattr(
        "domilink.cli.uvicorn.run", lambda *a, **kw: pytest.fail("Iniciou servidor")
    )
    assert main(["--config", str(path), "--check-config"]) == 2


def test_cli_init_requires_origin_and_preserves_existing_file(tmp_path: Path, capsys: Any) -> None:
    path = tmp_path / "config.toml"
    assert main(["--init", "--config", str(path)]) == 2
    assert not path.exists()
    args = ["--init", "--config", str(path), "--origin", "https://app.example.invalid"]
    assert main(args) == 0
    assert main(args) == 2
    assert "preservada" in capsys.readouterr().out


def test_pairing_console_renews_code_without_revoking_existing_session(
    monkeypatch: pytest.MonkeyPatch, capsys: Any,
) -> None:
    sessions = SessionManager(120, 900)
    code, _ = sessions.create_pairing_code()
    token, original = sessions.pair(code, "Sessão virtual")
    commands = iter(["parear"])

    def read_command() -> str:
        try:
            return next(commands)
        except StopIteration as exc:
            raise EOFError from exc

    monkeypatch.setattr("builtins.input", read_command)
    pairing_console(sessions, 120)
    assert sessions.authenticate(token).id == original.id
    assert "Novo código de uso único" in capsys.readouterr().out
