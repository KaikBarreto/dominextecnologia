from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import Field, model_validator

from ..schemas import RequisicaoAutenticada


class OperacaoFiscal(RequisicaoAutenticada):
    tenant_id: str = Field(alias="tenantId", min_length=1, max_length=100)
    operation_id: UUID = Field(alias="operationId")
    snapshot_hash: str = Field(alias="snapshotHash", pattern=r"^[0-9a-f]{64}$")

    @model_validator(mode="after")
    def tenant_e_custodia_coincidem(self):
        if self.tenant_id.strip().lower() != self.empresa_id.strip().lower():
            raise ValueError("tenantId precisa corresponder à empresa da custódia.")
        return self


class PrepararNfeRequest(OperacaoFiscal):
    documento: dict[str, Any]


class ConsultarNfeRequest(RequisicaoAutenticada):
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    xml_assinado: str | None = Field(default=None, alias="xmlAssinado", max_length=5_000_000)


class StatusNfeRequest(RequisicaoAutenticada):
    uf: str = Field(min_length=2, max_length=2)


class AutorizarNfeRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    id_lote: str = Field(alias="idLote", pattern=r"^[0-9]{1,15}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=100, max_length=5_000_000)


class PrepararEventoNfeRequest(OperacaoFiscal):
    tipo: Literal["cancellation", "correction"]
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    cnpj: str = Field(pattern=r"^[0-9]{14}$")
    sequencia: int = Field(default=1, ge=1, le=20)
    texto: str = Field(min_length=15, max_length=1000)
    ocorrido_em: datetime = Field(alias="ocorridoEm")
    protocolo: str | None = Field(default=None, pattern=r"^[0-9]{15}$")


class TransmitirEventoNfeRequest(OperacaoFiscal):
    tipo: Literal["cancellation", "correction"]
    uf: str = Field(min_length=2, max_length=2)
    id_lote: str = Field(alias="idLote", pattern=r"^[0-9]{1,15}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=100, max_length=2_000_000)


class PrepararInutilizacaoNfeRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    cnpj: str = Field(pattern=r"^[0-9]{14}$")
    ano: int = Field(ge=0, le=99)
    serie: int = Field(ge=0, le=889)
    numero_inicial: int = Field(alias="numeroInicial", ge=1, le=999_999_999)
    numero_final: int = Field(alias="numeroFinal", ge=1, le=999_999_999)
    justificativa: str = Field(min_length=15, max_length=255)


class TransmitirInutilizacaoNfeRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    xml_assinado: str = Field(alias="xmlAssinado", min_length=100, max_length=2_000_000)
