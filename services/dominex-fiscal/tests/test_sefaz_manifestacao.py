"""Manifestação do destinatário: evento IRREVERSÍVEL, testado sem rede.

Portado de `EcoSistemaSaaS/services/ecosistema-dfe/tests/test_manifestacao.py`.
O que mudou: `CredencialFiscal` virou `CredencialSefaz` e os tipos de erro agora
são os do `app/errors.py`. A regra fiscal é a mesma — se estes testes caírem, o
cliente declara ao fisco algo diferente do que ele pediu.
"""

from __future__ import annotations

import base64
import hashlib
import ssl
from datetime import datetime, timedelta, timezone
from xml.etree import ElementTree as StdlibET

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding, rsa
from cryptography.x509.oid import NameOID
from lxml import etree

from app.errors import DadosInvalidos
from app.sefaz.credencial import CredencialSefaz
from app.sefaz.manifestacao import (
    C14N,
    NS_DS,
    NS_NFE,
    _envelope_soap,
    interpretar_resposta,
    montar_evento_assinado,
)

CHAVE = "35260965256296000151550010000000531300000543"
CNPJ = "38386446000179"


@pytest.fixture(scope="module")
def credencial() -> CredencialSefaz:
    chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Teste Dominex")])
    agora = datetime.now(timezone.utc)
    certificado = (
        x509.CertificateBuilder()
        .subject_name(nome)
        .issuer_name(nome)
        .public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - timedelta(days=1))
        .not_valid_after(agora + timedelta(days=1))
        .sign(chave, hashes.SHA256())
    )
    return CredencialSefaz(ssl.create_default_context(), chave, certificado)


def _digest_esperado(elemento) -> str:
    return base64.b64encode(
        hashlib.sha1(
            StdlibET.canonicalize(
                etree.tostring(elemento, encoding="unicode"), with_comments=False
            ).encode("UTF-8")
        ).digest()
    ).decode("ascii")


def test_evento_confirmacao_obedece_leiaute_e_assinatura(credencial):
    xml = montar_evento_assinado(
        credencial=credencial,
        cnpj=CNPJ,
        chave=CHAVE,
        tipo="confirmada",
        justificativa=None,
        tp_amb=1,
        id_lote="123",
        agora=datetime(2026, 9, 21, 10, 30, 0, tzinfo=timezone(timedelta(hours=-3))),
    )
    raiz = etree.fromstring(xml)
    ns = {"n": NS_NFE, "ds": NS_DS}
    inf = raiz.find(".//n:infEvento", ns)
    signed_info = raiz.find(".//ds:SignedInfo", ns)
    assert inf is not None and signed_info is not None
    assert inf.get("Id") == f"ID210200{CHAVE}01"
    assert inf.findtext("n:cOrgao", namespaces=ns) == "91"
    assert inf.findtext("n:dhEvento", namespaces=ns) == "2026-09-21T10:30:00-03:00"
    assert inf.findtext("n:detEvento/n:descEvento", namespaces=ns) == "Confirmacao da Operacao"
    assert inf.find("n:detEvento/n:xJust", ns) is None
    # O Ambiente Nacional rejeita `<ds:Signature>` com cStat 404.
    assert b"ds:" not in xml

    assert raiz.findtext(".//ds:DigestValue", namespaces=ns) == _digest_esperado(inf)
    assert raiz.find(".//ds:CanonicalizationMethod", ns).get("Algorithm") == C14N

    assinatura = base64.b64decode(raiz.findtext(".//ds:SignatureValue", namespaces=ns))
    credencial.chave.public_key().verify(
        assinatura,
        StdlibET.canonicalize(
            etree.tostring(signed_info, encoding="unicode"), with_comments=False
        ).encode("UTF-8"),
        padding.PKCS1v15(),
        hashes.SHA1(),
    )


def test_ciencia_usa_210210_e_e_o_que_destrava_o_xml_completo(credencial):
    """Sem manifestação a SEFAZ só entrega `resNFe` (resumo). A ciência é o
    evento mínimo que libera o XML inteiro da nota."""
    xml = montar_evento_assinado(
        credencial=credencial,
        cnpj=CNPJ,
        chave=CHAVE,
        tipo="ciencia",
        justificativa=None,
        tp_amb=1,
        id_lote="1",
    )
    raiz = etree.fromstring(xml)
    ns = {"n": NS_NFE}
    assert raiz.find(".//n:infEvento", ns).get("Id") == f"ID210210{CHAVE}01"
    assert (
        raiz.findtext(".//n:detEvento/n:descEvento", namespaces=ns)
        == "Ciencia da Operacao"
    )


