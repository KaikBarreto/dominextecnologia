"""Contrato HTTP: auth, ciclo de custódia ponta a ponta e tradução de erro.

Nenhuma chamada real ao governo: o transporte é substituído por um dublê. O que
se prova aqui é o que a edge function enxerga.
"""

from __future__ import annotations

import base64
import gzip
import json
import os

import pytest
from fastapi.testclient import TestClient

from app.config import get_config
from app.main import app
from tests.test_armadilhas import CHAVE, CORPO_BASE

TOKEN = os.environ["FISCAL_SERVICE_TOKEN"]
EMPRESA = "7a1b3c4d-0000-4000-8000-abcdefabcdef"

NFSE_XML = (
    '<?xml version="1.0" encoding="UTF-8"?>'
    '<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse" versao="1.00">'
    f'<infNFSe Id="NFS{CHAVE}">'
    "<nNFSe>23</nNFSe><dhProc>2026-09-03T10:00:00-03:00</dhProc>"
    "</infNFSe></NFSe>"
).encode("utf-8")


@pytest.fixture
def cliente() -> TestClient:
    return TestClient(app)


class RespostaFalsa:
    def __init__(self, status: int, corpo: dict) -> None:
        self.status_code = status
        self._corpo = corpo
        self.content = json.dumps(corpo).encode()

    def json(self) -> dict:
        return self._corpo


@pytest.fixture
def sefin_falso(monkeypatch):
    """Substitui o transporte. Guarda o que foi enviado para inspeção."""
    enviados: list = []

    def fake(metodo, url, **kwargs):
        enviados.append({"metodo": metodo, "url": url, "json": kwargs.get("json")})
        if url.endswith("/nfse"):
            return RespostaFalsa(
                201,
                {
                    "tipoAmbiente": 2,
                    "chaveAcesso": CHAVE,
                    "idDps": "DPS...",
                    "nfseXmlGZipB64": base64.b64encode(gzip.compress(NFSE_XML)).decode(),
                },
            )
        if url.endswith("/eventos"):
            return RespostaFalsa(
                201,
                {"tipoAmbiente": 2, "eventoXmlGZipB64": base64.b64encode(
                    gzip.compress(b'<evento><tpEvento>101101</tpEvento></evento>')
                ).decode()},
            )
        return RespostaFalsa(404, {})

    monkeypatch.setattr("app.sefin.client.requests.request", fake)
    return enviados


# -----------------------------------------------------------------------------
# Auth
# -----------------------------------------------------------------------------


def test_healthz_nao_exige_token(cliente):
    resposta = cliente.get("/healthz")
    assert resposta.status_code == 200
    assert resposta.json() == {"ok": True}


@pytest.mark.parametrize(
    "metodo,caminho",
    [
        ("post", "/v1/nfse/emitir"),
        ("post", f"/v1/nfse/{CHAVE}/cancelar"),
        ("post", f"/v1/nfse/{CHAVE}/consultar"),
        ("post", "/v1/certificado/selar"),
        ("get", "/readyz"),
    ],
)
def test_sem_token_401_sem_pista(cliente, metodo, caminho):
    chamada = getattr(cliente, metodo)
    resposta = chamada(caminho) if metodo == "get" else chamada(caminho, json={})
    assert resposta.status_code == 401
    # Sem corpo: quem não tem o segredo não descobre nem que serviço é este.
    assert resposta.content == b""


def test_token_errado_tambem_401(cliente):
    resposta = cliente.post(
        "/v1/nfse/emitir", json={}, headers={"Authorization": "Bearer nao-e-o-token"}
    )
    assert resposta.status_code == 401


# -----------------------------------------------------------------------------
# Ciclo completo: selar → emitir → cancelar
# -----------------------------------------------------------------------------


def _selar(cliente, pfx: bytes, senha: str) -> dict:
    resposta = cliente.post(
        "/v1/certificado/selar",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={
            "empresaId": EMPRESA,
            "pfxB64": base64.b64encode(pfx).decode(),
            "senha": senha,
        },
    )
    assert resposta.status_code == 200, resposta.text
    return resposta.json()


def test_selar_devolve_so_material_cifrado(cliente, pfx_de_teste):
    pfx, senha = pfx_de_teste
    corpo = _selar(cliente, pfx, senha)

    assert set(corpo["certificado"]) == {
        "pfxCifradoB64",
        "dekEnvelopadaB64",
        "senhaCifradaB64",
        "nonceB64",
        "algoritmo",
    }
    # ⚠️ A edge NÃO pode receber DEK, KEK nem a senha em claro.
    texto = json.dumps(corpo)
    assert senha not in texto
    assert base64.b64encode(pfx).decode() not in texto
    # Resolve o certificate_expires_at que hoje fica sempre nulo.
    assert corpo["validadeAte"]
    assert corpo["cnpj"] == "12345678000199"


def test_selar_recusa_senha_errada(cliente, pfx_de_teste):
    pfx, _senha = pfx_de_teste
    resposta = cliente.post(
        "/v1/certificado/selar",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={"empresaId": EMPRESA, "pfxB64": base64.b64encode(pfx).decode(), "senha": "errada"},
    )
    assert resposta.status_code == 422
    assert "senha" in resposta.json()["erro"]["mensagem"].lower()


