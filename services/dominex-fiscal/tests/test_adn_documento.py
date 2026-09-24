"""Leitura do documento do ADN: NFS-e nacional, evento e as bombas de sempre.

Nenhuma rede. O XML aqui é montado no leiaute nacional
(`http://www.sped.fazenda.gov.br/nfse`), com os nomes de campo conferidos contra
os bindings oficiais do XSD que o próprio serviço usa para EMITIR
(`nfelib.nfse.bindings.v1_0`): TCInfNFSe, TCEmitente, TCValoresNFSe, TCInfDPS,
TCInfoPessoa, TCCServ, TCVServPrest, TCTribMunicipal.
"""

from __future__ import annotations

import base64
import gzip

import pytest

from app.adn import documento as doc
from app.adn.distribuicao import ItemDfe

# Chave de acesso da NFS-e nacional — 50 dígitos, no layout da legislação:
# cMun 7 + ambiente 1 + tipo de inscrição 1 + inscrição federal 14 +
# nNFSe 13 + AAMM 4 + código numérico 9 + DV 1.
CHAVE = (
    "3550308"            # cMun
    "1"                  # ambiente
    "2"                  # tipo de inscrição (CNPJ)
    "12345678000199"     # inscrição federal do prestador
    "0000000001201"      # nNFSe
    "2607"               # AAMM
    "123456789"          # código numérico
    "5"                  # DV
)
CHAVE_SUBSTITUTA = CHAVE[:-1] + "9"

PRESTADOR = "12345678000199"
TOMADOR = "38386446000179"


def _nfse(
    *,
    chave: str = CHAVE,
    tomador: str = TOMADOR,
    prestador: str = PRESTADOR,
    tp_ret: str | None = "2",
) -> str:
    bloco_ret = f"<tpRetISSQN>{tp_ret}</tpRetISSQN>" if tp_ret is not None else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infNFSe Id="NFS{chave}">
    <xLocEmi>Sao Paulo</xLocEmi>
    <xLocPrestacao>Sao Paulo</xLocPrestacao>
    <nNFSe>1201</nNFSe>
    <cLocIncid>3550308</cLocIncid>
    <verAplic>1.00</verAplic>
    <ambGer>1</ambGer>
    <tpEmis>1</tpEmis>
    <procEmi>1</procEmi>
    <cStat>100</cStat>
    <dhProc>2026-07-10T09:15:00-03:00</dhProc>
    <nDFSe>77</nDFSe>
    <emit>
      <CNPJ>{prestador}</CNPJ>
      <IM>1234567</IM>
      <xNome>ACME SERVICOS LTDA</xNome>
      <enderNac><cMun>3550308</cMun><CEP>01001000</CEP></enderNac>
    </emit>
    <valores>
      <vBC>1000.00</vBC>
      <pAliqAplic>5.00</pAliqAplic>
      <vISSQN>50.00</vISSQN>
      <vTotalRet>50.00</vTotalRet>
      <vLiq>950.00</vLiq>
    </valores>
    <DPS>
      <infDPS Id="DPS{prestador}000000000001201">
        <tpAmb>1</tpAmb>
        <dhEmi>2026-07-10T09:10:00-03:00</dhEmi>
        <verAplic>1.00</verAplic>
        <serie>00001</serie>
        <nDPS>1201</nDPS>
        <dCompet>2026-06-01</dCompet>
        <tpEmit>1</tpEmit>
        <cLocEmi>3550308</cLocEmi>
        <prest><CNPJ>{prestador}</CNPJ></prest>
        <toma>
          <CNPJ>{tomador}</CNPJ>
          <xNome>DOMINEX TECNOLOGIA LTDA</xNome>
        </toma>
        <serv>
          <locPrest><cLocPrestacao>3550308</cLocPrestacao></locPrest>
          <cServ>
            <cTribNac>140101</cTribNac>
            <cTribMun>001</cTribMun>
            <xDescServ>Manutencao preventiva de ar condicionado</xDescServ>
          </cServ>
        </serv>
        <valores>
          <vServPrest><vServ>1000.00</vServ></vServPrest>
          <trib><tribMun><tribISSQN>1</tribISSQN><pAliq>5.00</pAliq>{bloco_ret}</tribMun></trib>
        </valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>"""


def _evento(codigo: str = "101101", substituta: str | None = None) -> str:
    if codigo == "105102":
        miolo = (
            "<e105102><xDesc>Cancelamento por substituicao</xDesc>"
            f"<cMotivo>2</cMotivo><xMotivo>Erro de valor</xMotivo>"
            f"<chSubstituta>{substituta or CHAVE_SUBSTITUTA}</chSubstituta></e105102>"
        )
    else:
        miolo = (
            f"<e{codigo}><xDesc>Cancelamento de NFS-e</xDesc>"
            "<cMotivo>1</cMotivo><xMotivo>Erro na emissao</xMotivo></e"
            f"{codigo}>"
        )
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<evento xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">
  <infEvento Id="EVT{CHAVE}{codigo}01">
    <verAplic>1.00</verAplic>
    <ambGer>1</ambGer>
    <nSeqEvento>1</nSeqEvento>
    <dhProc>2026-07-15T10:00:00-03:00</dhProc>
    <nDFe>1</nDFe>
    <pedRegEvento>
      <infPedReg Id="PRE{CHAVE}">
        <tpAmb>1</tpAmb>
        <verAplic>1.00</verAplic>
        <dhEvento>2026-07-15T09:59:00-03:00</dhEvento>
        <CNPJAutor>{PRESTADOR}</CNPJAutor>
        <chNFSe>{CHAVE}</chNFSe>
        <nPedRegEvento>1</nPedRegEvento>
        {miolo}
      </infPedReg>
    </pedRegEvento>
  </infEvento>
</evento>"""


