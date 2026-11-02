"""dominex-fiscal — motor fiscal próprio (NFS-e, padrão nacional Sefin).

CONTRATO HTTP (fixo — a edge function e o Caddy dependem dele):

    GET  /healthz                            → 200 {"ok": true}          (sem auth)
    GET  /readyz[?deep=1]                    → 200 sempre (veredito no corpo: {"ok": bool})
    GET  /v1/nfse/autoteste                  → 200        (canário das 6 armadilhas)
    POST /v1/nfse/emitir                     → 201 | 4xx
    POST /v1/nfse/{chaveAcesso}/cancelar     → 201 | 4xx
    GET  /v1/nfse/{chaveAcesso}              → 200 | 404
    GET  /v1/nfse/{chaveAcesso}/danfse       → 200 (application/pdf)

    POST /v1/dfe/distribuicao                → 200  (NF-e destinada, ver app/sefaz/)
    POST /v1/dfe/consulta-chave              → 200  (diagnóstico por chave)
    POST /v1/dfe/manifestar                  → 201  (evento do destinatário)
    POST /v1/dfe/nfse/distribuicao           → 200  (NFS-e tomada, ver app/adn/)

    POST /v1/nfce/preparar                   → 200  (modelo 65 + QR Code v3)
    POST /v1/nfce/status-servico             → 200  (autorizador NFC-e da UF)
    POST /v1/nfce/consultar                  → 200  (situação oficial por chave)
    POST /v1/nfce/autorizar                  → 200  (síncrona + recuperação)
    POST /v1/nfce/cancelamento/preparar      → 200  (evento 110111 assinado)
    POST /v1/nfce/cancelamento/transmitir    → 200  (idempotente + reconciliação)
    POST /v1/nfce/danfce                     → 200  (PDF oficial de 80 mm)

    POST /v1/certificado/selar               → 200  (custódia, ver abaixo)
    POST /v1/nfse/{chaveAcesso}/consultar    → 200  (alias de GET, ver abaixo)
    POST /v1/nfse/{chaveAcesso}/danfse       → 200  (alias de GET, ver abaixo)

Auth: `Authorization: Bearer $FISCAL_SERVICE_TOKEN` em tudo menos `/healthz`.
Sem header ⇒ **401 sem pista** (nada de "token ausente" vs "token inválido").

NFC-e usa escopos `nfce:read`/`nfce:write`, matriz própria por UF e produção
fechada enquanto `FISCAL_NFCE_PRODUCAO_HABILITADA=0`.

⚠️ POR QUE EXISTEM OS ALIASES POST DAS DUAS ROTAS GET
   Toda rota autenticada precisa receber o bloco `certificado` no CORPO — a VPS
   não guarda acervo, o material cifrado viaja a cada requisição. Só que o
   `fetch` do Deno (runtime da Edge Function) SE RECUSA a enviar corpo em GET
   ("Request with GET/HEAD method cannot have body"). Então: as rotas GET do
   contrato continuam existindo e funcionando (útil para curl e para o smoke
   test), e a edge usa os aliases POST, idênticos em semântica e resposta.
   Nada no Caddy/compose muda por causa disso.

⚠️ AS ROTAS SÃO REGISTRADAS DUAS VEZES: com o prefixo `/v1` (o contrato) e sem
   ele. É cinto e suspensório enquanto a allowlist do Caddy não estiver alinhada
   com o `/v1` — a lista de caminhos permitidos lá é a única coisa que separa
   este serviço da internet, e um 404 de allowlist parece bug de aplicação.
   Quando o Caddy liberar `/v1/*`, o alias sem prefixo pode sair.

O serviço é STATELESS quanto a certificado: nunca grava .pfx nem PEM em disco
persistente, nunca fala com a Supabase e não tem banco. Toda persistência (e a
trilha de auditoria) é responsabilidade da edge function.
"""

from __future__ import annotations

import logging
import re
import time
import uuid

from fastapi import APIRouter, Depends, FastAPI, Request, Response
from fastapi.responses import JSONResponse

from . import diagnostico, servico
from .config import ConfiguracaoInvalida, get_config
from .custodia import ErroDeCustodia
from .errors import CertificadoInvalido, ErroFiscal
from .schemas import (
    CancelarRequest,
    ConsultarRequest,
    DanfseRequest,
    EmitirRequest,
    SelarCertificadoRequest,
)
from .security import PrincipalFiscal, exigir_escopo, exigir_token

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
log = logging.getLogger("dominex-fiscal")

