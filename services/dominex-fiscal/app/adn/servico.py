"""Orquestração da rodada de NFS-e recebida no ADN.

**Stateless**, igual ao irmão `app/sefaz/servico.py`: recebe de onde começar,
devolve o que achou e onde parou. Quem decide se pode consultar, e quem lembra do
cursor, é o lado da Supabase (`dfe_sync_state` + edge).

O QUE ESTE SERVIÇO **NÃO** FAZ (e não pode passar a fazer):
  - não guarda cursor de NSU;
  - não sabe qual empresa é qual, além do `empresa_id` que só serve de AAD da
    custódia;
  - não grava nota em lugar nenhum;
  - não decide se a nota vira despesa — só entrega os campos.

⚠️ O QUE A EDGE PRECISA FAZER E ESTE SERVIÇO NÃO PODE GARANTIR
   Se a resposta HTTP se perder DEPOIS de o ADN já ter servido NSUs (timeout do
   proxy, edge morta no meio), o cursor não é gravado e a rodada seguinte varre o
   mesmo trecho de novo. Aqui isso NÃO custa uma hora de bloqueio como na SEFAZ —
   o ADN não tem o 656 e a nota não se perde. Custa tráfego repetido contra o
   governo, que é como se chega no HTTP 429. Mitigação do lado da edge:
     1. gravar `ultimoNsu` mesmo quando `parcial` é true;
     2. tratar timeout/resposta perdida como rodada consumida (respeitar
        `proxima_consulta_em`), nunca como "não aconteceu".

⚠️ DIFERENÇA DE FUNDO PRA NF-e, que muda como se lê o resultado
   O feed do ADN traz as notas EMITIDAS e as RECEBIDAS misturadas, e não informa o
   tamanho da fila (não existe `maxNSU`). Logo: "rodada trouxe 2 notas" pode ter
   custado 3 páginas de 50 documentos, e não existe "faltam N". O contador
   `emitidasIgnoradas` existe justamente pra essa conta fechar na tela.
"""

from __future__ import annotations

import logging
import re
import time

from ..custodia import Envelope
from ..errors import DadosInvalidos, ErroFiscal, ServicoFiscalIndisponivel
# A custódia e o contexto mTLS são os MESMOS do DF-e da SEFAZ. Importar em vez de
# reescrever é deliberado: o cabeçalho de `app/security.py` manda existir UMA
# implementação de cripto neste serviço. O nome do tipo cita SEFAZ por ter nascido
# lá; o que ele carrega (SSLContext + certificado aberto) não tem nada de SEFAZ.
from ..sefaz.credencial import abrir_credencial
from . import documento as doc_mod
from . import enderecos, schemas
from .distribuicao import (
    STATUS_DOCUMENTOS,
    STATUS_NADA,
    consultar_por_nsu,
    validar_digitos,
)

log = logging.getLogger("dominex-fiscal.adn")

PRODUCAO_BLOQUEADA = (
    "A busca de NFS-e recebidas em produção ainda não está liberada neste "
    "servidor. Fale com o suporte."
)


def _empresa_curta(empresa_id: str) -> str:
    """Padrão da casa: nunca logar o company_id inteiro."""
    return (empresa_id or "")[:8] + "..."


def _envelope(certificado) -> Envelope:
    return Envelope(
        pfx_cifrado_b64=certificado.pfx_cifrado_b64,
        dek_envelopada_b64=certificado.dek_envelopada_b64,
        senha_cifrada_b64=certificado.senha_cifrada_b64,
        nonce_b64=certificado.nonce_b64,
        algoritmo=certificado.algoritmo,
    )


def _ambiente(valor: int) -> int:
    ambiente = 1 if valor == 1 else 2
    if ambiente == 1 and enderecos.producao_bloqueada():
        # Nunca redirecionar produção para homologação em silêncio: o cliente
        # acharia que buscou notas que nunca foram buscadas.
        raise ServicoFiscalIndisponivel(PRODUCAO_BLOQUEADA)
    return ambiente


def _nsu(valor: int) -> str:
    """15 dígitos com zeros à esquerda — formato da coluna `dfe_sync_state.ultimo_nsu`."""
    return f"{max(valor, 0):015d}"


def _digitos(valor) -> str:
    return re.sub(r"\D", "", str(valor or ""))


def _direcao(dados: dict, cnpj: str) -> str:
    if _digitos(dados.get("tomador_documento")) == cnpj:
        return "recebida"
    if _digitos(dados.get("prestador_documento")) == cnpj:
        return "emitida"
    return "indefinida"


def _tem_identidade(dados: dict) -> bool:
    """Espelha a CHECK `inbound_nfse_identidade_check` da migration.

    Sem isto, uma nota torta viraria `chave_natural = 'MUN:?|PRE:?|SER:?|NUM:?'`
    no banco — e a SEGUNDA nota torta sobrescreveria a primeira, em silêncio.
    Recusar aqui é melhor que descobrir lá.
    """
    chave = (dados.get("chave_acesso") or "").strip()
    if len(chave) == 50 and chave.isdigit():
        return True
    return bool((dados.get("prestador_documento") or "").strip()) and bool(
        (dados.get("numero") or "").strip()
    )


