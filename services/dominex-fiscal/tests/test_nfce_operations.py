from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from lxml import etree
from nfelib.nfe.client.v4_0.servers import Endpoint

from app.errors import ServicoFiscalIndisponivel
from app.nfce import service, soap
from app.nfe import documents
from app.nfe import soap as nfe_soap
from app.nfe.xml import NS
from tests.test_nfce_danfce import authorized_nfce
from tests.test_nfe_shadow import fake_credential


def signed_nfce() -> tuple[str, str]:
    processed, key = authorized_nfce()
    root = etree.fromstring(processed.encode())
    nfe = root.find(f"{{{NS}}}NFe")
    assert nfe is not None
    return etree.tostring(nfe, encoding="unicode"), key


def operation_req(xml: str, key: str, **extra):
    return SimpleNamespace(
        ambiente=2,
        empresa_id="tenant",
        tenant_id="tenant",
        operation_id="00000000-0000-4000-8000-000000000065",
        snapshot_hash="6" * 64,
        xml_assinado=xml,
        chave=key,
        uf="SP",
        **extra,
    )


def official(key: str, cstat: str = "100", **extra):
    return {
        "cstat": cstat,
        "reason": "Autorizado o uso da NFC-e" if cstat == "100" else "Resposta oficial",
        "key": key,
        "protocol": "135260000000065" if cstat in {"100", "101", "151"} else None,
        "events": [],
        **extra,
    }


def test_matriz_nfce_cobre_as_27_ufs_e_somente_https() -> None:
    assert set(soap.AUTHOR_BY_UF) == set(soap.UF_CODES)
    assert len(soap.AUTHOR_BY_UF) == 27
    for uf in soap.UF_CODES:
        for environment in ("production", "homologation"):
            for endpoint in (
                Endpoint.NFEAUTORIZACAO,
                Endpoint.NFECONSULTAPROTOCOLO,
                Endpoint.NFESTATUSSERVICO,
                Endpoint.RECEPCAOEVENTO,
            ):
                assert soap.service(uf, environment, endpoint).url.startswith("https://")


def test_sp_nfce_nao_reutiliza_endpoint_de_nfe() -> None:
    nfce = soap.service("SP", "homologation", Endpoint.NFEAUTORIZACAO)
    nfe = nfe_soap.service("SP", "homologation", Endpoint.NFEAUTORIZACAO)
    assert nfce.url != nfe.url
    assert "nfce" in nfce.url.lower()


def test_nfce_consulta_recusa_chave_modelo_55_antes_da_rede() -> None:
    invalid = "35" + "0" * 18 + "55" + "0" * 22
    with patch.object(soap.base, "_post") as post:
        with pytest.raises(Exception, match="modelo"):
            soap.consultar(invalid, "SP", "homologation", fake_credential())
    post.assert_not_called()


def test_producao_nfce_nasce_bloqueada() -> None:
    xml, key = signed_nfce()
    req = operation_req(xml, key, id_lote="65")
    req.ambiente = 1
    with patch.object(
        service, "get_config", return_value=SimpleNamespace(nfce_producao_habilitada=False)
    ):
        with pytest.raises(ServicoFiscalIndisponivel):
            service.autorizar(req)


def test_autorizacao_recupera_nfce_ja_autorizada_sem_reenvio() -> None:
    xml, key = signed_nfce()
    req = operation_req(xml, key, id_lote="65")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=official(key)
    ), patch.object(service, "_artifacts", return_value={"xmlProcessado": "<nfeProc/>"}), patch.object(
        service.soap, "transmitir"
    ) as transmit:
        result = service.autorizar(req)
    assert result["outcome"] == "authorized"
    assert result["recovered"] is True
    assert result["situacaoOficial"] == "autorizada"
    transmit.assert_not_called()


def test_consulta_105_mantem_incerteza_e_nao_reenvia() -> None:
    xml, key = signed_nfce()
    req = operation_req(xml, key, id_lote="65")
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=official(key, "105", protocol=None)
    ), patch.object(service.soap, "transmitir") as transmit:
        result = service.autorizar(req)
    assert result["outcome"] == "uncertain"
    assert result["situacaoOficial"] == "aguardando_confirmacao"
    transmit.assert_not_called()


def signed_cancellation() -> tuple[str, str]:
    _, key = signed_nfce()
    unsigned, _ = documents.montar_evento(
        key=key,
        cnpj="11222333000181",
        uf="SP",
        environment="homologation",
        kind="cancellation",
        sequence=1,
        text="Cancelamento fiscal de teste NFC-e",
        occurred_at=datetime(2026, 11, 2, 12, tzinfo=timezone.utc),
        protocol="135260000000065",
        model="65",
    )
    return documents.assinar_documento(
        unsigned, fake_credential(), "11222333000181", "cancellation"
    ), key


def test_cancelamento_ja_confirmado_nao_e_reenviado() -> None:
    xml, key = signed_cancellation()
    req = operation_req(xml, key, id_lote="66")
    response = official(
        key,
        "101",
        events=[{
            "event_type": "110111",
            "sequence": "1",
            "cstat": "135",
            "processed_xml": "<procEventoNFe/>",
        }],
    )
    with patch.object(service, "_credencial", return_value=fake_credential()), patch.object(
        service.soap, "consultar", return_value=response
    ), patch.object(service.soap, "transmitir_cancelamento") as transmit:
        result = service.transmitir_cancelamento(req)
    assert result["outcome"] == "accepted"
    assert result["recovered"] is True
    assert result["situacaoOficial"] == "cancelada"
    transmit.assert_not_called()


def test_nfce_nao_permite_carta_de_correcao() -> None:
    _, key = signed_nfce()
    with pytest.raises(Exception, match="apenas o evento de cancelamento"):
        documents.montar_evento(
            key=key,
            cnpj="11222333000181",
            uf="SP",
            environment="homologation",
            kind="correction",
            sequence=1,
            text="Correção que não deve existir em NFC-e",
            occurred_at=datetime(2026, 11, 2, 12, tzinfo=timezone.utc),
            model="65",
        )


def test_qr_code_recusa_dominio_privado() -> None:
    from app.nfce.xml import montar_xml
    from tests.test_nfe_shadow import job_base

    job = job_base()
    job["payload"].update({"saida": True, "consumidorFinal": True, "presencial": 1})
    job["payload"].pop("destinatario", None)
    job["payload"]["itens"][0]["cfop"] = "5102"
    with pytest.raises(Exception, match="domínio governamental"):
        montar_xml(
            job,
            qr_base_url="https://site-privado.example/nfce",
            access_url="https://consulta.exemplo.gov.br/nfce",
        )
