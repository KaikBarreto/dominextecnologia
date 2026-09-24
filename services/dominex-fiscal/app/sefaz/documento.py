"""Transforma cada `docZip` da SEFAZ nos campos de uma nota recebida.

PORTADO de `EcoSistemaSaaS/services/ecosistema-dfe/app/parser.py`. Duas
diferenças, ambas deliberadas:

  1. XML lido com **lxml endurecido** em vez de `defusedxml`. O lxml já é
     dependência deste serviço (assinatura, DANFSe); `defusedxml` seria uma
     dependência nova numa imagem que emite nota fiscal em produção, e subir
     dependência aqui é evento planejado. Com `resolve_entities=False`,
     `load_dtd=False` e `no_network=True` a proteção é a mesma (XXE e billion
     laughs ficam impossíveis).
  2. Teto de descompressão (`LIMITE_XML`). O gzip vem da SEFAZ por mTLS, mas um
     container com 512 MB de RAM não pode depender de boa-fé de terceiro:
     uma bomba de descompressão derrubaria o serviço fiscal INTEIRO, inclusive
     a emissão de NFS-e, que é o que paga a conta.

O docZip vem **base64 + gzip**. Dentro, quatro coisas diferentes podem aparecer —
e só duas viram nota:

  procNFe  → a NF-e INTEIRA (XML autorizado). resumo = False.
  resNFe   → só o RESUMO (a SEFAZ manda isso enquanto o destinatário não
             manifesta ciência). resumo = True.
  resEvento / procEventoNFe → EVENTO (ciência, confirmação, cancelamento, CC-e).
             ⚠️ NÃO é nota. Contar e ignorar. Tentar virar linha de nota recebida
             cria "nota" sem valor e sem emitente.

Sobre o resumo: ele não traz nNF, serie, CFOP, natOp nem finNFe. Mas número e
série estão DENTRO da chave de acesso (posições fixas), então a gente deriva em
vez de devolver nulo — o cliente vê "NF 53 série 1" mesmo antes de manifestar.
"""

from __future__ import annotations

import base64
import binascii
import gzip
import io
import logging
from typing import Any, Optional

from lxml import etree

log = logging.getLogger("dominex-fiscal.sefaz")

NS = {"n": "http://www.portalfiscal.inf.br/nfe"}

#: Teto do XML descompactado. Uma NF-e gorda (500 itens) não passa de ~2 MB.
LIMITE_XML = 12 * 1024 * 1024

# Layout da chave de acesso (44 dígitos), posições fixas pela legislação:
#   cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
FATIA_SERIE = slice(22, 25)
FATIA_NUMERO = slice(25, 34)

# cStat do protocolo (procNFe) → situação. O que não está aqui vira "outra":
# inventar "autorizada" pra código desconhecido é o tipo de chute que faz o
# cliente lançar uma despesa de nota que a SEFAZ não reconhece.
_SITUACAO_POR_CSTAT = {
    100: "autorizada",
    150: "autorizada",   # autorizada fora do prazo
    101: "cancelada",
    135: "cancelada",
    151: "cancelada",
    155: "cancelada",
    110: "denegada",
    301: "denegada",
    302: "denegada",
    303: "denegada",
}

# cSitNFe do resumo (resNFe)
_SITUACAO_POR_CSIT = {"1": "autorizada", "2": "denegada", "3": "cancelada"}


class ErroDeParse(Exception):
    """docZip ilegível. NUNCA derruba a rodada inteira — a nota é pulada.

    Não descende de `ErroFiscal` de propósito: isto não vira resposta HTTP.
    Um documento torto não pode impedir as outras 49 notas da página de chegar
    ao cliente, nem travar o avanço do cursor.
    """


def _parser() -> etree.XMLParser:
    return etree.XMLParser(
        resolve_entities=False,   # mata billion laughs e XXE
        load_dtd=False,
        no_network=True,
        huge_tree=False,
        recover=False,
    )


def descompactar(conteudo_b64: str) -> bytes:
    try:
        comprimido = base64.b64decode(conteudo_b64, validate=True)
    except (binascii.Error, ValueError):
        raise ErroDeParse("docZip não é base64 válido") from None
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(comprimido)) as fluxo:
            bruto = fluxo.read(LIMITE_XML + 1)
    except (OSError, EOFError) as exc:
        raise ErroDeParse(f"docZip não descompactou ({type(exc).__name__})") from None
    if len(bruto) > LIMITE_XML:
        raise ErroDeParse("docZip descompactado passou do tamanho máximo aceito")
    return bruto


def _texto(no: Any, caminho: str) -> Optional[str]:
    if no is None:
        return None
    achado = no.find(caminho, NS)
    if achado is None or achado.text is None:
        return None
    valor = achado.text.strip()
    return valor or None


def _inteiro(valor: Optional[str]) -> Optional[int]:
    if valor is None:
        return None
    try:
        return int(valor)
    except ValueError:
        return None


def _decimal(valor: Optional[str]) -> Optional[float]:
    if valor is None:
        return None
    try:
        return float(valor)
    except ValueError:
        return None


def _numero_serie_da_chave(chave: Optional[str]):
    """Deriva (numero, serie) da chave. Serve pro resumo, que não traz esses
    campos, e serve de conferência silenciosa no XML completo."""
    if not chave or len(chave) != 44 or not chave.isdigit():
        return None, None
    return _inteiro(chave[FATIA_NUMERO]), _inteiro(chave[FATIA_SERIE])