def test_emitir_usa_o_certificado_selado_e_devolve_status_canonico(
    cliente, pfx_de_teste, sefin_falso
):
    pfx, senha = pfx_de_teste
    certificado = _selar(cliente, pfx, senha)["certificado"]

    corpo = {**CORPO_BASE, "empresaId": EMPRESA, "certificado": certificado}
    resposta = cliente.post(
        "/v1/nfse/emitir",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json=corpo,
    )

    assert resposta.status_code == 201, resposta.text
    dados = resposta.json()
    # Status já sai no vocabulário PT-BR do Dominex: a edge não traduz nada.
    assert dados["status"] == "autorizada"
    assert dados["chaveAcesso"] == CHAVE
    assert dados["numero"] == "23"
    assert dados["xml"].startswith("<?xml")

    # E o que foi transmitido é a DPS assinada, comprimida.
    enviado = sefin_falso[0]
    assert enviado["metodo"] == "POST"
    assert enviado["url"].endswith("/nfse")
    dps = gzip.decompress(base64.b64decode(enviado["json"]["dpsXmlGZipB64"]))
    assert b"Signature" in dps
    assert b"cTribMun" in dps


def test_certificado_de_outra_empresa_nao_emite(cliente, pfx_de_teste, sefin_falso):
    """Prova de isolamento: o envelope é amarrado ao company_id."""
    pfx, senha = pfx_de_teste
    certificado = _selar(cliente, pfx, senha)["certificado"]

    corpo = {
        **CORPO_BASE,
        "empresaId": "00000000-0000-4000-8000-999999999999",
        "certificado": certificado,
    }
    resposta = cliente.post(
        "/v1/nfse/emitir", headers={"Authorization": f"Bearer {TOKEN}"}, json=corpo
    )

    assert resposta.status_code == 422
    assert not sefin_falso, "não pode ter chegado a falar com o governo"


def test_cancelar_devolve_cancelada(cliente, pfx_de_teste, sefin_falso):
    pfx, senha = pfx_de_teste
    certificado = _selar(cliente, pfx, senha)["certificado"]

    resposta = cliente.post(
        f"/v1/nfse/{CHAVE}/cancelar",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={
            "empresaId": EMPRESA,
            "ambiente": 2,
            "certificado": certificado,
            "cnpjAutor": "34901457000199",
            "motivo": "Emissao em duplicidade identificada pelo setor fiscal.",
        },
    )

    assert resposta.status_code == 201, resposta.text
    assert resposta.json()["status"] == "cancelada"
    evento = gzip.decompress(
        base64.b64decode(sefin_falso[0]["json"]["pedidoRegistroEventoXmlGZipB64"])
    )
    assert b"nPedRegEvento" not in evento  # armadilha 6, no caminho real


def test_rejeicao_do_governo_vira_mensagem_ptbr(cliente, pfx_de_teste, monkeypatch):
    pfx, senha = pfx_de_teste
    certificado = _selar(cliente, pfx, senha)["certificado"]

    def rejeita(metodo, url, **kwargs):
        return RespostaFalsa(
            422,
            {
                "erros": [
                    {
                        "codigo": "E0312",
                        "descricao": "Codigo de tributacao nacional nao administrado pelo municipio",
                    }
                ]
            },
        )

    monkeypatch.setattr("app.sefin.client.requests.request", rejeita)

    resposta = cliente.post(
        "/v1/nfse/emitir",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={**CORPO_BASE, "empresaId": EMPRESA, "certificado": certificado},
    )

    assert resposta.status_code == 422
    erro = resposta.json()["erro"]
    assert erro["codigo"] == "E0312"
    # Mensagem acionável, em PT-BR, sem citar endpoint nem biblioteca.
    assert erro["mensagem"].startswith("A prefeitura recusou a nota fiscal")
    assert "sefin.nfse.gov.br" not in json.dumps(resposta.json())


def test_producao_bloqueada_recusa_ambiente_1(cliente, pfx_de_teste, monkeypatch, sefin_falso):
    """Servidor liberado só para homologação NÃO pode emitir em produção — e
    muito menos redirecionar em silêncio (o cliente acharia que emitiu)."""
    cfg = get_config()
    monkeypatch.setattr(cfg.__class__, "producao_bloqueada", property(lambda self: True))
    pfx, senha = pfx_de_teste
    certificado = _selar(cliente, pfx, senha)["certificado"]

    resposta = cliente.post(
        "/v1/nfse/emitir",
        headers={"Authorization": f"Bearer {TOKEN}"},
        json={**CORPO_BASE, "empresaId": EMPRESA, "ambiente": 1, "certificado": certificado},
    )

    assert resposta.status_code == 503
    assert not sefin_falso


def test_aliases_camelcase_do_contrato_funcionam():
    """Seguro contra drift de versão do pydantic: se o alias parar de valer, a
    edge passa a receber 422 em tudo. Melhor descobrir aqui."""
    from app.schemas import CancelarRequest, SelarCertificadoRequest

    selar = SelarCertificadoRequest.model_validate(
        {"empresaId": EMPRESA, "pfxB64": "eA==", "senha": "s"}
    )
    assert selar.empresa_id == EMPRESA and selar.pfx_b64 == "eA=="

    cancelar = CancelarRequest.model_validate(
        {
            "empresaId": EMPRESA,
            "ambiente": 1,
            "certificado": {
                "pfxCifradoB64": "a",
                "dekEnvelopadaB64": "b",
                "senhaCifradaB64": "c",
                "nonceB64": "d",
            },
            "cnpjAutor": "34901457000199",
            "motivo": "m" * 20,
            "codigoMotivo": "2",
        }
    )
    assert cancelar.cnpj_autor == "34901457000199"
    assert cancelar.codigo_motivo == "2"
    assert cancelar.certificado.dek_envelopada_b64 == "b"


def test_autoteste_cobre_as_armadilhas(cliente):
    resposta = cliente.get(
        "/v1/nfse/autoteste", headers={"Authorization": f"Bearer {TOKEN}"}
    )
    assert resposta.status_code == 200
    assert resposta.json() == {"ok": True, "problemas": []}
