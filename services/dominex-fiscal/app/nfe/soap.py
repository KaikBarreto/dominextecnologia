"""Transporte NF-e 4.00 sobre SOAP 1.1/1.2 e mTLS.

Os endpoints vêm do catálogo versionado do nfelib; o roteamento por UF é
explícito e falha fechado para impedir envio ao autorizador errado.
"""

from __future__ import annotations

import gzip
import http.client
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

from lxml import etree as ET

from nfelib.nfe.client.v4_0.servers import Endpoint, servers

from ..sefaz.credencial import CredencialSefaz as CredencialFiscal
from .xml import UF_CODES

NFE = "http://www.portalfiscal.inf.br/nfe"
SOAP11 = "http://schemas.xmlsoap.org/soap/envelope/"
SOAP12 = "http://www.w3.org/2003/05/soap-envelope"

# Página de webservices do Portal Nacional, reproduzida pelo catálogo nfelib.
# Não usar fallback: uma UF desconhecida não pode ir silenciosamente à SVRS.
AUTHORIZER_BY_UF = {
    "AC": "SVRS", "AL": "SVRS", "AP": "SVRS", "AM": "AM",
    "BA": "BA", "CE": "SVRS", "DF": "SVRS", "ES": "SVRS",
    "GO": "GO", "MA": "SVAN", "MT": "MT", "MS": "MS",
    "MG": "MG", "PA": "SVAN", "PB": "SVRS", "PR": "PR",
    "PE": "PE", "PI": "SVRS", "RJ": "SVRS", "RN": "SVRS",
    "RS": "RS", "RO": "SVRS", "RR": "SVRS", "SC": "SVRS",
    "SP": "SP", "SE": "SVRS", "TO": "SVRS",
}


class ErroSefazNfe(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable


@dataclass(frozen=True)
class Service:
    url: str
    soap_version: str
    wsdl_namespace: str
    action: str


def service(uf: str, environment: str, endpoint: Endpoint) -> Service:
    normalized_uf = str(uf or "").upper()
    if normalized_uf not in UF_CODES or normalized_uf not in AUTHORIZER_BY_UF:
        raise ErroSefazNfe("UF sem autorizador NF-e configurado.", False)
    if environment not in {"production", "homologation"}:
        raise ErroSefazNfe("Ambiente NF-e inválido.", False)
    authorizer = AUTHORIZER_BY_UF[normalized_uf]
    try:
        config = servers[authorizer]
        endpoints = config["prod_endpoints" if environment == "production" else "dev_endpoints"]
        url = endpoints[endpoint]
    except KeyError:
        raise ErroSefazNfe(
            f"Serviço {endpoint.value} indisponível para o autorizador {authorizer}.", False
        ) from None
    operation = {
        Endpoint.NFESTATUSSERVICO: ("NFeStatusServico4", "nfeStatusServicoNF"),
        Endpoint.NFEAUTORIZACAO: ("NFeAutorizacao4", "nfeAutorizacaoLote"),
        Endpoint.NFECONSULTAPROTOCOLO: ("NFeConsultaProtocolo4", "nfeConsultaNF"),
        Endpoint.RECEPCAOEVENTO: ("NFeRecepcaoEvento4", "nfeRecepcaoEvento"),
        Endpoint.NFEINUTILIZACAO: ("NFeInutilizacao4", "nfeInutilizacaoNF"),
    }.get(endpoint)
    if operation is None:
        raise ErroSefazNfe("Operação NF-e ainda não habilitada no motor direto.", False)
    wsdl_name, method = operation
    namespace = f"{NFE}/wsdl/{wsdl_name}"
    return Service(
        url=url.removesuffix("?wsdl"),
        soap_version=str(config["soap_version"]),
        wsdl_namespace=namespace,
        action=f"{namespace}/{method}",
    )


def _envelope(service_config: Service, xml: str) -> str:
    soap_ns = SOAP12 if service_config.soap_version == "1.2" else SOAP11
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        # C14N inclusivo incorpora prefixos ancestrais; namespace padrão preserva
        # a assinatura feita antes de envolver o documento no SOAP.
        f'<Envelope xmlns="{soap_ns}"><Body>'
        f'<nfeDadosMsg xmlns="{service_config.wsdl_namespace}">{xml}</nfeDadosMsg>'
        "</Body></Envelope>"
    )


