from __future__ import annotations

import copy
import ssl
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

from app.sefaz.credencial import CredencialSefaz as CredencialFiscal
from app.nfe.compare import comparar
from app.nfe.emission import gerar_danfe, montar_nfe_processada
from app.nfe.homologation import HOMOLOGATION_NAME, HOMOLOGATION_SCENARIOS, _fixture
from app.nfe.soap import (
    AUTHORIZER_BY_UF,
    ErroSefazNfe,
    _parse,
    consultar,
    service,
    status,
    transmitir,
)
from app.nfe.xml import (
    ErroNfeLocal,
    assinar_xml,
    montar_xml,
    validar_assinatura,
    validar_xsd,
)
from nfelib.nfe.client.v4_0.servers import Endpoint


def job_base() -> dict:
    return {
        "payload_sha256": "a" * 64,
        "invoice": {
            "environment": "homologacao",
            "issue_date": "2026-11-01T12:00:00-03:00",
            "invoice_type": "entrada",
            "status": "emitida",
        },
        "fiscal_config": {
            "cnpj": "11222333000181",
            "inscricao_estadual": "123456789",
            "razao_social": "RECICLAGEM TESTE LTDA",
            "nome_fantasia": "RECICLAGEM TESTE",
            "regime_tributario": "lucro_presumido",
            "is_simples_nacional": False,
            "uf": "SP",
            "logradouro": "RUA TESTE",
            "numero": "100",
            "bairro": "CENTRO",
            "cidade": "SAO PAULO",
            "cep": "01001000",
            "codigo_ibge": "3550308",
        },
        "payload": {
            "idIntegracao": "00000000-0000-4000-8000-000000000001",
            "numero": 123,
            "serie": 1,
            "presencial": 0,
            "consumidorFinal": False,
            "natureza": "COMPRA DE SUCATA",
            "saida": False,
            "finalidade": 1,
            "emitente": {"cpfCnpj": "11222333000181", "inscricaoEstadual": "123456789"},
            "destinatario": {
                "cpfCnpj": "11222333000181",
                "razaoSocial": "NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO",
                "indicadorInscricaoEstadual": 1,
                "inscricaoEstadual": "123456789",
                "endereco": {
                    "tipoLogradouro": "Rua", "logradouro": "TESTE", "numero": "100",
                    "bairro": "CENTRO", "codigoCidade": "3550308",
                    "descricaoCidade": "SAO PAULO", "estado": "SP", "cep": "01001000",
                },
            },
            "itens": [{
                "codigo": "1", "descricao": "SUCATA DE FERRO", "ncm": "72044900",
                "cfop": "1102", "unidade": {"comercial": "KG", "tributavel": "KG"},
                "quantidade": {"comercial": 10, "tributavel": 10},
                "valorUnitario": {"comercial": 2.5, "tributavel": 2.5},
                "valor": 25,
                "tributos": {
                    "icms": {"origem": "0", "cst": "41"},
                    "pis": {"cst": "07"}, "cofins": {"cst": "07"},
                },
            }],
            "total": {
                "baseCalculoIcms": 0, "valorIcms": 0, "valorProdutosServicos": 25,
                "valorPis": 0, "valorCofins": 0, "valorIpi": 0, "valorNfe": 25,
                "valorAproximadoTributos": 0,
            },
            "pagamentos": [{"aVista": True, "meio": "01", "valor": 25}],
            "transporte": {"modalidadeFrete": 9},
        },
    }


def fake_credential() -> CredencialFiscal:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    now = datetime.now(timezone.utc)
    subject = issuer = x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "BR"),
        x509.NameAttribute(NameOID.COMMON_NAME, "RECICLAGEM TESTE:11222333000181"),
    ])
    certificate = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(days=1))
        .not_valid_after(now + timedelta(days=30))
        .sign(key, hashes.SHA256())
    )
    return CredencialFiscal(ssl.create_default_context(), key, certificate)


def signed(job: dict) -> tuple[str, str]:
    xml, key = montar_xml(job)
    return assinar_xml(xml, fake_credential(), "11222333000181"), key


