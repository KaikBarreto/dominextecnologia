from __future__ import annotations

import ssl
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.errors import ServicoFiscalIndisponivel
from app.mdfe import service, soap
from app.mdfe.xml import NS, _dv, montar_assinado, montar_evento_assinado
from app.sefaz.credencial import CredencialSefaz


def credential() -> CredencialSefaz:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, "TESTE:11222333000181")
    ])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    return CredencialSefaz(ssl.create_default_context(), key, cert)


def fixture() -> dict:
    nfe = "3526111122233300018155001000000123187654321"
    return {
        "environment": "homologation",
        "emitted_at": "2026-11-01T12:00:00-03:00",
        "numeric_code": "12345678",
        "snapshot": {
            "fiscal_config": {
                "cnpj": "11222333000181", "inscricao_estadual": "123456789",
                "razao_social": "RECICLAGEM TESTE LTDA", "uf": "SP",
                "logradouro": "RUA TESTE", "numero": "100", "bairro": "CENTRO",
                "cidade": "SAO PAULO", "cep": "01001000", "codigo_ibge": "3550308",
            },
            "manifest": {
                "serie": 1, "mdfe_number": 123, "modal": "1", "tipo_emitente": "2",
                "uf_carregamento": "SP", "uf_descarregamento": "SP",
                "codigo_ibge_carregamento": "3550308",
                "codigo_ibge_descarregamento": "3550308",
                "cidade_carregamento": "SAO PAULO", "cidade_descarregamento": "SAO PAULO",
                "cep_carregamento": "01001000", "cep_descarregamento": "01001000",
                "condutor_nome": "CONDUTOR DE TESTE", "condutor_cpf": "52998224725",
                "placa_veiculo": "ABC1D23", "tara_veiculo": 6000,
                "tipo_rodado": "02", "tipo_carroceria": "02", "uf_veiculo": "SP",
                "tipo_carga": "01", "descricao_produto_predominante": "SUCATA DE FERRO",
                "ncm_produto_predominante": "72044900", "valor_total_carga": 100,
                "peso_bruto_total": 50,
            },
            "invoices": [{"nfe_key": nfe + _dv(nfe)}],
        },
    }


def protocol(key: str, status: str = "100") -> str:
    return (
        f'<protMDFe xmlns="{NS}" versao="3.00"><infProt><tpAmb>2</tpAmb>'
        f'<verAplic>TESTE</verAplic><chMDFe>{key}</chMDFe>'
        '<dhRecbto>2026-11-01T12:00:01-03:00</dhRecbto>'
        '<nProt>135260000000001</nProt><digVal>AAAAAAAAAAAAAAAAAAAAAAAAAAA=</digVal>'
        f'<cStat>{status}</cStat><xMotivo>Retorno de teste</xMotivo></infProt></protMDFe>'
    )


def consultation(key: str, status: str = "100", document: str = "") -> str:
    return (
        f'<retConsSitMDFe xmlns="{NS}" versao="3.00"><tpAmb>2</tpAmb>'
        f'<verAplic>TESTE</verAplic><cStat>{status}</cStat>'
        f'<xMotivo>Retorno de teste</xMotivo><cUF>35</cUF><chMDFe>{key}</chMDFe>'
        f'{protocol(key) if status in {"100", "101", "132"} else ""}{document}'
        '</retConsSitMDFe>'
    )


def event_return(key: str, code: str = "110111", status: str = "135") -> str:
    return (
        f'<retEventoMDFe xmlns="{NS}" versao="3.00"><infEvento><tpAmb>2</tpAmb>'
        f'<verAplic>TESTE</verAplic><cOrgao>35</cOrgao><cStat>{status}</cStat>'
        f'<xMotivo>Retorno de teste</xMotivo><chMDFe>{key}</chMDFe>'
        f'<tpEvento>{code}</tpEvento><xEvento>Evento de teste</xEvento><nSeqEvento>1</nSeqEvento>'
        '<dhRegEvento>2026-11-01T22:00:01-03:00</dhRegEvento>'
        '<nProt>135260000000002</nProt></infEvento></retEventoMDFe>'
    )


def request(xml: str, key: str, **extra):
    return SimpleNamespace(
        ambiente=2, empresa_id="tenant", tenant_id="tenant",
        operation_id="00000000-0000-4000-8000-000000000001",
        snapshot_hash="a" * 64, xml_assinado=xml, chave=key,
        **extra,
    )


