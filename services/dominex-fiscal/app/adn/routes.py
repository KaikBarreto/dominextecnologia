"""Rota HTTP da distribuição de NFS-e recebida. Montada em `/v1/dfe/nfse/*`.

    POST /v1/dfe/nfse/distribuicao  → caminha a fila de NFS-e do ADN

Fica sob `/dfe/` junto com as rotas de NF-e porque, do ponto de vista de quem
chama, é a mesma pergunta ("o que chegou pra mim?"). O `/nfse/` no meio é o que
impede a confusão de um dia alguém mandar `cnpj` + `uf` pra cá: ISTO NÃO É A
SEFAZ, não existe `cUFAutor`, não existe manifestação e não existe cStat 656.

É POST, e não GET, pelas mesmas duas razões das rotas de NF-e:
  1. o `fetch` do Deno (runtime da Edge Function) se recusa a mandar corpo em
     GET — e o bloco `certificado` PRECISA viajar no corpo, porque a VPS não
     guarda acervo;
  2. o CNPJ fica FORA da URL, logo fora do log de acesso do Caddy (que é lido
     pelo fail2ban e entra no snapshot semanal da Hostinger).

Nasce protegida por `Depends(exigir_token)`. Rota nova sem token neste serviço é
exceção que precisa de justificativa, não o contrário.

⚠️ A allowlist do Caddy já libera `/v1/*`, então nada muda no proxy. O que muda:
   o orçamento de tempo da rodada (`ADN_ORCAMENTO_SEGUNDOS`, 75s) tem que
   continuar MENOR que o `read_timeout` do bloco `fiscal.dominex.app` (120s).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from ..security import exigir_token
from . import schemas, servico

protegido = [Depends(exigir_token)]

rotas_adn = APIRouter(prefix="/dfe/nfse", tags=["dfe"], dependencies=protegido)


@rotas_adn.post("/distribuicao")
async def distribuicao_nfse(req: schemas.DistribuicaoNfseRequest) -> dict:
    """Busca as NFS-e do CNPJ no Ambiente de Dados Nacional a partir do NSU.

    ⚠️ A resposta traz `ultimoNsu` mesmo quando `parcial` é true, e gravar esse
    cursor não é opcional: sem ele a próxima rodada varre o mesmo trecho do feed
    outra vez, e varredura repetida é o caminho pro HTTP 429 do governo.

    ⚠️ `documentos` traz SÓ as notas RECEBIDAS (a empresa como tomador). As
    emitidas por ela passam pelo feed, fazem o cursor andar e voltam só no
    contador `emitidasIgnoradas` — `inbound_nfse` é tabela de nota recebida.
    """
    return servico.distribuir(req).model_dump(by_alias=True, exclude_none=True)
