"""Contrato HTTP do DF-e — é contra isto que a edge function é escrita.

Nenhuma chamada real ao governo: o `http.client.HTTPSConnection` é substituído
por um dublê. O ciclo de custódia é REAL (selar → abrir → PEM em tmpfs → contexto
TLS), porque é justamente ele que a decisão D1 preserva.
"""

from __future__ import annotations

import base64
import gzip
import os

import pytest
from fastapi.testclient import TestClient

from app.custodia import selar
from app.main import app
from tests.test_sefaz_documento import CHAVE, PROC

TOKEN = os.environ["FISCAL_SERVICE_TOKEN"]
EMPRESA = "7a1b3c4d-0000-4000-8000-abcdefabcdef"
CNPJ = "38386446000179"

ROTAS = ("/v1/dfe/distribuicao", "/v1/dfe/consulta-chave", "/v1/dfe/manifestar")


# -----------------------------------------------------------------------------
# Dublê do transporte SOAP
# -----------------------------------------------------------------------------


class _RespostaHttp:
    def __init__(self, status: int, corpo: str) -> None:
        self.status = status
        self.reason = "OK"
        self._corpo = corpo

    def read(self) -> bytes:
        return self._corpo.encode("utf-8")


class ConexaoFalsa:
    fila: list = []
    enviados: list = []

    def __init__(self, host, port=443, context=None, timeout=None) -> None:
        self.host = host

    def request(self, metodo, caminho, corpo, headers) -> None:
        ConexaoFalsa.enviados.append(
            {
                "host": self.host,
                "caminho": caminho,
                "corpo": corpo.decode("utf-8") if isinstance(corpo, bytes) else corpo,
            }
        )

    def getresponse(self):
        assert ConexaoFalsa.fila, "a SEFAZ foi chamada mais vezes do que o teste previu"
        item = ConexaoFalsa.fila.pop(0)
        if isinstance(item, tuple):
            return _RespostaHttp(item[0], item[1])
        return _RespostaHttp(200, item)

    def close(self) -> None:
        pass


@pytest.fixture
def sefaz_falsa(monkeypatch):
    ConexaoFalsa.fila = []
    ConexaoFalsa.enviados = []
    monkeypatch.setattr("http.client.HTTPSConnection", ConexaoFalsa)
    return ConexaoFalsa


@pytest.fixture
def cliente() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def certificado(pfx_de_teste) -> dict:
    """Envelope real, selado pela custódia do serviço (KEK → DEK → .pfx)."""
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA)
    return {
        "pfxCifradoB64": envelope.pfx_cifrado_b64,
        "dekEnvelopadaB64": envelope.dek_envelopada_b64,
        "senhaCifradaB64": envelope.senha_cifrada_b64,
        "nonceB64": envelope.nonce_b64,
        "algoritmo": envelope.algoritmo,
    }


def _corpo(certificado: dict, **extra) -> dict:
    base = {"empresaId": EMPRESA, "ambiente": 2, "certificado": certificado}
    base.update(extra)
    return base


def _auth() -> dict:
    return {"Authorization": f"Bearer {TOKEN}"}


def _docz(xml: str) -> str:
    return base64.b64encode(gzip.compress(xml.encode())).decode()


def _dist(cstat: int, ult: str, maximo: str, docs: str = "") -> str:
    return f"""<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeDistDFeInteresseResponse xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe">
<nfeDistDFeInteresseResult>
<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">
<tpAmb>2</tpAmb><verAplic>1.0</verAplic><cStat>{cstat}</cStat>
<xMotivo>Documento(s) localizado(s)</xMotivo>
<ultNSU>{ult}</ultNSU><maxNSU>{maximo}</maxNSU>
<loteDistDFeInt>{docs}</loteDistDFeInt>
</retDistDFeInt></nfeDistDFeInteresseResult>
</nfeDistDFeInteresseResponse></soap:Body></soap:Envelope>"""


def _doczip(nsu: str, xml: str) -> str:
    return f'<docZip NSU="{nsu}" schema="procNFe_v4.00.xsd">{_docz(xml)}</docZip>'


