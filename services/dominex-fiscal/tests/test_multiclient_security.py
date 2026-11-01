from __future__ import annotations

import os
import json

from fastapi.testclient import TestClient

from app.config import ClienteFiscal, _carregar_clientes
from app.main import app
from app import security


LEGACY_TOKEN = os.environ["FISCAL_SERVICE_TOKEN"]
ECO_TOKEN = "eco-" + "x" * 48
OUTRO_TOKEN = "outro-" + "y" * 48


def _cliente(client_id: str, token: str, escopos: set[str], limite: int = 100):
    return ClienteFiscal(client_id, (token,), frozenset(escopos), limite)


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_token_legado_preserva_contrato(monkeypatch):
    security.limpar_rate_limit_para_testes()
    cliente = TestClient(app)
    resposta = cliente.get("/v1/nfse/autoteste", headers=_auth(LEGACY_TOKEN))
    assert resposta.status_code == 200
    assert resposta.headers["x-request-id"]


def test_cliente_leitura_nfse_nao_emite_nem_acessa_infra(monkeypatch):
    security.limpar_rate_limit_para_testes()
    monkeypatch.setattr(
        security,
        "clientes_configurados",
        lambda: (_cliente("ecosistema", ECO_TOKEN, {"nfse:read"}),),
    )
    cliente = TestClient(app)

    assert cliente.get("/v1/nfse/autoteste", headers=_auth(ECO_TOKEN)).status_code == 200
    negada = cliente.post("/v1/nfse/emitir", headers=_auth(ECO_TOKEN), json={})
    assert negada.status_code == 403
    assert negada.content == b""
    assert cliente.get("/readyz", headers=_auth(ECO_TOKEN)).status_code == 403


def test_token_de_um_cliente_nao_autentica_como_outro(monkeypatch):
    security.limpar_rate_limit_para_testes()
    monkeypatch.setattr(
        security,
        "clientes_configurados",
        lambda: (
            _cliente("ecosistema", ECO_TOKEN, {"nfse:read"}),
            _cliente("integrador", OUTRO_TOKEN, {"dfe:read"}),
        ),
    )
    cliente = TestClient(app)

    assert cliente.get("/v1/nfse/autoteste", headers=_auth(OUTRO_TOKEN)).status_code == 403
    assert cliente.get("/v1/nfse/autoteste", headers=_auth(ECO_TOKEN)).status_code == 200


def test_capacidades_respeitam_escopos_e_chaves_de_producao(monkeypatch):
    security.limpar_rate_limit_para_testes()
    monkeypatch.setattr(
        security,
        "clientes_configurados",
        lambda: (_cliente("ecosistema", ECO_TOKEN, {"nfe:*", "mdfe:read"}),),
    )
    resposta = TestClient(app).get("/v1/capacidades", headers=_auth(ECO_TOKEN))
    assert resposta.status_code == 200
    dados = resposta.json()
    assert dados["cliente"] == "ecosistema"
    assert dados["familias"]["nfe"]["disponivel"] is True
    assert dados["familias"]["mdfe"]["disponivel"] is True
    assert dados["familias"]["nfse"]["disponivel"] is False
    assert dados["familias"]["nfce"]["disponivel"] is False
    assert dados["familias"]["nfe"]["producaoHabilitada"] is False
    assert dados["familias"]["mdfe"]["producaoHabilitada"] is False


def test_rate_limit_e_independente_por_cliente(monkeypatch):
    security.limpar_rate_limit_para_testes()
    monkeypatch.setattr(
        security,
        "clientes_configurados",
        lambda: (
            _cliente("ecosistema", ECO_TOKEN, {"nfse:read"}, limite=1),
            _cliente("integrador", OUTRO_TOKEN, {"nfse:read"}, limite=1),
        ),
    )
    cliente = TestClient(app)

    assert cliente.get("/v1/nfse/autoteste", headers=_auth(ECO_TOKEN)).status_code == 200
    limitado = cliente.get("/v1/nfse/autoteste", headers=_auth(ECO_TOKEN))
    assert limitado.status_code == 429
    assert limitado.headers["retry-after"] == "60"
    assert cliente.get("/v1/nfse/autoteste", headers=_auth(OUTRO_TOKEN)).status_code == 200


def test_clientes_adicionais_sao_lidos_de_arquivo_secreto(monkeypatch, tmp_path):
    arquivo = tmp_path / "clients.json"
    arquivo.write_text(
        json.dumps({
            "ecosistema": {
                "token": ECO_TOKEN,
                "scopes": ["nfe:*", "nfse:read"],
                "rateLimitPerMinute": 321,
            }
        }),
        encoding="utf-8",
    )
    monkeypatch.setenv("FISCAL_CLIENTS_FILE", str(arquivo))
    monkeypatch.setenv(
        "FISCAL_CLIENTS_JSON",
        json.dumps({"ignorado": {"token": OUTRO_TOKEN, "scopes": ["dfe:read"]}}),
    )

    clientes = _carregar_clientes(LEGACY_TOKEN, "")

    assert [cliente.id for cliente in clientes] == ["dominex", "ecosistema"]
    assert clientes[1].limite_por_minuto == 321
    assert clientes[1].escopos == frozenset({"nfe:*", "nfse:read"})