def _post(
    service_config: Service, xml: str, credential: CredencialFiscal, timeout: int
) -> str:
    parsed = urlsplit(service_config.url)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ErroSefazNfe("Endpoint NF-e inseguro ou inválido.", False)
    # Alguns autorizadores ainda entregam cadeia ancorada na ICP-Brasil.
    credential.contexto.load_verify_locations(
        cafile=str(Path(__file__).parents[1] / "mdfe" / "icp-brasil-v10.ca")
    )
    body = _envelope(service_config, xml).encode()
    headers = {"Accept-Encoding": "gzip"}
    if service_config.soap_version == "1.2":
        headers["Content-Type"] = (
            f'application/soap+xml; charset=utf-8; action="{service_config.action}"'
        )
    else:
        headers.update({
            "Content-Type": "text/xml; charset=utf-8",
            "SOAPAction": f'"{service_config.action}"',
        })
    connection = http.client.HTTPSConnection(
        parsed.hostname, parsed.port or 443, context=credential.contexto,
        timeout=min(max(timeout, 1), 30),
    )
    try:
        path = parsed.path or "/"
        connection.request("POST", path, body=body, headers=headers)
        response = connection.getresponse()
        raw = response.read()
        if response.getheader("Content-Encoding") == "gzip":
            raw = gzip.decompress(raw)
        if response.status >= 500:
            raise ErroSefazNfe(f"SEFAZ indisponível (HTTP {response.status}).")
        if response.status >= 400:
            raise ErroSefazNfe(
                f"SEFAZ recusou a comunicação (HTTP {response.status}).", False
            )
        return raw.decode("utf-8", "replace")
    except (OSError, http.client.HTTPException) as exc:
        raise ErroSefazNfe("Não foi possível comunicar com a SEFAZ.") from exc
    finally:
        connection.close()


def _local_name(node: ET._Element) -> str:
    return node.tag.rsplit("}", 1)[-1] if isinstance(node.tag, str) else ""


def _root(raw: str) -> ET._Element:
    if len(raw.encode()) > 5_000_000:
        raise ErroSefazNfe("A resposta NF-e excedeu o limite permitido.")
    try:
        root = ET.fromstring(raw.encode(), ET.XMLParser(resolve_entities=False, no_network=True))
    except (ValueError, ET.XMLSyntaxError):
        raise ErroSefazNfe("A SEFAZ devolveu XML inválido.") from None
    if root.getroottree().docinfo.doctype:
        raise ErroSefazNfe("A SEFAZ devolveu XML com DTD não permitido.")
    fault = next((node for node in root.iter() if _local_name(node) == "Fault"), None)
    if fault is not None:
        raise ErroSefazNfe("A SEFAZ devolveu uma falha SOAP.")
    return root


def _response(root: ET._Element, name: str) -> ET._Element:
    matches = list(root.iter(f"{{{NFE}}}{name}"))
    if not matches:
        # ASMX pode devolver XML fiscal escapado dentro do resultado SOAP.
        for node in root.iter():
            if (_local_name(node) == "nfeResultMsg" or _local_name(node).endswith("Result")) \
                    and (node.text or "").lstrip().startswith("<"):
                matches.extend(_root(node.text).iter(f"{{{NFE}}}{name}"))
    if len(matches) != 1:
        raise ErroSefazNfe("A SEFAZ devolveu resposta NF-e ausente ou ambígua.")
    return matches[0]


def _value(node: ET._Element | None, name: str) -> str | None:
    if node is None:
        return None
    children = node.findall(f"{{{NFE}}}{name}")
    if len(children) > 1:
        raise ErroSefazNfe("A SEFAZ devolveu campos NF-e duplicados.")
    return (children[0].text or "").strip() or None if children else None


def _serialized(node: ET._Element | None) -> str | None:
    return ET.tostring(node, encoding="unicode", with_tail=False) if node is not None else None


def _event_result(event: ET._Element) -> dict[str, Any]:
    inf = event.find(f"{{{NFE}}}infEvento")
    return {
        "cstat": _value(inf, "cStat"), "reason": _value(inf, "xMotivo"),
        "key": _value(inf, "chNFe"), "event_type": _value(inf, "tpEvento"),
        "sequence": _value(inf, "nSeqEvento"), "protocol": _value(inf, "nProt"),
        "registered_at": _value(inf, "dhRegEvento"), "tp_amb": _value(inf, "tpAmb"),
        "return_xml": _serialized(event),
    }