class NfeShadowXmlTest(unittest.TestCase):
    def test_entrada_propria_valida_no_xsd(self) -> None:
        xml, key = signed(job_base())
        self.assertEqual(44, len(key))
        self.assertEqual([], validar_xsd(xml))
        self.assertEqual([], validar_assinatura(xml))
        self.assertIn("<ICMS40>", xml)
        self.assertIn("<CST>41</CST>", xml)

    def test_assinatura_detecta_xml_adulterado(self) -> None:
        xml, _ = signed(job_base())
        adulterated = xml.replace("<CFOP>1102</CFOP>", "<CFOP>1101</CFOP>")
        self.assertEqual(
            ["O conteúdo da NF-e foi alterado depois da assinatura."],
            validar_assinatura(adulterated),
        )

    def test_certificado_de_outro_cnpj_falha_antes_de_assinar(self) -> None:
        xml, _ = montar_xml(job_base())
        with self.assertRaisesRegex(ErroNfeLocal, "não pertence ao CNPJ"):
            assinar_xml(xml, fake_credential(), "99888777000166")

    def test_saida_diferida_com_ibscbs_valida_no_xsd(self) -> None:
        job = job_base()
        job["invoice"]["invoice_type"] = "saida"
        payload = job["payload"]
        payload["saida"] = True
        payload["natureza"] = "VENDA DE SUCATA"
        item = payload["itens"][0]
        item["cfop"] = "5102"
        item["tributos"] = {
            "valorAproximadoTributos": 0,
            "icms": {
                "origem": "0", "cst": "51",
                "baseCalculo": {"modalidadeDeterminacao": 3, "percentualReducao": 0, "valor": 25},
                "aliquota": 18, "valor": 4.5,
                "diferimento": {"percentual": 100, "valor": 4.5, "valorIcmsDevido": 0},
            },
            "pis": {"cst": "07"}, "cofins": {"cst": "07"},
            "ibscbs": {
                "cst": "000", "classificacao": "000001", "baseCalculo": 25,
                "uf": {"aliquota": 0.1, "valor": 0.03},
                "municipio": {"aliquota": 0, "valor": 0},
                "valorIbs": 0.03,
                "cbs": {"aliquota": 0.9, "valor": 0.23},
            },
        }
        payload["total"].update({
            "baseCalculoIbsCbs": 25, "valorDiferimentoIbsUF": 0,
            "valorDevolucaoIbsUF": 0, "valorIbsUF": 0.03,
            "valorDiferimentoIbsMunicipio": 0, "valorDevolucaoIbsMunicipio": 0,
            "valorIbsMunicipio": 0, "valorIbs": 0.03,
            "valorIbsCreditoPresumido": 0, "valorIbsCreditoPresumidoSuspensao": 0,
            "valorCbs": 0.23, "valorCbsDiferimento": 0, "valorCbsDevolucao": 0,
            "valorCbsCreditoPresumido": 0, "valorCbsCreditoPresumidoSuspensao": 0,
        })
        xml, _ = signed(job)
        self.assertEqual([], validar_xsd(xml))
        self.assertIn("<ICMS51>", xml)
        self.assertIn("<IBSCBSTot>", xml)

    def test_cst_nao_suportado_falha_fechado(self) -> None:
        job = job_base()
        job["payload"]["itens"][0]["tributos"]["icms"]["cst"] = "10"
        with self.assertRaisesRegex(ErroNfeLocal, "ainda não suportado"):
            montar_xml(job)

    def test_comparador_detecta_diferenca_fiscal(self) -> None:
        local, _ = signed(job_base())
        same = comparar(local, local)
        self.assertTrue(same["matched"])
        changed = local.replace("<CFOP>1102</CFOP>", "<CFOP>1101</CFOP>")
        result = comparar(local, changed)
        self.assertFalse(result["matched"])
        self.assertEqual(1, result["summary"]["changed"])

    def test_comparador_ignora_campos_volateis(self) -> None:
        local, _ = signed(job_base())
        changed = copy.copy(local).replace(
            "<verProc>EcoSistema-Shadow1</verProc>", "<verProc>PlugNotas</verProc>"
        )
        self.assertTrue(comparar(local, changed)["matched"])

    def test_processado_e_danfe_exigem_protocolo_da_mesma_assinatura(self) -> None:
        xml, key = signed(job_base())
        from lxml import etree
        from app.nfe.xml import DS, NS

        root = etree.fromstring(xml.encode())
        digest = root.findtext(
            f"{{{DS}}}Signature/{{{DS}}}SignedInfo/"
            f"{{{DS}}}Reference/{{{DS}}}DigestValue"
        )
        protocol = (
            f'<protNFe xmlns="{NS}" versao="4.00"><infProt>'
            f'<tpAmb>2</tpAmb><verAplic>TESTE</verAplic><chNFe>{key}</chNFe>'
            '<dhRecbto>2026-11-01T12:01:00-03:00</dhRecbto>'
            f'<nProt>123456789012345</nProt><digVal>{digest}</digVal>'
            '<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>'
            '</infProt></protNFe>'
        )
        processed, proof = montar_nfe_processada(xml, protocol)
        self.assertEqual(key, proof["access_key"])
        self.assertEqual("123456789012345", proof["protocol"])
        self.assertIn("<nfeProc", processed)
        pdf = gerar_danfe(processed)
        self.assertTrue(pdf.startswith(b"%PDF-"))

        with self.assertRaisesRegex(ErroNfeLocal, "outra NF-e"):
            montar_nfe_processada(xml, protocol.replace(key, "3" * 44))
        with self.assertRaisesRegex(ErroNfeLocal, "digest"):
            montar_nfe_processada(xml, protocol.replace(str(digest), "ZmFrZQ=="))


