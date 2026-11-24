from __future__ import annotations

import argparse
import json
import sys
import threading
from pathlib import Path
from typing import Optional, Sequence

import uvicorn

from .adapters.base import AdapterError
from .api import create_app
from .config import LOOPBACK_HOST, ConfigError, load_settings
from .discovery import printer_queues, serial_ports
from .logging_utils import configure_logging
from .registry import DeviceRegistry
from .security import SessionManager
from .setup import diagnose, initialize_config


def pairing_console(sessions: SessionManager, ttl: int) -> None:
    """Renovação é uma ação no terminal local; nunca uma rota HTTP anônima."""
    while True:
        try:
            command = input().strip().lower()
        except (EOFError, OSError):
            return
        if command == "parear":
            code, _ = sessions.create_pairing_code()
            print(f"Novo código de uso único: {code} — válido por {ttl} segundos.")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="DomiLink — ponte local de periféricos Dominex")
    parser.add_argument("--config", type=Path, help="arquivo TOML local de configuração")
    parser.add_argument("--init", action="store_true", help="cria configuração virtual inicial")
    parser.add_argument("--origin", help="origem exata do app, usada somente com --init")
    parser.add_argument(
        "--check-config", action="store_true", help="valida configuração sem abrir equipamentos"
    )
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
    if args.init:
        if not args.origin:
            print("Informe --origin com a origem exata do aplicativo.")
            return 2
        try:
            initialize_config(args.config or Path("config.toml"), args.origin)
        except FileExistsError:
            print("A configuração já existe e foi preservada. Edite seu arquivo local.")
            return 2
        except (ConfigError, OSError):
            print("Não foi possível criar a configuração. Confira a origem e a pasta de destino.")
            return 2
        print("Configuração virtual criada. Configure os equipamentos antes do uso na loja.")
        return 0
    if args.origin:
        print("--origin só pode ser usado com --init.")
        return 2
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
        registry = DeviceRegistry(settings.devices)
    except ConfigError as exc:
        logger.error("Configuração inválida: %s", exc)
        return 2
    except (OSError, ValueError, TypeError, KeyError):
        logger.error("Não foi possível ler a configuração. Revise o arquivo e os equipamentos.")
        return 2
    if args.check_config:
        report = diagnose(settings)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 0 if report["requirements_ready"] else 2

    sessions = SessionManager(settings.pairing_ttl_seconds, settings.session_ttl_seconds)
    pairing_code, _ = sessions.create_pairing_code()
    print("\nDomiLink — pareamento local")
    print(f"Código de uso único: {pairing_code}")
    print(f"Expira em {settings.pairing_ttl_seconds} segundos.\n")
    if sys.stdin.isatty():
        print("Digite parear e pressione Enter para gerar outro código, sem reiniciar.")
        threading.Thread(
            target=pairing_console,
            args=(sessions, settings.pairing_ttl_seconds),
            daemon=True,
        ).start()
    else:
        print("Sem terminal interativo. Reinicie o processo para gerar outro código.")

    app = create_app(settings, registry=registry, sessions=sessions)
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
