from __future__ import annotations

import base64
import hashlib
import shutil
import subprocess
import unittest
from dataclasses import replace
from datetime import datetime
from unittest.mock import patch
from xml.sax.saxutils import escape

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from lxml import etree
from nfelib.nfe.client.v4_0.servers import Endpoint

from app.nfe import soap
from app.nfe.documents import (
    CCE_CONDITIONS, EVENT_TYPES, assinar_documento, montar_evento, montar_inutilizacao,
    montar_processado, proxima_sequencia_cce, validar_documento,
)
from app.nfe.operations import (
    Record, executar, preparar_operacao, reconciliar_inutilizacao,
)
from app.nfe.api_schemas import PrepararInutilizacaoNfeRequest
from app.nfe.xml import DS, NS, ErroNfeLocal, assinar_xml, montar_xml, validar_assinatura
from tests.test_nfe_shadow import fake_credential, job_base, signed

COMPANY = "00000000-0000-4000-8000-000000000001"
CNPJ = "11222333000181"
PROTOCOL = "135260000000001"
EVENT_PROTOCOL = "135260000000002"
WHEN = "2026-11-01T12:00:00-03:00"


def soap_wrap(xml: str) -> str:
    return f'<s:Envelope xmlns:s="{soap.SOAP12}"><s:Body>{xml}</s:Body></s:Envelope>'


def event_return(key: str, kind: str, sequence: int = 1, cstat: str = "135", *, tp_amb: str = "2", protocol: str | None = EVENT_PROTOCOL) -> str:
    return (
        f'<retEvento xmlns="{NS}" versao="1.00"><infEvento>'
        f'<tpAmb>{tp_amb}</tpAmb><verAplic>TESTE_LOCAL</verAplic><cOrgao>35</cOrgao>'
        f'<cStat>{cstat}</cStat><xMotivo>Retorno de teste local</xMotivo>'
        f'<chNFe>{key}</chNFe><tpEvento>{EVENT_TYPES[kind]}</tpEvento>'
        f'<nSeqEvento>{sequence}</nSeqEvento><dhRegEvento>{WHEN}</dhRegEvento>'
        + (f'<nProt>{protocol}</nProt>' if protocol else "")
        + '</infEvento></retEvento>'
    )


def event_batch(returned: str, cstat: str = "128") -> str:
    return soap_wrap(
        f'<retEnvEvento xmlns="{NS}" versao="1.00"><idLote>1</idLote><tpAmb>2</tpAmb>'
        f'<verAplic>TESTE_LOCAL</verAplic><cOrgao>35</cOrgao><cStat>{cstat}</cStat>'
        f'<xMotivo>Lote processado</xMotivo>{returned}</retEnvEvento>'
    )


def invalidation_return(cstat: str = "102", *, first: str = "1", last: str = "3", tp_amb: str = "2") -> str:
    return soap_wrap(
        f'<retInutNFe xmlns="{NS}" versao="4.00"><infInut><tpAmb>{tp_amb}</tpAmb>'
        f'<verAplic>TESTE_LOCAL</verAplic><cStat>{cstat}</cStat>'
        '<xMotivo>Retorno de teste local</xMotivo><cUF>35</cUF><ano>26</ano>'
        f'<CNPJ>{CNPJ}</CNPJ><mod>55</mod><serie>1</serie>'
        f'<nNFIni>{first}</nNFIni><nNFFin>{last}</nNFFin><dhRecbto>{WHEN}</dhRecbto>'
        f'<nProt>{EVENT_PROTOCOL}</nProt></infInut></retInutNFe>'
    )


def consultation(key: str, *, cstat: str = "100", events: list[tuple[str, str]] | None = None) -> str:
    processed = "".join(
        f'<procEventoNFe versao="1.00">{request}{returned}</procEventoNFe>'
        for request, returned in events or []
    )
    return soap_wrap(
        f'<retConsSitNFe xmlns="{NS}" versao="4.00"><tpAmb>2</tpAmb><verAplic>TESTE_LOCAL</verAplic>'
        f'<cStat>{cstat}</cStat><xMotivo>Retorno de teste local</xMotivo><cUF>35</cUF>'
        f'<dhRecbto>{WHEN}</dhRecbto><chNFe>{key}</chNFe>'
        f'<protNFe versao="4.00"><infProt><tpAmb>2</tpAmb><verAplic>TESTE_LOCAL</verAplic>'
        f'<chNFe>{key}</chNFe><dhRecbto>{WHEN}</dhRecbto><nProt>{PROTOCOL}</nProt>'
        '<cStat>100</cStat><xMotivo>Autorizado</xMotivo></infProt></protNFe>'
        f'{processed}</retConsSitNFe>'
    )


