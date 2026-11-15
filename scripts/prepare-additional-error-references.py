#!/usr/bin/env python3
"""Compila referências adicionais com cobertura literal de marca/modelo.

Não acessa rede, banco ou assets. PDFs são abertos uma vez; códigos não recebem
uppercase, remoção de espaços, expansão de sufixos ou produto cartesiano de marcas.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
import sys

import fitz


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/data/additionalErrorCodeReferences.json"
REPORT = ROOT / ".context/additional-error-reference-report.json"
INPUTS = {
    ".context/midea-group-models.json": "725a0caa5347e13da6a0008d2fdf86b06f8c52ed864eb3a1926620c50a4f49b3",
    ".context/lg-catalog-models.json": "54522ea982f8dc8d3a0259c15619ce243842587a0db2107cf9d9d3d79a8e9b01",
    ".context/samsung-gree-models.json": "e0dd3dfd3089a71578d0deb1ecd289ce11f3db53094ecfd5b138711d2202cbbb",
}
# Os seis primeiros códigos estão desenhados, sem caracteres extraíveis. Revisão
# visual do PDF p.43 em 15/11/2026; o hash prende a aprovação aos mesmos bytes.
VISUAL_CODES = {
    "gree-manual-03-operacao-p43": "511a496d149cf627c86fc09003c513cd1a1089904aba85533640cf6d313f0ae5",
    "gree-manual-07-operacao-p43": "85333cab5196397b8b55b0930284e967a9f07bc1f0a1f8c00aedc034a49626f1",
}
LG_DISPLAY_HASH = "8803358b34b459134c90ac45f426e4fa64e6d792306199c27357557318094963"
STATE_TITLES = {
    "dd": "Estado de operação: verificação de ligação de comunicação ou válvula de expansão",
    "Fo": "Estado de operação: reciclagem de refrigerante",
    "AL": "Estado de operação: X-Fan",
    "H1": "Estado de operação: degelo ou retorno de óleo no aquecimento",
}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def literal_present(code: str, text: str) -> bool:
    return re.search(r"(?<![A-Za-z0-9])" + re.escape(code) + r"(?![A-Za-z0-9])", text) is not None


def resolve_models(source: dict, models: list[dict]) -> list[dict]:
    by_code = defaultdict(list)
    for model in models:
        by_code[model["code"]].append(model)
    explicit = source.get("coveredModels")
    if explicit is not None:
        pairs = [(entry["brand"], entry["code"]) for entry in explicit]
    else:
        require(bool(source.get("coveredCodes")), f"{source['id']}: cobertura vazia")
        pairs = []
        for code in source["coveredCodes"]:
            matches = by_code.get(code, [])
            require(len(matches) == 1, f"{source['id']}: código ausente ou ambíguo: {code!r}")
            pairs.append((matches[0]["brand"], code))
    require(len(pairs) == len(set(pairs)), f"{source['id']}: cobertura repetida")
    materialized = {(m["brand"], m["code"]) for m in models}
    for pair in pairs:
        require(pair in materialized, f"{source['id']}: par fora dos modelos: {pair!r}")
        require(sum((m["brand"], m["code"]) == pair for m in models) == 1,
                f"{source['id']}: par duplicado/ambíguo nos modelos: {pair!r}")
    return [{"brand": brand, "code": code} for brand, code in pairs]


def qualify_conditions(source: dict, covered: list[dict], changes: list) -> list[tuple[dict, list[dict]]]:
    """A tabela DUO explicita que A1/E4 de aquecimento não se aplicam ao QCA."""
    if source["id"] != "springer-duo-eletronico-legado":
        return [(source, covered)]
    require("A1 e E4" in source["conditions"] and "QQA" in source["conditions"],
            "DUO: a condição primária de aquecimento mudou; exige revisão")
    require({(m["brand"], m["code"]) for m in covered} == {
        ("Springer", "QCA 075 RBB"), ("Springer", "QQA 075 RBB")}, "DUO: cobertura primária mudou")
    parts = []
    for code, suffix in [("QCA 075 RBB", "qca-frio"), ("QQA 075 RBB", "qqa-quente-frio")]:
        copy = deepcopy(source)
        copy["id"] += "-" + suffix
        if suffix == "qca-frio":
            copy["codes"] = [row for row in copy["codes"] if row["code"] not in {"A1", "E4"}]
            copy["conditions"] += " Nesta referência QCA foram excluídos A1 e E4, exclusivos de aquecimento."
        for row in copy["codes"]:
            if row["code"] == "E5":
                row["title"] = "Aviso de manutenção: limpeza do filtro após 250 horas"
        parts.append((copy, [m for m in covered if m["code"] == code]))
    changes.append({"sourceId": source["id"], "action": "split_by_explicit_heating_condition",
                    "omittedFor": {"brand": "Springer", "code": "QCA 075 RBB", "errorCodes": ["A1", "E4"]}})
    return parts


class PdfCache:
    def __init__(self):
        self.documents = {}
        self.page_text = {}
        self.hashes = {}
        self.header_offsets = {}

    def get(self, path: str, expected: str):
        absolute = (ROOT / path).resolve()
        require(absolute.is_relative_to(ROOT), f"PDF fora do workspace: {path}")
        if path not in self.documents:
            data = absolute.read_bytes()
            offset = data[:1024].find(b"%PDF-")
            require(offset >= 0 and not data[:offset].strip(b"\x00 \t\r\n"), f"Assinatura PDF inválida: {path}")
            self.hashes[path] = digest(data)
            self.header_offsets[path] = offset
            self.documents[path] = fitz.open(stream=data, filetype="pdf")
        require(self.hashes[path] == expected, f"SHA-256 divergente: {path}")
        return self.documents[path]

    def text(self, path: str, page: int) -> str:
        key = (path, page)
        document = self.documents[path]
        require(isinstance(page, int) and 1 <= page <= len(document), f"Página PDF inválida: {path} {page}")
        if key not in self.page_text:
            self.page_text[key] = document[page - 1].get_text()
        return self.page_text[key]

    def all_text(self, path: str) -> str:
        return "\n".join(self.text(path, page) for page in range(1, len(self.documents[path]) + 1))


def validate_source(source: dict, covered: list[dict], pdfs: PdfCache, evidence: list) -> None:
    identifier = source["id"]
    require(source.get("context") in {"operation", "commissioning"}, f"{identifier}: contexto ausente")
    require(bool(source.get("conditions")), f"{identifier}: condições ausentes")
    require(source["url"].startswith("https://"), f"{identifier}: URL inválida")
    path, expected = source["localPath"], source["documentSha256"]
    document = pdfs.get(path, expected)
    page = source["pdfPage"]
    proof_pages = sorted(set(source.get("pages", []) + [page]))
    text = "\n".join(pdfs.text(path, number) for number in proof_pages)
    whole = pdfs.all_text(path)
    for model in covered:
        require(literal_present(model["code"], whole), f"{identifier}: modelo não localizado no PDF: {model!r}")
    codes = [row["code"] for row in source["codes"]]
    require(bool(codes) and len(codes) == len(set(codes)), f"{identifier}: códigos vazios/repetidos")
    checks = []
    for row in source["codes"]:
        code = row["code"]
        require(isinstance(code, str) and code == code.strip() and bool(code), f"{identifier}: código literal inválido")
        require(bool(row.get("title")) and bool(row.get("component")), f"{identifier}/{code}: descrição ausente")
        mode = "literal_pdf_text"
        if not literal_present(code, text):
            if VISUAL_CODES.get(identifier) == expected and code in {"F0", "F1", "F2", "F3", "F4", "F5"} and page == 43:
                mode = "visually_reviewed_pdf_page"
            elif identifier == "lg-multi-v5-lte5-sensores-operacao" and expected == LG_DISPLAY_HASH and code in {"CH01", "CH02", "CH06"}:
                require("CH →01" in pdfs.text(path, 50) and literal_present(code[2:], pdfs.text(path, 52)),
                        f"{identifier}/{code}: prefixo CH ou número do guia ausente")
                mode = "explicit_remote_display_prefix_pdf50_and_number_pdf52"
            else:
                raise ValueError(f"{identifier}: código sem prova literal/visual aprovada na página: {code!r}")
        checks.append({"code": code, "evidence": mode})
    evidence.append({"id": identifier, "localPath": path, "pdfSha256": expected,
                     "pdfPageCount": len(document), "pdfHeaderOffset": pdfs.header_offsets[path], "evidencePdfPages": proof_pages,
                     "coveredModelCount": len(covered), "modelEvidence": "literal_full_code_in_same_pdf",
                     "codes": checks})


def compile_reference(source: dict, covered: list[dict], reviewed: str, original_id: str, changes: list) -> dict:
    rows = deepcopy(source["codes"])
    if original_id == "gree-manual-22-operacao-p51":
        for row in rows:
            if row["code"] in STATE_TITLES:
                previous = row["title"]
                row["title"] = STATE_TITLES[row["code"]]
                changes.append({"sourceId": original_id, "code": row["code"], "action": "label_operating_state",
                                "previousTitle": previous, "title": row["title"]})
    fields = ("code", "title", "component", "solution")
    brands = list(dict.fromkeys(m["brand"] for m in covered))
    return {"id": source["id"], "scope": source.get("scope") or f"{' / '.join(brands)} · {source['document']} · {len(covered)} modelo(s) documentado(s)",
            "document": source["document"], "url": source["url"], "page": source["page"],
            "pdfPage": source["pdfPage"], "reviewedAt": reviewed,
            "codes": [{key: row[key] for key in fields if row.get(key) is not None} for row in rows],
            "pdfSha256": source["documentSha256"], "context": source["context"],
            "conditions": source["conditions"], "coveredModels": covered,
            "sourceReferenceIds": [original_id],
            "evidencePdfPages": sorted(set(source.get("pages", []) + [source["pdfPage"]]))}


def merge_complementary(references: list[dict], merges: list) -> list[dict]:
    groups = defaultdict(list)
    for reference in references:
        key = (reference["document"], reference["url"], reference["pdfSha256"], reference["context"],
               reference["conditions"], tuple(sorted((m["brand"], m["code"]) for m in reference["coveredModels"])))
        groups[key].append(reference)
    result = []
    for members in groups.values():
        if len(members) == 1:
            result.extend(members)
            continue
        combined = deepcopy(members[0])
        entries = {}
        for member in members:
            for row in member["codes"]:
                previous = entries.get(row["code"])
                require(previous is None or previous == row,
                        f"Conflito no mesmo PDF/contexto: {member['id']}/{row['code']}")
                entries[row["code"]] = row
        physical = sorted({m["pdfPage"] for m in members})
        combined["id"] += "-" + "-".join("p" + str(p) for p in physical[1:])
        combined["codes"] = list(entries.values())
        combined["page"] = " / ".join(str(m["page"]) for m in members)
        combined["pdfPages"] = physical
        combined["evidencePdfPages"] = sorted({p for m in members for p in m["evidencePdfPages"]})
        combined["sourceReferenceIds"] = [i for m in members for i in m["sourceReferenceIds"]]
        merges.append({"id": combined["id"], "sourceReferenceIds": combined["sourceReferenceIds"],
                       "reason": "Páginas complementares do mesmo PDF, contexto, condições e cobertura literal."})
        result.append(combined)
    return result


def find_conflicts(references: list[dict]) -> list[dict]:
    pairs = defaultdict(list)
    for ref in references:
        for model in ref["coveredModels"]:
            pairs[(model["brand"], model["code"], ref["context"])].append(ref)
    conflicts = []
    for (brand, code, context), refs in pairs.items():
        if len(refs) > 1:
            # Mesmo títulos iguais não autorizam descartar outro documento.
            conflicts.append({"brand": brand, "code": code, "context": context,
                              "referenceIds": [r["id"] for r in refs],
                              "reason": "Mais de uma referência no mesmo lookup; exige decisão documental explícita."})
    return conflicts


def self_test() -> None:
    models = [{"brand": "A", "code": "X 01"}, {"brand": "B", "code": "X 01"}]
    for codes in [["X 01"], ["X01"], ["x 01"]]:
        try:
            resolve_models({"id": "negative", "coveredCodes": codes}, models)
        except ValueError:
            pass
        else:
            raise AssertionError("Identidade ambígua/normalizada foi aceita")
    assert resolve_models({"id": "explicit", "coveredModels": [{"brand": "A", "code": "X 01"}]}, models) == [{"brand": "A", "code": "X 01"}]
    assert literal_present("Fo", "Fo\n") and not literal_present("F0", "Fo\n")
    ref = {"id": "r", "coveredModels": [{"brand": "A", "code": "X"}], "context": "operation"}
    assert len(find_conflicts([ref, {**ref, "id": "other"}])) == 1
    assert find_conflicts([ref, {**ref, "id": "other", "context": "commissioning"}]) == []
    print("Self-test: identidades ambíguas, literais, contextos e conflitos verificados.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Verifica reprodução sem reescrever o catálogo de saída")
    parser.add_argument("--self-test", action="store_true", help="Executa verificações negativas do escopo")
    args = parser.parse_args()
    if args.self_test:
        self_test()
    report = {"status": "validating", "inputs": [], "sourceEvidence": [], "changes": [], "merges": [], "conflicts": [], "rejected": []}
    pdfs = PdfCache()
    references = []
    try:
        for relative, expected in INPUTS.items():
            data_bytes = (ROOT / relative).read_bytes()
            require(digest(data_bytes) == expected, f"Dataset congelado mudou: {relative}")
            data = json.loads(data_bytes)
            report["inputs"].append({"path": relative, "sha256": expected, "models": len(data["models"]),
                                     "errorReferences": len(data.get("errorReferences", []))})
            for source in data.get("errorReferences", []):
                covered = resolve_models(source, data["models"])
                validate_source(source, covered, pdfs, report["sourceEvidence"])
                for qualified, selected in qualify_conditions(source, covered, report["changes"]):
                    references.append(compile_reference(qualified, selected, data["reviewedAt"], source["id"], report["changes"]))
        references = merge_complementary(references, report["merges"])
        report["conflicts"] = find_conflicts(references)
        require(not report["conflicts"], "Conflitos de lookup: catálogo anterior preservado; revisar relatório")
        require(len({r["id"] for r in references}) == len(references), "IDs de referência repetidos")
        output = {"reviewed_at": max(r["reviewedAt"] for r in references), "references": references}
        content = encoded(output)
        if args.check:
            require(OUTPUT.exists() and OUTPUT.read_bytes() == content, "Saída difere do resultado validado")
        else:
            OUTPUT.write_bytes(content)
        unique = {(m["brand"], m["code"]) for r in references for m in r["coveredModels"]}
        report.update(status="passed", reviewedAt=output["reviewed_at"], references=len(references),
                      uniqueCoveredModels=len(unique), byBrand=dict(Counter(brand for brand, _ in unique)),
                      byContext=dict(Counter(r["context"] for r in references)),
                      codeEntries=sum(len(r["codes"]) for r in references), pdfsValidated=len(pdfs.documents),
                      outputPath=str(OUTPUT.relative_to(ROOT)), outputSha256=digest(content),
                      literalCodePolicy="Sem normalização de marca, modelo, caixa, espaços ou caracteres do código.",
                      limitations=["Referências apenas para pares explicitamente presentes nos datasets congelados.",
                                   "Páginas podem ser rótulos compostos; pdfPage permanece numérica e pdfPages preserva páginas complementares.",
                                   "LG CH01/CH02/CH06 conserva grafia curada: prefixo remoto documentado p.50 e números p.52.",
                                   "F0–F5 Gree: caracteres sem texto extraível conferidos visualmente na p.43 dos PDFs com hash fixado.",
                                   "Sem acesso a rede, credenciais, banco, hosting ou alteração dos modelos/fontes de pesquisa."])
    except (KeyError, ValueError, OSError, json.JSONDecodeError) as error:
        report.update(status="rejected")
        report["rejected"].append(str(error))
        REPORT.write_bytes(encoded(report))
        print(str(error), file=sys.stderr)
        return 1
    REPORT.write_bytes(encoded(report))
    print(f"Referências: {report['references']}; pares únicos: {report['uniqueCoveredModels']}; códigos: {report['codeEntries']}; conflitos: 0")
    print("SHA-256:", report["outputSha256"])
    return 0


if __name__ == "__main__":
    sys.exit(main())
