"""Contrato HTTP da NFS-e recebida — é contra isto que a edge function é escrita.

Nenhuma chamada real ao governo: o `http.client.HTTPSConnection` é substituído por
um dublê. O ciclo de custódia é REAL (selar → abrir → PEM em tmpfs → contexto
TLS), porque é justamente ele que a decisão D1 preserva.
"""

from __future__ import annotations

import json
import os

import pytest
from fastapi.testclient import TestClient

from app.custodia import selar
from app.main import app
from tests.test_adn_documento import CHAVE, PRESTADOR, TOMADOR, _evento, _item, _nfse

TOKEN = os.environ["FISCAL_SERVICE_TOKEN"]
EMPRESA = "7a1b3c4d-0000-4000-8000-abcdefabcdef"
ROTA = "/v1/dfe/nfse/distribuicao"


# -----------------------------------------------------------------------------
# Dublê do transporte REST
# -----------------------------------------------------------------------------


class _RespostaHttp:
    def __init__(self, status: int, corpo: str, cabecalhos: dict | None = None) -> None:
        self.status = status
        self.reason = "OK"
        self._corpo = corpo.encode("utf-8")
        self.headers = cabecalhos or {}

    def read(self, quantidade: int | None = None) -> bytes:
        if quantidade is None:
            return self._corpo
        return self._corpo[:quantidade]


class ConexaoFalsa:
    fila: list = []
    enviados: list = []

    def __init__(self, host, port=443, context=None, timeout=None) -> None:
        self.host = host

    def request(self, metodo, caminho, corpo=None, headers=None) -> None:
        ConexaoFalsa.enviados.append(
            {"host": self.host, "metodo": metodo, "caminho": caminho, "headers": headers or {}}
        )

    def getresponse(self):
        assert ConexaoFalsa.fila, "o ADN foi chamado mais vezes do que o teste previu"
        item = ConexaoFalsa.fila.pop(0)
        if isinstance(item, tuple):
            return _RespostaHttp(*item)
        return _RespostaHttp(200, item)

    def close(self) -> None:
        pass


@pytest.fixture
def adn_falso(monkeypatch):
    ConexaoFalsa.fila = []
    ConexaoFalsa.enviados = []
    monkeypatch.setattr("http.client.HTTPSConnection", ConexaoFalsa)
    return ConexaoFalsa


@pytest.fixture
def cliente() -> TestClient:
    return TestClient(app)


@pytest.fixture(scope="module")
def certificado(pfx_de_teste) -> dict:
    pfx, senha = pfx_de_teste
    envelope = selar(pfx, senha, EMPRESA)
    return {
        "pfxCifradoB64": envelope.pfx_cifrado_b64,
        "dekEnvelopadaB64": envelope.dek_envelopada_b64,
        "senhaCifradaB64": envelope.senha_cifrada_b64,
        "nonceB64": envelope.nonce_b64,
        "algoritmo": envelope.algoritmo,
    }


def _auth() -> dict:
    return {"Authorization": f"Bearer {TOKEN}"}


def _corpo(certificado: dict, **extra) -> dict:
    base = {
        "empresaId": EMPRESA,
        "ambiente": 2,
        "certificado": certificado,
        "cnpj": TOMADOR,
    }
    base.update(extra)
    return base


def _lote(*itens, status: str = "DOCUMENTOS_LOCALIZADOS", **extra) -> str:
    envelope = {
        "StatusProcessamento": status,
        "TipoAmbiente": "HOMOLOGACAO",
        "VersaoAplicativo": "1.0.0",
        "DataHoraProcessamento": "2026-09-24T10:00:00-03:00",
        "LoteDFe": [
            {
                "NSU": item.nsu,
                "ChaveAcesso": item.chave_acesso,
                "TipoDocumento": item.tipo_documento,
                "TipoEvento": item.tipo_evento or None,
                "ArquivoXml": item.arquivo_xml_b64,
                "DataHoraGeracao": item.data_hora_geracao,
            }
            for item in itens
        ],
    }
    envelope.update(extra)
    return json.dumps(envelope)


def _vazio() -> str:
    return _lote(status="NENHUM_DOCUMENTO_LOCALIZADO")


# -----------------------------------------------------------------------------
# Portão de entrada
# -----------------------------------------------------------------------------


def test_rota_nova_nasce_protegida_e_401_nao_conta_nada(cliente):
    resposta = cliente.post(ROTA, json={})
    assert resposta.status_code == 401
    assert resposta.content == b""


def test_token_errado_nao_passa(cliente):
    resposta = cliente.post(
        ROTA, json={}, headers={"Authorization": "Bearer nao-e-o-token"}
    )
    assert resposta.status_code == 401


