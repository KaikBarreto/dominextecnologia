"""Endereços do Ambiente Nacional da NF-e e os limites da rodada de DF-e.

⚠️ O AMBIENTE NACIONAL SERVE TODAS AS UFs. Não se troca host por estado — o que
varia por estado é o `cUFAutor` do corpo (ver `uf.py`). Quem procurar "endpoint
da SEFAZ-SP" aqui não vai achar, e está certo assim.

Os valores de PRODUÇÃO são exatamente os que rodam no `ecosistema-dfe` desde
17/09/2026. Os de homologação estão anotados como NÃO PROVADOS: a
`NFeDistribuicaoDFe` só tem fila real em produção, então homologação serve para
encanamento, não para conferir conteúdo de nota.

Por que este módulo não mexe em `app/config.py`: aquele arquivo é o caminho que
emite NFS-e em produção. DF-e é função nova, com endereço e orçamento próprios;
somar chave nova lá seria arriscar a emissão por conveniência de organização.
"""

from __future__ import annotations

import os

#: NFeDistribuicaoDFe — leitura da fila de documentos destinados ao CNPJ.
DIST_HOST_PRODUCAO = "www1.nfe.fazenda.gov.br"
DIST_HOST_HOMOLOGACAO = "hom1.nfe.fazenda.gov.br"  # não provado
DIST_PATH = "/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx"

#: NFeRecepcaoEvento4 — transmissão do evento de manifestação do destinatário.
EVENTO_HOST_PRODUCAO = "www.nfe.fazenda.gov.br"
EVENTO_HOST_HOMOLOGACAO = "hom1.nfe.fazenda.gov.br"  # não provado
EVENTO_PATH = "/NFeRecepcaoEvento4/NFeRecepcaoEvento4.asmx"

#: Teto de documentos que a SEFAZ devolve por chamada (limite dela, não nosso).
DOCUMENTOS_POR_PAGINA = 50


def _inteiro(nome: str, padrao: int, minimo: int, maximo: int) -> int:
    bruto = (os.environ.get(nome) or "").strip()
    try:
        valor = int(bruto) if bruto else padrao
    except ValueError:
        valor = padrao
    return max(minimo, min(maximo, valor))


def host_distribuicao(ambiente: int) -> str:
    padrao = DIST_HOST_PRODUCAO if ambiente == 1 else DIST_HOST_HOMOLOGACAO
    return (os.environ.get("SEFAZ_DIST_HOST") or padrao).strip()


def caminho_distribuicao() -> str:
    return (os.environ.get("SEFAZ_DIST_PATH") or DIST_PATH).strip()


def host_evento(ambiente: int) -> str:
    padrao = EVENTO_HOST_PRODUCAO if ambiente == 1 else EVENTO_HOST_HOMOLOGACAO
    return (os.environ.get("SEFAZ_EVENTO_HOST") or padrao).strip()


def caminho_evento() -> str:
    return (os.environ.get("SEFAZ_EVENTO_PATH") or EVENTO_PATH).strip()


def timeout_segundos() -> int:
    """Timeout de UMA chamada à SEFAZ. 45s é o valor de produção do Eco."""
    return _inteiro("SEFAZ_TIMEOUT", 45, 5, 120)


def orcamento_segundos() -> int:
    """Teto de tempo de parede da rodada inteira (todas as páginas).

    ⚠️ ISTO NÃO É AFINAÇÃO DE PERFORMANCE, É PROTEÇÃO DE CURSOR. O Caddy corta a
    requisição em `read_timeout 120s`. Se a resposta for cortada DEPOIS de a
    SEFAZ já ter servido NSUs, a edge não grava o cursor novo, a próxima rodada
    repete o mesmo NSU e o CNPJ do cliente toma cStat 656 (uma hora sem consultar
    nota). Parar por orçamento e devolver o parcial é sempre melhor que ser
    cortado pelo proxy. Manter com folga confortável abaixo do `read_timeout`.
    """
    return _inteiro("SEFAZ_ORCAMENTO_SEGUNDOS", 75, 15, 110)


def max_paginas_padrao() -> int:
    """Páginas por rodada quando a edge não pede um número.

    Andar várias páginas DENTRO da mesma rodada é o fluxo documentado da SEFAZ e
    não é consumo indevido — indevido é repetir a rodada cedo demais ou pedir um
    NSU já servido. Páginas também amortizam a decifra do certificado: cada
    requisição vira uma linha em `fiscal_certificate_audit`.
    """
    return _inteiro("SEFAZ_MAX_PAGINAS", 3, 1, 20)


def max_paginas_teto() -> int:
    return _inteiro("SEFAZ_MAX_PAGINAS_TETO", 20, 1, 50)


def producao_bloqueada() -> bool:
    """Chave-mestra de segurança, desligada por padrão.

    ⚠️ De propósito NÃO reaproveita o `producao_bloqueada` do `app/config.py`:
    aquele flag responde "este servidor já pode emitir NFS-e em produção?", que
    é pergunta sobre a Sefin Nacional (município) e não diz nada sobre a SEFAZ
    (NF-e). Acoplar os dois faria a liberação de um mexer no outro em silêncio.
    Só o interruptor explícito `FISCAL_BLOQUEAR_PRODUCAO=1` vale para os dois.
    """
    return os.environ.get("FISCAL_BLOQUEAR_PRODUCAO") == "1"