def _evento(cstat: int, motivo: str, protocolo: str = "") -> str:
    prot = f"<nProt>{protocolo}</nProt>" if protocolo else ""
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>
<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeRecepcaoEvento4">
<retEnvEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.00">
<idLote>1</idLote><tpAmb>2</tpAmb><cOrgao>91</cOrgao>
<cStat>128</cStat><xMotivo>Lote processado</xMotivo>
<retEvento versao="1.00"><infEvento><cOrgao>91</cOrgao>
<cStat>{cstat}</cStat><xMotivo>{motivo}</xMotivo><chNFe>{CHAVE}</chNFe>
<tpEvento>210210</tpEvento><nSeqEvento>1</nSeqEvento>
<dhRegEvento>2026-09-24T10:00:00-03:00</dhRegEvento>{prot}
</infEvento></retEvento></retEnvEvento></nfeResultMsg></soap:Body></soap:Envelope>"""


# -----------------------------------------------------------------------------
# Portão de entrada
# -----------------------------------------------------------------------------


@pytest.mark.parametrize("rota", ROTAS)
def test_rota_nova_nasce_protegida_e_401_nao_conta_nada(cliente, rota):
    resposta = cliente.post(rota, json={})
    assert resposta.status_code == 401
    assert resposta.content == b""          # nem "token ausente", nem "inválido"


@pytest.mark.parametrize("rota", ROTAS)
def test_token_errado_nao_passa(cliente, rota):
    resposta = cliente.post(rota, json={}, headers={"Authorization": "Bearer nao-e-o-token"})
    assert resposta.status_code == 401


# -----------------------------------------------------------------------------
# Distribuição
# -----------------------------------------------------------------------------


def test_distribuicao_devolve_nota_cursor_e_manda_o_cuf_certo(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = [_dist(138, "000000000000676", "000000000000676", _doczip("000000000000676", PROC))]

    resposta = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=675),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()

    assert corpo["cStat"] == 138
    assert corpo["ultNsu"] == "000000000000676"     # é ISTO que vai pro cursor
    assert corpo["maxNsu"] == "000000000000676"
    assert corpo["filaDrenada"] is True
    assert corpo["parcial"] is False
    assert len(corpo["documentos"]) == 1

    nota = corpo["documentos"][0]
    # camelCase no fio: a edge lê estes nomes, não os do Python.
    assert nota["chave"] == CHAVE
    assert nota["emitenteCnpj"] == "65256296000151"
    assert nota["situacaoSefaz"] == "autorizada"
    assert nota["cfopPrincipal"] == "5102"
    assert nota["resumo"] is False

    # O cUF veio da tabela estática do serviço, não de banco nenhum.
    enviado = sefaz_falsa.enviados[0]
    assert "<cUFAutor>35</cUFAutor>" in enviado["corpo"]
    assert f"<CNPJ>{CNPJ}</CNPJ>" in enviado["corpo"]
    assert "<ultNSU>000000000000675</ultNSU>" in enviado["corpo"]
    assert enviado["caminho"].endswith("NFeDistribuicaoDFe.asmx")


def test_137_encerra_a_rodada_sem_pedir_de_novo(cliente, certificado, sefaz_falsa):
    """Repetir depois de 'nada novo' antes de 1 hora é o gatilho do 656."""
    sefaz_falsa.fila = [_dist(137, "000000000000676", "000000000000676")]

    corpo = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=676, maxPaginas=5),
    ).json()

    assert corpo["cStat"] == 137
    assert corpo["filaDrenada"] is True
    assert corpo["documentos"] == []
    assert len(sefaz_falsa.enviados) == 1          # NÃO insistiu


def test_evento_na_fila_e_contado_e_nao_vira_nota(cliente, certificado, sefaz_falsa):
    evento = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<resEvento xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">'
        f"<chNFe>{CHAVE}</chNFe><tpEvento>210210</tpEvento></resEvento>"
    )
    sefaz_falsa.fila = [
        _dist(
            138,
            "000000000000677",
            "000000000000677",
            _doczip("000000000000677", evento),
        )
    ]

    corpo = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=676),
    ).json()

    assert corpo.get("documentos", []) == []
    assert corpo["eventosIgnorados"] == 1
    assert corpo["ultNsu"] == "000000000000677"    # o cursor anda mesmo assim


def test_consumo_indevido_na_primeira_pagina_sai_429_com_o_nsu_da_sefaz(
    cliente, certificado, sefaz_falsa
):
    """O 656 carrega o ultNSU/maxNSU correntes — é o ÚNICO jeito de descobrir
    que o nosso cursor ficou pra trás. Sem repassar, a fila trava pra sempre."""
    sefaz_falsa.fila = [_dist(656, "000000000000900", "000000000000950")]

    resposta = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=100),
    )
    assert resposta.status_code == 429
    corpo = resposta.json()
    assert corpo["erro"]["codigo"] == "consumo_indevido"
    assert "1 hora" in corpo["erro"]["mensagem"]
    assert corpo["detalhe"]["ultNsu"] == "000000000000900"
    assert corpo["detalhe"]["maxNsu"] == "000000000000950"


def test_falha_no_meio_da_rodada_devolve_200_parcial_com_o_cursor_avancado(
    cliente, certificado, sefaz_falsa
):
    """A GARANTIA MAIS IMPORTANTE DESTE ARQUIVO.

    A página 1 já foi servida pela SEFAZ: aqueles NSU saíram da fila. Se a falha
    da página 2 virasse um erro HTTP, a edge descartaria o avanço, a rodada
    seguinte repetiria NSU já servido e o CNPJ tomaria 1 hora de bloqueio.
    """
    sefaz_falsa.fila = [
        _dist(138, "000000000000676", "000000000000900", _doczip("000000000000676", PROC)),
        _dist(656, "000000000000676", "000000000000900"),
    ]

    resposta = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=675, maxPaginas=3),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()

    assert corpo["parcial"] is True
    assert corpo["ultNsu"] == "000000000000676"     # GRAVAR ISTO É OBRIGATÓRIO
    assert len(corpo["documentos"]) == 1
    assert corpo["aviso"]["codigo"] == "consumo_indevido"
    assert corpo["filaDrenada"] is False


def test_teto_de_paginas_devolve_parcial_em_vez_de_varrer_a_fila_toda(
    cliente, certificado, sefaz_falsa
):
    sefaz_falsa.fila = [
        _dist(138, "000000000000676", "000000000009999", _doczip("000000000000676", PROC)),
    ]

    corpo = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=675, maxPaginas=1),
    ).json()

    assert corpo["parcial"] is True
    assert corpo["filaDrenada"] is False
    assert corpo["paginas"] == 1


def test_uf_invalida_nao_chega_a_falar_com_a_sefaz(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = []
    resposta = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="ZZ", ultimoNsu=0),
    )
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "dados_invalidos"
    assert sefaz_falsa.enviados == []


def test_cnpj_torto_nao_chega_a_falar_com_a_sefaz(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = []
    resposta = cliente.post(
        "/v1/dfe/distribuicao",
        headers=_auth(),
        json=_corpo(certificado, cnpj="123", uf="SP", ultimoNsu=0),
    )
    assert resposta.status_code == 422
    assert sefaz_falsa.enviados == []


# -----------------------------------------------------------------------------
# Consulta por chave (diagnóstico)
# -----------------------------------------------------------------------------


def test_consulta_por_chave_nao_devolve_cursor(cliente, certificado, sefaz_falsa):
    """consChNFe NÃO é cursor. Gravar o ultNSU daqui como ponteiro da fila faria
    a distribuição seguinte PULAR documentos que nunca foram lidos."""
    sefaz_falsa.fila = [
        _dist(138, "000000000000676", "000000000000900", _doczip("000000000000676", PROC))
    ]

    resposta = cliente.post(
        "/v1/dfe/consulta-chave",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", chave=CHAVE),
    )
    assert resposta.status_code == 200, resposta.text
    corpo = resposta.json()
    # Omitido, não vazio: a coluna dfe_sync_state.ultimo_nsu tem CHECK de 15
    # dígitos, então string vazia gravada por engano viraria erro de banco.
    assert "ultNsu" not in corpo
    assert len(corpo["documentos"]) == 1
    assert f"<chNFe>{CHAVE}</chNFe>" in sefaz_falsa.enviados[0]["corpo"]
    assert "<distNSU>" not in sefaz_falsa.enviados[0]["corpo"]


def test_chave_nao_viaja_na_url(cliente, certificado, sefaz_falsa):
    """A chave identifica a operação comercial do cliente e o log de acesso do
    Caddy guarda a URL inteira (e vai pro snapshot semanal da Hostinger)."""
    sefaz_falsa.fila = [_dist(138, "000000000000676", "000000000000900")]
    resposta = cliente.post(
        "/v1/dfe/consulta-chave",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, uf="SP", chave=CHAVE),
    )
    assert CHAVE not in str(resposta.request.url)


# -----------------------------------------------------------------------------
# Manifestação
# -----------------------------------------------------------------------------


def test_manifestacao_registrada_devolve_protocolo(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = [_evento(135, "Evento registrado", "135260000000001")]

    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="ciencia", idLote="42"),
    )
    assert resposta.status_code == 201, resposta.text
    corpo = resposta.json()
    assert corpo["status"] == "registrada"
    assert corpo["tipoEvento"] == "210210"
    assert corpo["protocolo"] == "135260000000001"
    assert corpo["duplicada"] is False
    assert "<envEvento" in corpo["xml"]

    enviado = sefaz_falsa.enviados[0]
    assert enviado["caminho"].endswith("NFeRecepcaoEvento4.asmx")
    assert "<idLote>42</idLote>" in enviado["corpo"]


def test_duplicidade_573_e_sucesso_nao_erro(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = [_evento(573, "Duplicidade de evento")]

    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="confirmada"),
    )
    assert resposta.status_code == 201
    assert resposta.json()["duplicada"] is True


def test_rejeicao_definitiva_sai_422_com_mensagem_em_ptbr(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = [_evento(236, "Rejeicao: Chave de Acesso com digito verificador invalido")]

    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="confirmada"),
    )
    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["erro"]["codigo"] == "manifestacao_rejeitada"
    assert corpo["erro"]["mensagem"].startswith("A SEFAZ recusou a manifestação")
    assert corpo["detalhe"]["cStat"] == 236


def test_rejeicao_transitoria_sai_503_para_a_fila_tentar_de_novo(
    cliente, certificado, sefaz_falsa
):
    sefaz_falsa.fila = [_evento(108, "Servico paralisado momentaneamente")]

    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="confirmada"),
    )
    assert resposta.status_code == 503
    assert resposta.json()["erro"]["codigo"] == "servico_indisponivel"


def test_tipo_desconhecido_nao_chega_a_falar_com_a_sefaz(cliente, certificado, sefaz_falsa):
    sefaz_falsa.fila = []
    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="devolvida"),
    )
    assert resposta.status_code == 422
    assert sefaz_falsa.enviados == []


def test_nao_realizada_sem_justificativa_nao_chega_a_falar_com_a_sefaz(
    cliente, certificado, sefaz_falsa
):
    """Evento irreversível: barrar antes de sair byte, não depois da rejeição."""
    sefaz_falsa.fila = []
    resposta = cliente.post(
        "/v1/dfe/manifestar",
        headers=_auth(),
        json=_corpo(certificado, cnpj=CNPJ, chave=CHAVE, tipo="nao_realizada"),
    )
    assert resposta.status_code == 422
    assert sefaz_falsa.enviados == []


def test_certificado_de_outra_empresa_nao_abre(cliente, certificado, sefaz_falsa):
    """A AAD da custódia amarra o envelope à empresa: o material da empresa A
    não decifra no slot da empresa B, mesmo com a mesma KEK."""
    sefaz_falsa.fila = []
    corpo = _corpo(certificado, cnpj=CNPJ, uf="SP", ultimoNsu=0)
    corpo["empresaId"] = "00000000-0000-4000-8000-000000000000"

    resposta = cliente.post("/v1/dfe/distribuicao", headers=_auth(), json=corpo)
    assert resposta.status_code == 422
    assert resposta.json()["erro"]["codigo"] == "certificado_invalido"
    assert sefaz_falsa.enviados == []