app = FastAPI(
    title="motor-fiscal",
    version="1.1.0",
    # Sem documentação pública: este serviço não é navegável por ninguém.
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

nfse_leitura = [Depends(exigir_escopo("nfse:read"))]
nfse_escrita = [Depends(exigir_escopo("nfse:write"))]
custodia_escrita = [Depends(exigir_escopo("custody:write"))]

#: Todas as rotas de negócio vivem aqui e são montadas com e sem o prefixo /v1.
rotas = APIRouter()

_REQUEST_ID = re.compile(r"[A-Za-z0-9._:-]{8,80}")


@rotas.get("/capacidades")
async def capacidades(
    principal: PrincipalFiscal = Depends(exigir_token),
) -> dict:
    cfg = get_config()

    def permitido(familia: str) -> bool:
        return principal.permite(f"{familia}:read") or principal.permite(f"{familia}:write")

    return {
        "cliente": principal.client_id,
        "familias": {
            "nfse": {
                "disponivel": permitido("nfse"),
                "operacoes": ["emitir", "consultar", "cancelar", "danfse"],
                "producaoHabilitada": not cfg.producao_bloqueada,
            },
            "nfe": {
                "disponivel": permitido("nfe"),
                "operacoes": ["preparar", "consultar", "autorizar", "cancelar", "cce", "inutilizar"],
                "producaoHabilitada": cfg.nfe_producao_habilitada,
            },
            "nfce": {
                "disponivel": permitido("nfce"),
                "operacoes": [
                    "preparar", "consultar", "autorizar", "cancelar", "danfce"
                ],
                "producaoHabilitada": cfg.nfce_producao_habilitada,
            },
            "mdfe": {
                "disponivel": permitido("mdfe"),
                "operacoes": ["preparar", "consultar", "autorizar", "cancelar", "encerrar"],
                "producaoHabilitada": cfg.mdfe_producao_habilitada,
            },
            "dfe": {
                "disponivel": permitido("dfe"),
                "operacoes": ["distribuir_nfe", "manifestar", "distribuir_nfse"],
                "producaoHabilitada": not cfg.producao_bloqueada,
            },
        },
    }


@app.middleware("http")
async def _auditar_requisicao(request: Request, call_next):
    apresentado = request.headers.get("x-request-id", "").strip()
    request_id = apresentado if _REQUEST_ID.fullmatch(apresentado) else str(uuid.uuid4())
    inicio = time.monotonic()
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
        response.headers["X-Request-ID"] = request_id
        return response
    finally:
        principal = getattr(request.state, "fiscal_principal", None)
        rota = request.scope.get("route")
        molde = getattr(rota, "path", "rota_desconhecida")
        log.info(
            "fiscal_request id=%s client=%s method=%s route=%s status=%s duration_ms=%s",
            request_id,
            getattr(principal, "client_id", "public"),
            request.method,
            molde,
            status_code,
            round((time.monotonic() - inicio) * 1000),
        )


@app.on_event("startup")
async def _validar_configuracao() -> None:
    """Falha no boot, não na primeira emissão. Sem KEK o serviço não sobe."""
    cfg = get_config()
    log.info(
        "motor-fiscal pronto (clientes=%s, keks=%s, atual=#%s, tmpfs=%s)",
        len(cfg.clientes),
        len(cfg.keks),
        cfg.kek_atual_id,
        cfg.tmpfs_dir,
    )


# -----------------------------------------------------------------------------
# Tradução de erro → resposta. NUNCA vaza stack trace, endpoint ou biblioteca.
# -----------------------------------------------------------------------------


@app.exception_handler(ErroFiscal)
async def _erro_fiscal(_req: Request, exc: ErroFiscal) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content=exc.corpo())


@app.exception_handler(ErroDeCustodia)
async def _erro_custodia(_req: Request, exc: ErroDeCustodia) -> JSONResponse:
    erro = CertificadoInvalido(exc.mensagem)
    return JSONResponse(status_code=erro.status, content=erro.corpo())