def test_evento_negativo_escapa_justificativa_e_entra_no_soap(credencial):
    xml = montar_evento_assinado(
        credencial=credencial,
        cnpj=CNPJ,
        chave=CHAVE,
        tipo="nao_realizada",
        justificativa="Mercadoria não recebida & pedido cancelado",
        tp_amb=1,
        id_lote="456",
    )
    assert b"Mercadoria n\xc3\xa3o recebida &amp; pedido cancelado" in xml

    soap = _envelope_soap(xml)
    raiz = etree.fromstring(soap)
    assert raiz.find(f".//{{{NS_NFE}}}envEvento") is not None

    # A assinatura tem que continuar válida no documento EFETIVAMENTE
    # transmitido, depois de ganhar os namespaces ancestrais do envelope SOAP.
    ns = {"n": NS_NFE, "ds": NS_DS}
    inf = raiz.find(".//n:infEvento", ns)
    signed_info = raiz.find(".//ds:SignedInfo", ns)
    assert raiz.findtext(".//ds:DigestValue", namespaces=ns) == _digest_esperado(inf)
    assinatura = base64.b64decode(raiz.findtext(".//ds:SignatureValue", namespaces=ns))
    credencial.chave.public_key().verify(
        assinatura,
        StdlibET.canonicalize(
            etree.tostring(signed_info, encoding="unicode"), with_comments=False
        ).encode("UTF-8"),
        padding.PKCS1v15(),
        hashes.SHA1(),
    )


def test_desconhecimento_nao_serializa_justificativa(credencial):
    """NT 2020.001 v1.50: xJust só existe em Operação não Realizada."""
    xml = montar_evento_assinado(
        credencial=credencial,
        cnpj=CNPJ,
        chave=CHAVE,
        tipo="desconhecida",
        justificativa="Fornecedor desconhecido nesta operação",
        tp_amb=1,
        id_lote="457",
    )
    assert etree.fromstring(xml).find(
        ".//n:detEvento/n:xJust", {"n": NS_NFE}
    ) is None


def test_nao_realizada_sem_justificativa_para_antes_de_transmitir(credencial):
    """Evento é irreversível: a validação tem que barrar ANTES de sair byte."""
    with pytest.raises(DadosInvalidos) as erro:
        montar_evento_assinado(
            credencial=credencial,
            cnpj=CNPJ,
            chave=CHAVE,
            tipo="nao_realizada",
            justificativa="curta",
            tp_amb=1,
            id_lote="458",
        )
    assert "justificativa" in erro.value.mensagem.lower()


def test_chave_torta_nao_vira_evento(credencial):
    with pytest.raises(DadosInvalidos):
        montar_evento_assinado(
            credencial=credencial,
            cnpj=CNPJ,
            chave="123",
            tipo="ciencia",
            justificativa=None,
            tp_amb=1,
            id_lote="459",
        )


def _soap_retorno(cstat: int, motivo: str, protocolo: str = "") -> str:
    prot = f"<nProt>{protocolo}</nProt>" if protocolo else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body><nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
    <retEnvEvento xmlns="{NS_NFE}" versao="1.00"><idLote>123</idLote><tpAmb>1</tpAmb>
      <verAplic>AN</verAplic><cOrgao>91</cOrgao><cStat>128</cStat><xMotivo>Lote processado</xMotivo>
      <retEvento versao="1.00"><infEvento><tpAmb>1</tpAmb><verAplic>AN</verAplic><cOrgao>91</cOrgao>
        <cStat>{cstat}</cStat><xMotivo>{motivo}</xMotivo><chNFe>{CHAVE}</chNFe>
        <tpEvento>210200</tpEvento><nSeqEvento>1</nSeqEvento>
        <dhRegEvento>2026-09-21T10:30:02-03:00</dhRegEvento>{prot}
      </infEvento></retEvento>
    </retEnvEvento>
  </nfeResultMsg></soap:Body>
</soap:Envelope>"""


def test_resposta_135_conclui_e_guarda_protocolo():
    resposta = interpretar_resposta(_soap_retorno(135, "Evento registrado", "135260000000001"))
    assert resposta.sucesso is True
    assert resposta.duplicada is False
    assert resposta.protocolo == "135260000000001"
    assert resposta.registrada_em == "2026-09-21T10:30:02-03:00"


def test_duplicidade_573_e_idempotente():
    """A SEFAZ já tinha o evento. É sucesso, não erro: é exatamente o retorno
    esperado quando ela aceitou e a gravação do nosso lado falhou depois."""
    resposta = interpretar_resposta(_soap_retorno(573, "Duplicidade de Evento"))
    assert resposta.sucesso is True
    assert resposta.duplicada is True
    assert resposta.protocolo is None


def test_rejeicao_transitoria_e_marcada_como_retentavel():
    resposta = interpretar_resposta(_soap_retorno(108, "Servico paralisado momentaneamente"))
    assert resposta.sucesso is False
    assert resposta.retentavel is True
