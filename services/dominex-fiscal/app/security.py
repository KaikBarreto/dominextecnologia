"""Autenticação e autorização dos clientes do motor fiscal.

O token legado continua sendo o cliente ``dominex`` com escopo total. Clientes
novos são configurados no servidor e recebem escopos próprios; corpo e headers
da requisição nunca escolhem permissões.
"""

from __future__ import annotations

import hmac
import logging
import threading
import time
from collections import deque
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, Header, HTTPException, Request

from .config import ClienteFiscal, ConfiguracaoInvalida, get_config

log = logging.getLogger("motor-fiscal.security")


@dataclass(frozen=True)
class PrincipalFiscal:
    client_id: str
    escopos: frozenset[str]

    def permite(self, escopo: str) -> bool:
        familia, _, _acao = escopo.partition(":")
        return "*" in self.escopos or escopo in self.escopos or f"{familia}:*" in self.escopos


_janelas: dict[str, deque[float]] = {}
_janelas_lock = threading.Lock()


def _limitar(cliente: ClienteFiscal) -> None:
    agora = time.monotonic()
    inicio = agora - 60.0
    with _janelas_lock:
        janela = _janelas.setdefault(cliente.id, deque())
        while janela and janela[0] <= inicio:
            janela.popleft()
        if len(janela) >= cliente.limite_por_minuto:
            raise HTTPException(status_code=429, headers={"Retry-After": "60"})
        janela.append(agora)


def clientes_configurados() -> tuple[ClienteFiscal, ...]:
    try:
        return get_config().clientes
    except ConfiguracaoInvalida:
        return ()


def tokens_aceitos() -> list[str]:
    """Compatibilidade para diagnóstico existente; nunca devolvida pela API."""
    return [token for cliente in clientes_configurados() for token in cliente.tokens]


def token_configurado() -> bool:
    return bool(tokens_aceitos())


async def exigir_token(
    request: Request,
    authorization: str | None = Header(default=None),
) -> PrincipalFiscal:
    clientes = clientes_configurados()
    if not clientes:
        log.error("nenhum cliente fiscal configurado — recusando toda requisição")
        raise HTTPException(status_code=401)
    if not authorization:
        raise HTTPException(status_code=401)

    esquema, _, apresentado = authorization.partition(" ")
    apresentado = apresentado.strip()
    if esquema.lower() != "bearer" or not apresentado:
        raise HTTPException(status_code=401)

    # Avalia todos os tokens, mesmo depois de encontrar um, para não revelar
    # por tempo qual cliente ou posição do anel correspondeu.
    resultados: list[tuple[ClienteFiscal, bool]] = []
    for cliente in clientes:
        comparacoes = [hmac.compare_digest(apresentado, token) for token in cliente.tokens]
        resultados.append((cliente, any(comparacoes)))
    correspondentes = [cliente for cliente, acertou in resultados if acertou]
    if len(correspondentes) != 1:
        raise HTTPException(status_code=401)

    cliente = correspondentes[0]
    _limitar(cliente)
    principal = PrincipalFiscal(cliente.id, cliente.escopos)
    request.state.fiscal_principal = principal
    return principal


def exigir_escopo(*escopos: str) -> Callable:
    normalizados = tuple(escopo.strip().lower() for escopo in escopos if escopo.strip())
    if not normalizados:
        raise ValueError("Ao menos um escopo fiscal é obrigatório.")

    async def dependencia(
        principal: PrincipalFiscal = Depends(exigir_token),
    ) -> PrincipalFiscal:
        if not all(principal.permite(escopo) for escopo in normalizados):
            raise HTTPException(status_code=403)
        return principal

    return dependencia


def limpar_rate_limit_para_testes() -> None:
    """Evita estado global entre testes; não é rota nem contrato público."""
    with _janelas_lock:
        _janelas.clear()