def _nota_vazia(nsu: str, xml: str, resumo: bool) -> dict:
    return {
        "chave": None,
        "nsu": nsu,
        "emitente_cnpj": None,
        "emitente_nome": None,
        "valor": None,
        "data_emissao": None,
        "natureza": None,
        "situacao_sefaz": None,
        "numero": None,
        "serie": None,
        "cfop_principal": None,
        "fin_nfe": None,
        "ref_nfe_chave": None,
        "resumo": resumo,
        "xml": xml,
    }


def _de_proc_nfe(raiz: Any, nsu: str, xml: str) -> dict:
    inf_nfe = raiz.find(".//n:infNFe", NS)
    if inf_nfe is None:
        raise ErroDeParse("procNFe sem infNFe")

    identificador = (inf_nfe.get("Id") or "").replace("NFe", "").strip()
    chave = (
        identificador
        if len(identificador) == 44
        else _texto(raiz, ".//n:protNFe/n:infProt/n:chNFe")
    )

    nota = _nota_vazia(nsu, xml, resumo=False)
    numero_da_chave, serie_da_chave = _numero_serie_da_chave(chave)
    serie_no_xml = _texto(inf_nfe, "n:ide/n:serie")
    c_stat_protocolo = _inteiro(_texto(raiz, ".//n:protNFe/n:infProt/n:cStat"))

    nota.update(
        {
            "chave": chave,
            "emitente_cnpj": _texto(inf_nfe, "n:emit/n:CNPJ")
            or _texto(inf_nfe, "n:emit/n:CPF"),
            "emitente_nome": _texto(inf_nfe, "n:emit/n:xNome"),
            # vNF do total é o valor da NOTA. Não somar item: desconto, frete e
            # ICMS-ST entram aqui e não no somatório dos produtos.
            "valor": _decimal(_texto(inf_nfe, "n:total/n:ICMSTot/n:vNF")),
            "data_emissao": _texto(inf_nfe, "n:ide/n:dhEmi")
            or _texto(inf_nfe, "n:ide/n:dEmi"),
            "natureza": _texto(inf_nfe, "n:ide/n:natOp"),
            "situacao_sefaz": _SITUACAO_POR_CSTAT.get(c_stat_protocolo or -1, "outra"),
            "numero": _inteiro(_texto(inf_nfe, "n:ide/n:nNF")) or numero_da_chave,
            "serie": _inteiro(serie_no_xml) if serie_no_xml is not None else serie_da_chave,
            # CFOP do PRIMEIRO item. Nota com CFOP misto entre itens existe (e não
            # é rara): este campo é indicativo, não verdade sobre a nota inteira.
            "cfop_principal": _texto(inf_nfe, "n:det/n:prod/n:CFOP"),
            "fin_nfe": _inteiro(_texto(inf_nfe, "n:ide/n:finNFe")),
            "ref_nfe_chave": _texto(inf_nfe, "n:ide/n:NFref/n:refNFe"),
        }
    )
    return nota


def _de_res_nfe(raiz: Any, nsu: str, xml: str) -> dict:
    chave = _texto(raiz, "n:chNFe")
    numero, serie = _numero_serie_da_chave(chave)

    nota = _nota_vazia(nsu, xml, resumo=True)
    nota.update(
        {
            "chave": chave,
            "emitente_cnpj": _texto(raiz, "n:CNPJ") or _texto(raiz, "n:CPF"),
            "emitente_nome": _texto(raiz, "n:xNome"),
            "valor": _decimal(_texto(raiz, "n:vNF")),
            "data_emissao": _texto(raiz, "n:dhEmi"),
            "situacao_sefaz": _SITUACAO_POR_CSIT.get(_texto(raiz, "n:cSitNFe") or "", "outra"),
            # Derivados da chave: o resumo não traz nNF nem serie.
            "numero": numero,
            "serie": serie,
            # natureza/CFOP/finNFe/refNFe só existem no XML completo. Ficam nulos
            # de propósito — preencher com chute seria pior que o campo vazio.
        }
    )
    return nota


def interpretar(nsu: str, schema: str, conteudo_b64: str) -> Optional[dict]:
    """Devolve a nota pronta, ou None se o documento for EVENTO.

    Levanta `ErroDeParse` se o documento estiver quebrado — o chamador conta,
    registra e segue pro próximo (uma nota ilegível não pode travar a fila).
    """
    bruto = descompactar(conteudo_b64)
    try:
        raiz = etree.fromstring(bruto, parser=_parser())
    except etree.XMLSyntaxError:
        raise ErroDeParse("docZip não é XML válido") from None

    xml = bruto.decode("utf-8", "replace")
    tag = etree.QName(raiz).localname if raiz.tag else ""

    if tag in ("resEvento", "procEventoNFe", "envEvento", "retEnvEvento"):
        log.info("nsu=%s: evento (%s) — contado e ignorado, não é nota", nsu, tag)
        return None

    if tag == "nfeProc":
        return _de_proc_nfe(raiz, nsu, xml)
    if tag == "resNFe":
        return _de_res_nfe(raiz, nsu, xml)
    # O schema do atributo é o desempate quando a raiz não é uma das conhecidas.
    if "procNFe" in (schema or ""):
        return _de_proc_nfe(raiz, nsu, xml)
    if "resNFe" in (schema or ""):
        return _de_res_nfe(raiz, nsu, xml)

    log.warning("nsu=%s: tipo desconhecido (%s, schema=%s) — ignorado", nsu, tag, schema)
    return None
