"""Orquestração de uma operação fiscal, do envelope cifrado ao XML assinado.

Todo caminho é o mesmo:
    1. abrir o envelope (KEK → DEK → .pfx e senha) — só em memória;
    2. materializar PEM em tmpfs (o `requests` exige caminho para o mTLS);
    3. montar o XML pela `nfelib` e serializar pelo PONTO ÚNICO;
    4. assinar sem prefixo de namespace (armadilha 4);
    5. gzip + base64 e transmitir por mTLS;
    6. sair do `with` → o PEM some, aconteça o que acontecer.
"""

from __future__ import annotations

import base64
import binascii
import logging
from typing import Optional

from . import schemas
from .custodia import Envelope, ErroDeCustodia, abrir, inspecionar, materializar_pem, selar
from .danfse import gerar_danfse
from .errors import DadosInvalidos, DocumentoNaoEncontrado
from .sefin import dps as dps_mod
from .sefin import evento as evento_mod
from .sefin import nfse_xml
from .sefin.assinatura import assinar
from .sefin.client import SefinClient

log = logging.getLogger("dominex-fiscal")

STATUS_AUTORIZADA = "autorizada"
STATUS_CANCELADA = "cancelada"

TIPO_EVENTO_CANCELAMENTO = evento_mod.TIPO_EVENTO_CANCELAMENTO


def _empresa_curta(empresa_id: str) -> str:
    """Padrão da casa: nunca logar o company_id inteiro."""
    return (empresa_id or "")[:8] + "..."


def _envelope(certificado: schemas.Certificado) -> Envelope:
    return Envelope(
        pfx_cifrado_b64=certificado.pfx_cifrado_b64,
        dek_envelopada_b64=certificado.dek_envelopada_b64,
        senha_cifrada_b64=certificado.senha_cifrada_b64,
        nonce_b64=certificado.nonce_b64,
        algoritmo=certificado.algoritmo,
    )


def _alertas(corpo: dict) -> list[schemas.Alerta]:
    brutos = corpo.get("alertas")
    if not isinstance(brutos, list):
        return []
    return [
        schemas.Alerta(
            codigo=str(a.get("codigo") or "") or None,
            descricao=str(a.get("descricao") or "") or None,
            complemento=str(a.get("complemento") or "") or None,
        )
        for a in brutos
        if isinstance(a, dict)
    ]


# -----------------------------------------------------------------------------
# Emissão
# -----------------------------------------------------------------------------


def emitir(req: schemas.EmitirRequest) -> schemas.NfseResposta:
    pfx, senha = abrir(_envelope(req.certificado), req.empresa_id)
    with materializar_pem(pfx, senha) as par:
        xml = dps_mod.montar(req)
        assinado = assinar(xml, par.key_pem_bytes, par.cert_pem_bytes)
        cliente = SefinClient(req.ambiente, par)
        corpo = cliente.emitir(nfse_xml.compactar(assinado))

    log.info(
        "nfse emitida empresa=%s ambiente=%s", _empresa_curta(req.empresa_id), req.ambiente
    )

    xml_nfse = b""
    if corpo.get("nfseXmlGZipB64"):
        try:
            xml_nfse = nfse_xml.descompactar(str(corpo["nfseXmlGZipB64"]))
        except (binascii.Error, OSError, ValueError):
            xml_nfse = b""

    resumo = nfse_xml.resumir(xml_nfse) if xml_nfse else {}
    chave = str(corpo.get("chaveAcesso") or resumo.get("chave_acesso") or "")

    return schemas.NfseResposta(
        status=STATUS_AUTORIZADA,
        chave_acesso=chave or None,
        numero=resumo.get("numero") or None,
        id_dps=str(corpo.get("idDps") or corpo.get("idDPS") or "") or None,
        data_emissao=resumo.get("data_emissao")
        or str(corpo.get("dataHoraProcessamento") or "")
        or None,
        ambiente=req.ambiente,
        xml=xml_nfse.decode("utf-8", errors="replace") if xml_nfse else None,
        alertas=_alertas(corpo),
    )


# -----------------------------------------------------------------------------
# Consulta (a situação de CANCELADA vem do evento, não da NFS-e)
# -----------------------------------------------------------------------------


def consultar(chave: str, req: schemas.ConsultarRequest) -> schemas.NfseResposta:
    pfx, senha = abrir(_envelope(req.certificado), req.empresa_id)
    with materializar_pem(pfx, senha) as par:
        cliente = SefinClient(req.ambiente, par)
        corpo = cliente.consultar(chave)
        # ⚠️ A NFS-e cancelada continua com cStat 100. A única forma de saber que
        # ela foi cancelada é perguntar pelo evento 101101 vinculado à chave.
        evento = cliente.consultar_evento(chave, TIPO_EVENTO_CANCELAMENTO, 1)

    xml_nfse = b""
    if corpo.get("nfseXmlGZipB64"):
        try:
            xml_nfse = nfse_xml.descompactar(str(corpo["nfseXmlGZipB64"]))
        except (binascii.Error, OSError, ValueError):
            xml_nfse = b""

    cancelada = False
    if evento and evento.get("eventoXmlGZipB64"):
        try:
            cancelada = nfse_xml.evento_de_cancelamento(
                nfse_xml.descompactar(str(evento["eventoXmlGZipB64"]))
            )
        except (binascii.Error, OSError, ValueError):
            cancelada = False

    resumo = nfse_xml.resumir(xml_nfse) if xml_nfse else {}
    return schemas.NfseResposta(
        status=STATUS_CANCELADA if cancelada else STATUS_AUTORIZADA,
        chave_acesso=str(corpo.get("chaveAcesso") or resumo.get("chave_acesso") or chave),
        numero=resumo.get("numero") or None,
        data_emissao=resumo.get("data_emissao") or None,
        ambiente=req.ambiente,
        xml=xml_nfse.decode("utf-8", errors="replace") if xml_nfse else None,
        cancelada=cancelada,
    )


