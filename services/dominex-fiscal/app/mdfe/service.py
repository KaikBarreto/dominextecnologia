from __future__ import annotations

import re
from typing import Any

from lxml import etree

from ..config import get_config
from ..custodia import Envelope
from ..errors import DadosInvalidos, ServicoFiscalIndisponivel
from ..rejections import anexar_orientacao, traduzir_rejeicao
from ..sefaz.credencial import abrir_credencial
from . import api_schemas as schemas
from . import soap
from .pdf import gerar_pdf
from .xml import (
    NS,
    ErroMdfeLocal,
    montar_assinado,
    montar_evento_assinado,
    montar_evento_processado,
    montar_processado,
    validar_certificado_emitente,
)

AUTORIZADO = {"100"}
NAO_ENCONTRADO = {"217"}
TRANSITORIO = {None, "108", "109", "999"}
EVENTO_ACEITO = {"135"}
EVENTO_EXIGE_CONSULTA = {"136", "155", "573"}
SITUACOES_TERMINAIS = {"101": "cancelado", "132": "encerrado"}


def _envelope(certificado) -> Envelope:
    return Envelope(
        pfx_cifrado_b64=certificado.pfx_cifrado_b64,
        dek_envelopada_b64=certificado.dek_envelopada_b64,
        senha_cifrada_b64=certificado.senha_cifrada_b64,
        nonce_b64=certificado.nonce_b64,
        algoritmo=certificado.algoritmo,
    )


def _credencial(req):
    return abrir_credencial(_envelope(req.certificado), req.empresa_id)


def _ambiente(req) -> str:
    return "production" if req.ambiente == 1 else "homologation"


def _meta(req) -> dict[str, str]:
    return {
        "tenantId": req.tenant_id,
        "operationId": str(req.operation_id),
        "snapshotHash": req.snapshot_hash,
    }


def _exigir_mutacao_liberada(req) -> None:
    if req.ambiente == 1 and not get_config().mdfe_producao_habilitada:
        raise ServicoFiscalIndisponivel(
            "A emissão direta de MDF-e em produção ainda não está liberada para este motor. "
            "A consulta e a reconciliação continuam disponíveis."
        )


def _indisponivel(exc: Exception, operacao: str) -> ServicoFiscalIndisponivel:
    orientacao = traduzir_rejeicao(
        "sefaz_mdfe", None, str(exc), operacao=operacao
    )
    return ServicoFiscalIndisponivel(
        orientacao.mensagem if orientacao else "A SEFAZ está temporariamente indisponível.",
        detalhe=type(exc).__name__,
        orientacao=orientacao,
    )


def _resposta_oficial(resposta: dict[str, Any], operacao: str) -> dict[str, Any]:
    retorno = anexar_orientacao(resposta, "sefaz_mdfe", operacao=operacao)
    cstat = str(resposta.get("cstat") or "")
    if cstat in AUTORIZADO and resposta.get("protocol"):
        retorno["situacaoOficial"] = "autorizado"
    elif cstat in SITUACOES_TERMINAIS:
        retorno["situacaoOficial"] = SITUACOES_TERMINAIS[cstat]
    else:
        retorno["situacaoOficial"] = "aguardando_confirmacao"
    return retorno


