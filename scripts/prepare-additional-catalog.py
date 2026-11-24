#!/usr/bin/env python3
"""Prepara catálogo público multimarcas e assets locais, sem rede ou credenciais.

Não aplica banco, não hospeda arquivos e não substitui campos remotos preenchidos.
PDFs são abertos uma vez por fonte; somente páginas citadas são extraídas.
"""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import shutil
import tempfile
import unicodedata
from urllib.parse import urlsplit
import uuid

import fitz
from PIL import Image


COLLECTION = "additional-br-2026"
DATE = "2026-11-15"
MAX_MIRRORED_PDF_BYTES = 200 * 1024 * 1024
DIRECT_DOCUMENT_NOTE = "Documento original no site do fabricante/distribuidor; sem cópia local por tamanho."
# Documento de diagnóstico da LG, publicado como Trouble Shooting Guide.
# A classificação por documento mantém intacto o raw congelado e não converte
# indiscriminadamente fichas técnicas da marca em manuais de serviço.
DOCUMENT_MANUAL_TYPES = {
    "8803358b34b459134c90ac45f426e4fa64e6d792306199c27357557318094963": "servico",
}
INPUTS = {
    ".context/midea-group-models.json": "725a0caa5347e13da6a0008d2fdf86b06f8c52ed864eb3a1926620c50a4f49b3",
    ".context/lg-catalog-models.json": "54522ea982f8dc8d3a0259c15619ce243842587a0db2107cf9d9d3d79a8e9b01",
    ".context/samsung-gree-models.json": "e0dd3dfd3089a71578d0deb1ecd289ce11f3db53094ecfd5b138711d2202cbbb",
}
MANUAL_TYPES = {
    "manual_instalacao_operacao": "instalacao", "manual_servico": "servico",
    "manual_projeto": "aplicacao", "ficha_tecnica": "datasheet",
    "manufacturer_catalog": "catalogo_tecnico",
    "manufacturer_catalog_distributor_mirror": "catalogo_tecnico",
    "manufacturer_manual": "manual", "catalogo_tecnico": "catalogo_tecnico",
    "manufacturer_product_page": None,
}


def normalize(value):
    return re.sub(r"[^A-Z0-9]", "", str(value or "").upper())


def label_key(value):
    return " ".join(unicodedata.normalize("NFD", value).encode("ascii", "ignore").decode().lower().split())


def read_json(path):
    return json.loads(Path(path).read_text())


