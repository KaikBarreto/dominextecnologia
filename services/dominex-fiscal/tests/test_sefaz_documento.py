"""DF-e: o que, se quebrar, deixa o cliente sem nota recebida.

Portado de `EcoSistemaSaaS/services/ecosistema-dfe/tests/test_parser_e_fusivel.py`.
Os testes do fusível anti-656 baseado em ARQUIVO não vieram: aqui o estado mora
na tabela `dfe_sync_state` (decisão D1 — a VPS não tem banco). O que substitui
eles é `test_sefaz_api.py`, que prova que o serviço DETECTA e REPORTA o 656 com
o cursor certo, que é a parte que cabe a esta box.
"""

from __future__ import annotations

import base64
import gzip

import pytest

from app.sefaz.documento import ErroDeParse, interpretar
from app.sefaz.uf import CODIGO_POR_SIGLA, codigo_uf
from app.errors import DadosInvalidos

CHAVE = "35260965256296000151550010000000531300000543"


def _zip(xml: str) -> str:
    return base64.b64encode(gzip.compress(xml.encode())).decode()


PROC = f"""<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
<NFe><infNFe Id="NFe{CHAVE}" versao="4.00">
<ide><cUF>35</cUF><natOp>Venda Dentro do Estado</natOp><mod>55</mod><serie>1</serie>
<nNF>53</nNF><dhEmi>2026-09-15T16:04:48-03:00</dhEmi><tpNF>1</tpNF><finNFe>1</finNFe></ide>
<emit><CNPJ>65256296000151</CNPJ><xNome>GR METAIS SBC LTDA</xNome></emit>
<det nItem="1"><prod><CFOP>5102</CFOP><vProd>34644.44</vProd></prod></det>
<det nItem="2"><prod><CFOP>5949</CFOP><vProd>0.00</vProd></prod></det>
<total><ICMSTot><vNF>34644.44</vNF></ICMSTot></total>
</infNFe></NFe>
<protNFe><infProt><chNFe>{CHAVE}</chNFe><cStat>100</cStat>
<xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></nfeProc>"""

RESUMO = f"""<?xml version="1.0" encoding="UTF-8"?>
<resNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<chNFe>{CHAVE}</chNFe><CNPJ>65256296000151</CNPJ><xNome>GR METAIS SBC LTDA</xNome>
<dhEmi>2026-09-15T16:04:48-03:00</dhEmi><vNF>34644.44</vNF><cSitNFe>1</cSitNFe></resNFe>"""

EVENTO = f"""<?xml version="1.0" encoding="UTF-8"?>
<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<CNPJ>65256296000151</CNPJ><chNFe>{CHAVE}</chNFe><tpEvento>210210</tpEvento>
<xEvento>Ciencia da Operacao</xEvento></resEvento>"""

CANCELADA = PROC.replace("<cStat>100</cStat>", "<cStat>101</cStat>")


def test_nota_completa_vira_os_campos_certos():
    nota = interpretar("000000000000676", "procNFe_v4.00.xsd", _zip(PROC))
    assert nota["chave"] == CHAVE
    assert nota["nsu"] == "000000000000676"          # o NSU prova de onde a nota veio
    assert nota["emitente_cnpj"] == "65256296000151"
    assert nota["emitente_nome"] == "GR METAIS SBC LTDA"
    assert nota["valor"] == 34644.44
    assert nota["data_emissao"] == "2026-09-15T16:04:48-03:00"
    assert nota["natureza"] == "Venda Dentro do Estado"
    assert nota["situacao_sefaz"] == "autorizada"
    assert nota["numero"] == 53 and nota["serie"] == 1
    assert nota["cfop_principal"] == "5102"          # do PRIMEIRO item, não do segundo
    assert nota["fin_nfe"] == 1
    assert nota["resumo"] is False
    assert "<nfeProc" in nota["xml"]


def test_resumo_deriva_numero_e_serie_da_chave():
    """O resNFe não traz nNF nem serie — vêm das posições fixas da chave."""
    nota = interpretar("000000000000677", "resNFe_v1.01.xsd", _zip(RESUMO))
    assert nota["resumo"] is True
    assert nota["numero"] == 53 and nota["serie"] == 1
    # O que o resumo não tem fica nulo: chute seria pior que campo vazio.
    assert nota["cfop_principal"] is None
    assert nota["natureza"] is None
    assert nota["fin_nfe"] is None


def test_evento_nao_vira_nota():
    """Evento (ciência/cancelamento/CC-e) não é nota. Virar linha de nota
    recebida criaria 'nota' sem valor e sem emitente."""
    assert interpretar("000000000000678", "resEvento_v1.01.xsd", _zip(EVENTO)) is None


def test_nota_cancelada_nao_passa_por_autorizada():
    nota = interpretar("000000000000679", "procNFe_v4.00.xsd", _zip(CANCELADA))
    assert nota["situacao_sefaz"] == "cancelada"


def test_xml_com_entidade_externa_nao_e_resolvido():
    """XXE: o docZip vem de fora. Com `resolve_entities=False` a entidade fica
    literal e o /etc/passwd do container não vaza pro XML da nota do cliente."""
    ataque = (
        '<?xml version="1.0"?>'
        '<!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
        '<resNFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        f"<chNFe>{CHAVE}</chNFe><xNome>&xxe;</xNome></resNFe>"
    )
    nota = interpretar("000000000000680", "resNFe_v1.01.xsd", _zip(ataque))
    assert "root:" not in (nota.get("xml") or "")
    assert "root:" not in (nota.get("emitente_nome") or "")


def test_bomba_de_descompressao_e_recusada_sem_derrubar_o_servico():
    """512 MB de RAM na box são divididos com a emissão de NFS-e. Um docZip de
    1 GB descompactado não pode levar o motor fiscal inteiro junto."""
    bomba = base64.b64encode(gzip.compress(b"\0" * (13 * 1024 * 1024))).decode()
    with pytest.raises(ErroDeParse):
        interpretar("000000000000681", "procNFe_v4.00.xsd", bomba)


def test_documento_ilegivel_levanta_erro_de_parse_e_nao_erro_fiscal():
    """ErroDeParse NÃO descende de ErroFiscal de propósito: documento torto é
    pulado pelo laço, não vira resposta de erro que derruba a página inteira."""
    with pytest.raises(ErroDeParse):
        interpretar("000000000000682", "procNFe_v4.00.xsd", "isso-nao-e-base64!!")


# --------------------------------------------------------------------------
# cUF: o Dominex não tem a tabela do IBGE em lugar nenhum; ela mora aqui.
# --------------------------------------------------------------------------
def test_tabela_de_uf_tem_as_27_unidades_e_os_codigos_certos():
    assert len(CODIGO_POR_SIGLA) == 27
    assert codigo_uf("SP") == "35"
    assert codigo_uf("mg") == "31"
    assert codigo_uf(" df ") == "53"
    assert codigo_uf("35") == "35"          # já veio como código


def test_uf_invalida_devolve_mensagem_que_o_cliente_entende():
    with pytest.raises(DadosInvalidos) as erro:
        codigo_uf("XX")
    assert "sigla" in erro.value.mensagem.lower()

    with pytest.raises(DadosInvalidos) as vazio:
        codigo_uf("")
    assert "cadastro" in vazio.value.mensagem.lower()