def test_toda_rota_de_dfe_registrada_exige_token(cliente):
    """⚠️ GUARDA DE INVENTÁRIO, não teste de rota. Varre o que está REGISTRADO em
    vez de uma lista escrita à mão, pra que a próxima rota de DF-e — de NF-e, de
    NFS-e ou do que vier — não possa nascer aberta e passar despercebida."""
    caminhos = [p for p in app.openapi()["paths"] if p.startswith("/v1/dfe/")]
    assert ROTA in caminhos, "a rota de NFS-e sumiu do inventário"
    for caminho in caminhos:
        assert cliente.post(caminho, json={}).status_code == 401, caminho


# -----------------------------------------------------------------------------
# Rodada feliz
# -----------------------------------------------------------------------------


def test_rodada_devolve_a_nota_recebida_e_o_cursor(cliente, certificado, adn_falso):
    adn_falso.fila = [_lote(_item(_nfse(), nsu=17)), _vazio()]

    resposta = cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=0, maxPaginas=3), headers=_auth()
    )
    assert resposta.status_code == 200
    corpo = resposta.json()

    assert corpo["status"] == "DOCUMENTOS_LOCALIZADOS"
    # 15 dígitos com zeros à esquerda — o formato que dfe_sync_state.ultimo_nsu exige.
    assert corpo["ultimoNsu"] == "000000000000017"
    assert len(corpo["ultimoNsu"]) == 15
    assert corpo["filaDrenada"] is True
    assert corpo["parcial"] is False

    (nota,) = corpo["documentos"]
    assert nota["chaveAcesso"] == CHAVE
    assert nota["direcao"] == "recebida"
    assert nota["tomadorDocumento"] == TOMADOR
    assert nota["prestadorDocumento"] == PRESTADOR
    assert nota["valorServico"] == 1000.0
    assert nota["valorLiquido"] == 950.0
    assert nota["issRetido"] is True
    assert nota["situacao"] == "autorizada"
    assert nota["xml"].startswith("<?xml")


def test_o_nsu_pedido_e_o_ultimo_consumido_e_nunca_ele_mais_um(
    cliente, certificado, adn_falso
):
    """⚠️ INVARIANTE. A documentação oficial descreve a operação como INCLUSIVA,
    mas não de forma normativa. Pedir `ultimo + 1` pularia pra sempre a nota que
    estivesse exatamente nessa posição, caso a semântica real fosse exclusiva.
    Pedir o mesmo NSU devolve no máximo um documento repetido — que o upsert por
    `chave_natural` deduplica. Entre repetir e perder nota, repete."""
    adn_falso.fila = [_vazio()]

    cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=680), headers=_auth()
    )
    (enviado,) = adn_falso.enviados
    assert enviado["caminho"].startswith("/contribuintes/DFe/680?")
    assert "/681" not in enviado["caminho"]


def test_o_cnpj_vai_na_query_do_adn_mas_nunca_na_url_de_quem_chama(
    cliente, certificado, adn_falso
):
    """O CNPJ viaja no CORPO do POST (fora do log do Caddy) e só entra na URL da
    chamada de saída, que é conversa entre a VPS e o governo."""
    adn_falso.fila = [_vazio()]
    cliente.post(ROTA, json=_corpo(certificado), headers=_auth())

    (enviado,) = adn_falso.enviados
    assert f"cnpjConsulta={TOMADOR}" in enviado["caminho"]
    assert "lote=true" in enviado["caminho"]
    assert enviado["metodo"] == "GET"
    # Sem Accept-Encoding: o teto de tamanho tem que medir bytes DESCOMPRIMIDOS.
    assert "Accept-Encoding" not in enviado["headers"]


def test_varias_paginas_avancam_o_cursor_pelo_maior_nsu_do_lote(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [
        _lote(_item(_nfse(), nsu=10), _item(_nfse(), nsu=12)),
        _lote(_item(_nfse(), nsu=31)),
        _vazio(),
    ]
    corpo = cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=0, maxPaginas=5), headers=_auth()
    ).json()

    assert corpo["paginas"] == 3
    assert corpo["ultimoNsu"] == "000000000000031"
    assert corpo["filaDrenada"] is True
    assert [e["caminho"].split("?")[0] for e in adn_falso.enviados] == [
        "/contribuintes/DFe/0",
        "/contribuintes/DFe/12",
        "/contribuintes/DFe/31",
    ]


def test_feed_que_nao_avanca_encerra_a_rodada_em_vez_de_pedir_a_mesma_pagina(
    cliente, certificado, adn_falso
):
    """Com NSU inclusivo, a última página devolve de volta o documento que já
    tínhamos. Insistir pediria a mesma página pra sempre."""
    adn_falso.fila = [_lote(_item(_nfse(), nsu=55))]

    corpo = cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=55, maxPaginas=5), headers=_auth()
    ).json()

    assert len(adn_falso.enviados) == 1
    assert corpo["filaDrenada"] is True
    assert corpo["ultimoNsu"] == "000000000000055"


