#!/usr/bin/env python3
"""Compara drivers locais com o EcoTray sem copiar código nem ler configurações."""

import argparse
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_BASELINE = ROOT / "docs/integrations/domilink-ecotray-sync.json"
SOURCE_FILES = (
    "print_manager.py", "scale_reader.py", "requirements.txt",
    "test_compute_target_w.py", "test_upx.py",
)
SOURCE_DIRECTORIES = ("protocols",)
TARGET_FILES = (
    "services/domilink/src/domilink/adapters/serial.py",
    "services/domilink/src/domilink/adapters/system_pdf.py",
    "services/domilink/src/domilink/adapters/windows_gdi.py",
    "services/domilink/src/domilink/discovery.py",
    "services/domilink/src/domilink/cli.py",
    "services/domilink/src/domilink/registry.py",
    "services/domilink/src/domilink/jobs.py",
    "services/domilink/src/domilink/api.py",
    "services/domilink/tests/test_ecotray_drivers.py",
    "services/domilink/pyproject.toml",
    "services/domilink/config.example.toml",
)
TARGET_DIRECTORIES = ("services/domilink/src/domilink/adapters/protocols",)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def snapshots(root, files, directories):
    """Somente arquivos de código conhecidos; ignora configuração real e symlinks."""
    root = root.resolve()
    paths = [root / name for name in files]
    for name in directories:
        directory = root / name
        if directory.is_dir() and not directory.is_symlink():
            paths.extend(directory.glob("*.py"))
    result = {}
    for path in sorted(set(paths)):
        if path.is_file() and not path.is_symlink() and root in path.resolve().parents:
            result[str(path.relative_to(root))] = digest(path)
    return result


def git_revision(source):
    try:
        result = subprocess.run(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            capture_output=True, text=True, check=False, timeout=5,
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def changes(before, after):
    return {
        "added": sorted(after.keys() - before.keys()),
        "removed": sorted(before.keys() - after.keys()),
        "modified": sorted(name for name in before.keys() & after.keys()
                           if before[name] != after[name]),
    }


def changed(groups):
    return any(groups.values())


def inspect(source, baseline, root=None):
    root = ROOT if root is None else root
    if baseline.get("schemaVersion") != 1:
        raise ValueError("Versão do registro não reconhecida.")
    upstream = snapshots(source, SOURCE_FILES, SOURCE_DIRECTORIES)
    if not all(name in upstream for name in ("print_manager.py", "scale_reader.py")):
        raise ValueError("Informe a pasta ecotray que contém os drivers de impressão e balança.")
    local = snapshots(root, TARGET_FILES, TARGET_DIRECTORIES)
    source_changes = changes(baseline["source"]["files"], upstream)
    local_changes = changes(baseline["target"]["files"], local)
    return {
        "schemaVersion": 1,
        "status": "review_required" if changed(source_changes) or changed(local_changes) else "unchanged",
        "sourceRevision": git_revision(source),
        "sourceChanges": source_changes,
        "targetChanges": local_changes,
        "sourceFiles": upstream,
        "targetFiles": local,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path(os.environ.get(
        "ECOTRAY_SOURCE", str(Path.home() / "Documents/GitHub/EcoSistemaSaaS/ecotray"))))
    parser.add_argument("--baseline", type=Path, default=DEFAULT_BASELINE)
    parser.add_argument("--json", action="store_true", help="Imprime somente o relatório JSON.")
    parser.add_argument("--accept", action="store_true", help="Atualiza o registro após revisão e testes.")
    parser.add_argument("--reviewed", help="Resumo da revisão obrigatória para atualizar o registro.")
    args = parser.parse_args(argv)
    try:
        if not args.source.is_dir():
            raise ValueError("EcoTray não encontrado. Use --source /caminho/EcoSistemaSaaS/ecotray.")
        if args.accept and (not args.reviewed or not args.reviewed.strip()):
            raise ValueError("Use --reviewed com o resumo da revisão e dos testes antes de aceitar.")
        baseline = json.loads(args.baseline.read_text())
        report = inspect(args.source, baseline)
        if args.accept:
            baseline["source"]["revision"] = report["sourceRevision"]
            baseline["source"]["files"] = report["sourceFiles"]
            baseline["target"]["files"] = report["targetFiles"]
            baseline["review"] = {
                "at": datetime.now(timezone.utc).isoformat(),
                "summary": args.reviewed.strip(),
            }
            args.baseline.write_text(json.dumps(baseline, ensure_ascii=False, indent=2) + "\n")
            report["status"] = "accepted"
        # O relatório contém caminhos relativos e hashes; nunca conteúdo de código/configuração.
        if args.json:
            print(json.dumps(report, ensure_ascii=False, indent=2))
        else:
            labels = {"unchanged": "Sem mudanças nos drivers acompanhados.",
                      "review_required": "Há mudanças para revisar entre EcoTray e DomiLink.",
                      "accepted": "Registro atualizado após a revisão informada."}
            print(labels[report["status"]])
            for side, title in [("sourceChanges", "EcoTray"), ("targetChanges", "DomiLink")]:
                for action, paths in report[side].items():
                    for path in paths:
                        print("  {} / {}: {}".format(title, action, path))
        return 1 if report["status"] == "review_required" else 0
    except (OSError, ValueError, KeyError, TypeError):
        # Não inclui payloads de arquivo nem caminhos internos de erros inesperados.
        print("Não foi possível comparar. Confira --source e o registro --baseline; "
              "ao aceitar, informe --reviewed com revisão e testes.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
