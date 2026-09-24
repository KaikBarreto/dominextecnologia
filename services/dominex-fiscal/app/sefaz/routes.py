"""Rotas HTTP do DF-e. Montadas em `/v1/dfe/*` (e no alias sem prefixo).

    POST /v1/dfe/distribuicao    → caminha a fila de notas destinadas
    POST /v1/dfe/consulta-chave  → diagnóstico por chave (não mexe no cursor)
    POST /v1/dfe/manifestar      → evento do destinatário (IRREVERSÍVEL)

TODAS são POST, inclusive as de leitura, por dois motivos:
  1. o `fetch` do Deno (runtime da Edge Function) se recusa a mandar corpo em
     GET — e o bloco `certificado` PRECISA viajar no corpo, porque a VPS não
     guarda acervo. É a mesma razão dos aliases POST das rotas de NFS-e;
  2. chave de acesso e CNPJ ficam FORA da URL, logo fora do log de acesso do
     Caddy (que é lido pelo fail2ban e entra no snapshot semanal da Hostinger).

Todas nascem protegidas por `Depends(exigir_token)`. Rota nova sem token neste
serviço é exceção que precisa de justificativa, não o contrário.

⚠️ A allowlist do Caddy já libera `/v1/*`, então nada muda no proxy. O que muda:
   o orçamento de tempo da distribuição (`SEFAZ_ORCAMENTO_SEGUNDOS`, 75s) tem
   que continuar MENOR que o `read_timeout` do bloco `fiscal.dominex.app`
   (120s). Se um dia alguém aumentar o orçamento, aumenta o proxy antes.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..security import exigir_token
from . import schemas, servico

protegido = [Depends(exigir_token)]

rotas_dfe = APIRouter(prefix="/dfe", tags=["dfe"], dependencies=protegido)


@rotas_dfe.post("/distribuicao")
async def distribuicao(req: schemas.DistribuicaoRequest) -> dict:
    """Busca as notas destinadas ao CNPJ a partir do NSU informado.

    ⚠️ A resposta traz `ultNsu` mesmo quando `parcial` é true. Gravar esse
    cursor NÃO é opcional: o que a SEFAZ serviu está servido, e pedir de novo é
    cStat 656 (uma hora sem consultar nota nenhuma para esse CNPJ).
    """
    return servico.distribuir(req).model_dump(by_alias=True, exclude_none=True)


@rotas_dfe.post("/consulta-chave")
async def consulta_chave(req: schemas.ConsultaChaveRequest) -> dict:
    """Diagnóstico: uma nota pela chave. Não mexe na fila de NSU.

    ⚠️ Consome a MESMA cota horária da distribuição — quem chama tem que marcar
    a batida na trava anti-656, senão um teste custa uma hora de nota do cliente.
    """
    return servico.consultar_chave(req).model_dump(by_alias=True, exclude_none=True)


@rotas_dfe.post("/manifestar", status_code=201)
async def manifestar(req: schemas.ManifestacaoRequest) -> dict:
    """Transmite o evento do destinatário. NÃO TEM VOLTA.

    201 no sucesso (inclusive duplicidade 573, que é idempotência e vem com
    `duplicada: true`). Rejeição definitiva sai 422; transitória sai 503.
    """
    return servico.manifestar(req).model_dump(by_alias=True, exclude_none=True)
