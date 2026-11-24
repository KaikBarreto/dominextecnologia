#!/usr/bin/env python3
"""Compare every bundled raw P/T row with the exact primary PDF edition.

Optional documentary QA, not part of the app build. Requires Python 3 + PyMuPDF
and the repository's existing Node/TypeScript dependencies. Downloads only the
public manufacturer documents explicitly listed in the dataset when --download
is supplied. PDFs remain local under .context by default.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from pathlib import Path

try:
    import fitz
except ImportError:
    sys.exit("PyMuPDF não está disponível. Use um ambiente Python isolado com PyMuPDF para esta verificação documental opcional.")

ROOT = Path(__file__).resolve().parents[1]
NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")
LOAD_DATASET = """
import fs from 'node:fs';
import ts from 'typescript';
const source = fs.readFileSync('src/data/refrigerantSaturationSources.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const module = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
process.stdout.write(JSON.stringify(Object.values(module.FONTES_TABELAS_SATURACAO)));
"""


def numeric_lines(page, columns):
    for line in page.get_text(sort=True).splitlines():
        values = line.split()
        if len(values) == columns and all(NUMBER.fullmatch(value) for value in values):
            yield list(map(float, values))


def extract_rows(document, source):
    """Column positions are pinned to the SHA-256-checked PDF layouts."""
    expected_pages = [16, 17] if source["id"] == "R438A" else [3] if source["id"] == "R448A" else [2]
    if source["pages"] != expected_pages:
        raise ValueError("A página declarada não corresponde ao extrator documental revisado")
    if source["title"].startswith("National Refrigerants"):
        pure = "unica" in source["curves"]
        return [row[:2 if pure else 3] for row in numeric_lines(document[1], 8 if pure else 9)]
    if source["id"] == "R32":
        # Final column = R32 on the SI page. Other gas columns change phase
        # above/below 10°C and MUST NOT be imported as a continuous curve.
        words = sorted((w for w in document[1].get_text("words") if w[0] > 370),
                       key=lambda word: (round(word[1], 1), word[0]))
        groups = []
        for word in words:
            if not groups or abs(word[1] - groups[-1][0][1]) > 2:
                groups.append([word])
            else:
                groups[-1].append(word)
        rows = []
        for group in groups:
            values = [w[4].replace("−", "-") for w in sorted(group, key=lambda w: w[0])]
            if len(values) == 8 and all(NUMBER.fullmatch(value) for value in values):
                rows.append([float(values[0]), float(values[-1])])
        return rows
    if source["id"] == "R438A":
        # Pressure, R22 temperature, MO99 liquid, MO99 vapor, NU22B liquid/vapor.
        return [[row[0], row[2], row[3]] for page in (document[15], document[16])
                for row in numeric_lines(page, 6)]
    if source["id"] == "R448A":
        # Two side-by-side blocks: pressure, mean temperature, bubble, dew.
        rows = []
        for row in numeric_lines(document[2], 8):
            rows.extend(([row[0], row[2], row[3]], [row[4], row[6], row[7]]))
        return sorted(rows)
    raise ValueError(f"Layout documental sem extrator revisado: {source['id']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf-dir", type=Path, default=ROOT / ".context/refrigerants-full-sources")
    parser.add_argument("--download", action="store_true", help="Baixar os documentos públicos ausentes na pasta local")
    args = parser.parse_args()
    sources = json.loads(subprocess.check_output(["node", "--input-type=module", "-e", LOAD_DATASET], cwd=ROOT, text=True))
    args.pdf_dir.mkdir(parents=True, exist_ok=True)
    total_rows = total_points = 0
    failed = []
    for source in sources:
        try:
            path = args.pdf_dir / f"{source['id']}.pdf"
            if not path.exists() and args.download:
                request = urllib.request.Request(source["url"], headers={"User-Agent": "Dominex-documentary-QA/1.0"})
                with urllib.request.urlopen(request, timeout=90) as response:
                    pdf = response.read()
                if not pdf.startswith(b"%PDF"):
                    raise ValueError("A fonte não retornou um PDF")
                path.write_bytes(pdf)
            pdf = path.read_bytes()
            actual_hash = hashlib.sha256(pdf).hexdigest()
            if actual_hash != source["pdfSha256"]:
                raise ValueError("O documento mudou de edição/conteúdo; revisar manualmente antes de atualizar os dados")
            with fitz.open(stream=pdf, filetype="pdf") as document:
                actual = extract_rows(document, source)
            if actual != source["rows"]:
                first = next((i for i, (left, right) in enumerate(zip(actual, source["rows"])) if left != right), None)
                raise ValueError(f"Linhas divergem: PDF={len(actual)}, app={len(source['rows'])}, primeira divergência={first}")
            row_count = len(actual)
            point_count = row_count * len(source["curves"]) - len(source.get("excluded", []))
            total_rows += row_count
            total_points += point_count
            print(f"{source['id']}: {row_count} linhas conferidas; {point_count} pontos válidos, SHA-256 e páginas confirmados.")
        except Exception as error:
            failed.append(source["id"])
            print(f"{source['id']}: FALHOU — {error}", file=sys.stderr)
    print(f"Total: {len(sources) - len(failed)}/{len(sources)} documentos; {total_rows} linhas; {total_points} pontos válidos.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
