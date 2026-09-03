"""Erros de domínio do motor fiscal.

Regra-lei: a mensagem que sai daqui pode chegar à tela do cliente, então é
SEMPRE PT-BR amigável e NUNCA cita endpoint, biblioteca, caminho de arquivo ou
nome de fornecedor. O detalhe técnico vai para `detalhe`, que só o log e a
trilha de auditoria enxergam.
"""

from __future__ import annotations

from typing import Any


class ErroFiscal(Exception):
    """Base. `status` é o HTTP que o microserviço devolve à edge."""

    status = 502
    codigo = "erro_fiscal"

    def __init__(
        self,
        mensagem: str,
        *,
        codigo: str | None = None,
        status: int | None = None,
        detalhe: Any = None,
    ) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem
        if codigo:
            self.codigo = codigo
        if status:
            self.status = status
        self.detalhe = detalhe

    def corpo(self) -> dict:
        corpo: dict[str, Any] = {
            "erro": {"codigo": self.codigo, "mensagem": self.mensagem},
        }
        if self.detalhe is not None:
            corpo["detalhe"] = self.detalhe
        return corpo


class DadosInvalidos(ErroFiscal):
    """A requisição não tem o necessário para montar um documento válido."""

    status = 422
    codigo = "dados_invalidos"


class DocumentoRejeitado(ErroFiscal):
    """A administração tributária recusou o documento (E0312, E0625, ...).

    Não é falha nossa nem indisponibilidade: é conteúdo. Vira `rejeitada`.
    """

    status = 422
    codigo = "documento_rejeitado"


class DocumentoNaoEncontrado(ErroFiscal):
    status = 404
    codigo = "documento_nao_encontrado"


class CertificadoInvalido(ErroFiscal):
    status = 422
    codigo = "certificado_invalido"


class ServicoFiscalIndisponivel(ErroFiscal):
    """Governo fora do ar, timeout, 5xx. Tentar de novo mais tarde resolve."""

    status = 503
    codigo = "servico_indisponivel"


class AcessoNegadoNoGoverno(ErroFiscal):
    """O certificado não autentica / não tem permissão para esta operação."""

    status = 403
    codigo = "acesso_negado"
