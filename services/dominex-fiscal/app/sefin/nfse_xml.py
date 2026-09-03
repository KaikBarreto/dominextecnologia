"""Leitura defensiva do XML da NFS-e devolvido pelo governo.

Namespace-agnóstico de propósito (`local-name()`): mudança de prefixo ou de
namespace numa versão futura do layout não pode fazer o número da nota sumir da
tela do cliente.
"""

from __future__ import annotations

import base64
import gzip
import re

from lxml import etree


def descompactar(b64: str) -> bytes:
    """`nfseXmlGZipB64` / `eventoXmlGZipB64` → XML puro."""
    return gzip.decompress(base64.b64decode(b64))


def compactar(xml: bytes) -> str:
    return base64.b64encode(gzip.compress(xml)).decode("ascii")


def _primeiro(root, tag: str) -> str:
    achados = root.xpath(f"//*[local-name()='{tag}']/text()")
    return str(achados[0]).strip() if achados else ""


def _atributo(root, tag: str, atributo: str) -> str:
    achados = root.xpath(f"//*[local-name()='{tag}']/@{atributo}")
    return str(achados[0]).strip() if achados else ""


def resumir(xml: bytes) -> dict:
    """Extrai o que a tela precisa: número, chave e data de processamento."""
    try:
        root = etree.fromstring(xml)
    except etree.XMLSyntaxError:
        return {}

    id_nfse = _atributo(root, "infNFSe", "Id")
    chave = re.sub(r"\D", "", id_nfse)[-50:] if id_nfse else ""
    return {
        "numero": _primeiro(root, "nNFSe"),
        "chave_acesso": chave,
        "data_emissao": _primeiro(root, "dhProc") or _primeiro(root, "dhEmi"),
        "codigo_verificacao": _primeiro(root, "nDFSe"),
    }


def evento_de_cancelamento(xml: bytes) -> bool:
    """True quando o XML de evento representa um cancelamento registrado."""
    try:
        root = etree.fromstring(xml)
    except etree.XMLSyntaxError:
        return False
    tipos = root.xpath("//*[local-name()='tpEvento']/text()")
    if any(str(t).strip() == "101101" for t in tipos):
        return True
    # Fallback: o Id do evento carrega o tipo nas 6 últimas posições.
    for atributo in root.xpath("//*[local-name()='infEvento']/@Id"):
        if str(atributo).strip().endswith("101101"):
            return True
    return bool(root.xpath("//*[local-name()='e101101']"))