@app.exception_handler(ConfiguracaoInvalida)
async def _erro_config(_req: Request, exc: ConfiguracaoInvalida) -> JSONResponse:
    # Mensagem técnica só no log; o cliente final vê algo honesto e genérico.
    log.error("configuração inválida: %s", exc)
    return JSONResponse(
        status_code=503,
        content={
            "erro": {
                "codigo": "servico_indisponivel",
                "mensagem": "A emissão fiscal está temporariamente indisponível. "
                "Tente novamente em alguns minutos.",
            }
        },
    )


@app.exception_handler(Exception)
async def _erro_inesperado(_req: Request, exc: Exception) -> JSONResponse:
    log.exception("falha inesperada: %s", type(exc).__name__)
    return JSONResponse(
        status_code=500,
        content={
            "erro": {
                "codigo": "erro_interno",
                "mensagem": "Falha inesperada ao processar a nota fiscal. Tente novamente.",
            }
        },
    )


# -----------------------------------------------------------------------------
# Saúde (sem auth — é o Docker/Caddy que consulta)
# -----------------------------------------------------------------------------


@app.get("/healthz")
async def healthz() -> dict:
    """Liveness. Sem auth de propósito: quem pergunta é o Docker e o Caddy."""
    return {"ok": True}


# -----------------------------------------------------------------------------
# NFS-e
# -----------------------------------------------------------------------------


@rotas.post("/nfse/emitir", status_code=201, dependencies=nfse_escrita)
async def emitir(req: EmitirRequest) -> dict:
    return servico.emitir(req).model_dump(by_alias=True, exclude_none=True)


@rotas.post("/nfse/{chave_acesso}/cancelar", status_code=201, dependencies=nfse_escrita)
async def cancelar(chave_acesso: str, req: CancelarRequest) -> dict:
    return servico.cancelar(chave_acesso, req).model_dump(by_alias=True, exclude_none=True)


# ⚠️ Declarada ANTES de /nfse/{chave_acesso}: no FastAPI, rota literal e rota com
# parâmetro competem pelo mesmo caminho e vence a PRIMEIRA declarada. Invertendo,
# "autoteste" viraria uma chave de acesso e o canário responderia 422.
@rotas.get("/nfse/autoteste", dependencies=nfse_leitura)
async def autoteste() -> dict:
    """Canário da esteira de layout (risco R2 do plano).

    Monta uma DPS e um pedido de cancelamento fictícios, assina com um par
    EFÊMERO gerado no processo (nenhum certificado de cliente é tocado) e
    confere as 6 armadilhas. Não transmite nada.

    É o que resta de barato depois de aceitar que a `nfelib` fica atrás do
    servidor: quando um rebuild trouxer uma versão que muda o comportamento,
    isto aqui fica vermelho ANTES de a nota do cliente ser rejeitada.
    """
    return diagnostico.checar_assinatura()


@rotas.get("/nfse/{chave_acesso}", dependencies=nfse_leitura)
async def consultar_get(chave_acesso: str, req: ConsultarRequest) -> dict:
    return servico.consultar(chave_acesso, req).model_dump(by_alias=True, exclude_none=True)


@rotas.post("/nfse/{chave_acesso}/consultar", dependencies=nfse_leitura)
async def consultar_post(chave_acesso: str, req: ConsultarRequest) -> dict:
    """Alias de `GET /v1/nfse/{chave}` — ver nota no topo do arquivo."""
    return servico.consultar(chave_acesso, req).model_dump(by_alias=True, exclude_none=True)


def _resposta_pdf(chave: str, pdf: bytes, gerador: str) -> Response:
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="nfse-{chave}.pdf"',
            # Diagnóstico honesto: saber se o PDF veio do governo ou do nosso
            # gerador local evita horas de investigação quando o layout mudar.
            "X-Danfse-Origem": gerador,
        },
    )


@rotas.get("/nfse/{chave_acesso}/danfse", dependencies=nfse_leitura)
async def danfse_get(chave_acesso: str, req: DanfseRequest) -> Response:
    pdf, gerador = servico.danfse(chave_acesso, req)
    return _resposta_pdf(chave_acesso, pdf, gerador)