# -----------------------------------------------------------------------------
# Cancelamento (evento 101101)
# -----------------------------------------------------------------------------


def cancelar(chave: str, req: schemas.CancelarRequest) -> schemas.NfseResposta:
    pfx, senha = abrir(_envelope(req.certificado), req.empresa_id)
    with materializar_pem(pfx, senha) as par:
        xml = evento_mod.montar_cancelamento(
            chave=chave,
            cnpj_autor=req.cnpj_autor,
            motivo=req.motivo,
            codigo_motivo=req.codigo_motivo,
            ambiente=req.ambiente,
        )
        assinado = assinar(xml, par.key_pem_bytes, par.cert_pem_bytes)
        cliente = SefinClient(req.ambiente, par)
        corpo = cliente.registrar_evento(chave, nfse_xml.compactar(assinado))

    log.info(
        "nfse cancelada empresa=%s ambiente=%s", _empresa_curta(req.empresa_id), req.ambiente
    )

    xml_evento = b""
    if corpo.get("eventoXmlGZipB64"):
        try:
            xml_evento = nfse_xml.descompactar(str(corpo["eventoXmlGZipB64"]))
        except (binascii.Error, OSError, ValueError):
            xml_evento = b""

    return schemas.NfseResposta(
        status=STATUS_CANCELADA,
        chave_acesso=chave,
        ambiente=req.ambiente,
        data_emissao=str(corpo.get("dataHoraProcessamento") or "") or None,
        xml=xml_evento.decode("utf-8", errors="replace") if xml_evento else None,
        cancelada=True,
    )


# -----------------------------------------------------------------------------
# DANFSe
# -----------------------------------------------------------------------------


def danfse(chave: str, req: schemas.DanfseRequest) -> tuple[bytes, str]:
    xml: Optional[bytes] = req.xml.encode("utf-8") if req.xml else None

    pfx, senha = abrir(_envelope(req.certificado), req.empresa_id)
    with materializar_pem(pfx, senha) as par:
        if xml is None:
            # Sem XML guardado, buscamos a nota para o gerador local ter matéria-prima.
            cliente = SefinClient(req.ambiente, par)
            corpo = cliente.consultar(chave)
            if corpo.get("nfseXmlGZipB64"):
                try:
                    xml = nfse_xml.descompactar(str(corpo["nfseXmlGZipB64"]))
                except (binascii.Error, OSError, ValueError):
                    xml = None
            if xml is None:
                raise DocumentoNaoEncontrado(
                    "Nota fiscal não encontrada na administração tributária."
                )
        return gerar_danfse(
            chave=chave, xml=xml, ambiente=req.ambiente, certificado=par
        )


# -----------------------------------------------------------------------------
# Custódia — selar certificado no upload
# -----------------------------------------------------------------------------


def selar_certificado(req: schemas.SelarCertificadoRequest) -> dict:
    try:
        pfx = base64.b64decode(req.pfx_b64, validate=True)
    except (binascii.Error, ValueError):
        raise DadosInvalidos(
            "O arquivo do certificado digital chegou corrompido. Tente enviar novamente."
        ) from None

    # Abre ANTES de selar: certificado que não abre com a senha informada não
    # pode ser guardado — o cliente descobriria só na primeira emissão.
    metadados = inspecionar(pfx, req.senha)
    envelope = selar(pfx, req.senha, req.empresa_id)

    log.info(
        "certificado selado empresa=%s validade=%s",
        _empresa_curta(req.empresa_id),
        metadados.get("validade_ate"),
    )

    return {
        "certificado": {
            "pfxCifradoB64": envelope.pfx_cifrado_b64,
            "dekEnvelopadaB64": envelope.dek_envelopada_b64,
            "senhaCifradaB64": envelope.senha_cifrada_b64,
            "nonceB64": envelope.nonce_b64,
            "algoritmo": envelope.algoritmo,
        },
        "titular": metadados.get("titular"),
        "cnpj": metadados.get("cnpj"),
        "validadeAte": metadados.get("validade_ate"),
        "numeroSerie": metadados.get("numero_serie"),
    }


__all__ = [
    "cancelar",
    "consultar",
    "danfse",
    "emitir",
    "selar_certificado",
    "ErroDeCustodia",
]