def _parse(raw: str) -> dict[str, Any]:
    root = _root(raw)
    responses = [node for node in root.iter() if node.tag in {
        f"{{{NFE}}}{name}" for name in (
            "retConsSitNFe", "retEnviNFe", "retConsStatServ", "retConsReciNFe"
        )
    }]
    if len(responses) != 1:
        # Também resolve a representação ASMX escapada.
        responses = []
        for name in ("retConsSitNFe", "retEnviNFe", "retConsStatServ", "retConsReciNFe"):
            try:
                responses.append(_response(root, name))
            except ErroSefazNfe:
                continue
    if len(responses) != 1:
        raise ErroSefazNfe("A SEFAZ devolveu resposta NF-e ausente ou ambígua.")
    response = responses[0]
    protocols = response.findall(f"{{{NFE}}}protNFe")
    if len(protocols) > 1:
        raise ErroSefazNfe("O retorno contém mais de um protocolo NF-e.")
    protocol = protocols[0] if protocols else None
    inf = protocol.find(f"{{{NFE}}}infProt") if protocol is not None else None
    # Na consulta, 101/151 prevalece sobre o protocolo anterior com 100/150.
    consultation = _local_name(response) == "retConsSitNFe"
    scope = response if consultation or inf is None else inf
    events = []
    for processed in response.findall(f"{{{NFE}}}procEventoNFe"):
        returned = processed.find(f"{{{NFE}}}retEvento")
        if returned is not None:
            event = _event_result(returned)
            event["processed_xml"] = _serialized(processed)
            event["request_xml"] = _serialized(processed.find(f"{{{NFE}}}evento"))
            events.append(event)
    return {
        "cstat": _value(scope, "cStat"), "reason": _value(scope, "xMotivo"),
        "protocol": _value(inf, "nProt"), "authorized_at": _value(inf, "dhRecbto"),
        "key": _value(response, "chNFe") or _value(inf, "chNFe"),
        "receipt": _value(response.find(f"{{{NFE}}}infRec"), "nRec"),
        "tp_amb": _value(response, "tpAmb"), "events": events,
        "protocol_cstat": _value(inf, "cStat"), "protocol_xml": _serialized(protocol),
        "response_xml": raw,
    }


def montar_status(uf: str, environment: str) -> str:
    service(uf, environment, Endpoint.NFESTATUSSERVICO)
    return (
        f'<consStatServ xmlns="{NFE}" versao="4.00">'
        f'<tpAmb>{1 if environment == "production" else 2}</tpAmb>'
        "<cUF>" + UF_CODES[uf.upper()] + "</cUF><xServ>STATUS</xServ></consStatServ>"
    )


def montar_consulta(key: str, uf: str, environment: str) -> str:
    if not isinstance(key, str) or not re.fullmatch(r"[0-9]{44}", key):
        raise ErroSefazNfe("Chave NF-e inválida para consulta.", False)
    service(uf, environment, Endpoint.NFECONSULTAPROTOCOLO)
    return (
        f'<consSitNFe xmlns="{NFE}" versao="4.00">'
        f'<tpAmb>{1 if environment == "production" else 2}</tpAmb>'
        f"<xServ>CONSULTAR</xServ><chNFe>{key}</chNFe></consSitNFe>"
    )


def status(
    uf: str, environment: str, credential: CredencialFiscal, timeout: int = 20
) -> dict[str, Any]:
    config = service(uf, environment, Endpoint.NFESTATUSSERVICO)
    payload = montar_status(uf, environment)
    return _parse(_post(config, payload, credential, timeout))


def transmitir(
    signed_nfe: str, uf: str, environment: str, credential: CredencialFiscal,
    batch_id: str, timeout: int = 30,
) -> dict[str, Any]:
    if not batch_id.isdigit() or not 1 <= len(batch_id) <= 15:
        raise ErroSefazNfe("Identificador do lote NF-e inválido.", False)
    config = service(uf, environment, Endpoint.NFEAUTORIZACAO)
    payload = (
        f'<enviNFe xmlns="{NFE}" versao="4.00"><idLote>{batch_id}</idLote>'
        f"<indSinc>1</indSinc>{signed_nfe}</enviNFe>"
    )
    return _parse(_post(config, payload, credential, timeout))


def consultar(
    key: str, uf: str, environment: str, credential: CredencialFiscal,
    timeout: int = 20,
) -> dict[str, Any]:
    payload = montar_consulta(key, uf, environment)
    config = service(uf, environment, Endpoint.NFECONSULTAPROTOCOLO)
    result = _parse(_post(config, payload, credential, timeout))
    if result.get("key") not in (None, key):
        raise ErroSefazNfe("A consulta devolveu outra chave NF-e.")
    if result.get("tp_amb") not in (None, "1" if environment == "production" else "2"):
        raise ErroSefazNfe("A consulta devolveu outro ambiente fiscal.")
    return result