@pytest.fixture(scope="module")
def mdfe_base():
    cred = credential()
    job = fixture()
    xml, key = montar_assinado(job, cred)
    return cred, job, xml, key


def test_xml_oficial_monta_e_gera_damdfe(mdfe_base):
    _, _, xml, key = mdfe_base
    assert f'Id="MDFe{key}"' in xml
    assert "MotorFiscal-1.1" in xml
    assert service.gerar_pdf(xml)


def test_autorizacao_recuperada_exige_protocolo_vinculado(mdfe_base):
    cred, _, xml, key = mdfe_base
    official = soap._result(consultation(key), key, "homologation")
    with patch.object(service, "_credencial", return_value=cred), patch.object(
        soap, "consultar", return_value=official
    ), patch.object(soap, "transmitir") as transmitir:
        result = service.autorizar(request(xml, key))
    assert result["outcome"] == "authorized"
    assert result["situacaoOficial"] == "autorizado"
    assert result["recovered"] is True
    assert "mdfeProc" in result["xmlProcessado"]
    transmitir.assert_not_called()


def test_status_terminal_atual_vence_protocolo_historico(mdfe_base):
    cred, _, xml, key = mdfe_base
    for cstat, expected in (("101", "cancelado"), ("132", "encerrado")):
        official = soap._result(consultation(key, cstat), key, "homologation")
        with patch.object(service, "_credencial", return_value=cred), patch.object(
            soap, "consultar", return_value=official
        ), patch.object(soap, "transmitir") as transmitir:
            result = service.autorizar(request(xml, key))
        assert result["outcome"] == expected
        assert result["situacaoOficial"] == expected
        transmitir.assert_not_called()


def test_duplicidade_sem_prova_nunca_vira_autorizado(mdfe_base):
    cred, _, xml, key = mdfe_base
    missing = soap._result(consultation(key, "217"), key, "homologation")
    duplicate = soap._result(protocol(key, "539"), key, "homologation")
    with patch.object(service, "_credencial", return_value=cred), patch.object(
        soap, "consultar", side_effect=[missing, missing]
    ), patch.object(soap, "transmitir", return_value=duplicate):
        result = service.autorizar(request(xml, key))
    assert result["outcome"] == "uncertain"
    assert result["situacaoOficial"] == "aguardando_confirmacao"


def test_falha_de_rede_nao_inventa_status(mdfe_base):
    cred, _, xml, key = mdfe_base
    with patch.object(service, "_credencial", return_value=cred), patch.object(
        soap, "consultar", side_effect=soap.ErroSefaz("Timeout")
    ):
        with pytest.raises(ServicoFiscalIndisponivel) as captured:
            service.autorizar(request(xml, key))
    body = captured.value.corpo()["erro"]
    assert body["codigo"] == "servico_indisponivel"
    assert body["orientacao"]["podeTentarNovamente"] is True


def test_evento_aceito_gera_prova_processada(mdfe_base):
    cred, job, xml, key = mdfe_base
    event_job = {
        **job, "key": key, "protocol": "135260000000001",
        "action": "cancel", "event_at": "2026-11-02T01:00:00Z",
        "event_reason": "Cancelamento para teste local",
    }
    event_xml = montar_evento_assinado(event_job, cred)
    authorized = soap._result(consultation(key), key, "homologation")
    accepted = soap._result(event_return(key), key, "homologation")
    req = request(event_xml, key, acao="cancel")
    with patch.object(service, "_credencial", return_value=cred), patch.object(
        soap, "consultar", return_value=authorized
    ), patch.object(soap, "transmitir_evento", return_value=accepted):
        result = service.transmitir_evento(req)
    assert result["outcome"] == "accepted"
    assert result["situacaoOficial"] == "cancelado"
    assert "procEventoMDFe" in result["xmlProcessado"]


def test_producao_nova_nasce_bloqueada(mdfe_base):
    cred, _, xml, key = mdfe_base
    req = request(xml, key)
    req.ambiente = 1
    cfg = SimpleNamespace(mdfe_producao_habilitada=False)
    with patch.object(service, "get_config", return_value=cfg), patch.object(
        service, "_credencial", return_value=cred
    ):
        with pytest.raises(ServicoFiscalIndisponivel):
            service.autorizar(req)
