"""Transforma cada item do `LoteDFe` nos campos de uma NFS-e recebida.

O `ArquivoXml` vem **base64 + gzip** (padrão fixado na apresentação do OpenAPI do
ADN). Dentro, duas coisas diferentes podem aparecer, e só uma vira nota:

  NFSe   (`TipoDocumento: NFSE`)  → a nota. Leiaute nacional, namespace
                                     `http://www.sped.fazenda.gov.br/nfse`.
  evento (`TipoDocumento: EVENTO`) → cancelamento, substituição, confirmação...
                                     ⚠️ NÃO é nota. Vira atualização de situação
                                     de uma nota que já existe (ou nada).

Os nomes de campo abaixo foram conferidos contra os bindings oficiais do XSD que
este serviço já usa para EMITIR (`nfelib.nfse.bindings.v1_0`): `TCInfNFSe`,
`TCEmitente`, `TCValoresNFSe`, `TCInfDPS`, `TCInfoPessoa`, `TCCServ`,
`TCVServPrest`, `TCTribMunicipal`. Não são chute de documentação.

⚠️ LEITURA NAMESPACE-AGNÓSTICA (`local-name()`), igual a `app/sefin/nfse_xml.py`.
   Se uma versão futura do leiaute trocar o namespace ou o prefixo, a nota do
   cliente não pode sumir da tela por causa disso.

⚠️ TETO DE DESCOMPRESSÃO. O gzip chega por mTLS de um servidor do governo, mas um
   container de 512 MB que também EMITE nota fiscal não pode depender de boa-fé de
   terceiro: uma bomba de descompressão derrubaria o motor inteiro.
"""

from __future__ import annotations

import base64
import binascii
import gzip
import io
import logging
import re
from typing import Any, Optional

from lxml import etree

log = logging.getLogger("dominex-fiscal.adn")

#: Teto do XML descompactado. Uma NFS-e completa não passa de ~30 KB; 12 MB é o
#: mesmo teto do DF-e da SEFAZ, mantido por simetria de operação.
LIMITE_XML = 12 * 1024 * 1024

#: Códigos de evento que este serviço se sente seguro traduzindo em situação.
#: Os dois estão provados: `101101` já é usado pelo caminho de emissão
#: (`app/sefin/nfse_xml.evento_de_cancelamento`) e `105102` é o único cujo XSD
#: carrega `chSubstituta` — ou seja, é cancelamento POR SUBSTITUIÇÃO por
#: construção. Os demais (`105104`/`105105`, deferimento/indeferimento de análise
#: fiscal) NÃO entram aqui de propósito: não dá pra confirmar qual número é qual
#: sem o manual na mão, e trocar os dois cancelaria uma nota que continua válida.
#: Nesses casos devolvemos `situacao_sugerida = None` e o `tipo_evento` cru.
SITUACAO_POR_CODIGO = {
    "101101": "cancelada",
    "105102": "substituida",
}

#: O ADN também classifica o evento com um enum PRÓPRIO (`TipoEvento`), que é
#: legível e não exige adivinhar número. Quando ele vem, tem precedência.
SITUACAO_POR_TIPO_EVENTO = {
    "CANCELAMENTO": "cancelada",
    "CANCELAMENTO_POR_SUBSTITUICAO": "substituida",
    "CANCELAMENTO_DEFERIDO_ANALISE_FISCAL": "cancelada",
    "CANCELAMENTO_POR_OFICIO": "cancelada",
}

_CODIGO_EVENTO = re.compile(r"^e(\d{6})$")


