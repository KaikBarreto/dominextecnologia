#!/usr/bin/env python3
"""Compila tabelas documentadas por código exato, sem generalizar por marca."""
import hashlib
import json
from pathlib import Path
import re


def title_ptbr(value):
    value = value.strip()
    if value.lower() == "ol iniciado":
        return "Proteção OL acionada"
    for before, after in [("Escassez", "Falta"), ("Escasez", "Falta"), ("Avaria", "Falha"), ("avaria", "falha"),
                          ("Anomalia", "Falha"), ("arranque", "partida"), ("Arranque", "Partida"),
                          ("permutador térmico", "trocador de calor"), ("Permutador térmico", "Trocador de calor"),
                          ("c.c.", "CC"), ("fecho", "fechamento")]:
        value = value.replace(before, after)
    return value


def main():
    references = []
    for group, key in [("residential", "errorCodeSources"), ("commercial", "errorReferences")]:
        data = json.loads(Path(f".context/daikin-{group}-models.json").read_text())
        paths = {model.get("documentUrl"): model.get("documentLocalPath") for model in data["models"] if model.get("documentLocalPath")}
        for source in data.get("sources", []):
            paths[source.get("url")] = source.get("localPath") or source.get("path")
            if source.get("resolvedUrl"):
                paths[source["resolvedUrl"]] = source.get("localPath") or source.get("path")
        for source in data.get(key, []):
            local = source.get("localPath") or paths.get(source["url"])
            if not local or not Path(local).exists():
                raise ValueError("Falta PDF conferido de " + source["id"])
            codes = []
            for entry in source["codes"]:
                codes.append({"code": entry["code"], "title": title_ptbr(entry["title"]), "component": entry["component"],
                              **({"solution": entry["solution"]} if entry.get("solution") else {})})
            if len({entry["code"] for entry in codes}) != len(codes):
                raise ValueError("Código repetido em " + source["id"])
            references.append(dict(id=source["id"], scope=source.get("scope") or " / ".join(source["coveredCodes"]),
                                   document=source["document"], url=source["url"], page=source["page"],
                                   pdfPage=source.get("pdfPage", source["page"]), reviewedAt="2026-11-15", codes=codes,
                                   distributorCopy=source.get("distributorCopy", False),
                                   conditions=source.get("conditions", source.get("evidence", "")),
                                   context="commissioning" if source["id"] == "daikin-vrv-w-iv-commissioning" else "operation",
                                   coveredCodes=source["coveredCodes"], pdfSha256=hashlib.sha256(Path(local).read_bytes()).hexdigest()))
    aliases = [code for reference in references for code in reference["coveredCodes"]]
    if len(set(aliases)) != len(aliases):
        raise ValueError("Modelo com duas tabelas primárias exige revisão")
    Path("src/data/daikinErrorCodeReferences.json").write_text(json.dumps({"reviewed_at": "2026-11-15", "references": references}, ensure_ascii=False, indent=2) + "\n")
    print("Referências:", len(references), "Modelos cobertos:", len(aliases))


if __name__ == "__main__":
    main()
