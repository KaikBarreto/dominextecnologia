from __future__ import annotations

import base64
import copy
from typing import Any

from lxml import etree

from ..custodia import Envelope
from ..config import get_config
from ..errors import DadosInvalidos, ServicoFiscalIndisponivel
from ..rejections import anexar_orientacao, traduzir_rejeicao
from ..sefaz.credencial import abrir_credencial
from . import api_schemas as schemas
from . import documents, soap, xml
from .emission import gerar_danfe, montar_nfe_processada

AUTORIZADA = {"100", "150"}
CANCELADA = {"101", "151"}
DENEGADA = {"110", "205", "301", "302"}
NAO_ENCONTRADA = {"217"}
TRANSITORIA = {None, "103", "105", "108", "109", "999"}


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


def _exigir_mutacao_liberada(req) -> None:
    if req.ambiente == 1 and not get_config().nfe_producao_habilitada:
        raise ServicoFiscalIndisponivel(
            "A emissão direta de NF-e em produção ainda não está liberada para este motor. "
            "A consulta e a reconciliação continuam disponíveis."
        )


def _meta(req) -> dict[str, str]:
    return {
        "tenantId": req.tenant_id,
        "operationId": str(req.operation_id),
        "snapshotHash": req.snapshot_hash,
    }


def _resultado(req, **dados: Any) -> dict[str, Any]:
    resposta = dados.get("resposta")
    if isinstance(resposta, dict):
        resposta = _retorno_documento(resposta, "operação de NF-e")
        dados["resposta"] = resposta
        if "orientacao" in resposta:
            dados["orientacao"] = resposta["orientacao"]
        if "situacaoOficial" in resposta and "situacaoOficial" not in dados:
            dados["situacaoOficial"] = resposta["situacaoOficial"]
    return {**_meta(req), **dados}


def _indisponivel(exc: Exception, operacao: str) -> ServicoFiscalIndisponivel:
    orientacao = traduzir_rejeicao(
        "sefaz_nfe", None, str(exc), operacao=operacao
    )
    return ServicoFiscalIndisponivel(
        orientacao.mensagem if orientacao else "A SEFAZ está temporariamente indisponível.",
        detalhe=type(exc).__name__,
        orientacao=orientacao,
    )


def _retorno_documento(resposta: dict[str, Any], operacao: str) -> dict[str, Any]:
    retorno = anexar_orientacao(resposta, "sefaz_nfe", operacao=operacao)
    cstat = str(resposta.get("cstat") or "")
    if cstat in AUTORIZADA and resposta.get("protocol"):
        retorno["situacaoOficial"] = "autorizada"
    elif cstat in CANCELADA:
        retorno["situacaoOficial"] = "cancelada"
    elif cstat in DENEGADA:
        retorno["situacaoOficial"] = "denegada"
    elif cstat in NAO_ENCONTRADA:
        retorno["situacaoOficial"] = "nao_localizada"
    else:
        retorno["situacaoOficial"] = "aguardando_confirmacao"
    return retorno


def _evento_confirmado_na_consulta(
    consulta: dict[str, Any], *, tipo_evento: str, sequencia: str
) -> dict[str, Any] | None:
    """Aceita evento somente quando a consulta oficial o vincula à NF-e."""
    encontrados = [
        evento for evento in consulta.get("events") or []
        if str(evento.get("event_type") or "") == tipo_evento
        and str(evento.get("sequence") or "") == sequencia
        and str(evento.get("cstat") or "") in {"135", "136", "155"}
    ]
    return encontrados[0] if len(encontrados) == 1 else None