def _item(xml: str, *, nsu: int = 42, tipo: str = "NFSE", tipo_evento: str = "") -> ItemDfe:
    return ItemDfe(
        nsu=nsu,
        chave_acesso=CHAVE,
        tipo_documento=tipo,
        tipo_evento=tipo_evento,
        arquivo_xml_b64=base64.b64encode(gzip.compress(xml.encode())).decode(),
        data_hora_geracao="2026-07-10T09:15:00-03:00",
    )


# -----------------------------------------------------------------------------
# NFS-e
# -----------------------------------------------------------------------------


def test_nota_vira_exatamente_as_colunas_de_inbound_nfse():
    genero, dados = doc.interpretar(_item(_nfse()))
    assert genero == "nfse"

    assert dados["chave_acesso"] == CHAVE
    assert len(dados["chave_acesso"]) == 50
    assert dados["numero"] == "1201"
    assert dados["serie"] == "00001"
    assert dados["codigo_verificacao"] == "77"
    assert dados["municipio_incidencia_ibge"] == "3550308"
    assert dados["data_emissao"] == "2026-07-10T09:15:00-03:00"
    assert dados["competencia"] == "2026-06-01"
    assert dados["prestador_documento"] == PRESTADOR
    assert dados["prestador_nome"] == "ACME SERVICOS LTDA"
    assert dados["prestador_im"] == "1234567"
    assert dados["prestador_municipio_ibge"] == "3550308"
    assert dados["tomador_documento"] == TOMADOR
    assert dados["tomador_nome"] == "DOMINEX TECNOLOGIA LTDA"
    assert dados["codigo_tributacao_nacional"] == "140101"
    assert dados["codigo_tributacao_municipal"] == "001"
    assert dados["discriminacao"].startswith("Manutencao")
    assert dados["situacao"] == "autorizada"
    assert dados["resumo"] is False
    assert dados["nsu"] == "42"


def test_valor_do_servico_e_o_liquido_sao_campos_DIFERENTES():
    """Confundir os dois lança a despesa com o valor errado quando há retenção."""
    _, dados = doc.interpretar(_item(_nfse()))
    assert dados["valor_servico"] == 1000.00   # vServPrest/vServ (DPS)
    assert dados["valor_liquido"] == 950.00    # vLiq (infNFSe)
    assert dados["valor_iss"] == 50.00


def test_iss_retido_pelo_tomador_vira_true():
    _, dados = doc.interpretar(_item(_nfse(tp_ret="2")))
    assert dados["iss_retido"] is True


def test_iss_nao_retido_vira_false():
    _, dados = doc.interpretar(_item(_nfse(tp_ret="1")))
    assert dados["iss_retido"] is False


def test_sem_tpRetISSQN_o_campo_fica_NULO_e_nao_false():
    """None = "não informado". Chutar false erraria o valor do título pra baixo."""
    _, dados = doc.interpretar(_item(_nfse(tp_ret=None)))
    assert dados["iss_retido"] is None


def test_chave_curta_no_Id_e_recusada_em_vez_de_virar_chave_torta():
    """A coluna tem CHECK `^[0-9]{50}$`: chave curta quebraria o INSERT do lote."""
    xml = _nfse().replace(f'Id="NFS{CHAVE}"', 'Id="NFS123"')
    item = ItemDfe(
        nsu=7,
        chave_acesso="",  # o envelope também não ajudou
        tipo_documento="NFSE",
        arquivo_xml_b64=base64.b64encode(gzip.compress(xml.encode())).decode(),
    )
    _, dados = doc.interpretar(item)
    assert dados["chave_acesso"] is None
    # Sem chave, a identidade tem que vir do par prestador+número.
    assert dados["prestador_documento"] == PRESTADOR
    assert dados["numero"] == "1201"


