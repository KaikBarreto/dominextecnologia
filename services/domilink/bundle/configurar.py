"""Cria apenas a configuração virtual inicial; nunca sobrescreve configuração local."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description="Configurar a origem exata do aplicativo Dominex")
    parser.add_argument("--origin", required=True, help="URL da barra do navegador, sem caminho")
    args = parser.parse_args()
    origin = args.origin
    try:
        parsed = urlsplit(origin)
        valid = (
            parsed.scheme in {"http", "https"} and parsed.hostname
            and parsed.username is None and parsed.password is None
            and parsed.path in {"", "/"} and not parsed.query and not parsed.fragment
            and "*" not in origin and not any(char.isspace() for char in origin)
        )
        _ = parsed.port
    except ValueError:
        valid = False
    if not valid:
        parser.error("Informe somente a origem do app, sem caminho, credenciais ou parâmetros.")
    directory = Path(__file__).resolve().parent
    source = (directory / "config.example.toml").read_text(encoding="utf-8")
    source = source.replace(
        'allowed_origins = ["https://app.example.invalid"]',
        "allowed_origins = [" + json.dumps(origin.rstrip("/"), ensure_ascii=False) + "]",
        1,
    )
    destination = directory / "config.toml"
    try:
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    except FileExistsError:
        parser.error("config.toml já existe. Edite seu arquivo local; ele foi preservado.")
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write(source)
    print("Configuração virtual criada. Leia LEIA-ME.txt antes de configurar equipamentos reais.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
