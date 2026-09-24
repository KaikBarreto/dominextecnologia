"""Manifestação do destinatário — evento assinado e transmitido ao Ambiente Nacional.

PORTADO de `EcoSistemaSaaS/services/ecosistema-dfe/app/manifestacao.py` (produção
desde 21/09/2026). Mudou: os erros agora descendem de `ErroFiscal` (viram
resposta HTTP em PT-BR), o XML é lido com lxml endurecido em vez de
`defusedxml`, e o tipo `ciencia` (210210) entrou — é ele que destrava o XML
completo da nota, que é o motivo de a manifestação existir neste produto.

Contrato oficial: NT 2020.001 v1.50 + MOC 7.0. O `infEvento` é assinado com
XMLDSig envelopada (C14N 1.0, RSA-SHA1 e digest SHA-1) e transmitido pelo
NFeRecepcaoEvento4 com mTLS.

⚠️ NÃO usa `app/sefin/assinatura.py`. Aquele módulo assina com rsa-sha256 e sem
   prefixo de namespace, que é o que a Sefin Nacional (NFS-e) exige. A SEFAZ
   (NF-e) exige rsa-sha1 + sha1 e um leiaute de Signature diferente. São dois
   governos com duas regras; unificar quebraria um dos dois.

⚠️ EVENTO É IRREVERSÍVEL. Manifestar "desconhecimento" numa nota legítima é uma
   declaração ao fisco que não se apaga. Por isso a validação é toda aqui, antes
   de qualquer byte sair, e a produção respeita o interruptor de bloqueio.
"""

from __future__ import annotations

import base64
import hashlib
import http.client
import logging
import re
import ssl
from dataclasses import dataclass
from datetime import datetime
from xml.etree import ElementTree as StdlibET
from zoneinfo import ZoneInfo

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.hazmat.primitives.serialization import Encoding
from lxml import etree

from ..errors import (
    AcessoNegadoNoGoverno,
    DadosInvalidos,
    ErroFiscal,
    ServicoFiscalIndisponivel,
)
from .credencial import CredencialSefaz

log = logging.getLogger("dominex-fiscal.sefaz")

NS_NFE = "http://www.portalfiscal.inf.br/nfe"
NS_DS = "http://www.w3.org/2000/09/xmldsig#"
NS_SOAP = "http://www.w3.org/2003/05/soap-envelope"
NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4"

C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
ENVELOPED = "http://www.w3.org/2000/09/xmldsig#enveloped-signature"
RSA_SHA1 = "http://www.w3.org/2000/09/xmldsig#rsa-sha1"
SHA1 = "http://www.w3.org/2000/09/xmldsig#sha1"

#: tipo aceito na API → (tpEvento, descEvento exigido pelo leiaute)
#: ⚠️ Os códigos são estes e não se trocam. (O plano de 24/09 listou
#: "210200 (Ciência), 210210 (Confirmação)" — está invertido lá.)
TIPOS = {
    "ciencia": ("210210", "Ciencia da Operacao"),
    "confirmada": ("210200", "Confirmacao da Operacao"),
    "desconhecida": ("210220", "Desconhecimento da Operacao"),
    "nao_realizada": ("210240", "Operacao nao Realizada"),
}

#: Só a "Operação não Realizada" serializa xJust (NT 2020.001 v1.50).
EXIGE_JUSTIFICATIVA = {"nao_realizada"}

SUCESSO_EVENTO = {135, 136}
DUPLICIDADE_EVENTO = 573
REJEICOES_TRANSITORIAS = {108, 109, 999}

INDISPONIVEL = (
    "O sistema da Receita/SEFAZ está indisponível no momento. "
    "Tente novamente em alguns minutos."
)


class ManifestacaoRejeitada(ErroFiscal):
    """A SEFAZ recusou o evento por conteúdo. Não adianta repetir igual."""

    status = 422
    codigo = "manifestacao_rejeitada"