def interpretar_evento(raw: str, *, key: str, event_type: str, sequence: int) -> dict[str, Any]:
    response = _response(_root(raw), "retEnvEvento")
    batch_status = _value(response, "cStat")
    matches = []
    for returned in response.findall(f"{{{NFE}}}retEvento"):
        event = _event_result(returned)
        if (event["key"], event["event_type"], event["sequence"]) == (key, event_type, str(sequence)):
            matches.append(event)
    if batch_status == "128" and len(matches) != 1:
        # Rejeições de schema podem omitir a identidade; nunca atribuir retorno
        # de outro evento à operação atual só porque o lote foi processado.
        raise ErroSefazNfe("O retorno não identifica unicamente o evento enviado.")
    result = matches[0] if batch_status == "128" else {
        "cstat": batch_status, "reason": _value(response, "xMotivo"), "protocol": None,
    }
    return {**result, "batch_cstat": batch_status, "response_xml": raw}


def transmitir_evento(
    signed_event: str, uf: str, environment: str, credential: CredencialFiscal,
    batch_id: str, timeout: int = 20,
) -> dict[str, Any]:
    from .documents import EVENT_TYPES, EVENT_VERSION, validar_identidade, validar_documento
    from .xml import validar_assinatura
    root = _root(signed_event)
    inf = root.find(f"{{{NFE}}}infEvento")
    key, event_type = _value(inf, "chNFe"), _value(inf, "tpEvento")
    kind = next((kind for kind, code in EVENT_TYPES.items() if code == event_type), None)
    if kind is None or validar_documento(signed_event, kind) or validar_assinatura(signed_event, information_tag="infEvento"):
        raise ErroSefazNfe("Evento NF-e inválido ou sem assinatura válida.", False)
    validar_identidade(signed_event, kind, uf, environment)
    if _value(inf, "tpAmb") != ("1" if environment == "production" else "2"):
        raise ErroSefazNfe("Ambiente do evento diverge da rota fiscal.", False)
    if not re.fullmatch(r"[0-9]{1,15}", str(batch_id)):
        raise ErroSefazNfe("Identificador do lote de eventos inválido.", False)
    config = service(uf, environment, Endpoint.RECEPCAOEVENTO)
    payload = (
        f'<envEvento xmlns="{NFE}" versao="{EVENT_VERSION}"><idLote>{batch_id}</idLote>'
        f"{signed_event}</envEvento>"
    )
    result = interpretar_evento(
        _post(config, payload, credential, timeout), key=key, event_type=event_type,
        sequence=int(_value(inf, "nSeqEvento")),
    )
    if result.get("tp_amb") not in (None, _value(inf, "tpAmb")):
        raise ErroSefazNfe("O retorno do evento pertence a outro ambiente fiscal.")
    return result


def interpretar_inutilizacao(raw: str) -> dict[str, Any]:
    response = _response(_root(raw), "retInutNFe")
    inf = response.find(f"{{{NFE}}}infInut")
    result = {
        name: _value(inf, tag) for name, tag in {
            "cstat": "cStat", "reason": "xMotivo", "protocol": "nProt",
            "registered_at": "dhRecbto", "tp_amb": "tpAmb", "uf_code": "cUF",
            "year": "ano", "cnpj": "CNPJ", "model": "mod", "series": "serie",
            "first": "nNFIni", "last": "nNFFin",
        }.items()
    }
    return {**result, "return_xml": _serialized(response), "response_xml": raw}


def transmitir_inutilizacao(
    signed_request: str, uf: str, environment: str, credential: CredencialFiscal,
    timeout: int = 20,
) -> dict[str, Any]:
    from .documents import validar_identidade, validar_documento
    from .xml import validar_assinatura
    if validar_documento(signed_request, "invalidation") or validar_assinatura(signed_request, information_tag="infInut"):
        raise ErroSefazNfe("Inutilização NF-e inválida ou sem assinatura válida.", False)
    validar_identidade(signed_request, "invalidation", uf, environment)
    inf = _root(signed_request).find(f"{{{NFE}}}infInut")
    if (_value(inf, "cUF"), _value(inf, "tpAmb")) != (
        UF_CODES.get(uf.upper()), "1" if environment == "production" else "2"
    ):
        raise ErroSefazNfe("Inutilização diverge da UF ou ambiente da rota fiscal.", False)
    config = service(uf, environment, Endpoint.NFEINUTILIZACAO)
    return interpretar_inutilizacao(_post(config, signed_request, credential, timeout))
