from __future__ import annotations

import copy
import os
import re

from fastapi.testclient import TestClient
from lxml import etree

from app.main import app
from app.nfce.danfce import gerar_danfce, parse_authorized_nfce
from app.nfce.xml import montar_xml, montar_xml_contingencia
from app.nfe.emission import montar_nfe_processada
from app.nfe.xml import DS, NS, ErroNfeLocal, assinar_xml, validar_assinatura, validar_xsd
from tests.test_nfe_shadow import fake_credential, job_base


def authorized_nfce(*, item_count: int = 1, contingency: bool = False) -> tuple[str, str]:
    job = job_base()
    job["invoice"]["invoice_type"] = "saida"
    payload = job["payload"]
    payload.update({
        "saida": True,
        "consumidorFinal": True,
        "presencial": 1,
        "natureza": "VENDA DE MERCADORIA",
        "troco": 5,
    })
    payload.pop("destinatario", None)
    payload["itens"][0]["cfop"] = "5102"
    if item_count > 1:
        template = payload["itens"][0]
        items = []
        for index in range(item_count):
            item = copy.deepcopy(template)
            item.update({
                "codigo": str(index + 1),
                "descricao": f"ITEM DE TESTE NFC-E {index + 1}",
                "quantidade": {"comercial": 1, "tributavel": 1},
                "valorUnitario": {"comercial": 1, "tributavel": 1},
                "valor": 1,
            })
            items.append(item)
        payload["itens"] = items
        payload["total"].update({
            "valorProdutosServicos": item_count,
            "valorNfe": item_count,
        })
    payable = payload["total"]["valorNfe"]
    payload["pagamentos"] = [{"aVista": True, "meio": "01", "valor": payable}]
    credential = fake_credential()
    if contingency:
        payload["tipoEmissao"] = 9
        signed, key = montar_xml_contingencia(
            job,
            credential,
            qr_base_url="https://homologacao.exemplo.gov.br/nfce/qrcode",
            access_url="https://homologacao.exemplo.gov.br/nfce/consulta",
        )
    else:
        unsigned, key = montar_xml(
            job,
            qr_base_url="https://homologacao.exemplo.gov.br/nfce/qrcode",
            access_url="https://homologacao.exemplo.gov.br/nfce/consulta",
        )
        signed = assinar_xml(unsigned, credential, "11222333000181")
    assert validar_xsd(signed) == []
    assert validar_assinatura(signed) == []
    root = etree.fromstring(signed.encode())
    digest = root.findtext(
        f"{{{DS}}}Signature/{{{DS}}}SignedInfo/"
        f"{{{DS}}}Reference/{{{DS}}}DigestValue"
    )
    protocol = (
        f'<protNFe xmlns="{NS}" versao="4.00"><infProt>'
        f'<tpAmb>2</tpAmb><verAplic>TESTE</verAplic><chNFe>{key}</chNFe>'
        '<dhRecbto>2026-11-02T10:01:00-03:00</dhRecbto>'
        f'<nProt>123456789012345</nProt><digVal>{digest}</digVal>'
        '<cStat>100</cStat><xMotivo>Autorizado o uso da NFC-e</xMotivo>'
        '</infProt></protNFe>'
    )
    processed, _ = montar_nfe_processada(signed, protocol)
    return processed, key


def test_modelo_65_autorizado_gera_danfce_80mm() -> None:
    processed, key = authorized_nfce()
    data = parse_authorized_nfce(processed)
    assert data.key == key
    assert data.environment == "2"
    assert data.consumer == "CONSUMIDOR NÃO IDENTIFICADO"
    assert data.change == "5,00"
    assert "|3|2" in data.qr_url
    pdf = gerar_danfce(processed)
    assert pdf.startswith(b"%PDF-")
    assert 1_000 < len(pdf) < 2_000_000


def test_danfce_recusa_qr_code_de_outra_chave() -> None:
    processed, key = authorized_nfce()
    altered = processed.replace(f"{key}|3|2", f"{'9' * 44}|3|2")
    try:
        parse_authorized_nfce(altered)
    except ErroNfeLocal as exc:
        assert "QR Code" in str(exc)
    else:
        raise AssertionError("QR Code divergente deveria ser bloqueado")