@dataclass(frozen=True)
class RespostaManifestacao:
    lote_cstat: int
    evento_cstat: int
    motivo: str
    protocolo: str | None
    registrada_em: str | None

    @property
    def duplicada(self) -> bool:
        return self.evento_cstat == DUPLICIDADE_EVENTO

    @property
    def sucesso(self) -> bool:
        # 573 torna a operação idempotente: o mesmo tpEvento/chave/seq=1 já foi
        # registrado. É o retorno esperado quando a SEFAZ aceitou e a gravação
        # do nosso lado falhou antes de persistir.
        return self.evento_cstat in SUCESSO_EVENTO or self.duplicada

    @property
    def retentavel(self) -> bool:
        return (
            self.lote_cstat in REJEICOES_TRANSITORIAS
            or self.evento_cstat in REJEICOES_TRANSITORIAS
        )


def _somente_digitos(valor: str, campo: str, tamanho: int) -> str:
    limpo = re.sub(r"\D", "", str(valor or ""))
    if len(limpo) != tamanho:
        raise DadosInvalidos(f"{campo} inválido: são {tamanho} dígitos.")
    return limpo


def _subelemento(pai, namespace: str, nome: str, texto: str | None = None, **attrs):
    elemento = etree.SubElement(pai, etree.QName(namespace, nome), **attrs)
    if texto is not None:
        elemento.text = texto
    return elemento


def _canonicalizar(elemento) -> bytes:
    """Canonicaliza um fragmento preservando namespaces padrão.

    O C14N do lxml/libxml2 injeta `xmlns=""` em alguns descendentes quando o
    fragmento troca do namespace padrão NF-e para o XMLDSig também padrão. A
    canonicalização da stdlib não sofre essa deriva e, para este leiaute sem
    comentários, produz os mesmos bytes do C14N 1.0 exigido pela SEFAZ.
    """
    xml = etree.tostring(elemento, encoding="unicode", with_tail=False)
    return StdlibET.canonicalize(xml, with_comments=False).encode("UTF-8")


