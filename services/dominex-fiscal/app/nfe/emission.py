"""Prova de autorização e DANFE da NF-e emitida diretamente."""

from __future__ import annotations

import copy
import re
from functools import lru_cache
from pathlib import Path

from lxml import etree

from .xml import DS, NS, ErroNfeLocal, validar_assinatura, validar_xsd


@lru_cache(maxsize=1)
def _processed_schema() -> etree.XMLSchema:
    try:
        import nfelib
        path = Path(nfelib.__path__[0]) / "nfe/schemas/v4_0/procNFe_v4.00.xsd"
        return etree.XMLSchema(etree.parse(str(path)))
    except (ImportError, OSError, etree.XMLSchemaParseError):
        raise ErroNfeLocal("O schema processado da NF-e não está instalado.") from None


def _parse(xml: str, label: str) -> etree._Element:
    if not isinstance(xml, str) or len(xml.encode()) > 5_000_000:
        raise ErroNfeLocal(f"{label} ausente ou acima do limite permitido.")
    try:
        root = etree.fromstring(
            xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise ErroNfeLocal(f"{label} ilegível.") from None
    if root.getroottree().docinfo.doctype:
        raise ErroNfeLocal(f"{label} contém DTD não permitido.")
    return root


def montar_nfe_processada(signed_xml: str, protocol_xml: str) -> tuple[str, dict[str, str]]:
    """Une NF-e e protNFe somente após confrontar toda a identidade fiscal."""
    nfe = _parse(signed_xml, "NF-e assinada")
    protocol = _parse(protocol_xml, "Protocolo NF-e")
    if nfe.tag != f"{{{NS}}}NFe" or protocol.tag != f"{{{NS}}}protNFe":
        raise ErroNfeLocal("O retorno não contém NF-e e protocolo compatíveis.")
    errors = validar_xsd(signed_xml) + validar_assinatura(signed_xml)
    if errors:
        raise ErroNfeLocal("; ".join(errors[:5]))
    info = nfe.find(f"{{{NS}}}infNFe")
    inf_prot = protocol.find(f"{{{NS}}}infProt")
    if info is None or inf_prot is None:
        raise ErroNfeLocal("A prova de autorização está incompleta.")
    identity = str(info.get("Id") or "")
    key = identity[3:] if identity.startswith("NFe") else ""
    if not re.fullmatch(r"[0-9]{44}", key):
        raise ErroNfeLocal("A NF-e assinada não tem chave válida.")

    def value(node: etree._Element, name: str) -> str:
        values = node.findall(f"{{{NS}}}{name}")
        if len(values) != 1 or not (values[0].text or "").strip():
            raise ErroNfeLocal(f"O protocolo não comprova {name} de forma única.")
        return str(values[0].text).strip()

    cstat = value(inf_prot, "cStat")
    if cstat not in {"100", "150"}:
        raise ErroNfeLocal("O protocolo não comprova autorização da NF-e.")
    if value(inf_prot, "chNFe") != key:
        raise ErroNfeLocal("O protocolo pertence a outra NF-e.")
    expected_amb = info.findtext(f"{{{NS}}}ide/{{{NS}}}tpAmb")
    if value(inf_prot, "tpAmb") != expected_amb:
        raise ErroNfeLocal("O protocolo pertence a outro ambiente fiscal.")
    protocol_number = value(inf_prot, "nProt")
    if not re.fullmatch(r"[0-9]{15}", protocol_number):
        raise ErroNfeLocal("O protocolo de autorização é inválido.")
    authorized_at = value(inf_prot, "dhRecbto")

    signed_digest = nfe.findtext(f"{{{DS}}}Signature/{{{DS}}}SignedInfo/"
                                 f"{{{DS}}}Reference/{{{DS}}}DigestValue")
    protocol_digest = value(inf_prot, "digVal")
    if not signed_digest or signed_digest.strip() != protocol_digest:
        raise ErroNfeLocal("O protocolo não corresponde ao digest da NF-e assinada.")

    root = etree.Element(etree.QName(NS, "nfeProc"), nsmap={None: NS}, versao="4.00")
    root.append(copy.deepcopy(nfe))
    root.append(copy.deepcopy(protocol))
    processed = etree.tostring(root, encoding="unicode")
    document = _parse(processed, "XML autorizado")
    if not _processed_schema().validate(document):
        raise ErroNfeLocal("O XML autorizado não passou no schema oficial NF-e.")
    return processed, {
        "access_key": key,
        "cstat": cstat,
        "protocol": protocol_number,
        "authorized_at": authorized_at,
    }


def gerar_danfe(processed_xml: str) -> bytes:
    """Renderiza o DANFE em memória; nenhum XML fiscal vai para disco persistente."""
    _parse(processed_xml, "XML autorizado")
    try:
        from brazilfiscalreport.danfe import Danfe
        content = Danfe(xml=processed_xml).output()
    except Exception as exc:
        raise ErroNfeLocal("Não foi possível gerar o DANFE autorizado.") from exc
    pdf = bytes(content or b"")
    if len(pdf) < 1000 or not pdf.startswith(b"%PDF-") or len(pdf) > 2_000_000:
        raise ErroNfeLocal("O DANFE gerado é inválido ou excede 2 MB.")
    return pdf
