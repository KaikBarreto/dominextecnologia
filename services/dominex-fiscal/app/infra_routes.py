"""
Rotas de INFRAESTRUTURA — DONO: 🖥️ Dev Infra (tarefas C1/C2/C6 do plano NFS-e).

Nenhuma regra fiscal aqui. Isto é o que a OPERAÇÃO precisa:

  GET  /readyz             Bearer  — pronto? (token, KEK, tmpfs, versões)
  GET  /readyz?deep=1      Bearer  — + autoteste de assinatura + egresso pro gov
                                     (a lógica vive em app/diagnostico.py)
  GET  /admin/kek/status   Bearer  — ids das KEKs carregadas (nunca o material)
  POST /admin/kek/rewrap   Bearer  — re-envelopa DEKs na KEK atual (rotação)
  POST /admin/smoke        Bearer  — gancho do teste de fumaça diário (C6)

`/healthz` NÃO está aqui: é do `main.py` (do motor), é público de propósito e
devolve só `{"ok": true}` — sem versão, sem hostname, sem estado de dependência.
Quem quiser detalhe autentica no `/readyz`.

⚠️ Este router é montado no fim do `app/main.py`. Se alguém reescrever o main.py,
o `include_router(infra_routes.router)` TEM que continuar lá — senão a operação
fica cega e o teste de fumaça (C6) para de funcionar em silêncio.
"""

from __future__ import annotations

import logging
import os
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from . import custodia, diagnostico
from .config import ConfiguracaoInvalida, get_config
from .security import exigir_token

log = logging.getLogger("dominex-fiscal.infra")

router = APIRouter(dependencies=[Depends(exigir_token)])

# =============================================================================
# /readyz — a rota; a INTELIGÊNCIA está em app/diagnostico.py (do motor)
# =============================================================================
# ⚠️ Não reimplementar os testes aqui. `diagnostico.py` já cobre KEK (ciclo
# selar→abrir completo), tmpfs, versões, assinatura (armadilhas 1,2,3,4,6) e
# egresso. Duas implementações do mesmo autoteste = uma delas apodrece em
# silêncio e a operação passa a confiar na errada.
@router.get("/readyz", include_in_schema=False)
def readyz(deep: int = Query(0, ge=0, le=1)) -> dict:
    """Diagnóstico completo. Sempre 200 — o veredito está no corpo.

    Por que não 503 quando degradado: `curl -f` e monitores simples descartam o
    corpo em erro, e é justamente o corpo que diz O QUE quebrou. Quem só quer
    "está vivo?" usa `/healthz` (público, sem corpo útil). Aqui é diagnóstico.
    `?deep=1` acrescenta o autoteste de assinatura e o teste de egresso — mais
    caro (gera uma chave RSA), por isso não roda em toda chamada.
    """
    resultado = diagnostico.readyz(profundo=bool(deep))
    resultado["status"] = "ok" if resultado.get("ok") else "degradado"
    return resultado


# =============================================================================
# Rotação de KEK (RUNBOOK §3.1)
# =============================================================================
class ItemRewrap(BaseModel):
    empresa_id: str = Field(min_length=1, alias="empresaId")
    dek_envelopada: str = Field(min_length=1, alias="dekEnvelopada")

    model_config = {"populate_by_name": True}


class RewrapRequest(BaseModel):
    itens: list[ItemRewrap] = Field(min_length=1, max_length=500)

    model_config = {"populate_by_name": True}


@router.get("/admin/kek/status", include_in_schema=False)
def kek_status() -> dict:
    cfg = get_config()
    return {"status": "ok", "atual": cfg.kek_atual_id, "ids": sorted(cfg.keks)}


def _reenvelopar(dek_envelopada_b64: str, empresa_id: str, cfg) -> str:
    """Abre a DEK com a KEK que a selou e a re-sela com a KEK ATUAL.

    Não toca no `.pfx` cifrado (que nem passa por aqui — vive na Supabase). É
    isso que faz a §Custódia valer: **rotacionar a KEK não obriga o cliente a
    subir o certificado de novo**.

    ⚠️ Usa os utilitários internos de `custodia.py` de propósito: o formato do
    blob (`DXF1|versão|kek_id|nonce|ct`) tem UMA implementação só. Candidato
    natural a virar função pública de `custodia.py` quando o C4 encostar lá.
    """
    aad = custodia._aad(custodia.DOM_DEK, empresa_id)
    kek_id, _nonce, _ct = custodia._desempacotar(dek_envelopada_b64, "chave")
    atual = cfg.kek_atual
    if kek_id == atual.id:
        return dek_envelopada_b64  # já está na atual: no-op idempotente

    kek_origem = cfg.kek(kek_id)
    dek = custodia._decifrar(kek_origem.chave, dek_envelopada_b64, aad, "chave")
    return custodia._cifrar(atual.chave, dek, aad, kek_id=atual.id)


@router.post("/admin/kek/rewrap", include_in_schema=False)
def kek_rewrap(corpo: RewrapRequest) -> dict:
    """Re-envelopa DEKs sob a KEK atual. Chamado pela edge function de rotação.

    ⚠️ Contrato de segurança: NUNCA devolve DEK em claro — só envelope novo.
    Mesmo quem tiver o token e os envelopes não extrai material daqui.

    ⚠️ Contrato de arquitetura: o microserviço NÃO fala com a Supabase. Quem lê e
    grava o banco é a edge; aqui só entra e sai blob. É isso que mantém as duas
    metades da custódia (acervo × KEK) em lugares diferentes.
    """
    cfg = get_config()
    resultado = []
    for item in corpo.itens:
        try:
            novo = _reenvelopar(item.dek_envelopada, item.empresa_id, cfg)
            resultado.append(
                {
                    "empresaId": item.empresa_id,
                    "ok": True,
                    "dekEnvelopada": novo,
                    "mudou": novo != item.dek_envelopada,
                }
            )
        except (custodia.ErroDeCustodia, ConfiguracaoInvalida) as exc:
            # Falha de uma empresa não pode abortar o lote inteiro.
            log.error("rewrap falhou para empresa=%s: %s", item.empresa_id[:8], exc)
            resultado.append({"empresaId": item.empresa_id, "ok": False, "erro": str(exc)})

    return {"kekAtual": cfg.kek_atual_id, "itens": resultado}


# =============================================================================
# /admin/smoke — gancho do teste de fumaça diário (C6)
# =============================================================================
@router.post("/admin/smoke", include_in_schema=False)
def smoke() -> dict:
    """Emissão real em HOMOLOGAÇÃO, ponta a ponta.

    ⚠️ Este serviço é STATELESS quanto a certificado — ele não tem como emitir
    sozinho, porque o material do certificado viaja no corpo de cada requisição.
    Por isso a emissão de fumaça é dirigida de fora (edge agendada por pg_cron,
    RUNBOOK §6.3, opção A).

    Se algum dia existir `servico.smoke_homologacao()`, este gancho a chama.
    Enquanto não existir, devolve `nao_implementado` — e o `smoke-test.sh` trata
    isso como "cobertura rasa", não como falha. Melhor um alarme honesto sobre o
    que ele NÃO cobre do que um alarme verde mentiroso.
    """
    try:
        from . import servico

        executor = getattr(servico, "smoke_homologacao", None)
    except Exception:  # noqa: BLE001
        executor = None

    if executor is None:
        return {
            "status": "nao_implementado",
            "detalhe": (
                "a emissão de fumaça precisa de certificado, que por decisão de "
                "custódia não mora nesta VPS. Ver RUNBOOK §6.3."
            ),
        }
    return {"status": "ok", "resultado": executor()}
