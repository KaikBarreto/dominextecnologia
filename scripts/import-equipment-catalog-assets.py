#!/usr/bin/env python3
"""Importação aditiva do catálogo GLOBAL. Dry-run por padrão; nunca toca clientes.

O manifesto contém somente fontes públicas e hashes. Credencial privilegiada é
recebida exclusivamente pelo ambiente; não é impressa nem persistida.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import urllib.error
import urllib.parse
import urllib.request
import uuid

FIELDS = {"image_url", "manual_url"}
BUCKET = "equipment-catalog"
IMMUTABLE_CACHE_CONTROL = "max-age=31536000"


def validate_declared_model(model):
    reference = model.get("catalog_reference") or {}
    source = urllib.parse.urlsplit(reference.get("source_url", ""))
    if source.scheme != "https" or not source.hostname or source.username or not reference.get("document"):
        raise ValueError("Novo modelo exige fonte documental pública conferida")
    is_html = reference.get("source_kind") == "html"
    pages = reference.get("pages", [])
    if not is_html and (not pages or any(not isinstance(p, int) or p < 1 for p in pages)):
        raise ValueError("Novo modelo exige páginas conferidas")
    # PDFs originais também podem ser distribuídos por representantes. Nesses
    # casos a curadoria acompanha hash da cópia e natureza da prova, sem liberar
    # uma origem arbitrária apenas porque usa HTTPS.
    if source.hostname != "www.daikin.com.br":
        if not re.fullmatch(r"[a-f0-9]{64}", reference.get("source_sha256", "")) or reference.get("proof_kind") not in ("text", "visual", "html"):
            raise ValueError("Novo modelo exige hash e prova documental revisada")
        if is_html != (reference.get("proof_kind") == "html"):
            raise ValueError("Natureza da prova divergente da fonte")


def validate_entry(entry):
    uuid.UUID(entry["model_id"])
    if entry["field"] not in FIELDS:
        raise ValueError("Campo fora do catálogo permitido")
    if not re.fullmatch(r"[a-f0-9]{64}", entry["sha256"]):
        raise ValueError("Hash inválido")
    if not entry.get("code") or not entry.get("brand_id"):
        raise ValueError("Identidade do equipamento ausente")
    uuid.UUID(entry["brand_id"])
    for field in ("source_url", "evidence_url"):
        parsed = urllib.parse.urlsplit(entry[field])
        if parsed.scheme != "https" or not parsed.hostname or parsed.username:
            raise ValueError("Fonte pública HTTPS obrigatória")
    if entry.get("scope") not in ("exact", "family"):
        raise ValueError("Escopo não revisado")
    if not entry.get("document") or not entry.get("reviewed_at"):
        raise ValueError("Referência documental obrigatória")
    if entry.get("replaces_url"):
        if entry["field"] != "manual_url" or not entry.get("replacement_reason") or not re.fullmatch(r"[a-f0-9]{64}", entry.get("replaces_sha256", "")):
            raise ValueError("Substituição exige prova do documento incorreto")
    if entry["field"] == "manual_url" and entry.get("manual_type") not in (
        "datasheet", "instalacao", "servico", "usuario", "guia", "aplicacao", "catalogo_tecnico", "ficha_eletrica", "manual"
    ):
        raise ValueError("Tipo de manual obrigatório")
    ext = entry["extension"]
    if ext not in ("pdf", "jpg", "png", "webp"):
        raise ValueError("Formato não permitido")
    if (entry["field"] == "manual_url") != (ext == "pdf"):
        raise ValueError("Formato incompatível com o campo")
    if entry.get("pdf_image_xref") is not None:
        if entry["field"] != "image_url" or not isinstance(entry["pdf_image_xref"], int) or entry["pdf_image_xref"] <= 0:
            raise ValueError("Extração de imagem PDF inválida")
    if entry.get("pdf_image_smask") is not None and (not entry.get("pdf_image_xref") or ext != "png" or not isinstance(entry["pdf_image_smask"], int) or entry["pdf_image_smask"] <= 0):
        raise ValueError("Máscara original de imagem inválida")
    if entry.get("storage_path") and entry["storage_path"] != f"verified/shared/{entry['sha256']}.{ext}":
        raise ValueError("Caminho compartilhado deve corresponder ao hash completo")
    if entry.get("pdf_image_clip"):
        clip = entry["pdf_image_clip"]
        if ext != "png" or len(clip) != 4 or not all(isinstance(value, (int, float)) for value in clip) or clip[2] <= clip[0] or clip[3] <= clip[1] or not isinstance(entry.get("pdf_image_page"), int) or entry["pdf_image_page"] < 1 or not 0 < entry.get("pdf_image_scale", 0) <= 4:
            raise ValueError("Recorte de ilustração original inválido")
    if entry.get("original_pages"):
        pages = entry["original_pages"]
        if ext != "pdf" or not isinstance(pages, list) or not 1 <= len(pages) <= 20:
            raise ValueError("Páginas originais inválidas")
        for page in pages:
            source = urllib.parse.urlsplit(page["url"])
            if source.scheme != "https" or not source.hostname or source.username or not re.fullmatch(r"[a-f0-9]{64}", page["sha256"]):
                raise ValueError("Fonte ou hash de página inválidos")


def object_path(entry):
    validate_entry(entry)
    return entry.get("storage_path") or f"verified/{entry['model_id']}/{entry['field']}-{entry['sha256'][:20]}.{entry['extension']}"


def plan_entry(entry, current, base_url):
    validate_entry(entry)
    if not current or any(current.get(k) != entry[k] for k in ("brand_id", "code")):
        raise ValueError("Equipamento alterado ou identidade divergente")
    public_url = f"{base_url}/storage/v1/object/public/{BUCKET}/{object_path(entry)}"
    existing = current.get(entry["field"])
    if existing and existing == entry.get("replaces_url"):
        return "replace_verified_mismatch", public_url
    if existing:
        return ("already_imported" if existing == public_url else "preserved"), public_url
    return "add", public_url


def validate_content(entry, body):
    if hashlib.sha256(body).hexdigest() != entry["sha256"]:
        raise ValueError("Arquivo mudou desde a revisão")
    signatures = {
        "pdf": re.match(br"[\x00\x09\x0a\x0d\x20]{0,8}%PDF-", body) is not None,
        "jpg": body.startswith(b"\xff\xd8\xff"),
        "png": body.startswith(b"\x89PNG\r\n\x1a\n"),
        "webp": body.startswith(b"RIFF") and body[8:12] == b"WEBP",
    }
    if not signatures[entry["extension"]]:
        raise ValueError("Resposta não é o documento/imagem revisado")


def validate_previous_content(entry, body):
    if hashlib.sha256(body).hexdigest() != entry["replaces_sha256"]:
        raise ValueError("Documento anterior mudou; substituição exige nova revisão")


def wrap_original_pages(pages):
    """Reúne páginas integrais do fabricante; PDF determinístico, sem redesenho."""
    import fitz
    with fitz.open() as result:
        for body in pages:
            with fitz.open(stream=body, filetype="jpg") as image:
                with fitz.open(stream=image.convert_to_pdf(), filetype="pdf") as page:
                    result.insert_pdf(page)
        return result.tobytes(garbage=4, deflate=True, no_new_id=True)


class CatalogClient:
    def __init__(self, base_url, key):
        self.base_url = base_url.rstrip("/")
        self.headers = {"apikey": key, "Authorization": "Bearer " + key}

    def request(self, path, method="GET", body=None, headers=None):
        request = urllib.request.Request(self.base_url + path, data=body,
                                        method=method, headers={**self.headers, **(headers or {})})
        with urllib.request.urlopen(request, timeout=180 if body and len(body) > 40 * 1024 * 1024 else 60) as response:
            return response.read()

    def current(self, model_id):
        query = urllib.parse.urlencode({"id": "eq." + model_id,
                                       "select": "id,brand_id,code,image_url,manual_url,manual_type"})
        rows = json.loads(self.request("/rest/v1/equipment_models?" + query))
        return rows[0] if len(rows) == 1 else None

    def models(self):
        result = []
        for offset in range(0, 100000, 500):
            query = urllib.parse.urlencode({"select": "id,brand_id,code,image_url,manual_url,manual_type", "order": "id.asc", "offset": offset, "limit": 500})
            page = json.loads(self.request("/rest/v1/equipment_models?" + query))
            result.extend(page)
            if len(page) < 500:
                return {model["id"]: model for model in result}
        raise ValueError("Catálogo excede o limite operacional da importação")

    def upload(self, entry, body):
        path = "/storage/v1/object/" + BUCKET + "/" + object_path(entry)
        mime = mimetypes.types_map.get("." + entry["extension"], "application/octet-stream")
        try:
            self.request(path, "POST", body, {
                "Content-Type": mime,
                "cache-control": IMMUTABLE_CACHE_CONTROL,
                "x-upsert": "false",
            })
        except urllib.error.HTTPError as error:
            # Reexecução: aceitar apenas o mesmo conteúdo, nunca substituir objeto.
            if error.code not in (400, 409):
                raise
            stored = self.request("/storage/v1/object/authenticated/" + BUCKET + "/" + object_path(entry))
            validate_content(entry, stored)

    def add_if_empty(self, entry, public_url):
        query = {"id": "eq." + entry["model_id"], "brand_id": "eq." + entry["brand_id"],
                 "code": "eq." + entry["code"], entry["field"]: "eq." + entry["replaces_url"] if entry.get("replaces_url") else "is.null"}
        patch = {entry["field"]: public_url}
        # Não substituir um tipo previamente catalogado; metadado só quando vazio.
        if entry["field"] == "manual_url":
            current = self.current(entry["model_id"])
            if current and not current.get("manual_type"):
                query["manual_type"] = "is.null"
                patch["manual_type"] = entry["manual_type"]
        result = self.request("/rest/v1/equipment_models?" + urllib.parse.urlencode(query),
                              "PATCH", json.dumps(patch).encode(),
                              {"Content-Type": "application/json", "Prefer": "return=representation"})
        return len(json.loads(result)) == 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", default="src/data/equipmentCatalogAssets.json")
    parser.add_argument("--cache", default=".context/catalog-assets")
    parser.add_argument("--models-manifest", help="Permite preparar arquivos de modelos documentados ainda não persistidos")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--apply", action="store_true")
    mode.add_argument("--stage-only", action="store_true", help="Hospedar arquivos sem alterar registros do catálogo")
    args = parser.parse_args()
    base_url = os.environ.get("VITE_SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not base_url or not key:
        parser.error("Configuração de acesso ausente; forneça-a somente pelo ambiente.")
    entries = json.loads(Path(args.manifest).read_text())["assets"]
    if len({(e["model_id"], e["field"]) for e in entries}) != len(entries):
        raise ValueError("Manifesto contém destinos duplicados")
    client = CatalogClient(base_url, key)
    persisted = client.models()
    declared = {}
    if args.models_manifest:
        declared = {model["id"]: model for model in json.loads(Path(args.models_manifest).read_text())["models"]}
    plan = []
    for entry in entries:
        current = persisted.get(entry["model_id"])
        if not current and entry["model_id"] in declared:
            model = declared[entry["model_id"]]
            validate_declared_model(model)
            if args.apply:
                raise ValueError("Modelo ainda não persistido; use stage-only antes da publicação")
            current = {**model, "image_url": None, "manual_url": None}
        plan.append((entry, *plan_entry(entry, current, base_url)))
    # Pré-validar todos os arquivos antes de começar a escrever.
    contents = {}
    if args.apply or args.stage_only:
        cache = Path(args.cache)
        cache.mkdir(parents=True, exist_ok=True)
        for entry, action, _ in plan:
            if action not in ("add", "replace_verified_mismatch"):
                continue
            if action == "replace_verified_mismatch":
                if not entry["replaces_url"].startswith(base_url + "/storage/v1/object/public/" + BUCKET + "/"):
                    raise ValueError("Substituição fora do catálogo global")
                with urllib.request.urlopen(entry["replaces_url"], timeout=60) as response:
                    old_body = response.read(60 * 1024 * 1024 + 1)
                validate_previous_content(entry, old_body)
            if entry["sha256"] in contents:
                continue
            cached = cache / (entry["sha256"] + "." + entry["extension"])
            if cached.exists():
                body = cached.read_bytes()
            else:
                if entry.get("original_pages"):
                    originals = []
                    for page in entry["original_pages"]:
                        with urllib.request.urlopen(page["url"], timeout=60) as response:
                            original = response.read(20 * 1024 * 1024 + 1)
                        if hashlib.sha256(original).hexdigest() != page["sha256"]:
                            raise ValueError("Página original mudou desde a revisão")
                        originals.append(original)
                    body = wrap_original_pages(originals)
                else:
                    request = urllib.request.Request(entry["source_url"], headers={"User-Agent": "Mozilla/5.0"})
                    source_limit = (200 if entry.get("pdf_image_clip") or entry.get("pdf_image_xref") else 60) * 1024 * 1024
                    with urllib.request.urlopen(request, timeout=60) as response:
                        body = response.read(source_limit + 1)
                    if len(body) > source_limit:
                        raise ValueError("Fonte excede o limite de importação")
                if entry.get("pdf_image_clip"):
                    import fitz
                    with fitz.open(stream=body, filetype="pdf") as pdf:
                        page = pdf[entry["pdf_image_page"] - 1]
                        scale = entry["pdf_image_scale"]
                        body = page.get_pixmap(matrix=fitz.Matrix(scale, scale), clip=fitz.Rect(entry["pdf_image_clip"]), alpha=False).tobytes("png")
                elif entry.get("pdf_image_xref"):
                    import fitz  # Somente imagens originais incorporadas, sem geração/edição.
                    with fitz.open(stream=body, filetype="pdf") as pdf:
                        if entry.get("pdf_image_smask"):
                            original = fitz.Pixmap(pdf, entry["pdf_image_xref"])
                            mask = fitz.Pixmap(pdf, entry["pdf_image_smask"])
                            body = (original if original.alpha else fitz.Pixmap(original, mask)).tobytes("png")
                        else:
                            body = pdf.extract_image(entry["pdf_image_xref"])["image"]
            validate_content(entry, body)
            cached.write_bytes(body)
            contents[entry["sha256"]] = body
    # Objetos imutáveis independentes: validar tudo antes e enviar cada hash
    # uma única vez, com concorrência limitada. Nenhuma linha é gravada aqui.
    uploads = {object_path(entry): entry for entry, action, _ in plan
               if action in ("add", "replace_verified_mismatch")}
    if args.apply or args.stage_only:
        with ThreadPoolExecutor(max_workers=6) as pool:
            list(pool.map(lambda entry: client.upload(entry, contents[entry["sha256"]]), uploads.values()))
    report = []
    for entry, action, public_url in plan:
        if (args.apply or args.stage_only) and action in ("add", "replace_verified_mismatch"):
            action = "staged" if args.stage_only else "added" if client.add_if_empty(entry, public_url) else "preserved_concurrent_change"
        report.append({"model_id": entry["model_id"], "code": entry["code"], "field": entry["field"], "action": action, "model_persisted": entry["model_id"] in persisted})
    print(json.dumps({"mode": "stage-only" if args.stage_only else "apply" if args.apply else "dry-run", "results": report}, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (urllib.error.URLError, ValueError, KeyError) as error:
        # Não ecoar Request, corpo de API, cabeçalhos ou credenciais.
        print(json.dumps({"error": "Importação interrompida. Pode haver arquivos já hospedados ou alterações parciais em --apply; revise o catálogo antes de reexecutar.",
                          "kind": type(error).__name__}))
        raise SystemExit(1)
