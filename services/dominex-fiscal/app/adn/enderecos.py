"""Endereço do ADN e os limites da rodada de NFS-e recebida.

O HOST vem de `app/config.py` (`base_adn`), que já é a fonte única do endereço do
ADN neste serviço — é o mesmo host que o DANFSe oficial usa. Duplicar a constante
aqui criaria o cenário em que o governo muda o domínio, alguém corrige um dos
dois lugares e o outro fica quebrado em silêncio.

O que é próprio deste módulo é o CAMINHO da distribuição e os limites da rodada.

⚠️ O ADN É NACIONAL, NÃO TEM ENDEREÇO POR MUNICÍPIO. Quem procurar aqui o
   webservice da prefeitura de tal cidade não vai achar, e está certo assim: a
   NFS-e nacional é distribuída num ponto só, e o município aparece dentro do
   documento (`cLocIncid`), não na URL.
"""

from __future__ import annotations

import os

from ..config import base_adn

#: Distribuição de DF-e ao contribuinte. O `{nsu}` é substituído no cliente.
#: Confirmado no OpenAPI oficial ("API NFS-e - ADN Contribuinte", v1): o
#: basePath é `/contribuintes` e a operação é `GET /DFe/{NSU}`.
DIST_PATH = "/contribuintes/DFe"

#: `lote=true` pede o LOTE a partir do NSU em vez de um documento só. É o default
#: do próprio serviço, mas mandamos explícito: default de terceiro muda sem aviso,
#: e cair pra `lote=false` faria a varredura levar 1 requisição POR NOTA.
PARAM_LOTE = "true"


def _inteiro(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    bruto = (os.environ.get(nome) or "").strip()
    try:
        valor = int(bruto) if bruto else padrao
    except ValueError:
        valor = padrao
    return max(minimo, min(maximo, valor))


def host_distribuicao(ambiente: int) -> str:
    """Só o host (sem esquema): o `http.client` quer host e caminho separados."""
    padrao = base_adn(ambiente).split("://", 1)[-1].strip("/")
    return (os.environ.get("ADN_DIST_HOST") or padrao).strip()


def caminho_distribuicao(nsu: int) -> str:
    base = (os.environ.get("ADN_DIST_PATH") or DIST_PATH).strip().rstrip("/")
    return f"{base}/{max(nsu, 0)}"


def timeout_segundos() -> int:
    """Timeout de UMA chamada ao ADN."""
    return _inteiro("ADN_TIMEOUT", 45, 5, 120)


def orcamento_segundos() -> int:
    """Teto de tempo de parede da rodada inteira (todas as páginas).

    ⚠️ MESMA RAZÃO DO DF-e DA SEFAZ, E O MESMO NÚMERO DE PROPÓSITO: o Caddy corta
    a requisição em `read_timeout 120s` no bloco `fiscal.dominex.app`. Ser cortado
    pelo proxy DEPOIS de o ADN já ter servido NSU faz a edge não gravar o cursor,
    e a rodada seguinte repete a varredura inteira do zero. Aqui isso não vira
    bloqueio de 1 hora (o ADN não tem 656), mas vira tráfego repetido contra um
    serviço do governo, que é exatamente o caminho pro HTTP 429.

    Se alguém aumentar este orçamento, aumenta o `read_timeout` do Caddy ANTES.
    """
    return _inteiro("ADN_ORCAMENTO_SEGUNDOS", 75, 15, 110)


def max_paginas_padrao() -> int:
    """Páginas por rodada quando a edge não pede um número."""
    return _inteiro("ADN_MAX_PAGINAS", 3, 1, 20)


def max_paginas_teto() -> int:
    return _inteiro("ADN_MAX_PAGINAS_TETO", 20, 1, 50)


def limite_resposta_bytes() -> int:
    """Teto do corpo HTTP de UMA página, ANTES de descompactar nada.

    Não é paranoia gratuita: o container tem 512 MB e roda a emissão de NFS-e, que
    é o que paga a conta. Um corpo gigante (por bug do governo ou por resposta
    adulterada) não pode derrubar o serviço fiscal inteiro. 32 MB é ~150x o tamanho
    observado de um lote cheio (~200 KB), então não estorva ninguém.
    """
    return _inteiro("ADN_LIMITE_RESPOSTA_MB", 32, 1, 128) * 1024 * 1024


def producao_bloqueada() -> bool:
    """Mesma chave-mestra do resto do serviço, desligada por padrão."""
    return os.environ.get("FISCAL_BLOQUEAR_PRODUCAO") == "1"
