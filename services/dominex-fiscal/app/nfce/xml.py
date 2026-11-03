"""Montagem do modelo 65 e suplemento QR Code v3 online."""

from __future__ import annotations

import base64
import re
from urllib.parse import quote, urlsplit

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from lxml import etree

from ..nfe import xml as nfe_xml
from ..sefaz.credencial import CredencialSefaz as CredencialFiscal


def _official_url(value: str, field: str, *, query_allowed: bool = False) -> str:
    parsed = urlsplit(str(value or "").strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    if parsed.scheme != "https" or not host.endswith(".gov.br"):
        raise nfe_xml.ErroNfeLocal(
            f"{field} precisa usar HTTPS em domínio governamental brasileiro."
        )
    if parsed.username or parsed.password or parsed.fragment:
        raise nfe_xml.ErroNfeLocal(f"{field} contém componentes de URL não permitidos.")
    if not query_allowed and parsed.query:
        raise nfe_xml.ErroNfeLocal(f"{field} não pode conter parâmetros.")
    return str(value).strip()


def montar_xml(
    job: dict,
    *,
    qr_base_url: str,
    access_url: str,
) -> tuple[str, str]:
    """Monta NFC-e online; contingência offline possui fluxo próprio."""
    qr_base_url = _official_url(qr_base_url, "A URL do QR Code NFC-e")
    access_url = _official_url(access_url, "A URL de consulta NFC-e")
    unsigned, key = nfe_xml.montar_xml(job, model="65")
    root = etree.fromstring(
        unsigned.encode("utf-8"),
        etree.XMLParser(resolve_entities=False, no_network=True),
    )
    info = root.find(f"{{{nfe_xml.NS}}}infNFe")
    if info is None:
        raise nfe_xml.ErroNfeLocal("A NFC-e não possui o grupo infNFe.")
    environment = info.findtext(f"{{{nfe_xml.NS}}}ide/{{{nfe_xml.NS}}}tpAmb")
    emission_type = info.findtext(f"{{{nfe_xml.NS}}}ide/{{{nfe_xml.NS}}}tpEmis")
    if environment not in {"1", "2"}:
        raise nfe_xml.ErroNfeLocal("Ambiente da NFC-e inválido.")
    if emission_type != "1":
        raise nfe_xml.ErroNfeLocal(
            "A contingência offline usa QR Code e fluxo próprios; não pode usar o construtor online."
        )
    # QR Code v3 online: chave|3|tpAmb. A URL fica no XML e depois é a única
    # fonte usada pelo DANFE; o frontend nunca recalcula o payload.
    qr_url = f"{qr_base_url}?p={quote(f'{key}|3|{environment}', safe='|')}"
    supplement = etree.SubElement(root, etree.QName(nfe_xml.NS, "infNFeSupl"))
    nfe_xml._add(supplement, "qrCode", qr_url)
    nfe_xml._add(supplement, "urlChave", access_url)
    return etree.tostring(root, encoding="unicode"), key


def montar_xml_contingencia(
    job: dict,
    credential: CredencialFiscal,
    *,
    qr_base_url: str,
    access_url: str,
) -> tuple[str, str]:
    """Monta e assina NFC-e offline com QR Code v3 (tpEmis=9).

    A assinatura dos sete parâmetros do QR usa RSA-SHA1 e a mesma chave A1 que
    assina o XML, conforme a tabela 7 do Manual DANFE NFC-e v6.0.
    """
    qr_base_url = _official_url(qr_base_url, "A URL do QR Code NFC-e")
    access_url = _official_url(access_url, "A URL de consulta NFC-e")
    if not isinstance(credential.chave, rsa.RSAPrivateKey):
        raise nfe_xml.ErroNfeLocal("O certificado não usa chave RSA compatível com NFC-e.")

    unsigned, key = nfe_xml.montar_xml(job, model="65")
    root = etree.fromstring(
        unsigned.encode("utf-8"),
        etree.XMLParser(resolve_entities=False, no_network=True),
    )
    info = root.find(f"{{{nfe_xml.NS}}}infNFe")
    if info is None:
        raise nfe_xml.ErroNfeLocal("A NFC-e não possui o grupo infNFe.")
    ide = info.find(f"{{{nfe_xml.NS}}}ide")
    total = info.find(f"{{{nfe_xml.NS}}}total/{{{nfe_xml.NS}}}ICMSTot")
    if ide is None or total is None:
        raise nfe_xml.ErroNfeLocal("A NFC-e de contingência está incompleta.")
    environment = ide.findtext(f"{{{nfe_xml.NS}}}tpAmb") or ""
    emission_type = ide.findtext(f"{{{nfe_xml.NS}}}tpEmis") or ""
    issued_at = ide.findtext(f"{{{nfe_xml.NS}}}dhEmi") or ""
    total_value = total.findtext(f"{{{nfe_xml.NS}}}vNF") or ""
    if environment not in {"1", "2"} or emission_type != "9":
        raise nfe_xml.ErroNfeLocal("A emissão offline exige tpEmis 9 e ambiente fiscal válido.")
    day_match = re.match(r"^\d{4}-\d{2}-(\d{2})T", issued_at)
    if not day_match or not re.fullmatch(r"\d{1,13}\.\d{2}", total_value):
        raise nfe_xml.ErroNfeLocal("Data ou valor total inválido para o QR Code offline.")

    destination_type = ""
    destination_id = ""
    destination = info.find(f"{{{nfe_xml.NS}}}dest")
    if destination is not None:
        for tag, kind in (("CNPJ", "1"), ("CPF", "2"), ("idEstrangeiro", "3")):
            value = (destination.findtext(f"{{{nfe_xml.NS}}}{tag}") or "").strip()
            if value:
                destination_type, destination_id = kind, value
                break

    parameters = "|".join(
        (key, "3", environment, day_match.group(1), total_value, destination_type, destination_id)
    )
    signature = base64.b64encode(
        credential.chave.sign(
            parameters.encode("utf-8"),
            padding.PKCS1v15(),
            hashes.SHA1(),
        )
    ).decode("ascii")
    # O XSD 4.00 exige Base64 literal ([a-zA-Z0-9+/]+={0,2}) no QR v3
    # offline. Não aplicar percent-encoding a +, / ou =.
    qr_url = f"{qr_base_url}?p={parameters}|{signature}"
    supplement = etree.SubElement(root, etree.QName(nfe_xml.NS, "infNFeSupl"))
    nfe_xml._add(supplement, "qrCode", qr_url)
    nfe_xml._add(supplement, "urlChave", access_url)
    with_supplement = etree.tostring(root, encoding="unicode")
    cnpj = str((job.get("fiscal_config") or {}).get("cnpj") or "")
    return nfe_xml.assinar_xml(with_supplement, credential, cnpj), key


assinar_xml = nfe_xml.assinar_xml
validar_assinatura = nfe_xml.validar_assinatura
validar_xsd = nfe_xml.validar_xsd
