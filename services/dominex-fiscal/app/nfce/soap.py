"""Transporte NFC-e 4.00 com matriz oficial própria por autorizador.

Fonte da matriz, conferida em 02/11/2026:
https://dfe-portal.svrs.rs.gov.br/NFCE/Servicos

O modelo 65 não pode reutilizar a matriz NF-e: várias UFs publicam domínios
distintos e um envio ao autorizador errado pode ser rejeitado ou ficar incerto.
"""

from __future__ import annotations

import re
from typing import Any

from nfelib.nfe.client.v4_0.servers import Endpoint

from ..nfe import documents
from ..nfe import soap as base
from ..nfe.xml import NS, UF_CODES, validar_assinatura
from ..sefaz.credencial import CredencialSefaz as CredencialFiscal


AUTHOR_BY_UF = {
    uf: (uf if uf in {"AM", "GO", "MS", "MT", "PR", "RS", "SP"} else "SVRS")
    for uf in UF_CODES
}
MATRIX: dict[str, dict[str, dict[Endpoint, str] | str]] = {
    "AM": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.sefaz.am.gov.br/nfce-services/services/NfeConsulta4",
            Endpoint.NFESTATUSSERVICO: "https://nfce.sefaz.am.gov.br/nfce-services/services/NfeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://nfce.sefaz.am.gov.br/nfce-services/services/RecepcaoEvento4",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeConsulta4",
            Endpoint.NFESTATUSSERVICO: "https://homnfce.sefaz.am.gov.br/nfce-services/services/NfeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://homnfce.sefaz.am.gov.br/nfce-services/services/RecepcaoEvento4",
        },
    },
    "GO": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfe.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfe.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://nfe.sefaz.go.gov.br/nfe/services/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://nfe.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://homolog.sefaz.go.gov.br/nfe/services/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://homolog.sefaz.go.gov.br/nfe/services/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://homolog.sefaz.go.gov.br/nfe/services/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://homolog.sefaz.go.gov.br/nfe/services/NFeRecepcaoEvento4",
        },
    },
    "MS": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://nfce.sefaz.ms.gov.br/ws/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://nfce.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://hom.nfce.sefaz.ms.gov.br/ws/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://hom.nfce.sefaz.ms.gov.br/ws/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://hom.nfce.sefaz.ms.gov.br/ws/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://hom.nfce.sefaz.ms.gov.br/ws/NFeRecepcaoEvento4",
        },
    },
    "MT": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.sefaz.mt.gov.br/nfcews/services/NfeConsulta4",
            Endpoint.NFESTATUSSERVICO: "https://nfce.sefaz.mt.gov.br/nfcews/services/NfeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://nfce.sefaz.mt.gov.br/nfcews/services/RecepcaoEvento4",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeConsulta4",
            Endpoint.NFESTATUSSERVICO: "https://homologacao.sefaz.mt.gov.br/nfcews/services/NfeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://homologacao.sefaz.mt.gov.br/nfcews/services/RecepcaoEvento4",
        },
    },
    "PR": {
        "soap": "1.2",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.sefa.pr.gov.br/nfce/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://nfce.sefa.pr.gov.br/nfce/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://nfce.sefa.pr.gov.br/nfce/NFeRecepcaoEvento4",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeAutorizacao4",
            Endpoint.NFECONSULTAPROTOCOLO: "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeConsultaProtocolo4",
            Endpoint.NFESTATUSSERVICO: "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeStatusServico4",
            Endpoint.RECEPCAOEVENTO: "https://homologacao.nfce.sefa.pr.gov.br/nfce/NFeRecepcaoEvento4",
        },
    },
    "RS": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://nfce.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://nfce.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://nfce-homologacao.sefazrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce-homologacao.sefazrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://nfce-homologacao.sefazrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://nfce-homologacao.sefazrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
        },
    },
    "SP": {
        "soap": "1.2",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeConsultaProtocolo4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://homologacao.nfce.fazenda.sp.gov.br/ws/NFeRecepcaoEvento4.asmx",
        },
    },
    "SVRS": {
        "soap": "1.1",
        "production": {
            Endpoint.NFEAUTORIZACAO: "https://nfce.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://nfce.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://nfce.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
        },
        "homologation": {
            Endpoint.NFEAUTORIZACAO: "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeAutorizacao/NFeAutorizacao4.asmx",
            Endpoint.NFECONSULTAPROTOCOLO: "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx",
            Endpoint.NFESTATUSSERVICO: "https://nfce-homologacao.svrs.rs.gov.br/ws/NfeStatusServico/NfeStatusServico4.asmx",
            Endpoint.RECEPCAOEVENTO: "https://nfce-homologacao.svrs.rs.gov.br/ws/recepcaoevento/recepcaoevento4.asmx",
        },
    },
}