class NfeSoapTest(unittest.TestCase):
    def test_todas_as_ufs_tem_tres_servicos_nos_dois_ambientes(self) -> None:
        self.assertEqual(27, len(AUTHORIZER_BY_UF))
        for uf in AUTHORIZER_BY_UF:
            for environment in ("production", "homologation"):
                for endpoint in (
                    Endpoint.NFESTATUSSERVICO,
                    Endpoint.NFEAUTORIZACAO,
                    Endpoint.NFECONSULTAPROTOCOLO,
                ):
                    configured = service(uf, environment, endpoint)
                    self.assertTrue(configured.url.startswith("https://"))
                    self.assertIn(configured.soap_version, {"1.1", "1.2"})

    def test_uf_desconhecida_falha_fechado(self) -> None:
        with self.assertRaisesRegex(ErroSefazNfe, "sem autorizador"):
            service("XX", "homologation", Endpoint.NFESTATUSSERVICO)

    @patch("app.nfe.soap._post")
    def test_status_sp_usa_soap12_e_homologacao(self, post) -> None:
        post.return_value = (
            '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">'
            '<soap:Body><retConsStatServ xmlns="http://www.portalfiscal.inf.br/nfe" '
            'versao="4.00"><tpAmb>2</tpAmb><verAplic>SP_NFE</verAplic><cStat>107</cStat>'
            '<xMotivo>Servico em Operacao</xMotivo><cUF>35</cUF></retConsStatServ>'
            '</soap:Body></soap:Envelope>'
        )
        result = status("SP", "homologation", fake_credential())
        configured, payload, _, _ = post.call_args.args
        self.assertEqual("1.2", configured.soap_version)
        self.assertIn("<tpAmb>2</tpAmb>", payload)
        self.assertEqual("107", result["cstat"])

    @patch("app.nfe.soap._post")
    def test_transmissao_sincrona_extrai_protocolo(self, post) -> None:
        post.return_value = (
            '<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">'
            '<soap:Body><retEnviNFe xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">'
            '<tpAmb>2</tpAmb><cStat>104</cStat><xMotivo>Lote processado</xMotivo>'
            '<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><chNFe>' + "3" * 44 +
            '</chNFe><dhRecbto>2026-11-01T12:00:01-03:00</dhRecbto><nProt>123</nProt>'
            '<digVal>abc</digVal><cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>'
            '</infProt></protNFe></retEnviNFe></soap:Body></soap:Envelope>'
        )
        result = transmitir("<NFe/>", "RJ", "homologation", fake_credential(), "1")
        configured, payload, _, _ = post.call_args.args
        self.assertEqual("1.1", configured.soap_version)
        self.assertIn("<indSinc>1</indSinc><NFe/>", payload)
        self.assertEqual("100", result["cstat"])
        self.assertEqual("123", result["protocol"])

    @patch("app.nfe.soap._post")
    def test_consulta_rejeita_chave_invalida_antes_da_rede(self, post) -> None:
        with self.assertRaisesRegex(ErroSefazNfe, "Chave NF-e inválida"):
            consultar("123", "SP", "homologation", fake_credential())
        post.assert_not_called()