def montar_evento_assinado(
    *,
    credencial: CredencialSefaz,
    cnpj: str,
    chave: str,
    tipo: str,
    justificativa: str | None,
    tp_amb: int,
    id_lote: str,
    agora: datetime | None = None,
) -> bytes:
    """Monta `envEvento` sem whitespace de formatação e assina `infEvento`."""
    if tipo not in TIPOS:
        raise DadosInvalidos(
            "Tipo de manifestação inválido. Use ciência, confirmação, "
            "desconhecimento ou operação não realizada."
        )
    if tp_amb not in (1, 2):
        raise DadosInvalidos("Ambiente fiscal inválido.")
    if not re.fullmatch(r"\d{1,15}", str(id_lote or "")):
        raise DadosInvalidos("Identificador do lote inválido.")

    cnpj = _somente_digitos(cnpj, "CNPJ", 14)
    chave = _somente_digitos(chave, "chave de acesso", 44)
    justificativa = (justificativa or "").strip()
    if tipo in EXIGE_JUSTIFICATIVA and not (15 <= len(justificativa) <= 255):
        raise DadosInvalidos(
            "A justificativa é obrigatória neste tipo de manifestação e deve ter "
            "entre 15 e 255 caracteres."
        )
    # A NT 2020.001 v1.50 determina que xJust seja serializado SOMENTE para
    # Operação não Realizada. Mandar em outro tipo é rejeição na certa.
    if tipo not in EXIGE_JUSTIFICATIVA:
        justificativa = ""

    if not isinstance(credencial.chave, rsa.RSAPrivateKey):
        raise DadosInvalidos(
            "O certificado digital da empresa não tem chave RSA, que é o padrão "
            "exigido pela NF-e. Envie um certificado A1 comum (e-CNPJ)."
        )

    codigo, descricao = TIPOS[tipo]
    sequencia = "1"
    # O campo nSeqEvento aceita "1", mas o atributo Id tem tamanho fixo:
    # "ID" + tpEvento(6) + chNFe(44) + sequência com 2 dígitos.
    evento_id = f"ID{codigo}{chave}{int(sequencia):02d}"
    instante = (agora or datetime.now(ZoneInfo("America/Sao_Paulo"))).astimezone(
        ZoneInfo("America/Sao_Paulo")
    )
    dh_evento = instante.isoformat(timespec="seconds")

    env = etree.Element(etree.QName(NS_NFE, "envEvento"), nsmap={None: NS_NFE}, versao="1.00")
    _subelemento(env, NS_NFE, "idLote", str(id_lote))
    evento = _subelemento(env, NS_NFE, "evento", versao="1.00")
    inf = _subelemento(evento, NS_NFE, "infEvento", Id=evento_id)
    # cOrgao 91 = Ambiente Nacional. Manifestação do destinatário é sempre AN,
    # nunca a UF do emitente.
    _subelemento(inf, NS_NFE, "cOrgao", "91")
    _subelemento(inf, NS_NFE, "tpAmb", str(tp_amb))
    _subelemento(inf, NS_NFE, "CNPJ", cnpj)
    _subelemento(inf, NS_NFE, "chNFe", chave)
    _subelemento(inf, NS_NFE, "dhEvento", dh_evento)
    _subelemento(inf, NS_NFE, "tpEvento", codigo)
    _subelemento(inf, NS_NFE, "nSeqEvento", sequencia)
    _subelemento(inf, NS_NFE, "verEvento", "1.00")
    detalhe = _subelemento(inf, NS_NFE, "detEvento", versao="1.00")
    _subelemento(detalhe, NS_NFE, "descEvento", descricao)
    if justificativa:
        _subelemento(detalhe, NS_NFE, "xJust", justificativa)

    # O Ambiente Nacional exige o namespace XMLDSig como padrão dentro de
    # Signature e rejeita o prefixo `ds` com cStat 404.
    assinatura = etree.SubElement(evento, etree.QName(NS_DS, "Signature"), nsmap={None: NS_DS})
    signed_info = _subelemento(assinatura, NS_DS, "SignedInfo")
    _subelemento(signed_info, NS_DS, "CanonicalizationMethod", Algorithm=C14N)
    _subelemento(signed_info, NS_DS, "SignatureMethod", Algorithm=RSA_SHA1)
    referencia = _subelemento(signed_info, NS_DS, "Reference", URI=f"#{evento_id}")
    transforms = _subelemento(referencia, NS_DS, "Transforms")
    _subelemento(transforms, NS_DS, "Transform", Algorithm=ENVELOPED)
    _subelemento(transforms, NS_DS, "Transform", Algorithm=C14N)
    _subelemento(referencia, NS_DS, "DigestMethod", Algorithm=SHA1)
    _subelemento(referencia, NS_DS, "DigestValue")
    _subelemento(assinatura, NS_DS, "SignatureValue")
    key_info = _subelemento(assinatura, NS_DS, "KeyInfo")
    x509_data = _subelemento(key_info, NS_DS, "X509Data")
    _subelemento(
        x509_data,
        NS_DS,
        "X509Certificate",
        base64.b64encode(credencial.certificado.public_bytes(Encoding.DER)).decode("ascii"),
    )

    # A canonicalização precisa acontecer sobre a mesma representação que será
    # transmitida. O lxml pode resolver declarações de namespace somente durante
    # a serialização; assinar a árvore ainda não normalizada gera um DigestValue
    # diferente do recalculado pela SEFAZ (cStat 297).
    env = etree.fromstring(etree.tostring(env, encoding="UTF-8", pretty_print=False))
    inf = env.find(f".//{{{NS_NFE}}}infEvento")
    signed_info = env.find(f".//{{{NS_DS}}}SignedInfo")
    digest_value = env.find(f".//{{{NS_DS}}}DigestValue")
    signature_value = env.find(f".//{{{NS_DS}}}SignatureValue")
    if any(elemento is None for elemento in (inf, signed_info, digest_value, signature_value)):
        raise ErroFiscal("Não foi possível montar a assinatura do evento.")

    inf_c14n = _canonicalizar(inf)
    digest_value.text = base64.b64encode(hashlib.sha1(inf_c14n).digest()).decode("ascii")

    signed_info_c14n = _canonicalizar(signed_info)
    valor_assinatura = credencial.chave.sign(
        signed_info_c14n,
        padding.PKCS1v15(),
        hashes.SHA1(),
    )
    signature_value.text = base64.b64encode(valor_assinatura).decode("ascii")

    return etree.tostring(env, encoding="UTF-8", xml_declaration=True, pretty_print=False)