def service(uf: str, environment: str, endpoint: Endpoint) -> base.Service:
    normalized = str(uf or "").upper()
    if normalized not in AUTHOR_BY_UF:
        raise base.ErroSefazNfe("UF sem autorizador NFC-e configurado.", False)
    if environment not in {"production", "homologation"}:
        raise base.ErroSefazNfe("Ambiente NFC-e inválido.", False)
    authorizer = AUTHOR_BY_UF[normalized]
    config = MATRIX[authorizer]
    try:
        url = config[environment][endpoint]  # type: ignore[index]
    except KeyError:
        raise base.ErroSefazNfe("Serviço NFC-e indisponível para o autorizador.", False) from None
    operation = {
        Endpoint.NFESTATUSSERVICO: ("NFeStatusServico4", "nfeStatusServicoNF"),
        Endpoint.NFEAUTORIZACAO: ("NFeAutorizacao4", "nfeAutorizacaoLote"),
        Endpoint.NFECONSULTAPROTOCOLO: ("NFeConsultaProtocolo4", "nfeConsultaNF"),
        Endpoint.RECEPCAOEVENTO: ("NFeRecepcaoEvento4", "nfeRecepcaoEvento"),
    }.get(endpoint)
    if operation is None:
        raise base.ErroSefazNfe("Operação NFC-e não habilitada neste motor.", False)
    wsdl_name, method = operation
    namespace = f"{NS}/wsdl/{wsdl_name}"
    return base.Service(
        url=str(url),
        soap_version=str(config["soap"]),
        wsdl_namespace=namespace,
        action=f"{namespace}/{method}",
    )


def status(uf: str, environment: str, credential: CredencialFiscal, timeout: int = 20) -> dict[str, Any]:
    payload = (
        f'<consStatServ xmlns="{NS}" versao="4.00">'
        f'<tpAmb>{1 if environment == "production" else 2}</tpAmb>'
        f'<cUF>{UF_CODES[str(uf).upper()]}</cUF><xServ>STATUS</xServ></consStatServ>'
    )
    return base._parse(base._post(service(uf, environment, Endpoint.NFESTATUSSERVICO), payload, credential, timeout))


def consultar(key: str, uf: str, environment: str, credential: CredencialFiscal, timeout: int = 20) -> dict[str, Any]:
    documents.validar_chave(key, uf, model="65")
    payload = (
        f'<consSitNFe xmlns="{NS}" versao="4.00">'
        f'<tpAmb>{1 if environment == "production" else 2}</tpAmb>'
        f'<xServ>CONSULTAR</xServ><chNFe>{key}</chNFe></consSitNFe>'
    )
    result = base._parse(base._post(service(uf, environment, Endpoint.NFECONSULTAPROTOCOLO), payload, credential, timeout))
    if result.get("key") not in (None, key):
        raise base.ErroSefazNfe("A consulta devolveu outra chave NFC-e.")
    return result


def transmitir(signed: str, uf: str, environment: str, credential: CredencialFiscal, batch_id: str, timeout: int = 30) -> dict[str, Any]:
    if not re.fullmatch(r"[0-9]{1,15}", batch_id):
        raise base.ErroSefazNfe("Identificador do lote NFC-e inválido.", False)
    payload = (
        f'<enviNFe xmlns="{NS}" versao="4.00"><idLote>{batch_id}</idLote>'
        f'<indSinc>1</indSinc>{signed}</enviNFe>'
    )
    return base._parse(base._post(service(uf, environment, Endpoint.NFEAUTORIZACAO), payload, credential, timeout))


def transmitir_cancelamento(signed: str, uf: str, environment: str, credential: CredencialFiscal, batch_id: str, timeout: int = 20) -> dict[str, Any]:
    root = base._root(signed)
    info = root.find(f"{{{NS}}}infEvento")
    key = base._value(info, "chNFe") or ""
    if documents.validar_documento(signed, "cancellation") or validar_assinatura(signed, information_tag="infEvento"):
        raise base.ErroSefazNfe("Cancelamento NFC-e inválido ou sem assinatura válida.", False)
    documents.validar_identidade(signed, "cancellation", uf, environment, model="65")
    if not re.fullmatch(r"[0-9]{1,15}", batch_id):
        raise base.ErroSefazNfe("Identificador do lote de evento inválido.", False)
    event_type = base._value(info, "tpEvento") or ""
    sequence = int(base._value(info, "nSeqEvento") or "0")
    payload = f'<envEvento xmlns="{NS}" versao="1.00"><idLote>{batch_id}</idLote>{signed}</envEvento>'
    return base.interpretar_evento(
        base._post(service(uf, environment, Endpoint.RECEPCAOEVENTO), payload, credential, timeout),
        key=key,
        event_type=event_type,
        sequence=sequence,
    )


ErroSefazNfce = base.ErroSefazNfe
