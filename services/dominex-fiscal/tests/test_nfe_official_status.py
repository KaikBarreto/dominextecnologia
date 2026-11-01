from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from app.errors import ServicoFiscalIndisponivel
from app.nfe import documents, service
from app.nfe.documents import assinar_documento
from tests.test_nfe_shadow import fake_credential, job_base, signed


def req_base(xml: str, key: str, **extra):
    return SimpleNamespace(
        ambiente=2, empresa_id="tenant", tenant_id="tenant",
        operation_id="00000000-0000-4000-8000-000000000001",
        snapshot_hash="b" * 64, xml_assinado=xml, chave=key, uf="SP",
        **extra,
    )


def cancelled(key: str, cstat: str = "101"):
    return {
        "cstat": cstat, "reason": "Cancelamento homologado", "key": key,
        "protocol": "135260000000001", "protocol_cstat": "100",
        "protocol_xml": "<protNFe/>", "response_xml": "<retConsSitNFe/>",
    }


def test_consulta_expoe_situacao_oficial_cancelada():
    xml, key = signed(job_base())
    req = SimpleNamespace(ambiente=2, empresa_id="tenant", chave=key, uf="SP", xml_assinado=None)
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=cancelled(key)
    ):
        result = service.consultar(req)
    assert result["situacaoOficial"] == "cancelada"
    assert "orientacao" not in result


def test_autorizacao_nao_reenvia_nota_ja_cancelada():
    xml, key = signed(job_base())
    req = req_base(xml, key, id_lote="1")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=cancelled(key)
    ), patch.object(service.soap, "transmitir") as transmitir:
        result = service.autorizar(req)
    assert result["outcome"] == "cancelled"
    assert result["situacaoOficial"] == "cancelada"
    transmitir.assert_not_called()


def evento_assinado(kind: str = "correction"):
    _, key = signed(job_base())
    bruto, _ = documents.montar_evento(
        key=key, cnpj="11222333000181", uf="SP", environment="homologation",
        kind=kind, sequence=1,
        text="Correcao fiscal de teste com texto suficiente" if kind == "correction" else "Cancelamento fiscal de teste",
        occurred_at=datetime(2026, 11, 1, 12, tzinfo=timezone.utc),
        protocol="135260000000001" if kind == "cancellation" else None,
    )
    return assinar_documento(bruto, fake_credential(), "11222333000181", kind), key


def test_cce_nao_e_enviada_quando_nota_esta_cancelada():
    xml, key = evento_assinado("correction")
    req = req_base(xml, key, tipo="correction", id_lote="2")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=cancelled(key)
    ), patch.object(service.soap, "transmitir_evento") as transmitir:
        result = service.transmitir_evento(req)
    assert result["outcome"] == "rejected"
    assert result["situacaoOficial"] == "cancelada"
    transmitir.assert_not_called()


def test_cancelamento_ja_homologado_e_recuperado_sem_reenvio():
    xml, key = evento_assinado("cancellation")
    req = req_base(xml, key, tipo="cancellation", id_lote="3")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=cancelled(key, "151")
    ), patch.object(service.soap, "transmitir_evento") as transmitir:
        result = service.transmitir_evento(req)
    assert result["outcome"] == "accepted"
    assert result["recovered"] is True
    assert result["situacaoOficial"] == "cancelada"
    transmitir.assert_not_called()


def test_producao_nfe_nova_nasce_bloqueada():
    xml, key = signed(job_base())
    req = req_base(xml, key, id_lote="4")
    req.ambiente = 1
    with patch.object(
        service, "get_config", return_value=SimpleNamespace(nfe_producao_habilitada=False)
    ):
        with pytest.raises(ServicoFiscalIndisponivel):
            service.autorizar(req)


def test_indisponibilidade_sefaz_vira_erro_amigavel_com_plano_de_acao():
    req = SimpleNamespace(ambiente=2, empresa_id="tenant", uf="SP")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "status", side_effect=service.soap.ErroSefazNfe("Falha de rede")
    ):
        with pytest.raises(ServicoFiscalIndisponivel) as capturado:
            service.status(req)

    assert capturado.value.orientacao is not None
    assert capturado.value.orientacao.plano_acao


def test_cancelamento_136_sem_prova_na_consulta_nao_marca_cancelada():
    xml, key = evento_assinado("cancellation")
    req = req_base(xml, key, tipo="cancellation", id_lote="5")
    autorizada = {
        "cstat": "100", "reason": "Autorizada", "key": key,
        "protocol": "135260000000001", "events": [],
    }
    retorno_136 = {
        "cstat": "136", "reason": "Evento registrado, mas não vinculado",
        "key": key, "return_xml": "<retEvento/>",
    }
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", side_effect=[autorizada, autorizada]
    ), patch.object(service.soap, "transmitir_evento", return_value=retorno_136):
        result = service.transmitir_evento(req)

    assert result["outcome"] == "uncertain"
    assert result["situacaoOficial"] == "aguardando_confirmacao"