class MemoryStore:
    """Fake exclusivo de teste; produção exige CAS durável via RPC."""
    def __init__(self) -> None:
        self.records = {}
        self.transitions = []
        self.fail_accept = False
        self.lose_begin = False

    def reserve(self, scope, payload_hash):
        return self.records.setdefault(scope, Record(0, payload_hash, "prepared"))

    def compare_and_set(self, scope, expected_revision, state, result):
        record = self.records[scope]
        if record.revision != expected_revision or record.state in {"accepted", "rejected"}:
            return None
        if state == "accepted" and self.fail_accept:
            raise RuntimeError("Falha local simulada após confirmação remota")
        changed = Record(record.revision + 1, record.payload_hash, state, result)
        self.records[scope] = changed
        self.transitions.append(state)
        return None if self.lose_begin and state == "transmitting" else changed


class FiscalFixtures(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.credential = fake_credential()
        _, cls.key = montar_xml(job_base())

    def make_event(self, kind="cancellation", sequence=1, text="Texto fiscal de teste local seguro"):
        unsigned, identity = montar_evento(
            key=self.key, cnpj=CNPJ, uf="SP", environment="homologation", kind=kind,
            sequence=sequence, text=text, occurred_at=datetime.fromisoformat(WHEN),
            protocol=PROTOCOL if kind == "cancellation" else None,
        )
        return assinar_documento(unsigned, self.credential, CNPJ, kind), identity

    def make_invalidation(self):
        unsigned, identity = montar_inutilizacao(
            cnpj=CNPJ, uf="SP", environment="homologation", year=2026, series=1,
            first=1, last=3, justification="Numeros nao utilizados em teste local",
        )
        return assinar_documento(unsigned, self.credential, CNPJ, "invalidation"), identity

    def operation(self, kind="cancellation", sequence=1, text="Texto fiscal de teste local seguro"):
        xml, _ = self.make_invalidation() if kind == "invalidation" else self.make_event(kind, sequence, text)
        return preparar_operacao(
            company_id=COMPANY, uf="SP", environment="homologation", kind=kind, signed_xml=xml,
        )


class DocumentTests(FiscalFixtures):
    def test_contrato_inutilizacao_exige_ano_completo(self):
        base = {
            "empresaId": COMPANY,
            "ambiente": 2,
            "certificado": {
                "pfxCifradoB64": "YQ==", "dekEnvelopadaB64": "YQ==",
                "senhaCifradaB64": "YQ==", "nonceB64": "YQ==",
                "algoritmo": "AES-256-GCM",
            },
            "tenantId": COMPANY,
            "operationId": "10000000-0000-4000-8000-000000000001",
            "snapshotHash": "a" * 64,
            "uf": "SP", "cnpj": CNPJ, "ano": 2026, "serie": 1,
            "numeroInicial": 1, "numeroFinal": 3,
            "justificativa": "Numeros nao utilizados em teste local",
        }
        self.assertEqual(2026, PrepararInutilizacaoNfeRequest.model_validate(base).ano)
        with self.assertRaises(ValueError):
            PrepararInutilizacaoNfeRequest.model_validate({**base, "ano": 26})

    def test_eventos_assinados_validam_no_schema_oficial(self):
        for kind in EVENT_TYPES:
            xml, identity = self.make_event(kind)
            self.assertEqual([], validar_documento(xml, kind))
            self.assertEqual([], validar_assinatura(xml, information_tag="infEvento"))
            self.assertEqual(f"ID{EVENT_TYPES[kind]}{self.key}01", identity)
            self.assertNotIn("<ds:", xml)
        xml, _ = self.make_event("correction", 20)
        self.assertIn("<nSeqEvento>20</nSeqEvento>", xml)
        self.assertIn(CCE_CONDITIONS, xml)

    def test_inutilizacao_assinada_id_e_faixa_oficial(self):
        xml, identity = self.make_invalidation()
        self.assertEqual(f"ID3526{CNPJ}55001000000001000000003", identity)
        self.assertEqual(43, len(identity))
        self.assertEqual([], validar_documento(xml, "invalidation"))
        self.assertEqual([], validar_assinatura(xml, information_tag="infInut"))
        self.assertIn("<ano>26</ano>", xml)

    def test_sequencia_cce_exige_historico_completo_e_sem_pendencias(self):
        self.assertEqual(1, proxima_sequencia_cce([]))
        self.assertEqual(3, proxima_sequencia_cce([2, 1]))
        for confirmed, pending in [([2], None), ([1], 2), (list(range(1, 21)), None)]:
            with self.assertRaises(ErroNfeLocal):
                proxima_sequencia_cce(confirmed, pending=pending)

    def test_rejeita_sequencia_invalida_texto_incompativel_e_data_sem_fuso(self):
        base = dict(key=self.key, cnpj=CNPJ, uf="SP", environment="homologation", kind="correction",
                    sequence=1, text="Texto fiscal de teste local seguro", occurred_at=datetime.fromisoformat(WHEN))
        for change in [{"sequence": 0}, {"sequence": 21}, {"sequence": True},
                       {"text": "x" * 1001}, {"text": "Correção com caractere inválido 🚫"},
                       {"occurred_at": datetime(2026, 11, 1)}, {"cnpj": "99888777000166"}]:
            with self.subTest(change=change), self.assertRaises(ErroNfeLocal):
                montar_evento(**{**base, **change})
        with self.assertRaises(ErroNfeLocal):
            self.make_event("cancellation", 2)

    def test_inutilizacao_rejeita_faixa_invertida_grande_e_serie_reservada(self):
        base = dict(cnpj=CNPJ, uf="SP", environment="homologation", year=2026, series=1,
                    first=1, last=3, justification="Numeros nao utilizados em teste local")
        for change in [{"last": 0}, {"last": 10001}, {"series": 999}, {"year": 26}, {"first": 0}]:
            with self.subTest(change=change), self.assertRaises(ErroNfeLocal):
                montar_inutilizacao(**{**base, **change})

    def test_assinatura_detecta_texto_adulterado_e_dupla_assinatura(self):
        xml, _ = self.make_event("correction")
        tampered = xml.replace("Texto fiscal", "Texto alterado")
        self.assertTrue(validar_assinatura(tampered, information_tag="infEvento"))
        with self.assertRaisesRegex(ErroNfeLocal, "já possui assinatura"):
            assinar_documento(xml, self.credential, CNPJ, "correction")

    def test_id_sintaticamente_valido_mas_divergente_falha_antes_da_rede(self):
        xml, identity = self.make_event("correction")
        unsigned = etree.fromstring(xml.encode())
        unsigned.remove(unsigned.find(f"{{{DS}}}Signature"))
        unsigned.find(f"{{{NS}}}infEvento").set("Id", identity[:-2] + "02")
        changed = assinar_xml(etree.tostring(unsigned, encoding="unicode"), self.credential, CNPJ, information_tag="infEvento")
        self.assertEqual([], validar_documento(changed, "correction"))
        with self.assertRaisesRegex(ErroNfeLocal, "identificador fiscal"):
            preparar_operacao(company_id=COMPANY, uf="SP", environment="homologation", kind="correction", signed_xml=changed)

    @unittest.skipUnless(shutil.which("xmllint"), "xmllint independente indisponível")
    def test_assinatura_independente_dentro_do_envelope_soap11_e_soap12(self):
        for kind in ["cancellation", "correction", "invalidation", "nfe"]:
            xml, _ = signed(job_base()) if kind == "nfe" else (
                self.make_invalidation() if kind == "invalidation" else self.make_event(kind)
            )
            for uf in ["SP", "RJ"]:
                endpoint = Endpoint.NFEINUTILIZACAO if kind == "invalidation" else Endpoint.RECEPCAOEVENTO
                envelope = soap._envelope(soap.service(uf, "homologation", endpoint), xml)
                root = etree.fromstring(envelope.encode())
                info_tag = "infNFe" if kind == "nfe" else "infInut" if kind == "invalidation" else "infEvento"
                info = root.find(f".//{{{NS}}}{info_tag}")
                signed_info = root.find(f".//{{{DS}}}SignedInfo")
                def canonicalize(node):
                    result = subprocess.run(["xmllint", "--c14n", "-"], input=etree.tostring(node), capture_output=True, check=True)
                    return result.stdout
                expected_digest = root.findtext(f".//{{{DS}}}DigestValue")
                self.assertEqual(expected_digest, base64.b64encode(hashlib.sha1(canonicalize(info)).digest()).decode())
                signature = base64.b64decode(root.findtext(f".//{{{DS}}}SignatureValue"))
                from cryptography import x509
                cert = x509.load_der_x509_certificate(base64.b64decode(root.findtext(f".//{{{DS}}}X509Certificate")))
                cert.public_key().verify(signature, canonicalize(signed_info), padding.PKCS1v15(), hashes.SHA1())

    def test_schema_errors_nao_expoem_cnpj_ou_xml(self):
        errors = validar_documento(f'<evento xmlns="{NS}"><CNPJ>{CNPJ}</CNPJ></evento>', "correction")
        self.assertTrue(errors)
        self.assertNotIn(CNPJ, str(errors))
        self.assertNotIn("<evento", str(errors))


class SoapTests(FiscalFixtures):
    def test_catalogo_tem_eventos_e_inutilizacao_para_27_ufs_e_ambientes(self):
        for uf in soap.AUTHORIZER_BY_UF:
            for environment in ["homologation", "production"]:
                for endpoint in [Endpoint.RECEPCAOEVENTO, Endpoint.NFEINUTILIZACAO]:
                    configured = soap.service(uf, environment, endpoint)
                    self.assertTrue(configured.url.startswith("https://"))
                    self.assertNotIn("?wsdl", configured.url)

    def test_consulta_preserva_status_cancelado_e_protocolo_anterior(self):
        result = soap._parse(consultation(self.key, cstat="101"))
        self.assertEqual("101", result["cstat"])
        self.assertEqual("100", result["protocol_cstat"])
        self.assertEqual(PROTOCOL, result["protocol"])
        self.assertEqual(WHEN, result["authorized_at"])

    def test_parse_rejeicao_e_recibo_nao_confunde_status_de_lote(self):
        raw = f'<retEnviNFe xmlns="{NS}" versao="4.00"><tpAmb>2</tpAmb><cStat>103</cStat><xMotivo>Lote recebido</xMotivo><infRec><nRec>135000000000001</nRec></infRec></retEnviNFe>'
        self.assertEqual("135000000000001", soap._parse(raw)["receipt"])
        self.assertEqual("103", soap._parse(raw)["cstat"])
        self.assertEqual("225", soap._parse(raw.replace("103", "225"))["cstat"])

    def test_parse_xml_inseguro_falha_soap_e_namespace_errado(self):
        for raw in ["<bad", '<!DOCTYPE x [<!ENTITY x "secret">]><x>&x;</x>',
                    f'<s:Envelope xmlns:s="{soap.SOAP12}"><s:Body><s:Fault/></s:Body></s:Envelope>',
                    '<retConsSitNFe xmlns="https://outro.invalid"><cStat>100</cStat></retConsSitNFe>']:
            with self.subTest(raw=raw[:30]), self.assertRaises(soap.ErroSefazNfe):
                soap._parse(raw)

    def test_parse_resultado_asmx_escapado(self):
        raw = soap_wrap(f'<nfeResultMsg xmlns="urn:test">{escape(consultation(self.key))}</nfeResultMsg>')
        self.assertEqual("100", soap._parse(raw)["cstat"])

    def test_parse_evento_sucesso_rejeicao_e_duplicidade(self):
        for cstat in ["135", "580", "573"]:
            result = soap.interpretar_evento(event_batch(event_return(self.key, "cancellation", cstat=cstat)), key=self.key, event_type="110111", sequence=1)
            self.assertEqual("128", result["batch_cstat"])
            self.assertEqual(cstat, result["cstat"])
        with self.assertRaises(soap.ErroSefazNfe):
            soap.interpretar_evento(event_batch(event_return(self.key, "correction", 2)), key=self.key, event_type="110110", sequence=1)

    @patch("app.nfe.soap._post")
    def test_transporte_evento_e_processado_oficial(self, post):
        for kind in EVENT_TYPES:
            signed_xml, _ = self.make_event(kind)
            returned = event_return(self.key, kind)
            post.return_value = event_batch(returned)
            result = soap.transmitir_evento(signed_xml, "SP", "homologation", self.credential, "1")
            self.assertEqual("135", result["cstat"])
            self.assertEqual(EVENT_PROTOCOL, result["protocol"])
            self.assertIn("<envEvento", post.call_args.args[1])
            processed = montar_processado(signed_xml, result["return_xml"], kind)
            self.assertEqual([], validar_documento(processed, kind, processed=True))

    @patch("app.nfe.soap._post")
    def test_transporte_inutilizacao_e_processado_oficial(self, post):
        signed_xml, _ = self.make_invalidation()
        post.return_value = invalidation_return()
        result = soap.transmitir_inutilizacao(signed_xml, "SP", "homologation", self.credential)
        self.assertEqual("102", result["cstat"])
        self.assertEqual("1", result["first"])
        processed = montar_processado(signed_xml, result["return_xml"], "invalidation")
        self.assertEqual([], validar_documento(processed, "invalidation", processed=True))

    @patch("app.nfe.soap._post")
    def test_ambiente_chave_e_sequencia_errados_nao_transmitem(self, post):
        xml, _ = self.make_event()
        with self.assertRaises((ErroNfeLocal, soap.ErroSefazNfe)):
            soap.transmitir_evento(xml, "SP", "production", self.credential, "1")
        with self.assertRaises((ErroNfeLocal, soap.ErroSefazNfe)):
            soap.transmitir_evento(xml, "RJ", "homologation", self.credential, "1")
        post.assert_not_called()

    def test_processado_nao_aceita_sucesso_sem_protocolo_ou_outro_ambiente(self):
        xml, _ = self.make_event()
        for returned in [event_return(self.key, "cancellation", tp_amb="1"),
                         event_return(self.key, "cancellation", protocol=None),
                         event_return(self.key, "cancellation", cstat="136")]:
            with self.assertRaises(ErroNfeLocal):
                montar_processado(xml, returned, "cancellation")


class OperationTests(FiscalFixtures):
    @patch("app.nfe.soap._post")
    def test_operacao_idempotente_sucesso_nao_repete_consulta_nem_envio(self, post):
        operation = self.operation()
        store = MemoryStore()
        post.side_effect = [consultation(self.key), event_batch(event_return(self.key, "cancellation"))]
        result = executar(operation, store, self.credential)
        self.assertEqual("accepted", result.state)
        self.assertEqual(["transmitting", "accepted"], store.transitions)
        self.assertEqual(result, executar(operation, store, self.credential))
        self.assertEqual(2, post.call_count)

    @patch("app.nfe.soap._post")
    def test_rejeicao_terminal_nao_reenvia(self, post):
        operation = self.operation()
        store = MemoryStore()
        post.side_effect = [consultation(self.key), event_batch(event_return(self.key, "cancellation", cstat="580"))]
        self.assertEqual("rejected", executar(operation, store, self.credential).state)
        self.assertEqual("rejected", executar(operation, store, self.credential).state)
        self.assertEqual(2, post.call_count)

    @patch("app.nfe.soap._post")
    def test_timeout_consulta_posterior_sem_evento_nao_reenvia(self, post):
        operation = self.operation()
        store = MemoryStore()
        post.side_effect = [consultation(self.key), TimeoutError(), consultation(self.key)]
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual(3, post.call_count)
        self.assertEqual(1, store.transitions.count("transmitting"))

    @patch("app.nfe.soap._post")
    def test_timeout_reconcilia_prova_da_mesma_tentativa_sem_reenvio(self, post):
        operation = self.operation()
        store = MemoryStore()
        proof = consultation(self.key, cstat="101", events=[(operation.xml, event_return(self.key, "cancellation"))])
        post.side_effect = [consultation(self.key), TimeoutError(), proof]
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual("accepted", executar(operation, store, self.credential).state)
        self.assertEqual(3, post.call_count)

    @patch("app.nfe.soap._post")
    def test_duplicidade_precisa_da_prova_e_nao_conclui_so_com_573(self, post):
        operation = self.operation()
        store = MemoryStore()
        proof = consultation(self.key, cstat="101", events=[(operation.xml, event_return(self.key, "cancellation"))])
        post.side_effect = [consultation(self.key), event_batch(event_return(self.key, "cancellation", cstat="573")), proof]
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual("accepted", executar(operation, store, self.credential).state)

    @patch("app.nfe.soap._post")
    def test_conflito_de_hash_falha_antes_da_rede(self, post):
        original = self.operation("correction")
        changed = self.operation("correction", text="Conteudo diferente para a mesma sequencia")
        store = MemoryStore()
        store.reserve(original.scope, original.payload_hash)
        with self.assertRaisesRegex(ErroNfeLocal, "outro conteúdo"):
            executar(changed, store, self.credential)
        post.assert_not_called()

    @patch("app.nfe.soap._post")
    def test_reconciliacao_nao_aceita_conteudo_de_outro_pedido(self, post):
        operation = self.operation("correction")
        changed = self.operation("correction", text="Conteudo diferente para a mesma sequencia")
        store = MemoryStore()
        post.return_value = consultation(self.key, events=[(changed.xml, event_return(self.key, "correction"))])
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual(1, post.call_count)

    @patch("app.nfe.soap._post")
    def test_cce_sequencia_sucessora_exige_historico_oficial(self, post):
        first = self.operation("correction")
        second = self.operation("correction", sequence=2)
        store = MemoryStore()
        post.side_effect = [consultation(self.key, events=[(first.xml, event_return(self.key, "correction"))]), event_batch(event_return(self.key, "correction", 2))]
        self.assertEqual("accepted", executar(second, store, self.credential).state)
        self.assertEqual(2, post.call_count)

    @patch("app.nfe.soap._post")
    def test_cce_nao_avanca_sem_sequencia_anterior_ou_com_evento_nao_vinculado(self, post):
        second = self.operation("correction", sequence=2)
        first, _ = self.make_event("correction")
        for events in [[], [(first, event_return(self.key, "correction", cstat="136"))]]:
            post.return_value = consultation(self.key, events=events)
            post.reset_mock()
            self.assertEqual("uncertain", executar(second, MemoryStore(), self.credential).state)
            self.assertEqual(1, post.call_count)

    @patch("app.nfe.soap._post")
    def test_crash_apos_begin_ou_disputa_de_cas_nunca_repete_mutacao(self, post):
        operation = self.operation()
        post.return_value = consultation(self.key)
        store = MemoryStore()
        record = store.reserve(operation.scope, operation.payload_hash)
        store.compare_and_set(operation.scope, record.revision, "transmitting", {})
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual(1, post.call_count)
        post.reset_mock()
        contested = MemoryStore()
        contested.lose_begin = True
        self.assertEqual("transmitting", executar(operation, contested, self.credential).state)
        self.assertEqual(1, post.call_count)

    @patch("app.nfe.soap._post")
    def test_aceite_remoto_com_falha_local_reconcilia_sem_duplicar(self, post):
        operation = self.operation()
        store = MemoryStore()
        store.fail_accept = True
        post.side_effect = [consultation(self.key), event_batch(event_return(self.key, "cancellation")), consultation(self.key, cstat="101", events=[(operation.xml, event_return(self.key, "cancellation"))])]
        with self.assertRaises(RuntimeError):
            executar(operation, store, self.credential)
        self.assertEqual("transmitting", store.records[operation.scope].state)
        store.fail_accept = False
        self.assertEqual("accepted", executar(operation, store, self.credential).state)
        self.assertEqual(3, post.call_count)

    @patch("app.nfe.soap._post")
    def test_inutilizacao_timeout_bloqueia_reenvio_e_reconcilia_so_com_prova(self, post):
        operation = self.operation("invalidation")
        store = MemoryStore()
        post.side_effect = TimeoutError()
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual("uncertain", executar(operation, store, self.credential).state)
        self.assertEqual(1, post.call_count)
        self.assertEqual("uncertain", reconciliar_inutilizacao(operation, store, invalidation_return(first="2")).state)
        self.assertEqual("uncertain", reconciliar_inutilizacao(operation, store, invalidation_return(cstat="563")).state)
        self.assertEqual("accepted", reconciliar_inutilizacao(operation, store, invalidation_return()).state)
        self.assertEqual(1, post.call_count)

    @patch("app.nfe.soap._post")
    def test_inutilizacao_sucesso_e_rejeicao_terminal(self, post):
        for status, state in [("102", "accepted"), ("206", "rejected"), ("563", "uncertain")]:
            post.return_value = invalidation_return(status)
            post.side_effect = None
            operation = self.operation("invalidation")
            self.assertEqual(state, executar(operation, MemoryStore(), self.credential).state)

    @patch("app.nfe.soap._post")
    def test_operacao_sem_snapshot_valido_ou_empresa_diferente_nao_compartilha_identidade(self, post):
        operation = self.operation()
        with self.assertRaises(ErroNfeLocal):
            executar(replace(operation, identity="outro"), MemoryStore(), self.credential)
        post.assert_not_called()
        other = replace(operation, company_id="00000000-0000-4000-8000-000000000002")
        self.assertNotEqual(operation.scope, other.scope)


if __name__ == "__main__":
    unittest.main()
