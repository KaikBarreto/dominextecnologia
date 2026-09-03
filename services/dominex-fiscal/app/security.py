"""
Autenticação edge → microserviço — DONO: 🖥️ Dev Infra (tarefa C2 do plano NFS-e).

⚠️ ESCOPO DESTE ARQUIVO: só o portão de entrada (autenticação).
   A custódia (KEK/DEK, .pfx, PEM) mora em `app/custodia.py` e `app/config.py`,
   que são do motor (C4). **Não duplicar cripto aqui** — uma implementação só.

Regras codificadas:
  - 401 é resposta VAZIA (o handler em main.py tira o corpo). Quem não tem o
    token não descobre nada: nem se o token estava ausente, nem se estava errado.
  - Comparação em TEMPO CONSTANTE, sem curto-circuito entre os tokens aceitos.
  - FAIL CLOSED: sem token configurado, o serviço recusa TUDO. Nunca fica aberto.
  - JANELA DE ROTAÇÃO: aceita o token vigente E o anterior ao mesmo tempo, o que
    permite trocar o segredo do Supabase sem janela de erro (RUNBOOK §3.2).
"""

from __future__ import annotations

import hmac
import logging
import os

from fastapi import Header, HTTPException

from .config import ConfiguracaoInvalida, get_config

log = logging.getLogger("dominex-fiscal.security")


def tokens_aceitos() -> list[str]:
    """Token vigente (obrigatório) + token anterior (opcional, só na rotação).

    O vigente vem do `get_config()` — mesma fonte que o resto do serviço, pra não
    existir duas verdades. O anterior é opcional e vive só enquanto a rotação
    estiver em andamento; depois volta a ficar vazio.
    """
    aceitos: list[str] = []
    try:
        aceitos.append(get_config().token)
    except ConfiguracaoInvalida:
        # Sem token válido não há o que aceitar. O 401 abaixo cobre.
        pass

    # ⚠️ O anterior chega por ARQUIVO (FISCAL_SERVICE_TOKEN_PREV_FILE, docker
    # secret) — `get_config()` já resolve arquivo↔env. Ler só do env aqui fazia a
    # janela de rotação não funcionar no compose de produção.
    anterior = ""
    try:
        anterior = get_config().token_anterior
    except ConfiguracaoInvalida:
        anterior = ""
    anterior = (anterior or os.environ.get("FISCAL_SERVICE_TOKEN_PREV", "")).strip()
    if anterior and len(anterior) >= 32:
        aceitos.append(anterior)
    return aceitos


def token_configurado() -> bool:
    return bool(tokens_aceitos())


async def exigir_token(authorization: str | None = Header(default=None)) -> None:
    """Dependência do FastAPI: `dependencies=[Depends(exigir_token)]`.

    Usada em TODA rota menos `/healthz`. Se você criar rota nova, ela nasce
    protegida — a exceção é que tem que ser justificada, não o contrário.
    """
    aceitos = tokens_aceitos()
    if not aceitos:
        # Mal provisionado: recusar tudo é melhor do que ficar aberto.
        log.error(
            "FISCAL_SERVICE_TOKEN ausente/curto — recusando toda requisição (fail closed). "
            "Ver RUNBOOK §1.4."
        )
        raise HTTPException(status_code=401)

    if not authorization:
        raise HTTPException(status_code=401)

    esquema, _, apresentado = authorization.partition(" ")
    if esquema.lower() != "bearer" or not apresentado.strip():
        raise HTTPException(status_code=401)

    apresentado = apresentado.strip()
    # Lista (não generator): avalia TODOS antes de decidir, pra não vazar por
    # tempo qual dos tokens bateu.
    acertos = [hmac.compare_digest(apresentado, valido) for valido in aceitos]
    if not any(acertos):
        raise HTTPException(status_code=401)

# ⚠️ O diagnóstico do tmpfs NÃO mora aqui: está em `diagnostico.checar_tmpfs()`,
# junto com os demais autotestes, pra existir uma implementação só. Este arquivo
# é só o portão de entrada.