def test_namespace_diferente_nao_faz_a_nota_sumir():
    """Leitura por local-name(): mudança de namespace no leiaute não pode cegar."""
    xml = _nfse().replace(
        'xmlns="http://www.sped.fazenda.gov.br/nfse"',
        'xmlns="http://www.sped.fazenda.gov.br/nfse/v2"',
    )
    genero, dados = doc.interpretar(_item(xml))
    assert genero == "nfse"
    assert dados["chave_acesso"] == CHAVE


def test_tipo_documento_ausente_desempata_pela_raiz_do_xml():
    genero, dados = doc.interpretar(_item(_nfse(), tipo=""))
    assert genero == "nfse"
    assert dados["numero"] == "1201"


# -----------------------------------------------------------------------------
# Eventos
# -----------------------------------------------------------------------------


def test_evento_nao_vira_nota_e_traz_a_chave_que_ele_afeta():
    genero, dados = doc.interpretar(_item(_evento(), tipo="EVENTO"))
    assert genero == "evento"
    assert dados["chave_acesso"] == CHAVE
    assert dados["codigo"] == "101101"
    assert dados["situacao_sugerida"] == "cancelada"
    assert dados["data_evento"] == "2026-07-15T10:00:00-03:00"


def test_cancelamento_por_substituicao_traz_a_chave_substituta():
    genero, dados = doc.interpretar(
        _item(_evento("105102"), tipo="EVENTO", tipo_evento="CANCELAMENTO_POR_SUBSTITUICAO")
    )
    assert genero == "evento"
    assert dados["situacao_sugerida"] == "substituida"
    assert dados["chave_substituta"] == CHAVE_SUBSTITUTA
    assert len(dados["chave_substituta"]) == 50


def test_evento_de_analise_fiscal_nao_e_traduzido_em_situacao():
    """⚠️ INVARIANTE. A numeração de deferido/indeferido não foi confirmada contra
    o manual oficial. Traduzir no chute cancelaria nota que continua válida —
    então `situacao_sugerida` fica None e o `tipo_evento` cru vai junto."""
    genero, dados = doc.interpretar(
        _item(
            _evento("105105"),
            tipo="EVENTO",
            tipo_evento="CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL",
        )
    )
    assert genero == "evento"
    assert dados["codigo"] == "105105"
    assert dados["situacao_sugerida"] is None
    assert dados["tipo_evento"] == "CANCELAMENTO_INDEFERIDO_ANALISE_FISCAL"


def test_tipo_evento_do_adn_tem_precedencia_sobre_o_codigo_do_xml():
    genero, dados = doc.interpretar(
        _item(_evento("999999"), tipo="EVENTO", tipo_evento="CANCELAMENTO_POR_OFICIO")
    )
    assert genero == "evento"
    assert dados["situacao_sugerida"] == "cancelada"


# -----------------------------------------------------------------------------
# Robustez
# -----------------------------------------------------------------------------


def test_item_sem_xml_e_ignorado_e_nao_derruba_a_rodada():
    genero, dados = doc.interpretar(ItemDfe(nsu=9, tipo_documento="NFSE"))
    assert genero == "ignorado"
    assert dados is None


def test_dps_solta_nao_vira_nota_recebida():
    """DPS é a DECLARAÇÃO, não a nota autorizada. Virar linha criaria despesa
    de um documento que ainda pode nem ter sido aceito."""
    dps = (
        '<?xml version="1.0"?>'
        '<DPS xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">'
        '<infDPS Id="DPS1"><nDPS>1</nDPS></infDPS></DPS>'
    )
    genero, dados = doc.interpretar(_item(dps, tipo="DPS"))
    assert genero == "ignorado"
    assert dados is None


def test_bomba_de_descompressao_e_recusada_sem_derrubar_o_servico():
    bomba = base64.b64encode(gzip.compress(b"\0" * (doc.LIMITE_XML + 10))).decode()
    with pytest.raises(doc.ErroDeParse):
        doc.descompactar(bomba)


def test_xml_com_entidade_externa_nao_e_resolvido():
    """XXE: o XML vem de fora. Com `resolve_entities=False` a entidade fica
    literal e o /etc/passwd do container não vaza pro XML da nota do cliente."""
    veneno = _nfse().replace(
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<!DOCTYPE NFSe [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
    ).replace("ACME SERVICOS LTDA", "&xxe;")

    _, dados = doc.interpretar(_item(veneno))
    assert "root:" not in (dados.get("xml") or "")
    assert "root:" not in (dados.get("prestador_nome") or "")


def test_base64_torto_levanta_erro_de_parse_e_nao_erro_fiscal():
    from app.errors import ErroFiscal

    item = ItemDfe(nsu=1, tipo_documento="NFSE", arquivo_xml_b64="não é base64!!")
    with pytest.raises(doc.ErroDeParse) as capturado:
        doc.interpretar(item)
    assert not isinstance(capturado.value, ErroFiscal)
