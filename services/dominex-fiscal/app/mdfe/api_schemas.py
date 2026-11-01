from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from ..nfe.api_schemas import OperacaoFiscal
from ..schemas import RequisicaoAutenticada


class PrepararMdfeRequest(OperacaoFiscal):
    snapshot: dict[str, Any]
    emitido_em: datetime = Field(alias="emitidoEm")
    codigo_numerico: str = Field(alias="codigoNumerico", pattern=r"^[0-9]{8}$")


class ConsultarMdfeRequest(RequisicaoAutenticada):
    chave: str = Field(pattern=r"^[0-9]{44}$")


class AutorizarMdfeRequest(OperacaoFiscal):
    chave: str = Field(pattern=r"^[0-9]{44}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=300, max_length=5_000_000)


class PrepararEventoMdfeRequest(OperacaoFiscal):
    acao: Literal["cancel", "enclose"]
    chave: str = Field(pattern=r"^[0-9]{44}$")
    protocolo: str = Field(pattern=r"^[0-9]{15}$")
    snapshot: dict[str, Any]
    ocorrido_em: datetime = Field(alias="ocorridoEm")
    justificativa: str | None = Field(default=None, min_length=15, max_length=255)


class TransmitirEventoMdfeRequest(OperacaoFiscal):
    acao: Literal["cancel", "enclose"]
    chave: str = Field(pattern=r"^[0-9]{44}$")
    xml_assinado: str = Field(alias="xmlAssinado", min_length=300, max_length=2_000_000)