def _identidade_xml(xml_assinado: str) -> tuple[str, str, str]:
    try:
        root = etree.fromstring(
            xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise DadosInvalidos("O XML assinado do MDF-e está ilegível.") from None
    if root.getroottree().docinfo.doctype or root.tag != f"{{{NS}}}MDFe":
        raise DadosInvalidos("O documento informado não é um MDF-e válido.")
    info = root.find(f"{{{NS}}}infMDFe")
    if info is None:
        raise DadosInvalidos("O MDF-e assinado está incompleto.")
    chave = str(info.get("Id") or "").removeprefix("MDFe")
    ambiente = info.findtext(f"{{{NS}}}ide/{{{NS}}}tpAmb") or ""
    cnpj = info.findtext(f"{{{NS}}}emit/{{{NS}}}CNPJ") or ""
    if not re.fullmatch(r"[0-9]{44}", chave) or chave[20:22] != "58":
        raise DadosInvalidos("A chave informada não pertence a um MDF-e modelo 58.")
    return chave, ambiente, cnpj


def _validar_xml(req, credencial) -> None:
    chave, ambiente, cnpj = _identidade_xml(req.xml_assinado)
    if chave != req.chave:
        raise DadosInvalidos("A chave não corresponde ao XML assinado.")
    if ambiente != ("1" if req.ambiente == 1 else "2"):
        raise DadosInvalidos("O XML assinado pertence a outro ambiente fiscal.")
    try:
        validar_certificado_emitente(cnpj, credencial)
    except ErroMdfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None


def preparar(req: schemas.PrepararMdfeRequest) -> dict[str, Any]:
    credencial = _credencial(req)
    job = {
        "snapshot": req.snapshot,
        "emitted_at": req.emitido_em.isoformat(),
        "numeric_code": req.codigo_numerico,
        "environment": _ambiente(req),
    }
    try:
        xml_assinado, chave = montar_assinado(job, credencial)
        damdfe = gerar_pdf(xml_assinado)
    except ErroMdfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return {
        **_meta(req),
        "status": "preparado",
        "chave": chave,
        "xmlAssinado": xml_assinado,
        "damdfeBase64": damdfe,
    }


def consultar(req: schemas.ConsultarMdfeRequest) -> dict[str, Any]:
    try:
        resposta = soap.consultar(
            req.chave, _ambiente(req), _credencial(req), 20
        )
        return _resposta_oficial(resposta, "consultar o MDF-e")
    except soap.ErroSefaz as exc:
        raise _indisponivel(exc, "consultar o MDF-e") from None


def _autorizado(req, resposta: dict[str, Any], *, recuperado: bool) -> dict[str, Any]:
    if resposta.get("cstat") not in AUTORIZADO or not resposta.get("protocol_xml"):
        raise ServicoFiscalIndisponivel(
            "A autorização ainda não contém prova fiscal suficiente; aguarde a reconciliação."
        )
    try:
        processado = montar_processado(
            req.xml_assinado, req.chave, str(resposta["protocol_xml"])
        )
        damdfe = gerar_pdf(processado)
    except ErroMdfeLocal as exc:
        raise ServicoFiscalIndisponivel(
            "A autorização foi localizada, mas a prova fiscal precisa ser reconciliada."
        ) from exc
    return {
        **_meta(req),
        "outcome": "authorized",
        "situacaoOficial": "autorizado",
        "recovered": recuperado,
        "resposta": _resposta_oficial(resposta, "autorizar o MDF-e"),
        "xmlProcessado": processado,
        "damdfeBase64": damdfe,
    }


def autorizar(req: schemas.AutorizarMdfeRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    credencial = _credencial(req)
    _validar_xml(req, credencial)
    ambiente = _ambiente(req)
    try:
        anterior = soap.consultar(req.chave, ambiente, credencial, 20)
        if anterior.get("cstat") in AUTORIZADO:
            return _autorizado(req, anterior, recuperado=True)
        if anterior.get("cstat") in SITUACOES_TERMINAIS:
            return {
                **_meta(req), "outcome": SITUACOES_TERMINAIS[str(anterior["cstat"])],
                "situacaoOficial": SITUACOES_TERMINAIS[str(anterior["cstat"])],
                "resposta": _resposta_oficial(anterior, "consultar o MDF-e"),
            }
        if anterior.get("cstat") not in NAO_ENCONTRADO:
            outcome = "uncertain" if anterior.get("cstat") in TRANSITORIO else "rejected"
            return {
                **_meta(req), "outcome": outcome,
                "situacaoOficial": "aguardando_confirmacao",
                "resposta": _resposta_oficial(anterior, "autorizar o MDF-e"),
            }
        resposta = soap.transmitir(req.xml_assinado, ambiente, credencial, 20)
        if resposta.get("cstat") in {"204", "539"}:
            confirmacao = soap.consultar(req.chave, ambiente, credencial, 20)
            if confirmacao.get("cstat") in AUTORIZADO:
                return _autorizado(req, confirmacao, recuperado=True)
            return {
                **_meta(req), "outcome": "uncertain",
                "situacaoOficial": "aguardando_confirmacao",
                "resposta": _resposta_oficial(resposta, "autorizar o MDF-e"),
            }
        if resposta.get("cstat") in AUTORIZADO:
            return _autorizado(req, resposta, recuperado=False)
        return {
            **_meta(req),
            "outcome": "uncertain" if resposta.get("cstat") in TRANSITORIO else "rejected",
            "situacaoOficial": "aguardando_confirmacao",
            "resposta": _resposta_oficial(resposta, "autorizar o MDF-e"),
        }
    except soap.ErroSefaz as exc:
        raise _indisponivel(exc, "autorizar o MDF-e") from None


def preparar_evento(req: schemas.PrepararEventoMdfeRequest) -> dict[str, Any]:
    job = {
        "snapshot": req.snapshot,
        "key": req.chave,
        "protocol": req.protocolo,
        "action": req.acao,
        "event_at": req.ocorrido_em.isoformat(),
        "event_reason": req.justificativa,
        "environment": _ambiente(req),
    }
    try:
        xml_assinado = montar_evento_assinado(job, _credencial(req))
    except ErroMdfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return {
        **_meta(req), "status": "preparado", "chave": req.chave,
        "xmlAssinado": xml_assinado,
    }


def _evento_recuperado(req, consulta: dict[str, Any], codigo: str) -> dict[str, Any] | None:
    documento = (consulta.get("event_documents") or {}).get(codigo)
    if not documento:
        return None
    try:
        root = etree.fromstring(
            str(documento).encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
        pedido = root.find(f"{{{NS}}}eventoMDFe")
        if pedido is None:
            raise ErroMdfeLocal("A consulta não trouxe o pedido assinado do evento.")
        xml_pedido = etree.tostring(pedido, encoding="unicode")
        processado = montar_evento_processado(xml_pedido, req.chave, str(documento))
    except (ValueError, etree.XMLSyntaxError, ErroMdfeLocal) as exc:
        raise ServicoFiscalIndisponivel(
            "O evento foi localizado, mas a prova fiscal precisa ser reconciliada."
        ) from exc
    return {
        **_meta(req), "outcome": "accepted", "recovered": True,
        "situacaoOficial": "cancelado" if req.acao == "cancel" else "encerrado",
        "resposta": _resposta_oficial(consulta, "consultar o evento MDF-e"),
        "xmlProcessado": processado,
    }


def transmitir_evento(req: schemas.TransmitirEventoMdfeRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    codigo = "110111" if req.acao == "cancel" else "110112"
    ambiente = _ambiente(req)
    credencial = _credencial(req)
    try:
        anterior = soap.consultar(req.chave, ambiente, credencial, 20)
        recuperado = _evento_recuperado(req, anterior, codigo)
        if recuperado:
            return recuperado
        if anterior.get("cstat") in TRANSITORIO:
            return {
                **_meta(req), "outcome": "uncertain",
                "situacaoOficial": "aguardando_confirmacao",
                "resposta": _resposta_oficial(anterior, "consultar o evento MDF-e"),
            }
        if anterior.get("cstat") not in AUTORIZADO:
            return {
                **_meta(req), "outcome": "rejected",
                "situacaoOficial": SITUACOES_TERMINAIS.get(
                    str(anterior.get("cstat")), "aguardando_confirmacao"
                ),
                "resposta": _resposta_oficial(anterior, "registrar o evento MDF-e"),
            }
        resposta = soap.transmitir_evento(
            req.xml_assinado, req.chave, ambiente, credencial, 20
        )
        if resposta.get("cstat") in EVENTO_ACEITO and resposta.get("response_xml"):
            processado = montar_evento_processado(
                req.xml_assinado, req.chave, str(resposta["response_xml"])
            )
            return {
                **_meta(req), "outcome": "accepted", "recovered": False,
                "situacaoOficial": "cancelado" if req.acao == "cancel" else "encerrado",
                "resposta": _resposta_oficial(resposta, "registrar o evento MDF-e"),
                "xmlProcessado": processado,
            }
        if resposta.get("cstat") in EVENTO_EXIGE_CONSULTA:
            consulta = soap.consultar(req.chave, ambiente, credencial, 20)
            recuperado = _evento_recuperado(req, consulta, codigo)
            if recuperado:
                return recuperado
        return {
            **_meta(req),
            "outcome": "uncertain" if resposta.get("cstat") in TRANSITORIO | EVENTO_EXIGE_CONSULTA else "rejected",
            "situacaoOficial": "aguardando_confirmacao",
            "resposta": _resposta_oficial(resposta, "registrar o evento MDF-e"),
        }
    except ErroMdfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    except soap.ErroSefaz as exc:
        raise _indisponivel(exc, "registrar o evento MDF-e") from None
