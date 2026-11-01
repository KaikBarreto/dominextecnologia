"""Execução segura, desacoplada do banco e sem retry de mutações fiscais.

O adaptador de OperationStore deve persistir reserva e CAS em transações,
isoladas pelo company_id autenticado. Não há store volátil de produção nem
chamador habilitado aqui: a integração com outbox/RPC é responsabilidade do
backend. Timeout, crash após begin e duplicidade exigem reconciliação.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Any, Protocol
from uuid import UUID

from lxml import etree

from ..sefaz.credencial import CredencialSefaz as CredencialFiscal
from . import soap
from .documents import (
    EVENT_TYPES, _context, montar_processado, proxima_sequencia_cce,
    validar_documento, validar_identidade,
)
from .xml import NS, ErroNfeLocal, _validate_certificate_owner, validar_assinatura

Scope = tuple[str, str, str, str]
TERMINAL = {"accepted", "rejected"}
# Disponibilidade/erro interno/duplicidade não comprovam rejeição terminal.
UNCERTAIN = {None, "108", "109", "128", "136", "204", "218", "539", "573", "563", "999"}


@dataclass(frozen=True)
class Operation:
    company_id: str
    uf: str
    environment: str
    kind: str
    xml: str = field(repr=False)
    identity: str = field(repr=False)
    payload_hash: str

    @property
    def scope(self) -> Scope:
        return self.company_id, self.environment, self.uf, self.identity


@dataclass(frozen=True)
class Record:
    revision: int
    payload_hash: str
    state: str
    result: dict[str, Any] = field(default_factory=dict, repr=False)


class OperationStore(Protocol):
    def reserve(self, scope: Scope, payload_hash: str) -> Record:
        """INSERT prepared se ausente; unicidade de scope; nunca alterar o hash."""
        ...

    def compare_and_set(
        self, scope: Scope, expected_revision: int, state: str, result: dict[str, Any]
    ) -> Record | None:
        """CAS transacional durável; incrementa revisão; None quando outra posse venceu.

        Rejeitar regressão de estado terminal e validar isolamento por empresa.
        A confirmação de transmitting precisa estar commitada antes de retornar.
        Na inutilização, bloquear faixas sobrepostas e comprovar atomicamente que
        nenhum número foi autorizado/reservado por outra operação de emissão.
        """
        ...


def _info(xml: str, kind: str) -> etree._Element:
    root = etree.fromstring(xml.encode(), etree.XMLParser(resolve_entities=False, no_network=True))
    info = root.find(f"{{{NS}}}{'infInut' if kind == 'invalidation' else 'infEvento'}")
    if info is None:
        raise ErroNfeLocal("Documento sem identidade fiscal.")
    return info


def _value(info: etree._Element, name: str) -> str | None:
    return info.findtext(f"{{{NS}}}{name}")


def _hash(info: etree._Element) -> str:
    # Prefixos/declarações SOAP não pertencem ao conteúdo fiscal. QNames
    # expandidos preservam namespaces, atributos e texto sem essa variação.
    def content(node: etree._Element) -> list[Any]:
        return [node.tag, sorted(node.attrib.items()), node.text or "",
                [content(child) for child in node if isinstance(child.tag, str)]]
    canonical = json.dumps(content(info), ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def preparar_operacao(
    *, company_id: str, uf: str, environment: str, kind: str, signed_xml: str,
) -> Operation:
    try:
        company_id = str(UUID(company_id))
    except (ValueError, TypeError, AttributeError):
        raise ErroNfeLocal("Empresa autenticada inválida para a operação fiscal.") from None
    _context(uf, environment)
    errors = validar_documento(signed_xml, kind)
    tag = "infInut" if kind == "invalidation" else "infEvento"
    errors += validar_assinatura(signed_xml, information_tag=tag)
    if errors:
        raise ErroNfeLocal("; ".join(errors))
    info = _info(signed_xml, kind)
    validar_identidade(signed_xml, kind, uf, environment)
    identity = str(info.get("Id"))
    return Operation(company_id, uf.upper(), environment, kind, signed_xml, identity, _hash(info))


def _save(store: OperationStore, operation: Operation, record: Record, result: dict[str, Any]) -> Record:
    changed = store.compare_and_set(operation.scope, record.revision, result["state"], result)
    return changed if changed is not None else store.reserve(operation.scope, operation.payload_hash)


def _uncertain(reason: str, **details: Any) -> dict[str, Any]:
    return {**details, "state": "uncertain", "action": "reconcile", "reason": reason}


def _event_proof(operation: Operation, consultation: dict[str, Any]) -> dict[str, Any] | None:
    info = _info(operation.xml, operation.kind)
    identity = (_value(info, "chNFe"), _value(info, "tpEvento"), _value(info, "nSeqEvento"))
    matches = [event for event in consultation.get("events", [])
               if (event.get("key"), event.get("event_type"), event.get("sequence")) == identity]
    if not matches:
        return None
    if len(matches) != 1:
        return _uncertain("A consulta retornou eventos conflitantes para a mesma sequência.")
    event = matches[0]
    if not event.get("request_xml") or _hash(_info(event["request_xml"], operation.kind)) != operation.payload_hash:
        return _uncertain("O evento consultado tem conteúdo diferente ou sem prova do pedido.")
    try:
        processed = montar_processado(operation.xml, event["return_xml"], operation.kind)
    except (ErroNfeLocal, KeyError):
        return _uncertain("O evento consultado ainda não comprova conclusão vinculada à NF-e.")
    return {**event, "state": "accepted", "processed_xml": processed}


def _preflight_event(operation: Operation, consultation: dict[str, Any]) -> dict[str, Any] | None:
    info = _info(operation.xml, operation.kind)
    key = _value(info, "chNFe")
    if consultation.get("key") != key or consultation.get("tp_amb") != _value(info, "tpAmb"):
        return _uncertain("A consulta não comprovou a chave e o ambiente esperados.")
    proof = _event_proof(operation, consultation)
    if proof is not None:
        return proof
    if consultation.get("cstat") not in {"100", "150"} or not consultation.get("protocol"):
        return _uncertain("A consulta não confirmou uma NF-e autorizada para o evento.")
    if operation.kind == "cancellation":
        if consultation["protocol"] != info.findtext(f"{{{NS}}}detEvento/{{{NS}}}nProt"):
            return _uncertain("O protocolo atual não corresponde ao pedido de cancelamento.")
    else:
        corrections = [event for event in consultation.get("events", [])
                       if event.get("event_type") == EVENT_TYPES["correction"]]
        if any(event.get("key") != key or event.get("tp_amb") != _value(info, "tpAmb")
               or event.get("cstat") != "135" or not event.get("protocol")
               for event in corrections):
            return _uncertain("Há CC-e sem confirmação conclusiva; reconcilie antes de avançar.")
        try:
            expected = proxima_sequencia_cce([int(event["sequence"]) for event in corrections])
        except (ErroNfeLocal, ValueError, TypeError, KeyError):
            return _uncertain("O histórico de sequências CC-e precisa de reconciliação.")
        if str(expected) != _value(info, "nSeqEvento"):
            return _uncertain("A sequência CC-e não é a sucessora do histórico oficial.")
    return None


def _classify(operation: Operation, response: dict[str, Any]) -> dict[str, Any]:
    status = response.get("cstat")
    if status in ({"102"} if operation.kind == "invalidation" else {"135", "155"}):
        try:
            processed = montar_processado(operation.xml, response["return_xml"], operation.kind)
        except (ErroNfeLocal, KeyError):
            return _uncertain("O retorno não comprova a conclusão fiscal do pedido.", cstat=status)
        return {**response, "state": "accepted", "processed_xml": processed}
    if status in UNCERTAIN or not isinstance(status, str) or len(status) != 3 \
            or not status.isascii() or not status.isdigit() or not "200" <= status <= "899":
        return _uncertain("A operação exige reconciliação antes de qualquer nova tentativa.", cstat=status)
    return {**response, "state": "rejected"}


def executar(
    operation: Operation, store: OperationStore, credential: CredencialFiscal, *,
    batch_id: str = "1", timeout: int = 20,
) -> Record:
    """Nunca chama mutação novamente após prepared → transmitting.

    O chamador deve fornecer documento congelado e company_id de origem confiável.
    Recriar data/texto na repetição provoca conflito de hash e falha fechada.
    """
    # Não confiar em instanciação manual de Operation para pular os validadores.
    checked = preparar_operacao(
        company_id=operation.company_id, uf=operation.uf, environment=operation.environment,
        kind=operation.kind, signed_xml=operation.xml,
    )
    if checked != operation:
        raise ErroNfeLocal("Snapshot da operação fiscal foi alterado.")
    _validate_certificate_owner(_value(_info(operation.xml, operation.kind), "CNPJ"), credential)
    record = store.reserve(operation.scope, operation.payload_hash)
    if record.payload_hash != operation.payload_hash:
        raise ErroNfeLocal("A identidade fiscal já foi reservada com outro conteúdo.")
    if record.state in TERMINAL:
        return record
    if operation.kind != "invalidation":
        info = _info(operation.xml, operation.kind)
        try:
            consultation = soap.consultar(
                _value(info, "chNFe"), operation.uf, operation.environment, credential, timeout,
            )
            preflight = _preflight_event(operation, consultation)
        except Exception:
            return _save(store, operation, record, _uncertain("Não foi possível reconciliar o evento na consulta oficial."))
        if preflight is not None:
            return _save(store, operation, record, preflight)
    if record.state != "prepared":
        return _save(store, operation, record, _uncertain("Já houve tentativa de envio; aguarde prova conclusiva sem reenviar."))
    started = store.compare_and_set(operation.scope, record.revision, "transmitting", {"state": "transmitting"})
    if started is None:
        return store.reserve(operation.scope, operation.payload_hash)
    try:
        if operation.kind == "invalidation":
            response = soap.transmitir_inutilizacao(
                operation.xml, operation.uf, operation.environment, credential, timeout,
            )
        else:
            response = soap.transmitir_evento(
                operation.xml, operation.uf, operation.environment, credential, batch_id, timeout,
            )
        result = _classify(operation, response)
    except Exception:
        # Mesmo erro HTTP não retryable pode ocorrer após a escrita remota.
        result = _uncertain("O envio não teve confirmação conclusiva; não reenviar o pedido.")
    return _save(store, operation, started, result)


def reconciliar_inutilizacao(operation: Operation, store: OperationStore, response_xml: str) -> Record:
    """Ingere prova oficial; não existe endpoint de consulta dedicado no catálogo.

    Sem retInutNFe conclusivo, o estado incerto permanece e o envio é bloqueado.
    """
    if operation.kind != "invalidation":
        raise ErroNfeLocal("A reconciliação exige um pedido de inutilização.")
    record = store.reserve(operation.scope, operation.payload_hash)
    if record.payload_hash != operation.payload_hash:
        raise ErroNfeLocal("A identidade fiscal já foi reservada com outro conteúdo.")
    if record.state in TERMINAL:
        return record
    try:
        response = soap.interpretar_inutilizacao(response_xml)
        # Apenas sucesso com identidade completa pode resolver envio anterior.
        if response.get("cstat") != "102":
            return _save(store, operation, record, _uncertain("A prova recebida não confirma a inutilização."))
        result = _classify(operation, response)
    except (soap.ErroSefazNfe, ErroNfeLocal):
        result = _uncertain("A prova recebida não confirma a inutilização.")
    return _save(store, operation, record, result)
