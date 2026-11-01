from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from lxml import etree

VOLATILE_NODES = {
    "Signature", "protNFe", "cNF", "cDV", "dhEmi", "dhSaiEnt", "verProc", "infRespTec"
}
NUMBER = re.compile(r"^-?\d+(?:\.\d+)?$")


class ErroComparacaoNfe(Exception):
    pass


def _nfe_root(xml: str) -> etree._Element:
    try:
        root = etree.fromstring(
            xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True, remove_blank_text=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise ErroComparacaoNfe("XML ilegível.") from None
    if etree.QName(root).localname == "NFe":
        return root
    found = root.xpath("//*[local-name()='NFe']")
    if not found:
        raise ErroComparacaoNfe("O documento não contém uma NF-e.")
    return found[0]


def extrair_nfe(xml: str) -> str:
    return etree.tostring(_nfe_root(xml), encoding="unicode")


def _normalize(value: str) -> str:
    result = re.sub(r"\s+", " ", value or "").strip()
    if NUMBER.fullmatch(result):
        try:
            return format(Decimal(result).normalize(), "f")
        except InvalidOperation:
            pass
    return result


def _map(xml: str) -> dict[str, str]:
    root = _nfe_root(xml)
    values: dict[str, str] = {}

    def walk(node: etree._Element, path: str) -> None:
        name = etree.QName(node).localname
        if name in VOLATILE_NODES:
            return
        siblings = [item for item in node.itersiblings(preceding=True) if etree.QName(item).localname == name]
        current = f"{path}/{name}[{len(siblings) + 1}]"
        children = [child for child in node if isinstance(child.tag, str)]
        if not children:
            values[current] = _normalize(node.text or "")
        for child in children:
            walk(child, current)

    walk(root, "")
    return values


def comparar(local_xml: str, provider_xml: str, limit: int = 100) -> dict[str, Any]:
    local, provider = _map(local_xml), _map(provider_xml)
    missing = [
        {"path": path, "expected": expected}
        for path, expected in local.items()
        if path not in provider
    ]
    changed = [
        {"path": path, "expected": expected, "actual": provider[path]}
        for path, expected in local.items()
        if path in provider and provider[path] != expected
    ]
    # Campo adicional do provedor pode ser cálculo/decisão fiscal que o motor
    # próprio ainda não representa. Não o escondemos: ele impede promoção.
    extra = [
        {"path": path, "actual": actual}
        for path, actual in provider.items()
        if path not in local
    ]
    total = len(missing) + len(changed) + len(extra)
    return {
        "matched": total == 0,
        "summary": {"missing": len(missing), "changed": len(changed), "extra": len(extra)},
        "differences": (missing + changed + extra)[:limit],
        "truncated": total > limit,
    }
