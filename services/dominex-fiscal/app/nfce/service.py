from __future__ import annotations

import base64
import copy
from typing import Any

from lxml import etree

from ..config import get_config
from ..errors import DadosInvalidos, ServicoFiscalIndisponivel
from ..nfe import documents
from ..nfe.emission import montar_nfe_processada
from ..nfe.service import (
    AUTORIZADA,
    CANCELADA,
    DENEGADA,
    NAO_ENCONTRADA,
    TRANSITORIA,
    _credencial,
    _evento_confirmado_na_consulta,
)
from ..nfe import xml as nfe_xml
from ..rejections import anexar_orientacao, traduzir_rejeicao
from . import api_schemas as schemas
from . import soap, xml
from .danfce import gerar_danfce


def _ambiente(req) -> str:
    return "production" if req.ambiente == 1 else "homologation"


def _meta(req) -> dict[str, str]:
    return {
        "tenantId": req.tenant_id,
        "operationId": str(req.operation_id),
        "snapshotHash": req.snapshot_hash,
    }


def _exigir_mutacao_liberada(req) -> None:
    if req.ambiente == 1 and not get_config().nfce_producao_habilitada:
        raise ServicoFiscalIndisponivel(
            "A emissão direta de NFC-e em produção ainda não está liberada. "
            "A consulta e a reconciliação continuam disponíveis."
        )


def _retorno(resposta: dict[str, Any], operacao: str) -> dict[str, Any]:
    result = anexar_orientacao(resposta, "sefaz_nfe", operacao=operacao)
    code = str(resposta.get("cstat") or "")
    if code in AUTORIZADA and resposta.get("protocol"):
        result["situacaoOficial"] = "autorizada"
    elif code in CANCELADA:
        result["situacaoOficial"] = "cancelada"
    elif code in DENEGADA:
        result["situacaoOficial"] = "denegada"
    elif code in NAO_ENCONTRADA:
        result["situacaoOficial"] = "nao_localizada"
    else:
        result["situacaoOficial"] = "aguardando_confirmacao"
    return result


def _resultado(req, **data: Any) -> dict[str, Any]:
    response = data.get("resposta")
    if isinstance(response, dict):
        normalized = _retorno(response, "operação de NFC-e")
        data["resposta"] = normalized
        data.setdefault("situacaoOficial", normalized.get("situacaoOficial"))
        if "orientacao" in normalized:
            data["orientacao"] = normalized["orientacao"]
    return {**_meta(req), **data}


def _indisponivel(exc: Exception, operacao: str) -> ServicoFiscalIndisponivel:
    guidance = traduzir_rejeicao("sefaz_nfe", None, str(exc), operacao=operacao)
    return ServicoFiscalIndisponivel(
        guidance.mensagem if guidance else "A SEFAZ está temporariamente indisponível.",
        detalhe=type(exc).__name__,
        orientacao=guidance,
    )