def _identidade_nfe(xml_assinado: str) -> tuple[str, str, str, str]:
    try:
        root = etree.fromstring(
            xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
    except (ValueError, etree.XMLSyntaxError):
        raise DadosInvalidos("O XML assinado da NF-e está ilegível.") from None
    if root.getroottree().docinfo.doctype or root.tag != f"{{{xml.NS}}}NFe":
        raise DadosInvalidos("O documento informado não é uma NF-e válida.")
    info = root.find(f"{{{xml.NS}}}infNFe")
    if info is None:
        raise DadosInvalidos("A NF-e assinada está incompleta.")
    identidade = str(info.get("Id") or "")
    chave = identidade[3:] if identidade.startswith("NFe") else ""
    ambiente = info.findtext(f"{{{xml.NS}}}ide/{{{xml.NS}}}tpAmb") or ""
    uf = info.findtext(f"{{{xml.NS}}}ide/{{{xml.NS}}}cUF") or ""
    cnpj = info.findtext(f"{{{xml.NS}}}emit/{{{xml.NS}}}CNPJ") or ""
    if len(chave) != 44 or not chave.isdigit() or chave[20:22] != "55":
        raise DadosInvalidos("A chave informada não pertence a uma NF-e modelo 55.")
    return chave, ambiente, uf, cnpj


def _validar_xml_assinado(req, credencial) -> tuple[str, str]:
    erros = xml.validar_xsd(req.xml_assinado) + xml.validar_assinatura(req.xml_assinado)
    if erros:
        raise DadosInvalidos("; ".join(erros[:5]))
    chave, ambiente, uf_codigo, cnpj = _identidade_nfe(req.xml_assinado)
    if chave != req.chave:
        raise DadosInvalidos("A chave não corresponde ao XML assinado.")
    if ambiente != ("1" if req.ambiente == 1 else "2"):
        raise DadosInvalidos("O XML assinado pertence a outro ambiente fiscal.")
    if uf_codigo != xml.UF_CODES.get(req.uf.upper()):
        raise DadosInvalidos("O XML assinado pertence a outra UF.")
    try:
        xml._validate_certificate_owner(cnpj, credencial)
    except xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return chave, cnpj


def _artefatos(xml_assinado: str, resposta: dict[str, Any]) -> dict[str, Any]:
    protocolo = resposta.get("protocol_xml")
    if resposta.get("cstat") not in AUTORIZADA or not protocolo:
        return {}
    try:
        processado, prova = montar_nfe_processada(xml_assinado, str(protocolo))
        danfe = gerar_danfe(processado)
    except xml.ErroNfeLocal as exc:
        raise ServicoFiscalIndisponivel(
            "A autorização foi localizada, mas a prova fiscal precisa ser reconciliada."
        ) from exc
    return {
        "xmlProcessado": processado,
        "danfeBase64": base64.b64encode(danfe).decode("ascii"),
        "prova": prova,
    }


def preparar(req: schemas.PrepararNfeRequest) -> dict[str, Any]:
    job = copy.deepcopy(req.documento)
    if not isinstance(job, dict):
        raise DadosInvalidos("O documento fiscal está em formato inválido.")
    invoice = job.setdefault("invoice", {})
    if not isinstance(invoice, dict):
        raise DadosInvalidos("O cabeçalho da NF-e está em formato inválido.")
    invoice["environment"] = "producao" if req.ambiente == 1 else "homologacao"
    job["payload_sha256"] = req.snapshot_hash
    credencial = _credencial(req)
    try:
        bruto, chave = xml.montar_xml(job)
        assinado = xml.assinar_xml(
            bruto, credencial, str((job.get("fiscal_config") or {}).get("cnpj") or "")
        )
        erros = xml.validar_xsd(assinado) + xml.validar_assinatura(assinado)
        if erros:
            raise xml.ErroNfeLocal("; ".join(erros[:5]))
    except xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return _resultado(
        req,
        status="preparada",
        chave=chave,
        xmlAssinado=assinado,
        fingerprint=xml.fingerprint(assinado),
    )


def status(req: schemas.StatusNfeRequest) -> dict[str, Any]:
    try:
        return anexar_orientacao(
            soap.status(req.uf.upper(), _ambiente(req), _credencial(req)),
            "sefaz_nfe",
            operacao="consultar o serviço de NF-e",
        )
    except soap.ErroSefazNfe as exc:
        raise _indisponivel(exc, "consultar o serviço de NF-e") from None


def consultar(req: schemas.ConsultarNfeRequest) -> dict[str, Any]:
    try:
        resposta = soap.consultar(
            req.chave, req.uf.upper(), _ambiente(req), _credencial(req)
        )
        extras = _artefatos(req.xml_assinado, resposta) if req.xml_assinado else {}
        return {
            **_retorno_documento(resposta, "consultar a NF-e"),
            **extras,
        }
    except soap.ErroSefazNfe as exc:
        raise _indisponivel(exc, "consultar a NF-e") from None


def autorizar(req: schemas.AutorizarNfeRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    credencial = _credencial(req)
    _validar_xml_assinado(req, credencial)
    ambiente = _ambiente(req)
    try:
        anterior = soap.consultar(req.chave, req.uf.upper(), ambiente, credencial)
        if anterior.get("cstat") in AUTORIZADA:
            return _resultado(
                req, outcome="authorized", recovered=True,
                resposta=anterior, **_artefatos(req.xml_assinado, anterior),
            )
        if anterior.get("cstat") in CANCELADA:
            return _resultado(
                req, outcome="cancelled", recovered=True, resposta=anterior,
                situacaoOficial="cancelada",
            )
        if anterior.get("cstat") in DENEGADA:
            return _resultado(
                req, outcome="denied", recovered=True, resposta=anterior,
                situacaoOficial="denegada",
            )
        if anterior.get("cstat") not in NAO_ENCONTRADA:
            return _resultado(
                req,
                outcome="uncertain" if anterior.get("cstat") in TRANSITORIA else "rejected",
                recovered=False,
                resposta=anterior,
            )
        saude = soap.status(req.uf.upper(), ambiente, credencial)
        if saude.get("cstat") != "107":
            return _resultado(req, outcome="retry", recovered=False, resposta=saude)
        resposta = soap.transmitir(
            req.xml_assinado, req.uf.upper(), ambiente, credencial, req.id_lote
        )
        if resposta.get("cstat") == "539":
            consulta = soap.consultar(req.chave, req.uf.upper(), ambiente, credencial)
            if consulta.get("cstat") in AUTORIZADA:
                return _resultado(
                    req, outcome="authorized", recovered=True,
                    resposta=consulta, **_artefatos(req.xml_assinado, consulta),
                )
            return _resultado(req, outcome="uncertain", recovered=False, resposta=resposta)
        outcome = (
            "authorized" if resposta.get("cstat") in AUTORIZADA
            else "uncertain" if resposta.get("cstat") in TRANSITORIA
            else "rejected"
        )
        extras = _artefatos(req.xml_assinado, resposta) if outcome == "authorized" else {}
        return _resultado(
            req, outcome=outcome, recovered=False, resposta=resposta, **extras
        )
    except soap.ErroSefazNfe as exc:
        raise _indisponivel(exc, "autorizar a NF-e") from None


def preparar_evento(req: schemas.PrepararEventoNfeRequest) -> dict[str, Any]:
    try:
        bruto, identidade = documents.montar_evento(
            key=req.chave,
            cnpj=req.cnpj,
            uf=req.uf.upper(),
            environment=_ambiente(req),
            kind=req.tipo,
            sequence=req.sequencia,
            text=req.texto,
            occurred_at=req.ocorrido_em,
            protocol=req.protocolo if req.tipo == "cancellation" else None,
        )
        assinado = documents.assinar_documento(
            bruto, _credencial(req), req.cnpj, req.tipo
        )
    except xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return _resultado(
        req, status="preparado", identidade=identidade,
        xmlAssinado=assinado, fingerprint=xml.fingerprint(assinado),
    )


def transmitir_evento(req: schemas.TransmitirEventoNfeRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    try:
        root = etree.fromstring(
            req.xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
        info = root.find(f"{{{xml.NS}}}infEvento")
        if info is None:
            raise DadosInvalidos("O evento NF-e assinado está incompleto.")
        chave = info.findtext(f"{{{xml.NS}}}chNFe") or ""
        cnpj = info.findtext(f"{{{xml.NS}}}CNPJ") or ""
        credencial = _credencial(req)
        xml._validate_certificate_owner(cnpj, credencial)
        ambiente = _ambiente(req)
        anterior = soap.consultar(chave, req.uf.upper(), ambiente, credencial)
        if anterior.get("cstat") in CANCELADA:
            if req.tipo == "cancellation":
                return _resultado(
                    req, outcome="accepted", recovered=True, chave=chave,
                    situacaoOficial="cancelada", resposta=anterior,
                    xmlProcessado=None,
                )
            return _resultado(
                req, outcome="rejected", recovered=True, chave=chave,
                situacaoOficial="cancelada", resposta=anterior,
                xmlProcessado=None,
            )
        if anterior.get("cstat") not in AUTORIZADA:
            return _resultado(
                req,
                outcome="uncertain" if anterior.get("cstat") in TRANSITORIA else "rejected",
                recovered=False, chave=chave, resposta=anterior,
                xmlProcessado=None,
            )
        resposta = soap.transmitir_evento(
            req.xml_assinado, req.uf.upper(), _ambiente(req), credencial, req.id_lote
        )
        codigo = str(resposta.get("cstat") or "")
        tipo_evento = info.findtext(f"{{{xml.NS}}}tpEvento") or ""
        sequencia = info.findtext(f"{{{xml.NS}}}nSeqEvento") or ""
        consulta_pos_evento = None
        evento_consultado = None
        if codigo in {"136", "573"}:
            consulta_pos_evento = soap.consultar(
                chave, req.uf.upper(), ambiente, credencial
            )
            evento_consultado = _evento_confirmado_na_consulta(
                consulta_pos_evento, tipo_evento=tipo_evento, sequencia=sequencia
            )
            if req.tipo == "cancellation" and consulta_pos_evento.get("cstat") in CANCELADA:
                return _resultado(
                    req, outcome="accepted", recovered=True, chave=chave,
                    situacaoOficial="cancelada", resposta=consulta_pos_evento,
                    xmlProcessado=(evento_consultado or {}).get("processed_xml"),
                )
            if req.tipo == "correction" and evento_consultado:
                return _resultado(
                    req, outcome="accepted", recovered=True, chave=chave,
                    situacaoOficial=(
                        "autorizada"
                        if consulta_pos_evento.get("cstat") in AUTORIZADA
                        else "aguardando_confirmacao"
                    ),
                    resposta=consulta_pos_evento,
                    xmlProcessado=evento_consultado.get("processed_xml"),
                )
        processado = None
        if codigo in {"135", "155"} and resposta.get("return_xml"):
            processado = documents.montar_processado(
                req.xml_assinado, str(resposta["return_xml"]), req.tipo
            )
        return _resultado(
            req,
            outcome="accepted" if codigo in {"135", "155"} else (
                "uncertain" if codigo in {"", "128", "136", "573", "999"}
                else "rejected"
            ),
            chave=chave,
            situacaoOficial=(
                "cancelada"
                if req.tipo == "cancellation" and codigo in {"135", "155"}
                else "autorizada"
                if req.tipo == "correction" and codigo == "135"
                else "aguardando_confirmacao"
            ),
            resposta=resposta,
            xmlProcessado=processado,
        )
    except (ValueError, etree.XMLSyntaxError, xml.ErroNfeLocal) as exc:
        raise DadosInvalidos(str(exc)) from None
    except soap.ErroSefazNfe as exc:
        raise _indisponivel(exc, "registrar o evento da NF-e") from None


def preparar_inutilizacao(req: schemas.PrepararInutilizacaoNfeRequest) -> dict[str, Any]:
    if req.numero_final < req.numero_inicial:
        raise DadosInvalidos("O número final não pode ser menor que o inicial.")
    try:
        bruto, identidade = documents.montar_inutilizacao(
            cnpj=req.cnpj, uf=req.uf.upper(), environment=_ambiente(req),
            year=req.ano, series=req.serie, first=req.numero_inicial,
            last=req.numero_final, justification=req.justificativa,
        )
        assinado = documents.assinar_documento(
            bruto, _credencial(req), req.cnpj, "invalidation"
        )
    except xml.ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    return _resultado(
        req, status="preparada", identidade=identidade,
        xmlAssinado=assinado, fingerprint=xml.fingerprint(assinado),
    )


def transmitir_inutilizacao(req: schemas.TransmitirInutilizacaoNfeRequest) -> dict[str, Any]:
    _exigir_mutacao_liberada(req)
    try:
        root = etree.fromstring(
            req.xml_assinado.encode(), etree.XMLParser(resolve_entities=False, no_network=True)
        )
        info = root.find(f"{{{xml.NS}}}infInut")
        if info is None:
            raise DadosInvalidos("A inutilização NF-e assinada está incompleta.")
        cnpj = info.findtext(f"{{{xml.NS}}}CNPJ") or ""
        credencial = _credencial(req)
        xml._validate_certificate_owner(cnpj, credencial)
        resposta = soap.transmitir_inutilizacao(
            req.xml_assinado, req.uf.upper(), _ambiente(req), credencial
        )
        processado = None
        if resposta.get("cstat") == "102" and resposta.get("return_xml"):
            processado = documents.montar_processado(
                req.xml_assinado, str(resposta["return_xml"]), "invalidation"
            )
        return _resultado(
            req,
            outcome="accepted" if resposta.get("cstat") == "102" else (
                "uncertain" if resposta.get("cstat") in {"563", "999", None}
                else "rejected"
            ),
            resposta=resposta,
            xmlProcessado=processado,
        )
    except (ValueError, etree.XMLSyntaxError, xml.ErroNfeLocal) as exc:
        raise DadosInvalidos(str(exc)) from None
    except soap.ErroSefazNfe as exc:
        raise _indisponivel(exc, "inutilizar a numeração da NF-e") from None
