#!/usr/bin/env python3
"""Compila curadoria pública Daikin, sem credenciais ou escrita no banco.

Entradas de pesquisa ficam em .context. Exige PDFs/imagens locais conferidos;
produz modelos, manifesto de assets compartilhados e relatório de cobertura.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
import os
from pathlib import Path
import re
import uuid
import fitz

BRAND_ID = "dfc735e0-a04f-4ba9-a9bf-fd91c6ed2e1e"
DATE = "2026-11-15"
COLLECTION = "daikin-br-2026"


def normalize(value):
    return re.sub(r"[^A-Z0-9]", "", (value or "").upper())


def deterministic_id(kind, value):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://www.daikin.com.br/catalog/" + kind + "/" + value))


def category_name(raw):
    name = raw["category"]
    lower = name.lower()
    if "hidrônico" in lower:
        return "Fancoil hidrônico"
    if "cassete" in lower:
        return "Cassete"
    if lower in ("hi-wall", "split hi-wall"):
        return "Split Hi-Wall"
    if "multi split" in lower:
        return "Multi-Split"
    if "duto" in lower or "dutado" in lower:
        return "Dutado"
    return name


def image_extension(body):
    if body.startswith(b"\xff\xd8\xff"):
        return "jpg"
    if body.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if body.startswith(b"RIFF") and body[8:12] == b"WEBP":
        return "webp"
    raise ValueError("Imagem não suportada ou resposta não é foto")


def read_json(path):
    return json.loads(Path(path).read_text())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", default=".context/catalog-public-inventory.json")
    parser.add_argument("--research-dir", default=".context")
    parser.add_argument("--base-url", default=os.environ.get("VITE_SUPABASE_URL", ""))
    args = parser.parse_args()
    if not args.base_url.startswith("https://"):
        raise ValueError("URL pública de hospedagem ausente")
    base = args.base_url.rstrip("/")
    inventory = read_json(args.inventory)
    brand = next(brand for brand in inventory["brands"] if brand["id"] == BRAND_ID)
    known = {(model["domain"], normalize(model["code"])): model for model in inventory["models"] if model["brand_id"] == BRAND_ID and model["code"]}
    categories = {category["name"].casefold(): category for category in inventory["categories"]}
    groups = defaultdict(list)
    research_sources = []
    pending = []
    visual = {}
    industrial_proofs = read_json(".context/daikin-industrial/visual-code-proofs.json")
    for proof in industrial_proofs["proofs"]:
        visual[normalize(proof["code"])] = dict(sha=proof["pdf_sha256"], pages=[proof["pdf_page"]], image=proof["page_image"], image_sha=proof["image_sha256"])
    commercial_proofs = read_json(".context/daikin-commercial/rhxyq-visual-proof.json")
    for proof in commercial_proofs["records"]:
        visual[normalize(proof["code"])] = dict(sha=commercial_proofs["document_sha256"], pages=proof["physical_pdf_pages"], image=proof["page_header_file"])
    for domain in ("residential", "commercial", "industrial"):
        research = read_json(Path(args.research_dir) / f"daikin-{domain}-models.json")
        for model in research["models"]:
            groups[(model.get("domainSuggested", "ar_condicionado"), normalize(model["code"]))].append(model)
        research_sources.extend(research.get("sources", []))
        pending.extend(research.get("pending", []))
    assets = []
    models = []
    proof_warnings = []
    conflicts = []
    cache = Path(".context/catalog-assets")
    cache.mkdir(parents=True, exist_ok=True)
    docs = {}
    files = {}

    def file_body(path, expected_hash):
        if path not in files:
            body = Path(path).read_bytes()
            actual_hash = hashlib.sha256(body).hexdigest()
            files[path] = (body, actual_hash)
        body, actual_hash = files[path]
        if expected_hash and actual_hash != expected_hash:
            raise ValueError("Arquivo mudou desde a inspeção: " + path)
        return body, actual_hash

    def add_asset(model_id, code, field, body, source, evidence, scope, document, note, **extra):
        ext = "pdf" if field == "manual_url" else image_extension(body)
        sha = hashlib.sha256(body).hexdigest()
        storage = f"verified/shared/{sha}.{ext}"
        entry = dict(model_id=model_id, brand_id=BRAND_ID, code=code, field=field, source_url=source,
                     evidence_url=evidence, sha256=sha, extension=ext, scope=scope, document=document,
                     reviewed_at=DATE, note=note, storage_path=storage, catalog_collection=COLLECTION, **extra)
        assets.append(entry)
        cached = cache / (sha + "." + ext)
        if not cached.exists():
            cached.write_bytes(body)
        return base + "/storage/v1/object/public/equipment-catalog/" + storage

    for (domain, normalized_code), candidates in sorted(groups.items()):
        if not normalized_code:
            raise ValueError("Modelo sem código explícito")
        fluids = {normalize(model.get("refrigerant")) for model in candidates if model.get("refrigerant")}
        kinds = {model["unitKind"] for model in candidates}
        if len(fluids) > 1 or len(kinds) > 1:
            conflicts.append({"code": candidates[0]["code"], "fluids": sorted(fluids), "unitKinds": sorted(kinds), "sources": [model["documentUrl"] for model in candidates]})
            continue
        # Priorizar prova PDF e foto já inspecionada; empates mantêm o escopo da pesquisa.
        raw = max(candidates, key=lambda model: (bool(model.get("documentLocalPath")), bool(model.get("imageLocalPath"))))
        existing = known.get((domain, normalized_code))
        model_id = existing["id"] if existing else deterministic_id("model", domain + "/" + normalized_code)
        category = category_name(raw)
        category_id = categories.get(category.casefold(), {}).get("id") or deterministic_id("category", domain + "/" + category.casefold())
        source_url = raw["sourceUrl"]
        if not source_url.startswith("https://www.daikin.com.br/"):
            raise ValueError("Procedência do modelo fora da fonte oficial: " + raw["code"])
        scope = "series" if raw.get("recordKind") == "series" else "configuration" if raw.get("recordKind") == "catalog_model" and domain == "ar_condicionado" else "combination" if raw.get("unitKind") == "system" and "combina" in raw.get("name", "").lower() else "model"
        note = raw.get("evidenceNotes", "")
        pages = sorted(set(raw.get("pages", [])))
        title = raw.get("documentTitle") or raw["line"] + " · documentação Daikin"
        reference = dict(line=raw["line"], unit_kind=raw["unitKind"], record_scope=scope, source_url=source_url,
                         document=title, pages=pages, reviewed_at=DATE, note=note, source_kind="pdf" if raw.get("documentLocalPath") else "html", proof_kind="text" if raw.get("documentLocalPath") else "html")
        name = category + " " + raw["code"]
        if raw.get("capacityBtu"):
            name += " · " + f"{raw['capacityBtu']:,.0f}".replace(",", ".") + " BTU/h"
        cycle = normalize(raw.get("cycle"))
        if cycle in ("QUENTEFRIO", "FRIOQUENTE"):
            name += " · Quente/frio"
        elif cycle in ("FRIO", "SOFRIO"):
            name += " · Só frio"
        frequency = re.search(r"\b(50|60)\s*Hz\b", raw["name"], re.I)
        if frequency:
            name += " · " + frequency.group(1) + " Hz"
        model = dict(id=model_id, brand_id=BRAND_ID, category_id=category_id, name=name, code=raw["code"],
                     image_url=None, manual_url=None, manual_type=raw.get("documentType"), refrigerant=raw.get("refrigerant"),
                     consumo_kwh_mes=None, potencia_w=None, domain=domain, created_at=DATE + "T00:00:00Z",
                     brand=dict(id=BRAND_ID, name=brand["name"], logo_url=brand["logo_url"]),
                     category=dict(id=category_id, name=category), catalog_reference=reference)
        doc_path = raw.get("documentLocalPath")
        if doc_path:
            body, sha = file_body(doc_path, raw.get("documentSha256"))
            if not body.startswith(b"%PDF-"):
                raise ValueError("Documento inválido: " + raw["code"])
            if doc_path not in docs:
                with fitz.open(stream=body, filetype="pdf") as pdf:
                    docs[doc_path] = {"count": len(pdf), "pages": [normalize(page.get_text()) for page in pdf]}
            pdf = docs[doc_path]
            if not pages or any(not isinstance(page, int) or page < 1 or page > pdf["count"] for page in pages):
                raise ValueError("Página de prova inválida: " + raw["code"])
            if normalized_code not in "".join(pdf["pages"][page - 1] for page in pages):
                proof = visual.get(normalized_code)
                if not proof or proof["sha"] != sha or not set(pages).intersection(proof["pages"]):
                    raise ValueError("Modelo sem prova textual ou visual correspondente: " + raw["code"])
                image_body = Path(proof["image"]).read_bytes()
                if proof.get("image_sha") and hashlib.sha256(image_body).hexdigest() != proof["image_sha"]:
                    raise ValueError("Imagem de prova visual alterada: " + raw["code"])
                reference["proof_kind"] = "visual"
                proof_warnings.append(dict(code=raw["code"], pages=pages, document=raw["documentUrl"], proof_kind="visual"))
            model["manual_url"] = add_asset(model_id, raw["code"], "manual_url", body, raw["documentUrl"], source_url,
                                             "family", title, note or "Documento original Daikin da família indicada; confira opções e versão na placa.",
                                             manual_type=raw.get("documentType") or "catalogo_tecnico", pages=pages)
        image_raw = next((candidate for candidate in candidates if candidate.get("imageLocalPath")), raw)
        image_path = image_raw.get("imageLocalPath")
        if image_path:
            body, sha = file_body(image_path, image_raw.get("imageSha256"))
            extras = {}
            if image_raw.get("imagePdfXref"):
                extras["pdf_image_xref"] = image_raw["imagePdfXref"]
                if image_raw.get("imagePdfSmask"):
                    extras["pdf_image_smask"] = image_raw["imagePdfSmask"]
                extras["pages"] = [image_raw["imagePdfPage"]] if image_raw.get("imagePdfPage") else []
            if image_raw.get("imagePdfClip"):
                extras.update(pdf_image_clip=image_raw["imagePdfClip"], pdf_image_page=image_raw["imagePdfPage"], pdf_image_scale=image_raw.get("imagePdfScale", 1))
            image_url = image_raw.get("imagePdfUrl") or image_raw.get("imageUrl") or image_raw["imageSourceUrl"]
            model["image_url"] = add_asset(model_id, raw["code"], "image_url", body, image_url, image_raw["imageSourceUrl"],
                                            image_raw.get("imageScope", "family"), "Imagem Daikin · " + raw["line"],
                                            "Imagem original representativa da família; não identifica a configuração exata de pedido. " + image_raw.get("imageEvidenceNotes", image_raw.get("imageNotes", "")), image_kind=image_raw.get("imageKind", "photo"), **extras)
        else:
            pending.append(dict(code=raw["code"], reason="Foto da família ainda não validada"))
        models.append(model)
    if conflicts:
        Path(".context/daikin-model-conflicts.json").write_text(json.dumps(conflicts, ensure_ascii=False, indent=2))
        raise ValueError("Conflitos de refrigerante/unidade exigem revisão: " + str(len(conflicts)))
    if not models:
        raise ValueError("Curadoria vazia")
    previous = read_json("src/data/equipmentCatalogAssets.json")
    previous["assets"] = [entry for entry in previous["assets"] if entry.get("catalog_collection") != COLLECTION] + assets
    Path("src/data/equipmentCatalogAssets.json").write_text(json.dumps(previous, ensure_ascii=False, indent=2) + "\n")
    catalog = dict(reviewed_at=DATE, brand_id=BRAND_ID, models=models)
    Path("src/data/daikinCatalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n")
    Path(".context/daikin-assets-manifest.json").write_text(json.dumps(dict(assets=assets), ensure_ascii=False, indent=2))
    report = dict(models=len(models), new_models=sum(model["id"] not in {item["id"] for item in known.values()} for model in models),
                  by_domain=dict(Counter(model["domain"] for model in models)), by_line=dict(Counter(model["catalog_reference"]["line"] for model in models)),
                  by_scope=dict(Counter(model["catalog_reference"]["record_scope"] for model in models)),
                  with_photo=sum(bool(model["image_url"]) for model in models), with_document=sum(bool(model["manual_url"]) for model in models),
                  asset_associations=len(assets), unique_files=len({entry["storage_path"] for entry in assets}),
                  pending=pending, visual_proofs=proof_warnings)
    Path(".context/daikin-catalog-preparation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({key: value for key, value in report.items() if key not in ("pending", "visual_proofs", "by_line")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