def _identidade(xml_assinado: str) -> tuple[str, str, str, str]:
    try:
        root = etree.fromstring(
            xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise DadosInvalidos("O XML assinado da NFC-e está ilegível.") from None
    info = root.find(f"{{{nfe_xml.NS}}}infNFe")
    if root.tag != f"{{{nfe_xml.NS}}}NFe" or info is None:
        raise DadosInvalidos("O documento informado não é uma NFC-e válida.")
    identity = str(info.get("Id") or "")
    key = identity[3:] if identity.startswith("NFe") else ""
    if len(key) != 44 or not key.isdigit() or key[20:22] != "65":
        raise DadosInvalidos("A chave informada não pertence a uma NFC-e modelo 65.")
    return (
        key,
        info.findtext(f"{{{nfe_xml.NS}}}ide/{{{nfe_xml.NS}}}tpAmb") or "",
        info.findtext(f"{{{nfe_xml.NS}}}ide/{{{nfe_xml.NS}}}cUF") or "",
        info.findtext(f"{{{nfe_xml.NS}}}emit/{{{nfe_xml.NS}}}CNPJ") or "",
    )


def _validar_xml(req, credential) -> None:
    errors = nfe_xml.validar_xsd(req.xml_assinado) + nfe_xml.validar_assinatura(req.xml_assinado)
    if errors:
        raise DadosInvalidos("; ".join(errors[:5]))
    key, environment, uf_code, cnpj = _identidade(req.xml_assinado)
    if key != req.chave:
        raise DadosInvalidos("A chave não corresponde ao XML assinado.")
    if environment != ("1" if req.ambiente == 1 else "2"):
        raise DadosInvalidos("O XML assinado pertence a outro ambiente fiscal.")
    if uf_code != nfe_xml.UF_CODES.get(req.uf.upper()):
        raise DadosInvalidos("O XML assinado pertence a outra UF.")
    try:
        nfe_xml._validate_certificate_owner(cnpj, credential)
    except nfe_xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None


def _artifacts(signed: str, response: dict[str, Any]) -> dict[str, Any]:
    protocol_xml = response.get("protocol_xml")
    if response.get("cstat") not in AUTORIZADA or not protocol_xml:
        return {}
    try:
        processed, proof = montar_nfe_processada(signed, str(protocol_xml))
        pdf = gerar_danfce(processed)
    except nfe_xml.ErroNfeLocal as exc:
        raise ServicoFiscalIndisponivel(
            "A autorização foi localizada, mas a prova fiscal precisa ser reconciliada."
        ) from exc
    return {
        "xmlProcessado": processed,
        "danfceBase64": base64.b64encode(pdf).decode("ascii"),
        "prova": proof,
    }


def preparar(req: schemas.PrepararNfceRequest) -> dict[str, Any]:
    job = copy.deepcopy(req.documento)
    invoice = job.setdefault("invoice", {})
    payload = job.setdefault("payload", {})
    if not isinstance(invoice, dict) or not isinstance(payload, dict):
        raise DadosInvalidos("O documento fiscal está em formato inválido.")
    invoice["environment"] = "producao" if req.ambiente == 1 else "homologacao"
    job["payload_sha256"] = req.snapshot_hash
    credential = _credencial(req)
    try:
        if int(payload.get("tipoEmissao") or 1) == 9:
            signed, key = xml.montar_xml_contingencia(
                job, credential, qr_base_url=req.qr_base_url, access_url=req.access_url
            )
        else:
            unsigned, key = xml.montar_xml(
                job, qr_base_url=req.qr_base_url, access_url=req.access_url
            )
            signed = xml.assinar_xml(
                unsigned, credential, str((job.get("fiscal_config") or {}).get("cnpj") or "")
            )
        errors = xml.validar_xsd(signed) + xml.validar_assinatura(signed)
        if errors:
            raise nfe_xml.ErroNfeLocal("; ".join(errors[:5]))
    except (ValueError, TypeError, nfe_xml.ErroNfeLocal) as exc:
        raise DadosInvalidos(str(exc)) from None
    return _resultado(
        req,
        status="preparada",
        chave=key,
        xmlAssinado=signed,
        fingerprint=nfe_xml.fingerprint(signed),
    )


def status(req: schemas.StatusNfceRequest) -> dict[str, Any]:
    try:
        return anexar_orientacao(
            soap.status(req.uf.upper(), _ambiente(req), _credencial(req)),
            "sefaz_nfe",
            operacao="consultar o serviço de NFC-e",
        )
    except soap.ErroSefazNfce as exc:
        raise _indisponivel(exc, "consultar o serviço de NFC-e") from None


def consultar(req: schemas.ConsultarNfceRequest) -> dict[str, Any]:
    try:
        response = soap.consultar(req.chave, req.uf.upper(), _ambiente(req), _credencial(req))
        extras = _artifacts(req.xml_assinado, response) if req.xml_assinado else {}
        return {**_retorno(response, "consultar a NFC-e"), **extras}
    except soap.ErroSefazNfce as exc:
        raise _indisponivel(exc, "consultar a NFC-e") from None


def autorizar(req: schemas.AutorizarNfceRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    credential = _credencial(req)
    _validar_xml(req, credential)
    environment = _ambiente(req)
    try:
        previous = soap.consultar(req.chave, req.uf.upper(), environment, credential)
        if previous.get("cstat") in AUTORIZADA:
            return _resultado(req, outcome="authorized", recovered=True, resposta=previous, **_artifacts(req.xml_assinado, previous))
        if previous.get("cstat") in CANCELADA:
            return _resultado(req, outcome="cancelled", recovered=True, resposta=previous, situacaoOficial="cancelada")
        if previous.get("cstat") in DENEGADA:
            return _resultado(req, outcome="denied", recovered=True, resposta=previous, situacaoOficial="denegada")
        if previous.get("cstat") not in NAO_ENCONTRADA:
            return _resultado(
                req,
                outcome="uncertain" if previous.get("cstat") in TRANSITORIA else "rejected",
                recovered=False,
                resposta=previous,
            )
        health = soap.status(req.uf.upper(), environment, credential)
        if health.get("cstat") != "107":
            return _resultado(req, outcome="retry", recovered=False, resposta=health)
        response = soap.transmitir(req.xml_assinado, req.uf.upper(), environment, credential, req.id_lote)
        if response.get("cstat") == "539":
            check = soap.consultar(req.chave, req.uf.upper(), environment, credential)
            if check.get("cstat") in AUTORIZADA:
                return _resultado(req, outcome="authorized", recovered=True, resposta=check, **_artifacts(req.xml_assinado, check))
            return _resultado(req, outcome="uncertain", recovered=False, resposta=response)
        outcome = "authorized" if response.get("cstat") in AUTORIZADA else (
            "uncertain" if response.get("cstat") in TRANSITORIA else "rejected"
        )
        extras = _artifacts(req.xml_assinado, response) if outcome == "authorized" else {}
        return _resultado(req, outcome=outcome, recovered=False, resposta=response, **extras)
    except soap.ErroSefazNfce as exc:
        raise _indisponivel(exc, "autorizar a NFC-e") from None


def preparar_cancelamento(req: schemas.PrepararCancelamentoNfceRequest) -> dict[str, Any]:
    try:
        unsigned, identity = documents.montar_evento(
            key=req.chave,
            cnpj=req.cnpj,
            uf=req.uf.upper(),
            environment=_ambiente(req),
            kind="cancellation",
            sequence=1,
            text=req.justificativa,
            occurred_at=req.ocorrido_em,
            protocol=req.protocolo,
            model="65",
        )
        signed = documents.assinar_documento(unsigned, _credencial(req), req.cnpj, "cancellation")
    except nfe_xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return _resultado(
        req,
        status="preparado",
        identidade=identity,
        xmlAssinado=signed,
        fingerprint=nfe_xml.fingerprint(signed),
    )


def transmitir_cancelamento(req: schemas.TransmitirCancelamentoNfceRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    try:
        root = etree.fromstring(req.xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
        info = root.find(f"{{{nfe_xml.NS}}}infEvento")
        if info is None:
            raise DadosInvalidos("O cancelamento NFC-e assinado está incompleto.")
        key = info.findtext(f"{{{nfe_xml.NS}}}chNFe") or ""
        cnpj = info.findtext(f"{{{nfe_xml.NS}}}CNPJ") or ""
        credential = _credencial(req)
        nfe_xml._validate_certificate_owner(cnpj, credential)
        environment = _ambiente(req)
        previous = soap.consultar(key, req.uf.upper(), environment, credential)
        event_type = info.findtext(f"{{{nfe_xml.NS}}}tpEvento") or ""
        sequence = info.findtext(f"{{{nfe_xml.NS}}}nSeqEvento") or ""
        if previous.get("cstat") in CANCELADA:
            event = _evento_confirmado_na_consulta(previous, tipo_evento=event_type, sequencia=sequence)
            return _resultado(
                req,
                outcome="accepted" if event else "uncertain",
                recovered=bool(event),
                chave=key,
                situacaoOficial="cancelada",
                resposta=previous,
                xmlProcessado=(event or {}).get("processed_xml"),
            )
        if previous.get("cstat") not in AUTORIZADA:
            return _resultado(
                req,
                outcome="uncertain" if previous.get("cstat") in TRANSITORIA else "rejected",
                recovered=False,
                chave=key,
                resposta=previous,
                xmlProcessado=None,
            )
        response = soap.transmitir_cancelamento(
            req.xml_assinado, req.uf.upper(), environment, credential, req.id_lote
        )
        code = str(response.get("cstat") or "")
        if code in {"136", "573"}:
            checked = soap.consultar(key, req.uf.upper(), environment, credential)
            event = _evento_confirmado_na_consulta(checked, tipo_evento=event_type, sequencia=sequence)
            if checked.get("cstat") in CANCELADA and event:
                return _resultado(
                    req,
                    outcome="accepted",
                    recovered=True,
                    chave=key,
                    situacaoOficial="cancelada",
                    resposta=checked,
                    xmlProcessado=event.get("processed_xml"),
                )
        processed = None
        if code in {"135", "155"} and response.get("return_xml"):
            processed = documents.montar_processado(
                req.xml_assinado, str(response["return_xml"]), "cancellation"
            )
        return _resultado(
            req,
            outcome="accepted" if code in {"135", "155"} else (
                "uncertain" if code in {"", "128", "136", "573", "999"} else "rejected"
            ),
            recovered=False,
            chave=key,
            situacaoOficial="cancelada" if code in {"135", "155"} else "aguardando_confirmacao",
            resposta=response,
            xmlProcessado=processed,
        )
    except (ValueError, etree.XMLSyntaxError, nfe_xml.ErroNfeLocal) as exc:
        raise DadosInvalidos(str(exc)) from None
    except soap.ErroSefazNfce as exc:
        raise _indisponivel(exc, "cancelar a NFC-e") from None
