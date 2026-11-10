"""SOAP 1.2 SVRS. Todas as chamadas são síncronas e limitadas a 20 segundos."""

from __future__ import annotations
import base64
import gzip
import http.client
import re
import ssl
from pathlib import Path
from lxml import etree as ET
from typing import Any
from ..sefaz.credencial import CredencialSefaz as CredencialFiscal

SOAP = "http://www.w3.org/2003/05/soap-envelope"
MDFE = "http://www.portalfiscal.inf.br/mdfe"
SVRS = {
    "production": "https://mdfe.svrs.rs.gov.br/ws/",
    "homologation": "https://mdfe-homologacao.svrs.rs.gov.br/ws/",
}


class ErroSefaz(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


def _post(
    url: str, action: str, payload: str, credential: CredencialFiscal, timeout: int
) -> str:
    parsed = url.removeprefix("https://")
    host, path = parsed.split("/", 1)
    body = payload.encode("utf-8")
    # Raiz PÚBLICA ICP-Brasil v10 (ITI), usada pelo HTTPS da SVRS.
    # DER SHA256: 6e0bff069a26994c15de2c4888cc54af84882e5495b7fbf66be9ccffec7489f6
    # https://acraiz.icpbrasil.gov.br/credenciadas/RAIZ/ICP-Brasilv10.crt
    credential.contexto.load_verify_locations(cafile=str(Path(__file__).with_name("icp-brasil-v10.ca")))
    conn = http.client.HTTPSConnection(
        host, 443, context=credential.contexto, timeout=min(max(timeout, 1), 20)
    )
    try:
        conn.request(
            "POST",
            "/" + path,
            body=body,
            headers={
                "Content-Type": f'application/soap+xml; charset=utf-8; action="{action}"',
                "Accept-Encoding": "gzip",
            },
        )
        response = conn.getresponse()
        raw = response.read()
        if response.getheader("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        if response.status >= 500:
            raise ErroSefaz(f"SEFAZ indisponível (HTTP {response.status}).")
        if response.status >= 400:
            raise ErroSefaz(
                f"SEFAZ recusou a comunicação (HTTP {response.status}).", False
            )
        return raw.decode("utf-8", "replace")
    except (OSError, http.client.HTTPException) as exc:
        raise ErroSefaz("Não foi possível comunicar com a SEFAZ.") from exc
    finally:
        conn.close()


def _envelope(wsdl: str, xml: str, uf: str | None = None) -> str:
    if xml.lstrip().startswith("<?xml"):
        xml = xml.split("?>", 1)[1]
    header = (
        ""
        if not uf
        else f'<Header><mdfeCabecMsg xmlns="{wsdl}"><cUF>{uf}</cUF><versaoDados>3.00</versaoDados></mdfeCabecMsg></Header>'
    )
    # Namespace padrão evita acrescentar prefixo herdado ao C14N inclusivo do evento.
    return f'<?xml version="1.0" encoding="UTF-8"?><Envelope xmlns="{SOAP}">{header}<Body><mdfeDadosMsg xmlns="{wsdl}">{xml}</mdfeDadosMsg></Body></Envelope>'


def _parse(raw: str):
    try:
        root = ET.fromstring(
            raw.encode(), ET.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, ET.XMLSyntaxError):
        raise ErroSefaz("A SEFAZ devolveu resposta inválida.") from None
    if root.getroottree().docinfo.doctype:
        raise ErroSefaz("A SEFAZ devolveu resposta inválida.")
    if root.find(f".//{{{SOAP}}}Fault") is not None:
        raise ErroSefaz("A SEFAZ devolveu falha no serviço SOAP.")
    return root


def _field(node, name: str) -> str | None:
    value = node.findtext(f"{{{MDFE}}}{name}")
    return value.strip() or None if value is not None else None


def _fiscal_fragment(node) -> str:
    fragment = ET.fromstring(ET.tostring(node))
    # A consulta pode herdar soap:/wsdl: que não pertenciam ao evento assinado.
    # Preserve todas as demais declarações, inclusive prefixos não utilizados.
    prefixes = {
        prefix for element in fragment.iter() for prefix, uri in element.nsmap.items()
        if prefix and uri not in {SOAP, "http://schemas.xmlsoap.org/soap/envelope/"}
        and not uri.startswith(MDFE + "/wsdl/")
    }
    ET.cleanup_namespaces(fragment, keep_ns_prefixes=sorted(prefixes))
    return ET.tostring(fragment, encoding="unicode")


def _event_documents(root, key: str | None, environment: str | None) -> dict[str, str]:
    found: dict[str, str] = {}
    for event in root.iter(f"{{{MDFE}}}procEventoMDFe"):
        request = event.find(f"{{{MDFE}}}eventoMDFe/{{{MDFE}}}infEvento")
        response = event.find(f"{{{MDFE}}}retEventoMDFe/{{{MDFE}}}infEvento")
        if request is None or response is None:
            continue
        code = _field(response, "tpEvento")
        status = _field(response, "cStat")
        if code not in {"110111", "110112"} or status not in {"135", "136", "155"}:
            continue
        if status == "155" and code != "110111":
            continue
        if any(_field(request, name) != _field(response, name)
               for name in ("chMDFe", "tpEvento", "nSeqEvento", "tpAmb")):
            continue
        if _field(response, "nSeqEvento") != "1":
            continue
        if key and _field(response, "chMDFe") != key:
            continue
        if environment and _field(response, "tpAmb") != ("1" if environment == "production" else "2"):
            continue
        if not re.fullmatch(r"\d{15}", _field(response, "nProt") or ""):
            continue
        found[code] = _fiscal_fragment(event)
    return found


def _result(raw: str, key: str | None = None, environment: str | None = None) -> dict[str, Any]:
    root = _parse(raw)
    consultation = next(root.iter(f"{{{MDFE}}}retConsSitMDFe"), None)
    event_return = next(root.iter(f"{{{MDFE}}}retEventoMDFe"), None)
    protocol_node = next(
        root.iter(f"{{{MDFE}}}protMDFe"),
        None,
    )
    protocol_xml = (
        ET.tostring(protocol_node, encoding="unicode")
        if protocol_node is not None
        else None
    )
    if event_return is not None and consultation is None:
        scope = event_return.find(f"{{{MDFE}}}infEvento")
    elif protocol_node is not None:
        scope = protocol_node.find(f"{{{MDFE}}}infProt")
    else:
        scope = next((node for node in root.iter() if node.find(f"{{{MDFE}}}cStat") is not None), None)
    if scope is None or not _field(scope, "cStat"):
        raise ErroSefaz("A SEFAZ devolveu resposta fiscal incompleta.")
    expected_amb = ("1" if environment == "production" else "2") if environment else None
    for name, expected in (("chMDFe", key), ("tpAmb", expected_amb)):
        actual = _field(scope, name)
        if (expected and actual and actual != expected) or (
            consultation is not None and actual and _field(consultation, name)
            and actual != _field(consultation, name)
        ):
            raise ErroSefaz("A SEFAZ devolveu resposta de outro MDF-e ou ambiente.")
    if consultation is not None:
        if (key and _field(consultation, "chMDFe") != key) or (
            environment and _field(consultation, "tpAmb") != ("1" if environment == "production" else "2")
        ):
            raise ErroSefaz("A SEFAZ devolveu consulta de outro MDF-e ou ambiente.")
    documents = _event_documents(root, key, environment)
    return {
        "cstat": _field(consultation, "cStat") if consultation is not None else _field(scope, "cStat"),
        "reason": _field(consultation, "xMotivo") if consultation is not None else _field(scope, "xMotivo"),
        "protocol": _field(scope, "nProt"),
        "authorized_at": _field(scope, "dhRecbto"),
        "key": _field(scope, "chMDFe"),
        "event_type": _field(scope, "tpEvento"),
        "event_sequence": _field(scope, "nSeqEvento"),
        "protocol_xml": protocol_xml,
        "events": {code: _field(_parse(xml).find(f"{{{MDFE}}}retEventoMDFe/{{{MDFE}}}infEvento"), "nProt")
                   for code, xml in documents.items()},
        "event_documents": documents,
        "response_xml": raw,
    }


def _validate_request(key: str, environment: str) -> None:
    if environment not in SVRS or not re.fullmatch(r"\d{44}", key):
        raise ErroSefaz("Chave ou ambiente MDF-e inválido.", False)


def consultar(
    key: str, environment: str, credential: CredencialFiscal, timeout: int
) -> dict[str, Any]:
    _validate_request(key, environment)
    wsdl = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeConsulta"
    data = f'<consSitMDFe xmlns="{MDFE}" versao="3.00"><tpAmb>{1 if environment == "production" else 2}</tpAmb><xServ>CONSULTAR</xServ><chMDFe>{key}</chMDFe></consSitMDFe>'
    return _result(
        _post(
            SVRS[environment] + "MDFeConsulta/MDFeConsulta.asmx",
            wsdl + "/mdfeConsultaMDF",
            _envelope(wsdl, data),
            credential,
            timeout,
        ), key, environment
    )


def transmitir(
    xml: str, environment: str, credential: CredencialFiscal, timeout: int
) -> dict[str, Any]:
    root = _parse(xml)
    info = root.find(f"{{{MDFE}}}infMDFe")
    if info is None:
        raise ErroSefaz("O XML de transmissão MDF-e está incompleto.", False)
    key = (info.get("Id") or "").removeprefix("MDFe")
    _validate_request(key, environment)
    if info.findtext(f"{{{MDFE}}}ide/{{{MDFE}}}tpAmb") != ("1" if environment == "production" else "2"):
        raise ErroSefaz("O XML MDF-e pertence a outro ambiente.", False)
    wsdl = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoSinc"
    # MDFeRecepcaoSinc recebe o XML como texto comprimido e codificado dentro
    # de mdfeDadosMsg; Content-Encoding do HTTP é uma camada adicional.
    payload = base64.b64encode(gzip.compress(xml.encode("utf-8"))).decode("ascii")
    return _result(
        _post(
            SVRS[environment] + "MDFeRecepcaoSinc/MDFeRecepcaoSinc.asmx",
            wsdl + "/mdfeRecepcao",
            _envelope(wsdl, payload),
            credential,
            timeout,
        ), key, environment
    )


def transmitir_evento(
    xml: str, key: str, environment: str, credential: CredencialFiscal, timeout: int
) -> dict[str, Any]:
    _validate_request(key, environment)
    wsdl = "http://www.portalfiscal.inf.br/mdfe/wsdl/MDFeRecepcaoEvento"
    raw = _post(
        SVRS[environment] + "MDFeRecepcaoEvento/MDFeRecepcaoEvento.asmx",
        wsdl + "/mdfeRecepcaoEvento",
        _envelope(wsdl, xml, key[:2]),
        credential,
        timeout,
    )
    return _result(raw, key, environment)
