from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Optional, Sequence

import uvicorn

from .adapters.base import AdapterError
from .api import create_app
from .config import LOOPBACK_HOST, ConfigError, load_settings
from .discovery import printer_queues, serial_ports
from .logging_utils import configure_logging
from .security import SessionManager


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DomiLink — ponte local de periféricos Dominex")
    parser.add_argument("--config", type=Path, help="arquivo TOML local de configuração")
    parser.add_argument(
        "--verbose", action="store_true", help="habilita logs técnicos sem conteúdo sensível"
    )
    parser.add_argument("--list-ports", action="store_true", help="lista portas sem abri-las")
    parser.add_argument(
        "--list-printers", action="store_true", help="lista filas locais de impressão"
    )
    return parser


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = build_parser().parse_args(argv)
    logger = configure_logging(args.verbose)
    if args.list_ports or args.list_printers:
        try:
            result = serial_ports() if args.list_ports else printer_queues()
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 0
        except AdapterError as exc:
            print(str(exc))
            return 2
    try:
        settings = load_settings(args.config)
    except (ConfigError, OSError) as exc:
        logger.error("Configuração inválida: %s", exc)
        return 2

    sessions = SessionManager(settings.pairing_ttl_seconds, settings.session_ttl_seconds)
    pairing_code, _ = sessions.create_pairing_code()
    print("\nDomiLink — pareamento local")
    print(f"Código de uso único: {pairing_code}")
    print(f"Expira em {settings.pairing_ttl_seconds} segundos. Reinicie para gerar outro.\n")

    app = create_app(settings, sessions=sessions)
    logger.info("DomiLink iniciado em loopback na porta %s", settings.port)
    uvicorn.run(
        app,
        host=LOOPBACK_HOST,
        port=settings.port,
        access_log=False,
        server_header=False,
        proxy_headers=False,
    )
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main())