def test_danfce_recusa_modelo_55() -> None:
    job = job_base()
    unsigned, _ = __import__("app.nfe.xml", fromlist=["montar_xml"]).montar_xml(job)
    signed = assinar_xml(unsigned, fake_credential(), "11222333000181")
    root = etree.fromstring(signed.encode())
    digest = root.findtext(
        f"{{{DS}}}Signature/{{{DS}}}SignedInfo/"
        f"{{{DS}}}Reference/{{{DS}}}DigestValue"
    )
    key = root.find(f"{{{NS}}}infNFe").get("Id")[3:]
    protocol = (
        f'<protNFe xmlns="{NS}" versao="4.00"><infProt><tpAmb>2</tpAmb>'
        f'<verAplic>TESTE</verAplic><chNFe>{key}</chNFe>'
        '<dhRecbto>2026-11-02T10:01:00-03:00</dhRecbto>'
        f'<nProt>123456789012345</nProt><digVal>{digest}</digVal>'
        '<cStat>100</cStat><xMotivo>Autorizado</xMotivo></infProt></protNFe>'
    )
    processed, _ = montar_nfe_processada(signed, protocol)
    try:
        gerar_danfce(processed)
    except ErroNfeLocal as exc:
        assert "modelo 65" in str(exc)
    else:
        raise AssertionError("NF-e modelo 55 não pode gerar DANFE NFC-e")


def test_contingencia_offline_v3_assinada_gera_danfce_autorizado() -> None:
    processed, key = authorized_nfce(contingency=True)
    data = parse_authorized_nfce(processed)
    assert data.key == key
    assert data.contingency is True
    assert len(data.qr_url.split("|")) >= 8
    assert gerar_danfce(processed).startswith(b"%PDF-")


def test_contingencia_offline_recusa_assinatura_qr_adulterada() -> None:
    processed, _ = authorized_nfce(contingency=True)
    root = etree.fromstring(processed.encode())
    qr = root.find(f".//{{{NS}}}qrCode")
    assert qr is not None and qr.text
    qr.text = qr.text[:-1] + ("A" if qr.text[-1] != "A" else "B")
    altered = etree.tostring(root, encoding="unicode")
    try:
        parse_authorized_nfce(altered)
    except ErroNfeLocal as exc:
        assert "assinatura do QR Code offline" in str(exc)
    else:
        raise AssertionError("Assinatura adulterada do QR offline deveria ser bloqueada")


def test_construtor_online_recusa_tpemis_offline() -> None:
    job = job_base()
    job["invoice"]["invoice_type"] = "saida"
    job["payload"].update({"saida": True, "tipoEmissao": 9})
    job["payload"]["itens"][0]["cfop"] = "5102"
    try:
        montar_xml(
            job,
            qr_base_url="https://homologacao.exemplo.gov.br/nfce/qrcode",
            access_url="https://homologacao.exemplo.gov.br/nfce/consulta",
        )
    except ErroNfeLocal as exc:
        assert "construtor online" in str(exc)
    else:
        raise AssertionError("tpEmis 9 não pode usar QR online")


def test_danfce_com_800_itens_nao_corta_e_pagina() -> None:
    processed, _ = authorized_nfce(item_count=800)
    data = parse_authorized_nfce(processed)
    assert len(data.items) == 800
    pdf = gerar_danfce(processed)
    page_counts = [int(value) for value in re.findall(rb"/Count\s+(\d+)", pdf)]
    assert page_counts and max(page_counts) > 1
    assert len(pdf) < 2_000_000


def test_rota_danfce_exige_auth_e_devolve_pdf_oficial() -> None:
    processed, key = authorized_nfce()
    client = TestClient(app)
    body = {"xmlProcessado": processed, "larguraPapelMm": 80}
    assert client.post("/v1/nfce/danfce", json=body).status_code == 401
    response = client.post(
        "/v1/nfce/danfce",
        json=body,
        headers={"Authorization": f"Bearer {os.environ['FISCAL_SERVICE_TOKEN']}"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.headers["x-danfce-origem"] == "motor-fiscal"
    assert key in response.headers["content-disposition"]
    assert response.content.startswith(b"%PDF-")