def _envelope_soap(evento_xml: bytes) -> bytes:
    evento = etree.fromstring(evento_xml)
    # O namespace SOAP como prefixo ancestral passaria a integrar o C14N 1.0
    # inclusivo de SignedInfo e invalidaria uma assinatura feita antes do wrap.
    # Usá-lo como namespace padrão, sobrescrito por cada payload, preserva a
    # assinatura e continua sendo um envelope SOAP 1.2 equivalente.
    envelope = etree.Element(etree.QName(NS_SOAP, "Envelope"), nsmap={None: NS_SOAP})
    body = _subelemento(envelope, NS_SOAP, "Body")
    dados = etree.SubElement(body, etree.QName(NS_WSDL, "nfeDadosMsg"), nsmap={None: NS_WSDL})
    dados.append(evento)
    return etree.tostring(envelope, encoding="UTF-8", xml_declaration=True, pretty_print=False)


def _local(tag) -> str:
    return str(tag).rsplit("}", 1)[-1]


def _filho_texto(elemento, nome: str) -> str:
    if elemento is None:
        return ""
    for filho in list(elemento):
        if _local(filho.tag) == nome:
            return (filho.text or "").strip()
    return ""


def _parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False
    )


def interpretar_resposta(xml_soap: str | bytes) -> RespostaManifestacao:
    bruto = xml_soap.encode("utf-8") if isinstance(xml_soap, str) else xml_soap
    try:
        raiz = etree.fromstring(bruto, parser=_parser())
    except etree.XMLSyntaxError:
        raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe="resposta não é XML") from None

    ret_env = next((e for e in raiz.iter() if _local(e.tag) == "retEnvEvento"), None)
    if ret_env is None:
        # Alguns stacks SOAP devolvem o XML fiscal escapado como texto.
        texto_interno = next(
            ((e.text or "").strip() for e in raiz.iter() if "<retEnvEvento" in (e.text or "")),
            "",
        )
        if texto_interno:
            try:
                ret_env = etree.fromstring(texto_interno.encode("utf-8"), parser=_parser())
            except etree.XMLSyntaxError:
                ret_env = None
    if ret_env is None:
        raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe="sem retEnvEvento")

    lote_bruto = _filho_texto(ret_env, "cStat")
    ret_evento = next((e for e in ret_env.iter() if _local(e.tag) == "retEvento"), None)
    inf_evento = (
        next((e for e in ret_evento.iter() if _local(e.tag) == "infEvento"), None)
        if ret_evento is not None
        else None
    )
    evento_bruto = _filho_texto(inf_evento, "cStat")

    try:
        lote_cstat = int(lote_bruto)
    except ValueError:
        lote_cstat = 0
    try:
        evento_cstat = int(evento_bruto)
    except ValueError:
        evento_cstat = lote_cstat

    motivo = _filho_texto(inf_evento, "xMotivo") or _filho_texto(ret_env, "xMotivo")
    return RespostaManifestacao(
        lote_cstat=lote_cstat,
        evento_cstat=evento_cstat,
        motivo=motivo or "Resposta sem motivo.",
        protocolo=_filho_texto(inf_evento, "nProt") or None,
        registrada_em=_filho_texto(inf_evento, "dhRegEvento") or None,
    )


def transmitir_manifestacao(
    *,
    host: str,
    caminho: str,
    contexto: ssl.SSLContext,
    evento_xml: bytes,
    timeout: int,
) -> RespostaManifestacao:
    corpo = _envelope_soap(evento_xml)
    conexao = http.client.HTTPSConnection(host, 443, context=contexto, timeout=timeout)
    try:
        conexao.request(
            "POST",
            caminho,
            corpo,
            {
                "Content-Type": (
                    'application/soap+xml; charset=utf-8; '
                    f'action="{NS_WSDL}/nfeRecepcaoEvento"'
                ),
                "Accept": "application/soap+xml",
            },
        )
        resposta = conexao.getresponse()
        texto = resposta.read().decode("utf-8", "replace")
        if resposta.status != 200:
            raise ServicoFiscalIndisponivel(
                INDISPONIVEL, detalhe=f"evento:http{resposta.status}"
            )
        return interpretar_resposta(texto)
    except ErroFiscal:
        raise
    except ssl.SSLError as exc:
        raise AcessoNegadoNoGoverno(
            "O certificado digital da empresa não foi aceito pela SEFAZ. "
            "Verifique se ele está válido e é o certificado do CNPJ da empresa.",
            detalhe=type(exc).__name__,
        ) from None
    except (http.client.HTTPException, OSError) as exc:
        raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe=type(exc).__name__) from None
    finally:
        conexao.close()