def write_json(path, value):
    """Substituição atômica; o leitor nunca vê um JSON parcial."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile("w", dir=target.parent, prefix="." + target.name, delete=False) as stream:
        stream.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
        temporary = Path(stream.name)
    temporary.replace(target)


def category_name(raw):
    name = raw["category"]
    value = label_key(name)
    if "vrf" in value or "vrv" in value:
        return "VRF"
    if "absorcao" in value:
        return "Chiller por absorção"
    if "hidronic" in value or "fancoil" in value or "fan coil" in value:
        return "Fancoil hidrônico"
    if "cassete" in value or "cassette" in value:
        return "Cassete"
    if "condensadora" in value:
        return "Condensadora"
    if value == "comercial leve" and raw.get("unitKind") == "outdoor":
        return "Condensadora"
    if "multi split" in value or "multi-split" in value:
        return "Multi-Split"
    if "piso-teto" in value or "piso teto" in value:
        return "Piso-Teto"
    if "hi wall" in value or "hi-wall" in value or value.startswith("artcool"):
        return "Split Hi-Wall"
    if "duto" in value or "dutado" in value:
        return "Dutado"
    if "janela" in value:
        return "Janela (ACJ)"
    if value == "piso com gabinete":
        return "Piso aparente"
    if value == "piso sem gabinete":
        return "Piso embutido"
    if value == "tomada de ar externo":
        return "Tratamento de ar externo"
    if value == "teto":
        return "Teto aparente"
    return name


def new_id(kind, key):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, "https://dominex.app/equipment-catalog/" + kind + "/" + key))


def model_name(raw, category):
    # A categoria comum serve à navegação; manter a tipologia publicada no nome
    # distingue, por exemplo, cassetes 1/2/4-vias dentro da mesma família Multi V.
    name = raw["category"] + " " + raw["code"]
    capacity = raw.get("capacityBtu")
    if isinstance(capacity, (int, float)) and capacity > 0:
        number = f"{capacity:,.0f}".replace(",", ".") if float(capacity).is_integer() else str(capacity).replace(".", ",")
        name += " · " + number + " BTU/h"
    cycle = label_key(raw.get("cycle") or "").replace("/", " ").replace("-", " ")
    if cycle in ("quente frio", "quente e frio", "frio quente", "frio e quente"):
        name += " · Quente/frio"
    elif cycle in ("frio", "so frio", "somente frio"):
        name += " · Só frio"
    # Não extraímos frequência dos sufixos nem de notas com diferentes casos elétricos.
    frequency = raw.get("frequencyHz")
    if frequency in (50, 60):
        name += f" · {frequency} Hz"
    return name


class LocalEvidence:
    def __init__(self, cache):
        self.hashes, self.documents, self.texts, self.image_info, self.image_xrefs = {}, {}, {}, {}, {}
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.cached = set()

    def digest(self, path, expected=None):
        path = str(path)
        if path not in self.hashes:
            digest = hashlib.sha256()
            with open(path, "rb") as stream:
                for block in iter(lambda: stream.read(1024 * 1024), b""):
                    digest.update(block)
            self.hashes[path] = digest.hexdigest()
        actual = self.hashes[path]
        if expected and actual != expected:
            raise ValueError("Hash diverge da curadoria congelada: " + path)
        return actual

    def pdf(self, path, expected=None):
        sha = self.digest(path, expected)
        if path not in self.documents:
            with open(path, "rb") as stream:
                # Alguns PDFs LG originais têm whitespace/NUL antes do cabeçalho.
                # Aceitar apenas o prefixo limitado; bytes e hash permanecem originais.
                if not re.match(rb"[\x00\t\n\r ]{0,8}%PDF-", stream.read(13)):
                    raise ValueError("Documento não é PDF: " + path)
            self.documents[path] = fitz.open(path)
        return self.documents[path], sha

    def page_text(self, path, page):
        doc, sha = self.pdf(path)
        if not isinstance(page, int) or isinstance(page, bool) or not 1 <= page <= len(doc):
            raise ValueError("Página PDF inválida: " + str((path, page)))
        key = (sha, page)
        if key not in self.texts:
            self.texts[key] = doc[page - 1].get_text()
        return self.texts[key]

    def image(self, path, expected=None):
        sha = self.digest(path, expected)
        if path not in self.image_info:
            with open(path, "rb") as stream:
                header = stream.read(16)
            if header.startswith(b"\xff\xd8\xff"):
                ext = "jpg"
            elif header.startswith(b"\x89PNG\r\n\x1a\n"):
                ext = "png"
            elif header.startswith(b"RIFF") and header[8:12] == b"WEBP":
                ext = "webp"
            else:
                raise ValueError("Assinatura de imagem inválida: " + path)
            with Image.open(path) as image:
                width, height = image.size
                image.verify()
            if min(width, height) < 45:
                raise ValueError("Imagem pequena demais para representar equipamento: " + path)
            self.image_info[path] = (ext, width, height)
        return sha, self.image_info[path]

    def cache_file(self, path, sha, ext):
        target = self.cache / f"{sha}.{ext}"
        if str(target) not in self.cached:
            if target.exists():
                self.digest(str(target), sha)
            else:
                shutil.copyfile(path, target)
            self.cached.add(str(target))
        return f"verified/shared/{sha}.{ext}"

    def close(self):
        for document in self.documents.values():
            document.close()


def https(value):
    parsed = urlsplit(value or "")
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Referência pública HTTPS obrigatória")
    return value


def code_present(code, text):
    """Somente espaços/quebras do próprio código; não expande curingas/sufixos."""
    compact = lambda value: re.sub(r"\s+", "", value)
    return code in text or compact(code) in compact(text)


def public_base(daikin):
    for model in daikin["models"]:
        for field in ("image_url", "manual_url"):
            value = model.get(field) or ""
            if "/storage/v1/object/public/" in value:
                return value.split("/storage/v1/object/public/", 1)[0]
    raise ValueError("Base pública ausente no catálogo existente; forneça --base-url")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--inventory", default=".context/catalog-public-inventory.json")
    parser.add_argument("--base-url", help="Somente origem pública de storage; não lê variáveis de ambiente")
    parser.add_argument("--input", action="append", default=[], metavar="PATH=SHA256", help="Atualiza o hash esperado de uma entrada novamente congelada")
    parser.add_argument("--cache", default=".context/catalog-assets")
    args = parser.parse_args()
    expected = dict(INPUTS)
    for override in args.input:
        name, sha = override.rsplit("=", 1)
        if name not in expected or not re.fullmatch(r"[0-9a-f]{64}", sha):
            raise ValueError("Entrada/hash desconhecido")
        expected[name] = sha

    inventory = read_json(args.inventory)
    daikin = read_json("src/data/daikinCatalog.json")
    base = https(args.base_url or public_base(daikin)).rstrip("/")
    if urlsplit(base).path or urlsplit(base).query or urlsplit(base).fragment:
        raise ValueError("--base-url deve conter apenas a origem pública")
    brands = {brand["name"]: brand for brand in inventory["brands"]}
    categories = {label_key(item["name"]): item for item in inventory["categories"]}
    category_by_id = {item["id"]: item for item in inventory["categories"]}
    for model in daikin["models"]:
        category = model.get("category")
        if category:
            categories.setdefault(label_key(category["name"]), category)
            category_by_id.setdefault(category["id"], category)
    known = {(item["brand_id"], item["domain"], normalize(item["code"])): item for item in inventory["models"] if item.get("code")}
    evidence = LocalEvidence(args.cache)
    grouped = defaultdict(list)
    pending, proofs, conflicts, errors = [], [], [], []
    input_reports, assets, models = [], [], []
    direct_documents = {}
    image_sources = {}
    report = {"collection": COLLECTION, "reviewed_at": DATE, "status": "preparing"}

    try:
        for path, expected_sha in expected.items():
            digest = evidence.digest(path, expected_sha)
            research = read_json(path)
            input_reports.append(dict(path=path, sha256=digest, records=len(research["models"])))
            pending.extend(dict(item, research_input=path) for item in research.get("pending", []))
            for source in research.get("sources", []):
                local = source.get("localPath")
                url = source.get("documentUrl") or source.get("url")
                if local and url and Path(local).suffix.lower() == ".pdf":
                    image_sources[url.split("#", 1)[0]] = (local, source.get("sha256"))
            for raw in research["models"]:
                brand = brands.get(raw["brand"])
                if not brand or raw["brand"] not in {"Midea", "Springer", "Carrier", "LG", "Samsung", "Gree"}:
                    raise ValueError("Marca comercial ausente do inventário")
                domain = raw.get("domainSuggested", "ar_condicionado")
                if not normalize(raw["code"]):
                    raise ValueError("Código explícito ausente")
                grouped[(brand["id"], domain, normalize(raw["code"]))].append(raw)
                for field in ("documentUrl", "imagePdfUrl"):
                    if raw.get(field) and raw.get("documentLocalPath") and raw["documentUrl"] == raw[field]:
                        image_sources[raw[field].split("#", 1)[0]] = (raw["documentLocalPath"], raw.get("documentSha256"))

        def add_asset(model, raw, field, path, sha, ext, source, title, note, **extra):
            storage = evidence.cache_file(path, sha, ext)
            entry = dict(model_id=model["id"], brand_id=model["brand_id"], code=model["code"], field=field,
                         source_url=https(source), evidence_url=https(raw.get("imageSourceUrl") if field == "image_url" else raw["sourceUrl"]),
                         sha256=sha, extension=ext, scope=raw.get("imageScope", "family") if field == "image_url" else "family",
                         document=title, reviewed_at=DATE, note=note, storage_path=storage, catalog_collection=COLLECTION, **extra)
            assets.append(entry)
            return base + "/storage/v1/object/public/equipment-catalog/" + storage

        for (brand_id, domain, code_key), candidates in sorted(grouped.items()):
            raw = candidates[0]
            existing = known.get((brand_id, domain, code_key))
            fluids = {normalize(item.get("refrigerant")) for item in candidates if item.get("refrigerant")}
            if existing and existing.get("refrigerant"):
                fluids.add(normalize(existing["refrigerant"]))
            units = {item["unitKind"] for item in candidates}
            if existing and existing.get("catalog_reference", {}).get("unit_kind"):
                units.add(existing["catalog_reference"]["unit_kind"])
            if len(fluids) > 1 or len(units) > 1:
                conflict = dict(brand=raw["brand"], domain=domain, normalized_code=code_key, reason="Conflito de fluido/unidade; nenhuma variante foi escolhida",
                                candidates=[dict(code=item["code"], refrigerant=item.get("refrigerant"), unit_kind=item["unitKind"], source=item.get("documentUrl") or item["sourceUrl"], pages=item.get("pages", [])) for item in candidates])
                if existing:
                    conflict["existing"] = {field: existing.get(field) for field in ("id", "code", "refrigerant")}
                conflicts.append(conflict)
                pending.append(conflict)
                continue
            try:
                if raw["recordKind"] not in {"model", "catalog_model", "configuration", "series", "combination"} or raw["unitKind"] not in {"indoor", "outdoor", "system"}:
                    raise ValueError("Natureza/unidade não reconhecida")
                if raw["documentType"] not in MANUAL_TYPES:
                    raise ValueError("Tipo documental não mapeado: " + raw["documentType"])
                https(raw["sourceUrl"])
                category_label = category_name(raw)
                category = categories.get(label_key(category_label))
                if not category:
                    category = dict(id=new_id("category", domain + "/" + label_key(category_label)), name=category_label)
                    categories[label_key(category_label)] = category
                    category_by_id[category["id"]] = category
                model_id = existing["id"] if existing else new_id("model", brand_id + "/" + domain + "/" + code_key)
                scope = "configuration" if raw["recordKind"] == "catalog_model" else raw["recordKind"]
                pages = sorted(set(raw.get("pages") or []))
                reference = dict(line=raw["line"], unit_kind=raw["unitKind"], record_scope=scope, source_url=raw["sourceUrl"],
                                 source_kind="pdf", proof_kind="text", source_sha256=None, document=raw["documentTitle"], pages=pages,
                                 reviewed_at=DATE, note=raw.get("evidenceNotes") or "Código literal publicado na fonte indicada.")
                if raw.get("codeAliases"):
                    reference["note"] += " Grafias alternativas publicadas do mesmo modelo: " + "; ".join(raw["codeAliases"]) + ". Não constituem novas unidades."
                if raw.get("commercialBrand"):
                    reference["commercial_brand"] = raw["commercialBrand"]
                brand = brands[raw["brand"]]
                model = dict(id=model_id, brand_id=brand_id, category_id=category["id"], name=model_name(raw, category["name"]), code=raw["code"],
                             image_url=None, manual_url=None, manual_type=None, refrigerant=raw.get("refrigerant"), potencia_w=None, consumo_kwh_mes=None,
                             domain=domain, created_at=DATE + "T00:00:00Z", brand=dict(id=brand_id, name=brand["name"], logo_url=brand.get("logo_url")),
                             category=category, catalog_reference=reference)
                doc_path = raw["documentLocalPath"]
                source_sha = evidence.digest(doc_path, raw.get("documentSha256"))
                proof = dict(brand=raw["brand"], code=raw["code"], model_id=model_id, source_path=doc_path, source_sha256=source_sha, pages=pages)
                if raw.get("aliasEvidence"):
                    alias_proofs = []
                    for alias in raw["aliasEvidence"]:
                        alias_path = alias["documentLocalPath"]
                        _, alias_sha = evidence.pdf(alias_path, alias["documentSha256"])
                        alias_pages = [page for page in alias["pages"] if code_present(alias["code"], evidence.page_text(alias_path, page))]
                        if not alias_pages or alias["code"] not in raw.get("codeAliases", []):
                            raise ValueError("Grafia alternativa sem prova literal correspondente")
                        alias_proofs.append(dict(code=alias["code"], source_path=alias_path, source_sha256=alias_sha, matching_pages=alias_pages))
                    proof["aliases"] = alias_proofs
                if raw["documentType"] == "manufacturer_product_page":
                    if pages or raw.get("documentUrl"):
                        raise ValueError("Página comercial não deve se apresentar como PDF/manual")
                    snapshot = Path(doc_path).read_text()
                    if not code_present(raw["code"], snapshot):
                        raise ValueError("Código ausente do snapshot HTML/JSON")
                    reference.update(source_kind="html", proof_kind="html", source_sha256=source_sha)
                    proof.update(proof_kind="html")
                else:
                    document, doc_sha = evidence.pdf(doc_path, raw.get("documentSha256"))
                    if not pages:
                        raise ValueError("PDF sem página de comprovação")
                    matched = [page for page in pages if code_present(raw["code"], evidence.page_text(doc_path, page))]
                    reference["source_sha256"] = doc_sha
                    if matched:
                        reference["source_url"] = raw["documentUrl"]
                        if raw["sourceUrl"] != raw["documentUrl"]:
                            reference["note"] += " Página oficial de contexto: " + raw["sourceUrl"]
                        proof.update(proof_kind="text", matching_pages=matched)
                    elif raw.get("sourceSnapshotLocalPath"):
                        snapshot_path = raw["sourceSnapshotLocalPath"]
                        snapshot_sha = evidence.digest(snapshot_path, raw.get("sourceSnapshotSha256"))
                        if not code_present(raw["code"], Path(snapshot_path).read_text()):
                            raise ValueError("Sufixo completo ausente da prova HTML")
                        reference.update(source_kind="html", proof_kind="html", source_sha256=snapshot_sha)
                        proof.update(proof_kind="html", snapshot_path=snapshot_path, snapshot_sha256=snapshot_sha)
                    else:
                        raise ValueError("Código não aparece literalmente nas páginas citadas; requer prova visual individual")
                    manual_type = DOCUMENT_MANUAL_TYPES.get(doc_sha, MANUAL_TYPES[raw["documentType"]])
                    model["manual_type"] = manual_type
                    document_bytes = Path(doc_path).stat().st_size
                    reference["document_bytes"] = document_bytes
                    if document_bytes > MAX_MIRRORED_PDF_BYTES:
                        model["manual_url"] = https(raw["documentUrl"])
                        reference["note"] += " " + DIRECT_DOCUMENT_NOTE
                        direct = direct_documents.setdefault(doc_sha, dict(source_url=raw["documentUrl"], source_path=doc_path,
                            sha256=doc_sha, bytes=document_bytes, document=raw["documentTitle"], models=0,
                            reason=DIRECT_DOCUMENT_NOTE))
                        direct["models"] += 1
                    else:
                        model["manual_url"] = add_asset(model, raw, "manual_url", doc_path, doc_sha, "pdf", raw["documentUrl"], raw["documentTitle"], reference["note"], manual_type=manual_type, pages=pages)
                proofs.append(proof)
                image_path = raw.get("imageLocalPath")
                if not image_path:
                    raise ValueError("Imagem previamente validada ausente")
                image_sha, (extension, width, height) = evidence.image(image_path, raw.get("imageSha256"))
                image_kind = raw.get("imageKind")
                if image_kind not in {"photo", "technical_illustration"} or raw.get("imageScope") not in {"family", "exact"}:
                    raise ValueError("Escopo/tipo de imagem não revisado")
                extras = dict(image_kind=image_kind)
                image_source = raw.get("imagePdfUrl") or raw.get("imageUrl") or raw["imageSourceUrl"]
                if raw.get("imagePdfPage"):
                    extras["pages"] = [raw["imagePdfPage"]]
                    extras["pdf_image_page"] = raw["imagePdfPage"]
                if raw.get("imagePdfXref"):
                    extras["pdf_image_xref"] = raw["imagePdfXref"]
                    if raw.get("imagePdfSmask"):
                        extras["pdf_image_smask"] = raw["imagePdfSmask"]
                if raw.get("imagePdfClip"):
                    clip = raw["imagePdfClip"]
                    if extension != "png" or len(clip) != 4 or clip[2] <= clip[0] or clip[3] <= clip[1]:
                        raise ValueError("Recorte PDF inválido")
                    scale = raw.get("imagePdfScale")
                    if scale is None:
                        # Geometria da extração, nunca informação de modelo/capacidade.
                        scale = min((1, 2, 3, 4), key=lambda value: abs(width - (clip[2] - clip[0]) * value) + abs(height - (clip[3] - clip[1]) * value))
                        if abs(width - (clip[2] - clip[0]) * scale) > 2 or abs(height - (clip[3] - clip[1]) * scale) > 2:
                            raise ValueError("Escala da imagem não corresponde ao recorte PDF")
                    extras.update(pdf_image_clip=clip, pdf_image_scale=scale)
                if raw.get("imagePdfUrl"):
                    image_document = image_sources.get(raw["imagePdfUrl"].split("#", 1)[0])
                    if not image_document:
                        raise ValueError("Fonte local da imagem PDF ausente")
                    image_doc_path, expected_image_doc_sha = image_document
                    image_pdf, image_doc_sha = evidence.pdf(image_doc_path, expected_image_doc_sha)
                    page = raw.get("imagePdfPage")
                    if not isinstance(page, int) or not 1 <= page <= len(image_pdf):
                        raise ValueError("Página da imagem fora do PDF")
                    image_page_key = (image_doc_sha, page)
                    if image_page_key not in evidence.image_xrefs:
                        evidence.image_xrefs[image_page_key] = {item[0] for item in image_pdf[page - 1].get_images(full=True)}
                    if raw.get("imagePdfXref") and raw["imagePdfXref"] not in evidence.image_xrefs[image_page_key]:
                        raise ValueError("Xref da imagem não pertence à página citada")
                    extras["pdf_source_sha256"] = image_doc_sha
                model["image_url"] = add_asset(model, raw, "image_url", image_path, image_sha, extension, image_source,
                                                "Imagem " + raw["brand"] + " · " + raw["line"], raw.get("imageEvidenceNotes") or "Imagem original representativa da família.", **extras)
                # A fonte remota preserva UUID e TODOS os valores efetivamente preenchidos.
                if existing:
                    for field, value in existing.items():
                        if value is not None and value != "":
                            model[field] = value
                    preserved_category = category_by_id.get(model["category_id"])
                    if preserved_category:
                        model["category"] = preserved_category
                models.append(model)
            except (ValueError, OSError, KeyError, fitz.FileDataError) as error:
                errors.append(dict(brand=raw["brand"], code=raw["code"], error=str(error)))

        report.update(inputs=input_reports, input_records=sum(item["records"] for item in input_reports), unique_input_identities=len(grouped),
                      models=len(models), new_models=sum(model["id"] not in {item["id"] for item in known.values()} for model in models),
                      existing_models_preserved=sum(model["id"] in {item["id"] for item in known.values()} for model in models),
                      by_brand=dict(Counter(model["brand"]["name"] for model in models)), by_domain=dict(Counter(model["domain"] for model in models)),
                      by_scope=dict(Counter(model["catalog_reference"]["record_scope"] for model in models)), by_category=dict(Counter(model["category"]["name"] for model in models)),
                      by_line=dict(Counter(model["brand"]["name"] + " · " + model["catalog_reference"]["line"] for model in models)),
                      with_photo=sum(bool(model["image_url"]) for model in models), with_document=sum(bool(model["manual_url"]) for model in models),
                      html_sources=sum(model["catalog_reference"]["source_kind"] == "html" for model in models),
                      asset_associations=len(assets), unique_files=len({entry["storage_path"] for entry in assets}),
                      direct_manual_models=sum(item["models"] for item in direct_documents.values()),
                      direct_document_files=len(direct_documents), direct_documents=list(direct_documents.values()),
                      mirrored_document_files=len({entry["sha256"] for entry in assets if entry["field"] == "manual_url"}),
                      max_mirrored_pdf_bytes=MAX_MIRRORED_PDF_BYTES,
                      source_pdfs_opened=len(evidence.documents), source_pdf_pages_extracted=len(evidence.texts),
                      local_files_hashed=len(evidence.hashes), pending=pending, conflicts=conflicts, errors=errors, code_proofs=proofs)
        if errors:
            report["status"] = "failed_validation"
            write_json(".context/additional-catalog-preparation-report.json", report)
            raise ValueError("Falhas de prova/asset impedem preparação: " + str(len(errors)))
        # Ler novamente no último momento: preservar alterações paralelas fora da coleção.
        previous = read_json("src/data/equipmentCatalogAssets.json")
        preserved = [entry for entry in previous["assets"] if entry.get("catalog_collection") != COLLECTION]
        preserved_hash = hashlib.sha256(json.dumps(preserved, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        previous["assets"] = preserved + assets
        write_json("src/data/equipmentCatalogAssets.json", previous)
        catalog = dict(reviewed_at=DATE, catalog_collection=COLLECTION, models=models)
        write_json("src/data/additionalCatalog.json", catalog)
        write_json(".context/additional-assets-manifest.json", dict(reviewed_at=DATE, catalog_collection=COLLECTION, assets=assets))
        report.update(status="prepared_with_pending_conflicts" if conflicts else "prepared", preserved_asset_associations=len(preserved),
                      preserved_assets_sha256=preserved_hash, output_sha256=evidence.digest("src/data/additionalCatalog.json"),
                      manifest_sha256=evidence.digest(".context/additional-assets-manifest.json"),
                      checks=["Hashes das entradas congeladas", "SHA256 em streaming por arquivo", "Assinatura PDF e imagem", "Páginas/Xrefs das imagens", "Código literal em páginas citadas ou snapshot HTML", "Nenhuma expansão de nomenclatura", "UUID/campos remotos preenchidos preservados", "Assets fora da coleção preservados"])
        write_json(".context/additional-catalog-preparation-report.json", report)
        print(json.dumps({key: report[key] for key in ("status", "input_records", "models", "new_models", "existing_models_preserved", "by_brand", "by_scope", "with_photo", "with_document", "html_sources", "asset_associations", "unique_files", "direct_manual_models", "direct_document_files", "mirrored_document_files", "source_pdfs_opened", "source_pdf_pages_extracted")}, ensure_ascii=False))
    finally:
        evidence.close()


if __name__ == "__main__":
    main()
