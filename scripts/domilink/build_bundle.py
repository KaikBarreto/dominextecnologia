#!/usr/bin/env python3
"""Gera somente fontes conhecidas e exemplo virtual; não lê config real/secrets."""
import argparse
import hashlib
import json
import re
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SERVICE = ROOT / "services/domilink"
DEFAULT_OUTPUT = ROOT / "public/downloads/domilink"
FIXED_TIME = (2026, 1, 1, 0, 0, 0)


def build(output=DEFAULT_OUTPUT):
    version = re.search(r'^version = "([^"]+)"', (SERVICE / "pyproject.toml").read_text(), re.M).group(1)
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ValueError("Versão inválida")
    files = {}
    for name in ["pyproject.toml", "README.md", "ECOTRAY_PROVENANCE.md", "config.example.toml", "uv.lock"]:
        source = SERVICE / name
        if source.is_symlink():
            raise ValueError("Links simbólicos não entram no pacote")
        files[name] = source.read_bytes()
    for source in sorted((SERVICE / "src/domilink").rglob("*.py")):
        if source.is_symlink():
            raise ValueError("Links simbólicos não entram no pacote")
        files[source.relative_to(SERVICE).as_posix()] = source.read_bytes()
    for name in ["configurar.py", "iniciar.py", "LEIA-ME.txt"]:
        source = SERVICE / "bundle" / name
        if source.is_symlink():
            raise ValueError("Links simbólicos não entram no pacote")
        files[name] = source.read_bytes()
    inner = {"version": version, "kind": "python-source", "requires_python": ">=3.9",
             "hardware_validated": False, "files": {
                 name: hashlib.sha256(content).hexdigest() for name, content in sorted(files.items())}}
    files["manifest.json"] = (json.dumps(inner, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    output.mkdir(parents=True, exist_ok=True)
    filename = "domilink-fontes-" + version + ".zip"
    archive = output / filename
    with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as target:
        for name, content in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=FIXED_TIME)
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            target.writestr(info, content, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    manifest = {"name": "DomiLink", "version": version, "kind": "python-source",
                "requires_python": ">=3.9", "requires_internet_for_install": True,
                "signed_installer": False, "hardware_validated": False, "filename": filename,
                "url": "/downloads/domilink/" + filename, "bytes": archive.stat().st_size,
                "sha256": hashlib.sha256(archive.read_bytes()).hexdigest()}
    (output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    return manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    print(json.dumps(build(parser.parse_args().output), ensure_ascii=False))
