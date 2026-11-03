from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from ..nfe.api_schemas import OperacaoFiscal
from ..schemas import RequisicaoAutenticada


class PrepararNfceRequest(OperacaoFiscal):
    documento: dict[str, Any]
    qr_base_url: str = Field(alias="qrBaseUrl", min_length=20, max_length=500)
    access_url: str = Field(alias="accessUrl", min_length=20, max_length=500)


class StatusNfceRequest(RequisicaoAutenticada):
    uf: str = Field(min_length=2, max_length=2)


class ConsultarNfceRequest(RequisicaoAutenticada):
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    xml_assinado: str | None = Field(default=None, alias="xmlAssinado", max_length=5_000_000)


class AutorizarNfceRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    id_lote: str = Field(alias="idLote", pattern=r"^[0-9]{1,15}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=100, max_length=5_000_000)


class PrepararCancelamentoNfceRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    chave: str = Field(pattern=r"^[0-9]{44}$")
    cnpj: str = Field(pattern=r"^[0-9]{14}$")
    protocolo: str = Field(pattern=r"^[0-9]{15}$")
    justificativa: str = Field(min_length=15, max_length=255)
    ocorrido_em: datetime = Field(alias="ocorridoEm")


class TransmitirCancelamentoNfceRequest(OperacaoFiscal):
    uf: str = Field(min_length=2, max_length=2)
    id_lote: str = Field(alias="idLote", pattern=r"^[0-9]{1,15}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=100, max_length=2_000_000)


class GerarDanfceRequest(BaseModel):
    """Gera a representação impressa a partir da prova oficial já autorizada."""

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    xml_processado: str = Field(
        alias="xmlProcessado", min_length=200, max_length=5_000_000
    )
    largura_papel_mm: Literal[80] = Field(default=80, alias="larguraPapelMm")
