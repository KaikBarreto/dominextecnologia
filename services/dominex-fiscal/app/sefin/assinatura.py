"""Assinatura XMLDSig do padrão nacional (armadilha 4 do spike).

O validador do Sefin Nacional recusa assinatura com PREFIXO de namespace
(`<ds:Signature>`): devolve **E1228 — "Xml declarado com prefixo de namespace"**.
A assinatura tem que sair com o namespace XMLDSig como DEFAULT.

A referência (`URI="#..."`) é o atributo `Id` do primeiro filho da raiz:
`infDPS` na DPS e `infPedReg` no pedido de evento.
"""

from __future__ import annotations

from lxml import etree
from signxml import XMLSigner, methods

XMLDSIG = "http://www.w3.org/2000/09/xmldsig#"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"


def assinar(xml: bytes, chave_pem: bytes, cert_pem: bytes, *, sha1: bool = False) -> bytes:
    """Assina o XML in-place (enveloped) e devolve os bytes assinados.

    `sha1=True` existe porque o XSD do pedido de evento chegou a fixar
    rsa-sha1/sha1 em versões anteriores do layout. O caminho provado em produção
    (2026-09-02) foi sha256 nos DOIS documentos — só mexer aqui se o servidor
    voltar a reclamar do algoritmo.
    """
    root = etree.fromstring(xml)
    if len(root) == 0 or not root[0].get("Id"):
        raise ValueError("XML sem elemento assinável (esperado filho com atributo Id).")

    signer = XMLSigner(
        method=methods.enveloped,
        signature_algorithm="rsa-sha1" if sha1 else "rsa-sha256",
        digest_algorithm="sha1" if sha1 else "sha256",
        c14n_algorithm=C14N,
    )
    # ⚠️ As duas linhas abaixo SÃO a correção da E1228. Não remover.
    signer.excise_empty_xmlns_declarations = True
    signer.namespaces = {None: XMLDSIG}

    assinado = signer.sign(
        root, key=chave_pem, cert=cert_pem, reference_uri=root[0].get("Id")
    )
    return etree.tostring(assinado, xml_declaration=True, encoding="UTF-8")