def _coletar(itens, acumulado: dict, cnpj: str, somente_recebidas: bool) -> None:
    """Interpreta os itens de uma página. Documento torto é contado e pulado.

    ⚠️ NUNCA levantar daqui. Uma nota ilegível não pode impedir as outras de
    chegarem ao cliente — nem impedir o cursor de avançar.
    """
    for item in itens:
        try:
            genero, dados = doc_mod.interpretar(item)
        except doc_mod.ErroDeParse as exc:
            log.warning("adn nsu=%s ilegível (%s) — pulado", item.nsu, exc)
            acumulado["ilegiveis"] += 1
            continue

        if genero == "ignorado" or dados is None:
            acumulado["ignorados"] += 1
            continue

        if genero == "evento":
            acumulado["eventos"].append(schemas.EventoNfse(**dados))
            continue

        dados["direcao"] = _direcao(dados, cnpj)
        if somente_recebidas and dados["direcao"] != "recebida":
            if dados["direcao"] == "emitida":
                acumulado["emitidas"] += 1
            else:
                # Nem tomador nem prestador é este CNPJ (nota de intermediário,
                # por exemplo). Não é despesa desta empresa: fora do lote.
                acumulado["ignorados"] += 1
            continue

        if not _tem_identidade(dados):
            log.warning("adn nsu=%s sem identidade mínima — fora do lote", item.nsu)
            acumulado["sem_identidade"] += 1
            continue

        acumulado["documentos"].append(schemas.DocumentoNfse(**dados))


def distribuir(
    req: schemas.DistribuicaoNfseRequest,
) -> schemas.DistribuicaoNfseResposta:
    ambiente = _ambiente(req.ambiente)
    cnpj = validar_digitos(req.cnpj, "CNPJ", 14)
    if req.ultimo_nsu < 0:
        raise DadosInvalidos(
            "O ponteiro de leitura da fila (NSU) não pode ser negativo."
        )

    teto = enderecos.max_paginas_teto()
    paginas_pedidas = req.max_paginas or enderecos.max_paginas_padrao()
    paginas_pedidas = max(1, min(teto, paginas_pedidas))
    orcamento = enderecos.orcamento_segundos()
    timeout = enderecos.timeout_segundos()
    teto_resposta = enderecos.limite_resposta_bytes()
    host = enderecos.host_distribuicao(ambiente)

    credencial = abrir_credencial(_envelope(req.certificado), req.empresa_id)

    acumulado = {
        "documentos": [],
        "eventos": [],
        "emitidas": 0,
        "ignorados": 0,
        "ilegiveis": 0,
        "sem_identidade": 0,
    }
    nsu = req.ultimo_nsu
    status = STATUS_NADA
    paginas = 0
    parcial = False
    drenada = False
    aviso = None
    alertas = None
    comeco = time.monotonic()

    for pagina in range(1, paginas_pedidas + 1):
        try:
            resposta = consultar_por_nsu(
                contexto=credencial.contexto,
                host=host,
                # NSU pedido = último consumido, NUNCA +1. Ver a nota longa em
                # `distribuicao.consultar_por_nsu`: é o que garante que nenhuma
                # nota é pulada, qualquer que seja a semântica real do governo.
                caminho=enderecos.caminho_distribuicao(nsu),
                cnpj=cnpj,
                timeout=timeout,
                teto_resposta=teto_resposta,
            )
        except ErroFiscal as exc:
            # Página 1 falhou e nada foi servido: o erro é a resposta honesta.
            if paginas == 0:
                raise
            # ⚠️ Já houve página servida. Devolver 200 com o cursor avançado é o
            # certo: levantar aqui faria a edge descartar notas que já chegaram e
            # varrer tudo de novo na próxima rodada.
            log.warning(
                "adn parou na página %s (%s) — devolvendo parcial", pagina, exc.codigo
            )
            parcial = True
            aviso = schemas.Aviso(
                codigo=exc.codigo, mensagem=exc.mensagem, detalhe=exc.detalhe
            )
            break

        paginas = pagina
        status = resposta.status
        alertas = alertas or (resposta.alertas or None)

        if resposta.fim_do_feed or status == STATUS_NADA or not resposta.itens:
            drenada = True
            break

        _coletar(resposta.itens, acumulado, cnpj, req.somente_recebidas)

        maior = resposta.maior_nsu
        if maior <= nsu:
            # O feed não avançou. Com NSU inclusivo isto é o fim natural da fila
            # (a página só trouxe de volta o documento que já tínhamos). Insistir
            # pediria a mesma página pra sempre.
            log.info("adn: feed não avançou além do NSU %s — fila drenada", nsu)
            drenada = True
            break
        nsu = maior

        if time.monotonic() - comeco >= orcamento:
            # Parar por orçamento é PROTEÇÃO DE CURSOR, não performance: ser
            # cortado pelo proxy perderia o avanço já servido.
            log.info("adn parou pelo orçamento de %ss — sobrou fila", orcamento)
            parcial = True
            break
    else:
        # Saiu pelo teto de páginas com a fila ainda cheia.
        parcial = not drenada

    if aviso is None and alertas:
        aviso = schemas.Aviso(
            codigo="alerta_governo",
            mensagem="O sistema nacional de NFS-e devolveu avisos nesta busca.",
            detalhe={"alertas": alertas},
        )

    log.info(
        "adn empresa=%s ambiente=%s paginas=%s recebidas=%s emitidas=%s eventos=%s ultNSU=%s",
        _empresa_curta(req.empresa_id),
        ambiente,
        paginas,
        len(acumulado["documentos"]),
        acumulado["emitidas"],
        len(acumulado["eventos"]),
        _nsu(nsu),
    )

    return schemas.DistribuicaoNfseResposta(
        status=STATUS_DOCUMENTOS if acumulado["documentos"] else status,
        ultimo_nsu=_nsu(nsu),
        fila_drenada=drenada,
        parcial=parcial and not drenada,
        paginas=paginas,
        documentos=acumulado["documentos"],
        eventos=acumulado["eventos"],
        emitidas_ignoradas=acumulado["emitidas"],
        ignorados=acumulado["ignorados"],
        ilegiveis=acumulado["ilegiveis"],
        sem_identidade=acumulado["sem_identidade"],
        aviso=aviso,
        ambiente=ambiente,
    )


__all__ = ["distribuir"]