class ErroDeParse(Exception):
    """Item ilegível. NUNCA derruba a rodada — o documento é pulado e contado.

    Não descende de `ErroFiscal` de propósito: isto não vira resposta HTTP. Um
    documento torto não pode impedir as outras notas da página de chegar ao
    cliente nem travar o avanço do cursor.
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
        raise ErroDeParse("ArquivoXml não é base64 válido") from None
    try:
        with gzip.GzipFile(fileobj=io.BytesIO(comprimido)) as fluxo:
            bruto = fluxo.read(LIMITE_XML + 1)
    except (OSError, EOFError) as exc:
        raise ErroDeParse(f"ArquivoXml não descompactou ({type(exc).__name__})") from None
    if len(bruto) > LIMITE_XML:
        raise ErroDeParse("ArquivoXml descompactado passou do tamanho máximo aceito")
    return bruto


# -----------------------------------------------------------------------------
# Navegação por nome local (sem namespace)
# -----------------------------------------------------------------------------


def _passos(caminho: str) -> str:
    return "/".join(f"*[local-name()='{passo}']" for passo in caminho.split("/"))


def _no(raiz: Any, caminho: str) -> Any:
    if raiz is None:
        return None
    achados = raiz.xpath("./" + _passos(caminho))
    return achados[0] if achados else None


def _busca(raiz: Any, nome: str) -> Any:
    if raiz is None:
        return None
    achados = raiz.xpath(f"//*[local-name()='{nome}']")
    return achados[0] if achados else None


def _txt(raiz: Any, caminho: str) -> Optional[str]:
    no = _no(raiz, caminho)
    if no is None or no.text is None:
        return None
    return no.text.strip() or None


def _digitos(valor: Optional[str]) -> Optional[str]:
    if not valor:
        return None
    limpo = re.sub(r"\D", "", valor)
    return limpo or None


def _decimal(valor: Optional[str]) -> Optional[float]:
    if valor is None:
        return None
    try:
        return float(valor.replace(",", "."))
    except ValueError:
        return None


def _primeiro(*valores: Optional[str]) -> Optional[str]:
    for valor in valores:
        if valor:
            return valor
    return None


def _documento_pessoa(no: Any) -> Optional[str]:
    """CNPJ, CPF ou NIF — nesta ordem. NIF (estrangeiro) sai como veio."""
    if no is None:
        return None
    return _primeiro(
        _digitos(_txt(no, "CNPJ")),
        _digitos(_txt(no, "CPF")),
        _txt(no, "NIF"),
    )


# -----------------------------------------------------------------------------
# NFS-e
# -----------------------------------------------------------------------------


def _chave_do_id(valor: Optional[str]) -> Optional[str]:
    """`infNFSe/@Id` = "NFS" + chave de 50 dígitos. Só aceita 50 exatos.

    Devolver uma chave curta seria pior que devolver nada: a coluna
    `inbound_nfse.chave_acesso` tem CHECK `^[0-9]{50}$` e o INSERT quebraria a
    rodada inteira por causa de um documento torto.
    """
    digitos = _digitos(valor)
    if not digitos:
        return None
    candidata = digitos[-50:]
    return candidata if len(candidata) == 50 else None


def interpretar_nfse(item, xml_bytes: bytes) -> dict:
    """XML da NFS-e → dicionário com os campos de `inbound_nfse`."""
    try:
        raiz = etree.fromstring(xml_bytes, parser=_parser())
    except etree.XMLSyntaxError:
        raise ErroDeParse("ArquivoXml não é XML válido") from None

    inf = raiz if etree.QName(raiz).localname == "infNFSe" else _busca(raiz, "infNFSe")
    if inf is None:
        raise ErroDeParse("documento sem infNFSe")

    chave = _chave_do_id(inf.get("Id")) or (
        item.chave_acesso if len(item.chave_acesso or "") == 50 else None
    )

    emit = _no(inf, "emit")
    valores_nfse = _no(inf, "valores")
    inf_dps = _no(inf, "DPS/infDPS")
    prest = _no(inf_dps, "prest")
    toma = _no(inf_dps, "toma")
    c_serv = _no(inf_dps, "serv/cServ")
    valores_dps = _no(inf_dps, "valores")

    # `emit` é o prestador do ponto de vista do documento autorizado; `prest` é o
    # que o prestador declarou na DPS. Quando o prestador é o próprio emitente, o
    # governo preenche `emit` a partir do cadastro e a DPS vem enxuta (é a mesma
    # armadilha 2/3 do caminho de emissão) — daí a ordem: emit primeiro.
    prestador_documento = _primeiro(_documento_pessoa(emit), _documento_pessoa(prest))

    # `tpRetISSQN`: 1 = não retido · 2 = retido pelo tomador · 3 = retido pelo
    # intermediário. AUSENTE vira None, não False: o lançamento de despesa usa
    # este campo pra decidir quanto o cliente realmente paga ao prestador, e
    # chutar "não retido" erraria o valor do título pra baixo.
    tp_ret = _txt(valores_dps, "trib/tribMun/tpRetISSQN")
    iss_retido = None if tp_ret is None else tp_ret in ("2", "3")

    return {
        "nsu": str(item.nsu),
        "chave_acesso": chave,
        "numero": _txt(inf, "nNFSe"),
        "serie": _txt(inf_dps, "serie"),
        "codigo_verificacao": _txt(inf, "nDFSe"),
        # `cLocIncid` é o município onde o ISS incide. Na ausência, os 7 primeiros
        # dígitos da chave de acesso são o código do município por construção.
        "municipio_incidencia_ibge": _primeiro(
            _txt(inf, "cLocIncid"), chave[:7] if chave else None
        ),
        "data_emissao": _primeiro(_txt(inf, "dhProc"), _txt(inf_dps, "dhEmi")),
        "competencia": _txt(inf_dps, "dCompet"),
        # Valor do serviço prestado (DPS) x valor líquido (já com retenções).
        # Os dois vão: o regime de competência usa um, o pagamento usa o outro.
        "valor_servico": _decimal(_txt(valores_dps, "vServPrest/vServ")),
        "valor_liquido": _decimal(_txt(valores_nfse, "vLiq")),
        "valor_iss": _decimal(_txt(valores_nfse, "vISSQN")),
        "iss_retido": iss_retido,
        "prestador_documento": prestador_documento,
        "prestador_nome": _primeiro(_txt(emit, "xNome"), _txt(prest, "xNome")),
        "prestador_im": _primeiro(_txt(emit, "IM"), _txt(prest, "IM")),
        "prestador_municipio_ibge": _primeiro(
            _txt(emit, "enderNac/cMun"), _txt(inf_dps, "cLocEmi")
        ),
        "tomador_documento": _documento_pessoa(toma),
        "tomador_nome": _txt(toma, "xNome"),
        "codigo_tributacao_nacional": _txt(c_serv, "cTribNac"),
        "codigo_tributacao_municipal": _txt(c_serv, "cTribMun"),
        "discriminacao": _txt(c_serv, "xDescServ"),
        # Situação nasce SEMPRE autorizada: o cancelamento chega como EVENTO, num
        # NSU próprio e possivelmente numa rodada futura. Deduzir "cancelada" do
        # documento da nota seria inventar.
        "situacao": "autorizada",
        "resumo": False,
        "xml": xml_bytes.decode("utf-8", "replace"),
        "origem_ref": item.data_hora_geracao or None,
    }


# -----------------------------------------------------------------------------
# Eventos
# -----------------------------------------------------------------------------


def _codigo_evento(inf_ped_reg: Any) -> Optional[str]:
    if inf_ped_reg is None:
        return None
    for filho in inf_ped_reg:
        nome = etree.QName(filho).localname if isinstance(filho.tag, str) else ""
        achado = _CODIGO_EVENTO.match(nome or "")
        if achado:
            return achado.group(1)
    return None


def interpretar_evento(item, xml_bytes: bytes) -> dict:
    try:
        raiz = etree.fromstring(xml_bytes, parser=_parser())
    except etree.XMLSyntaxError:
        raise ErroDeParse("ArquivoXml de evento não é XML válido") from None

    inf_evento = _busca(raiz, "infEvento")
    inf_ped_reg = _busca(raiz, "infPedReg")
    codigo = _codigo_evento(inf_ped_reg)

    chave = _primeiro(
        _digitos(_txt(inf_ped_reg, "chNFSe")),
        item.chave_acesso or None,
    )
    if chave and len(chave) != 50:
        chave = None

    tipo_evento = (item.tipo_evento or "").upper()
    situacao = SITUACAO_POR_TIPO_EVENTO.get(tipo_evento)
    if situacao is None and codigo:
        situacao = SITUACAO_POR_CODIGO.get(codigo)

    substituta = None
    if inf_ped_reg is not None:
        substituta = _digitos(_txt(inf_ped_reg, "e105102/chSubstituta"))
        if substituta and len(substituta) != 50:
            substituta = None

    return {
        "nsu": str(item.nsu),
        "chave_acesso": chave,
        "codigo": codigo,
        "tipo_evento": tipo_evento or None,
        # None = "não sei traduzir isto em situação". O chamador NÃO deve tratar
        # None como "nada aconteceu" nem como "cancelada" — deve deixar a nota
        # como está e registrar o evento.
        "situacao_sugerida": situacao,
        "chave_substituta": substituta,
        "data_evento": _primeiro(
            _txt(inf_evento, "dhProc"), item.data_hora_geracao or None
        ),
        "xml": xml_bytes.decode("utf-8", "replace"),
    }


# -----------------------------------------------------------------------------
# Porta de entrada
# -----------------------------------------------------------------------------


def interpretar(item) -> tuple:
    """`(genero, dados)` — genero ∈ {'nfse', 'evento', 'ignorado'}.

    Levanta `ErroDeParse` quando o documento está quebrado; o chamador conta,
    registra e segue pro próximo.
    """
    if not item.arquivo_xml_b64:
        # Item sem XML acontece e não é erro: o NSU existe, o conteúdo não veio.
        # Contar como ignorado deixa o cursor avançar sem inventar nota.
        log.info("adn nsu=%s sem ArquivoXml — ignorado", item.nsu)
        return "ignorado", None

    xml_bytes = descompactar(item.arquivo_xml_b64)
    tipo = (item.tipo_documento or "").upper()

    if tipo == "NFSE":
        return "nfse", interpretar_nfse(item, xml_bytes)
    if tipo == "EVENTO":
        return "evento", interpretar_evento(item, xml_bytes)

    # `TipoDocumento` ausente ou desconhecido (DPS, PEDIDO_REGISTRO_EVENTO, CNC):
    # desempata pela raiz do XML. DPS é a DECLARAÇÃO, não a nota — se virasse
    # linha de `inbound_nfse`, o cliente veria uma despesa que não existe.
    try:
        raiz = etree.fromstring(xml_bytes, parser=_parser())
    except etree.XMLSyntaxError:
        raise ErroDeParse("ArquivoXml não é XML válido") from None
    nome = etree.QName(raiz).localname if isinstance(raiz.tag, str) else ""

    if nome in ("NFSe", "nfseProc", "infNFSe"):
        return "nfse", interpretar_nfse(item, xml_bytes)
    if nome in ("evento", "eventoProc", "pedRegEvento"):
        return "evento", interpretar_evento(item, xml_bytes)

    log.info("adn nsu=%s: tipo desconhecido (%s / raiz %s) — ignorado", item.nsu, tipo, nome)
    return "ignorado", None