class NfeHomologationFixtureTest(unittest.TestCase):
    def _run(self, scenario: str) -> dict:
        base = job_base()
        return {
            "id": "00000000-0000-4000-8000-000000000099",
            "scenario": scenario, "serie": 889, "invoice_number": 1,
            "issued_at": "2026-11-01T12:00:00-03:00",
            "fiscal_config": base["fiscal_config"],
        }

    def test_tres_cenarios_chuto_geram_xml_oficial_assinado(self) -> None:
        for scenario in HOMOLOGATION_SCENARIOS:
            job = _fixture(self._run(scenario))
            self.assertEqual(HOMOLOGATION_NAME, job["payload"]["destinatario"]["razaoSocial"])
            unsigned, _ = montar_xml(job)
            xml = assinar_xml(unsigned, fake_credential(), "11222333000181")
            self.assertEqual([], validar_xsd(xml), scenario)
            self.assertEqual([], validar_assinatura(xml), scenario)
            self.assertIn("<IBSCBS>", xml, scenario)
            self.assertIn("<CST>000</CST><cClassTrib>000001</cClassTrib>", xml, scenario)
            self.assertIn("<IBSCBSTot>", xml, scenario)

    def test_matriz_chuto_cobre_destinos_pis_multitens_e_desconto(self) -> None:
        own_final = _fixture(self._run("chuto_entrada_propria_consumidor_final"))
        own_xml, _ = montar_xml(own_final)
        self.assertIn("<indFinal>1</indFinal>", own_xml)
        self.assertIn("<CNPJ>11222333000181</CNPJ>", own_xml)

        mixed = _fixture(self._run("chuto_entrada_cpf_sp_pis_misto"))
        mixed_xml, _ = montar_xml(mixed)
        self.assertEqual(3, mixed_xml.count("<det nItem="))
        self.assertIn("<idDest>1</idDest>", mixed_xml)
        self.assertIn("<CPF>12345678909</CPF>", mixed_xml)
        self.assertIn("<PISOutr><CST>98</CST>", mixed_xml)
        self.assertIn("<PISNT><CST>09</CST>", mixed_xml)
        self.assertIn("<PISNT><CST>06</CST>", mixed_xml)

        interstate = _fixture(self._run("chuto_entrada_cpf_mg_interestadual"))
        interstate_xml, _ = montar_xml(interstate)
        self.assertIn("<idDest>2</idDest>", interstate_xml)
        self.assertIn("<CFOP>2102</CFOP>", interstate_xml)

        non_contributor = _fixture(self._run("chuto_saida_cpf_sp_cst00"))
        non_contributor_xml, _ = montar_xml(non_contributor)
        self.assertIn("<ICMS00>", non_contributor_xml)
        self.assertIn("<indFinal>1</indFinal>", non_contributor_xml)

        many = _fixture(self._run("chuto_saida_multitens_desconto"))
        many_xml, _ = montar_xml(many)
        self.assertEqual(6, many_xml.count("<det nItem="))
        self.assertEqual(6, many_xml.count("<vDesc>0.01</vDesc>"))
        self.assertIn("<vDesc>0.06</vDesc>", many_xml)
        self.assertIn("<vNF>86.94</vNF>", many_xml)


if __name__ == "__main__":
    unittest.main()