@rotas.post("/nfse/{chave_acesso}/danfse", dependencies=nfse_leitura)
async def danfse_post(chave_acesso: str, req: DanfseRequest) -> Response:
    """Alias de `GET /v1/nfse/{chave}/danfse` — ver nota no topo do arquivo."""
    pdf, gerador = servico.danfse(chave_acesso, req)
    return _resposta_pdf(chave_acesso, pdf, gerador)


# -----------------------------------------------------------------------------
# Custódia
# -----------------------------------------------------------------------------


@rotas.post("/certificado/selar", dependencies=custodia_escrita)
async def selar_certificado(req: SelarCertificadoRequest) -> dict:
    """Cifra o .pfx e a senha com uma DEK nova e envelopa a DEK com a KEK.

    ⚠️ Esta é a ÚNICA rota que recebe material em claro, e recebe UMA vez por
    upload. Ela não devolve a DEK nem a KEK — a edge sai daqui com ciphertext e
    nada mais. Nada é gravado aqui: quem persiste é a edge (Storage + banco).
    """
    return servico.selar_certificado(req)


# -----------------------------------------------------------------------------
# DF-e — NF-e destinada na SEFAZ + manifestação do destinatário.
# Módulo IRMÃO de `app/sefin/`: o caminho que emite NFS-e não é tocado por ele.
# Entra no mesmo router `rotas`, então ganha `/v1/dfe/*` e o alias sem prefixo
# de graça, e herda os mesmos handlers de erro (ErroFiscal → resposta PT-BR).
# -----------------------------------------------------------------------------
from .sefaz.routes import rotas_dfe  # noqa: E402

rotas.include_router(rotas_dfe)


# -----------------------------------------------------------------------------
# DF-e — NFS-e recebida (serviço TOMADO) no ADN, o Ambiente de Dados Nacional.
# ⚠️ OUTRO GOVERNO, OUTRO PROTOCOLO: REST/JSON, não o SOAP da SEFAZ. Vive em
# `app/adn/`, irmão de `app/sefaz/`, e entra no mesmo router `rotas` pra ganhar
# `/v1/dfe/nfse/*`, o alias sem prefixo e os mesmos handlers de erro.
# -----------------------------------------------------------------------------
from .adn.routes import rotas_adn  # noqa: E402

rotas.include_router(rotas_adn)


# NF-e modelo 55 — núcleo compartilhado, sem banco e sem regra de produto.
from .nfe.routes import rotas_nfe  # noqa: E402

rotas.include_router(rotas_nfe)

from .mdfe.routes import rotas_mdfe  # noqa: E402

rotas.include_router(rotas_mdfe)

# NFC-e modelo 65: nesta fase somente DANFE oficial a partir do XML autorizado.
# Emissão permanece fechada e a capacidade de produção continua false.
from .nfce.routes import rotas_nfce  # noqa: E402

rotas.include_router(rotas_nfce)


# =============================================================================
# INFRAESTRUTURA — 🖥️ Dev Infra (C1/C2/C6). NÃO REMOVER.
# =============================================================================
# Se este trecho sumir, a operação fica CEGA: o teste de fumaça agendado, a
# checagem do tmpfs de custódia e a rotação de KEK dependem dele. Ele não altera
# nenhuma rota do motor — só acrescenta /readyz e /admin/*, todas com Bearer.
from starlette.exceptions import HTTPException as _HTTPExcecao  # noqa: E402
from fastapi.exception_handlers import http_exception_handler as _handler_padrao  # noqa: E402

from . import infra_routes  # noqa: E402

app.include_router(infra_routes.router)


@app.exception_handler(_HTTPExcecao)
async def _http_excecao(req: Request, exc: _HTTPExcecao) -> Response:
    """401 sai SEM CORPO: nem "token ausente", nem "token inválido", nem `detail`.

    Quem não tem o segredo não descobre nada — nem que o serviço é FastAPI.
    Os demais códigos seguem o comportamento padrão do FastAPI.
    """
    if exc.status_code in {401, 403}:
        return Response(status_code=exc.status_code)
    return await _handler_padrao(req, exc)


# -----------------------------------------------------------------------------
# Montagem: /v1/... (contrato) e /... (alias, ver nota no topo).
# ⚠️ A ordem importa: o /v1 é o caminho oficial e o que deve aparecer no log.
# -----------------------------------------------------------------------------
app.include_router(rotas, prefix="/v1")
app.include_router(rotas)