# -----------------------------------------------------------------------------
# Classificação do feed
# -----------------------------------------------------------------------------


def test_nota_emitida_pela_empresa_nao_vira_despesa_mas_faz_o_cursor_andar(
    cliente, certificado, adn_falso
):
    """⚠️ O feed do ADN traz emitidas e recebidas MISTURADAS. Deixar a emitida
    entrar em `inbound_nfse` lançaria como despesa um serviço que a empresa
    VENDEU. E descartá-la sem avançar o cursor releria o feed pra sempre."""
    adn_falso.fila = [
        _lote(_item(_nfse(tomador="99999999000191"), nsu=21)),
        _vazio(),
    ]
    corpo = cliente.post(
        ROTA,
        json=_corpo(certificado, cnpj=PRESTADOR, ultimoNsu=0),
        headers=_auth(),
    ).json()

    assert corpo["documentos"] == []
    assert corpo["emitidasIgnoradas"] == 1
    assert corpo["ultimoNsu"] == "000000000000021"


def test_somenteRecebidas_false_traz_as_duas_pontas_com_a_direcao_marcada(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [_lote(_item(_nfse(), nsu=21)), _vazio()]
    corpo = cliente.post(
        ROTA,
        json=_corpo(certificado, cnpj=PRESTADOR, somenteRecebidas=False),
        headers=_auth(),
    ).json()

    (nota,) = corpo["documentos"]
    assert nota["direcao"] == "emitida"


def test_evento_de_cancelamento_sai_em_lista_propria_e_nao_como_nota(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [
        _lote(_item(_evento(), nsu=30, tipo="EVENTO", tipo_evento="CANCELAMENTO")),
        _vazio(),
    ]
    corpo = cliente.post(ROTA, json=_corpo(certificado), headers=_auth()).json()

    assert corpo["documentos"] == []
    (evento,) = corpo["eventos"]
    assert evento["chaveAcesso"] == CHAVE
    assert evento["situacaoSugerida"] == "cancelada"
    assert corpo["ultimoNsu"] == "000000000000030"


def test_documento_ilegivel_e_contado_e_nao_impede_os_outros(
    cliente, certificado, adn_falso
):
    quebrado = _item(_nfse(), nsu=40)
    quebrado.arquivo_xml_b64 = "isso-nao-e-base64!!"
    adn_falso.fila = [_lote(quebrado, _item(_nfse(), nsu=41)), _vazio()]

    corpo = cliente.post(ROTA, json=_corpo(certificado), headers=_auth()).json()

    assert corpo["ilegiveis"] == 1
    assert len(corpo["documentos"]) == 1
    assert corpo["ultimoNsu"] == "000000000000041"


# -----------------------------------------------------------------------------
# Falhas
# -----------------------------------------------------------------------------


def test_429_na_primeira_pagina_sai_429_com_o_retry_after_do_governo(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [(429, "", {"Retry-After": "900"})]

    resposta = cliente.post(ROTA, json=_corpo(certificado), headers=_auth())
    assert resposta.status_code == 429
    corpo = resposta.json()
    assert corpo["erro"]["codigo"] == "consumo_indevido"
    assert corpo["detalhe"]["retryAfter"] == 900


def test_falha_no_meio_da_rodada_devolve_200_parcial_com_o_cursor_avancado(
    cliente, certificado, adn_falso
):
    """⚠️ INVARIANTE. Levantar aqui faria a edge DESCARTAR notas que já chegaram e
    varrer o mesmo trecho de novo na rodada seguinte — o caminho pro 429."""
    adn_falso.fila = [_lote(_item(_nfse(), nsu=12)), (503, "")]

    resposta = cliente.post(
        ROTA, json=_corpo(certificado, maxPaginas=3), headers=_auth()
    )
    assert resposta.status_code == 200
    corpo = resposta.json()

    assert corpo["parcial"] is True
    assert corpo["filaDrenada"] is False
    assert corpo["ultimoNsu"] == "000000000000012"
    assert len(corpo["documentos"]) == 1
    assert corpo["aviso"]["codigo"] == "servico_indisponivel"


def test_teto_de_paginas_devolve_parcial_em_vez_de_varrer_o_feed_inteiro(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [_lote(_item(_nfse(), nsu=5)), _lote(_item(_nfse(), nsu=9))]

    corpo = cliente.post(
        ROTA, json=_corpo(certificado, maxPaginas=2), headers=_auth()
    ).json()

    assert corpo["paginas"] == 2
    assert corpo["parcial"] is True
    assert corpo["filaDrenada"] is False
    assert corpo["ultimoNsu"] == "000000000000009"


def test_rejeicao_do_adn_sai_422_em_ptbr_sem_citar_endpoint(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [
        (
            200,
            json.dumps(
                {
                    "StatusProcessamento": "REJEICAO",
                    "Erros": [
                        {"Codigo": "E999", "Descricao": "Contribuinte nao habilitado"}
                    ],
                    "LoteDFe": [],
                }
            ),
        )
    ]

    resposta = cliente.post(ROTA, json=_corpo(certificado), headers=_auth())
    assert resposta.status_code == 422
    corpo = resposta.json()
    assert corpo["erro"]["codigo"] == "distribuicao_rejeitada"
    mensagem = corpo["erro"]["mensagem"]
    assert "adn.nfse.gov.br" not in mensagem
    assert "http" not in mensagem.lower()
    assert corpo["detalhe"]["erros"][0]["codigo"] == "E999"


def test_envelope_em_camelCase_nao_faz_a_rodada_voltar_vazia(
    cliente, certificado, adn_falso
):
    """⚠️ A pior falha possível desta rota não é erro: é rodada "bem-sucedida" com
    zero nota porque o serializador do governo trocou a caixa das chaves e todo
    `.get()` devolveu None em silêncio. A leitura é case-insensitive por isso."""
    item = _item(_nfse(), nsu=77)
    adn_falso.fila = [
        json.dumps(
            {
                "statusProcessamento": "DOCUMENTOS_LOCALIZADOS",
                "loteDFe": [
                    {
                        "nsu": item.nsu,
                        "chaveAcesso": item.chave_acesso,
                        "tipoDocumento": "NFSE",
                        "arquivoXml": item.arquivo_xml_b64,
                    }
                ],
            }
        ),
        _vazio(),
    ]

    corpo = cliente.post(ROTA, json=_corpo(certificado), headers=_auth()).json()
    assert len(corpo["documentos"]) == 1
    assert corpo["ultimoNsu"] == "000000000000077"


def test_alerta_do_governo_sobe_pra_resposta_em_vez_de_sumir_no_log(
    cliente, certificado, adn_falso
):
    adn_falso.fila = [
        _lote(
            _item(_nfse(), nsu=3),
            Alertas=[{"Codigo": "A1", "Descricao": "Consulta parcial"}],
        ),
        _vazio(),
    ]

    corpo = cliente.post(ROTA, json=_corpo(certificado), headers=_auth()).json()
    assert corpo["aviso"]["codigo"] == "alerta_governo"
    assert corpo["aviso"]["detalhe"]["alertas"][0]["codigo"] == "A1"


def test_404_do_adn_e_fim_de_feed_e_nao_erro(cliente, certificado, adn_falso):
    adn_falso.fila = [(404, "")]

    resposta = cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=99), headers=_auth()
    )
    assert resposta.status_code == 200
    corpo = resposta.json()
    assert corpo["filaDrenada"] is True
    assert corpo["parcial"] is False
    assert corpo["ultimoNsu"] == "000000000000099"


def test_cnpj_torto_nao_chega_a_falar_com_o_governo(cliente, certificado, adn_falso):
    adn_falso.fila = []

    resposta = cliente.post(
        ROTA, json=_corpo(certificado, cnpj="123"), headers=_auth()
    )
    assert resposta.status_code == 422
    assert adn_falso.enviados == []


def test_nsu_negativo_nao_chega_a_falar_com_o_governo(cliente, certificado, adn_falso):
    adn_falso.fila = []

    resposta = cliente.post(
        ROTA, json=_corpo(certificado, ultimoNsu=-1), headers=_auth()
    )
    assert resposta.status_code == 422
    assert adn_falso.enviados == []


def test_resposta_gigante_e_recusada_antes_de_virar_memoria(
    cliente, certificado, adn_falso, monkeypatch
):
    """512 MB de RAM na box são divididos com a EMISSÃO de NFS-e, que é o que
    paga a conta. Um corpo absurdo não pode levar o motor fiscal junto."""
    monkeypatch.setenv("ADN_LIMITE_RESPOSTA_MB", "1")
    adn_falso.fila = [(200, "x" * (2 * 1024 * 1024))]

    resposta = cliente.post(ROTA, json=_corpo(certificado), headers=_auth())
    assert resposta.status_code == 503


def test_certificado_de_outra_empresa_nao_abre(cliente, certificado, adn_falso):
    """O empresa_id é AAD do AES-GCM: o envelope de uma empresa não abre na outra."""
    adn_falso.fila = []
    corpo = _corpo(certificado)
    corpo["empresaId"] = "00000000-0000-4000-8000-000000000000"

    resposta = cliente.post(ROTA, json=corpo, headers=_auth())
    assert resposta.status_code >= 400
    assert adn_falso.enviados == []
