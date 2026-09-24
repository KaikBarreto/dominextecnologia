"""Orquestração das rodadas de DF-e.

REESCRITO. Este arquivo é o que substitui o `main.py` do `ecosistema-dfe` — lá
ele era um worker de cron que lia o estado do banco, decidia se podia consultar e
gravava as notas. Aqui ele é **stateless**: recebe de onde começar, devolve o que
achou e onde parou. Quem decide se pode consultar, e quem lembra do cursor, é o
lado da Supabase (`dfe_sync_state` + edge).

O QUE ESTE SERVIÇO **NÃO** FAZ (e não pode passar a fazer):
  - não guarda cursor de NSU;
  - não implementa a espera de 1 hora do anti-656 (ele DETECTA e REPORTA);
  - não sabe qual empresa é qual, além do `empresa_id` que só serve de AAD da
    custódia;
  - não grava nota em lugar nenhum.

⚠️ O QUE A EDGE PRECISA FAZER E ESTE SERVIÇO NÃO PODE GARANTIR
   Se a resposta HTTP se perder DEPOIS de a SEFAZ ter servido NSUs (timeout do
   proxy, edge morta no meio), o cursor não é gravado e a rodada seguinte repete
   NSU já servido = cStat 656 = 1 hora sem nota. O worker do Eco se protegia
   disso gravando a marca-d'água em arquivo local ANTES do upsert; sem banco,
   este serviço não tem onde. Mitigação obrigatória do lado da edge:
     1. marcar `ultima_rodada_em = now()` ANTES de chamar a VPS;
     2. tratar timeout/resposta perdida como RODADA CONSUMIDA (esperar a janela
        cheia antes de tentar de novo), nunca como "não aconteceu";
     3. gravar `ultNsu` mesmo quando `parcial` é true.
   O orçamento de tempo abaixo existe para que este cenário seja raro.
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from ..custodia import Envelope
from ..errors import DadosInvalidos, ErroFiscal, ServicoFiscalIndisponivel
from . import documento as doc_mod
from . import enderecos, schemas
from .credencial import CredencialSefaz, abrir_credencial
from .distribuicao import (
    CSTAT_DOC_LOCALIZADO,
    CSTAT_NADA_NOVO,
    RespostaDistDFe,
    consultar_por_chave,
    consultar_por_nsu,
    validar_digitos,
)
from .manifestacao import (
    TIPOS,
    ManifestacaoRejeitada,
    montar_evento_assinado,
    transmitir_manifestacao,
)
from .uf import codigo_uf

log = logging.getLogger("dominex-fiscal.sefaz")

PRODUCAO_BLOQUEADA = (
    "A consulta de notas na SEFAZ em produção ainda não está liberada neste "
    "servidor. Fale com o suporte."
)


def _empresa_curta(empresa_id: str) -> str:
    """Padrão da casa: nunca logar o company_id inteiro."""
    return (empresa_id or "")[:8] + "..."


def _chave_curta(chave: str) -> str:
    return f"{chave[:6]}...{chave[-6:]}" if chave and len(chave) == 44 else "?"


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
        # acharia que consultou/manifestou algo que não aconteceu.
        raise ServicoFiscalIndisponivel(PRODUCAO_BLOQUEADA)
    return ambiente


def _credencial(req) -> CredencialSefaz:
    return abrir_credencial(_envelope(req.certificado), req.empresa_id)


def _nsu(valor: int) -> str:
    return f"{max(valor, 0):015d}"


# -----------------------------------------------------------------------------
# Distribuição por NSU
# -----------------------------------------------------------------------------


def _coletar(resposta: RespostaDistDFe, acumulado: dict) -> None:
    """Interpreta os docZip de uma página. Documento torto é contado e pulado.

    ⚠️ NUNCA levantar daqui. Uma nota ilegível não pode impedir as outras 49 de
    chegar ao cliente — e, pior, não pode impedir o cursor de avançar: a SEFAZ
    já serviu aquele NSU, e repeti-lo é 656.
    """
    for bruto in resposta.documentos:
        try:
            nota = doc_mod.interpretar(bruto.nsu, bruto.schema, bruto.conteudo_b64)
        except doc_mod.ErroDeParse as exc:
            log.warning("nsu=%s ilegível (%s) — pulado", bruto.nsu, exc)
            acumulado["ilegiveis"] += 1
            continue
        if nota is None:
            acumulado["eventos"] += 1
            continue
        chave = (nota.get("chave") or "").strip()
        if len(chave) != 44 or not chave.isdigit():
            # Sem chave de 44 dígitos não há como o banco deduplicar a nota.
            # Melhor perder o documento torto do que envenenar o upsert.
            log.warning("nsu=%s sem chave de acesso válida — fora do lote", bruto.nsu)
            acumulado["sem_chave"] += 1
            continue
        acumulado["documentos"].append(schemas.DocumentoDfe(**nota))


def distribuir(req: schemas.DistribuicaoRequest) -> schemas.DistribuicaoResposta:
    ambiente = _ambiente(req.ambiente)
    cnpj = validar_digitos(req.cnpj, "CNPJ", 14)
    c_uf = codigo_uf(req.uf)
    if req.ultimo_nsu < 0:
        raise DadosInvalidos("O ponteiro de leitura da fila (NSU) não pode ser negativo.")

    teto = enderecos.max_paginas_teto()
    paginas_pedidas = req.max_paginas or enderecos.max_paginas_padrao()
    paginas_pedidas = max(1, min(teto, paginas_pedidas))
    orcamento = enderecos.orcamento_segundos()
    timeout = enderecos.timeout_segundos()
    host = enderecos.host_distribuicao(ambiente)
    caminho = enderecos.caminho_distribuicao()

    credencial = _credencial(req)

    acumulado = {"documentos": [], "eventos": 0, "ilegiveis": 0, "sem_chave": 0}
    nsu = req.ultimo_nsu
    max_nsu = ""
    c_stat = 0
    x_motivo = ""
    paginas = 0
    parcial = False
    drenada = False
    aviso = None
    comeco = time.monotonic()

    for pagina in range(1, paginas_pedidas + 1):
        try:
            resposta = consultar_por_nsu(
                contexto=credencial.contexto,
                host=host,
                caminho=caminho,
                tp_amb=ambiente,
                c_uf_autor=c_uf,
                cnpj=cnpj,
                ultimo_nsu=nsu,
                timeout=timeout,
            )
        except ErroFiscal as exc:
            # Página 1 falhou e nada foi servido: o erro é a resposta honesta.
            if paginas == 0:
                raise
            # ⚠️ Já houve página servida. Devolver 200 com o cursor avançado é
            # OBRIGATÓRIO: aqueles NSU já saíram da fila da SEFAZ. Levantar aqui
            # faria a edge descartar o avanço e repetir NSU servido = 656.
            log.warning(
                "distdfe parou na página %s (%s) — devolvendo parcial", pagina, exc.codigo
            )
            parcial = True
            aviso = schemas.Aviso(
                codigo=exc.codigo, mensagem=exc.mensagem, detalhe=exc.detalhe
            )
            break

        paginas = pagina
        c_stat, x_motivo = resposta.c_stat, resposta.x_motivo
        max_nsu = resposta.max_nsu or max_nsu

        if resposta.c_stat == CSTAT_NADA_NOVO:
            # Repetir antes de 1 hora é o gatilho do 656. A rodada acaba aqui.
            drenada = True
            nsu = max(resposta.ult_nsu_int, nsu)
            break

        if resposta.c_stat != CSTAT_DOC_LOCALIZADO:
            if paginas > 1:
                parcial = True
                aviso = schemas.Aviso(
                    codigo="cstat_inesperado",
                    mensagem="A SEFAZ interrompeu a busca de notas.",
                    detalhe={"cStat": resposta.c_stat, "xMotivo": resposta.x_motivo},
                )
                break
            raise ServicoFiscalIndisponivel(
                "A SEFAZ não conseguiu atender a busca de notas agora. "
                "Tente novamente em alguns minutos.",
                detalhe={"cStat": resposta.c_stat, "xMotivo": resposta.x_motivo},
            )

        _coletar(resposta, acumulado)

        # Nunca deixar o cursor RETROCEDER, nem que a SEFAZ devolva algo
        # estranho: o próximo pedido sairia de um NSU já servido = 656.
        anterior, nsu = nsu, max(resposta.ult_nsu_int, nsu)

        if resposta.ult_nsu_int <= anterior:
            log.warning("sefaz não avançou o ultNSU — parando pra não repetir a página")
            parcial = True
            break

        if resposta.max_nsu_int and nsu >= resposta.max_nsu_int:
            drenada = True
            break

        if time.monotonic() - comeco >= orcamento:
            # Parar por orçamento é PROTEÇÃO DE CURSOR, não performance:
            # ser cortado pelo proxy perderia o avanço já servido.
            log.info("distdfe parou pelo orçamento de %ss — sobrou fila", orcamento)
            parcial = True
            break
    else:
        # Saiu pelo teto de páginas com a fila ainda cheia.
        parcial = not drenada

    log.info(
        "distdfe empresa=%s ambiente=%s paginas=%s notas=%s eventos=%s ultNSU=%s",
        _empresa_curta(req.empresa_id),
        ambiente,
        paginas,
        len(acumulado["documentos"]),
        acumulado["eventos"],
        _nsu(nsu),
    )

    return schemas.DistribuicaoResposta(
        c_stat=c_stat,
        x_motivo=x_motivo,
        ult_nsu=_nsu(nsu),
        max_nsu=max_nsu or None,
        fila_drenada=drenada,
        parcial=parcial and not drenada,
        paginas=paginas,
        documentos=acumulado["documentos"],
        eventos_ignorados=acumulado["eventos"],
        ilegiveis=acumulado["ilegiveis"],
        sem_chave=acumulado["sem_chave"],
        aviso=aviso,
    )


# -----------------------------------------------------------------------------
# Consulta por chave (diagnóstico — não mexe no cursor)
# -----------------------------------------------------------------------------


def consultar_chave(req: schemas.ConsultaChaveRequest) -> schemas.DistribuicaoResposta:
    ambiente = _ambiente(req.ambiente)
    cnpj = validar_digitos(req.cnpj, "CNPJ", 14)
    chave = validar_digitos(req.chave, "chave de acesso", 44)
    c_uf = codigo_uf(req.uf)

    credencial = _credencial(req)
    resposta = consultar_por_chave(
        contexto=credencial.contexto,
        host=enderecos.host_distribuicao(ambiente),
        caminho=enderecos.caminho_distribuicao(),
        tp_amb=ambiente,
        c_uf_autor=c_uf,
        cnpj=cnpj,
        chave=chave,
        timeout=enderecos.timeout_segundos(),
    )

    acumulado = {"documentos": [], "eventos": 0, "ilegiveis": 0, "sem_chave": 0}
    _coletar(resposta, acumulado)

    log.info(
        "conschnfe empresa=%s chave=%s cStat=%s",
        _empresa_curta(req.empresa_id),
        _chave_curta(chave),
        resposta.c_stat,
    )

    return schemas.DistribuicaoResposta(
        c_stat=resposta.c_stat,
        x_motivo=resposta.x_motivo,
        # ⚠️ AUSENTE de propósito: consChNFe NÃO é cursor. Gravar o ultNSU daqui
        # como ponteiro da fila faria a próxima distribuição PULAR documentos
        # que nunca foram lidos. Omitir é mais seguro que mandar vazio.
        ult_nsu=None,
        max_nsu=resposta.max_nsu or None,
        fila_drenada=False,
        parcial=False,
        paginas=1,
        documentos=acumulado["documentos"],
        eventos_ignorados=acumulado["eventos"],
        ilegiveis=acumulado["ilegiveis"],
        sem_chave=acumulado["sem_chave"],
    )


# -----------------------------------------------------------------------------
# Manifestação do destinatário
# -----------------------------------------------------------------------------


def _id_lote_padrao() -> str:
    """Numérico, <= 15 dígitos. A edge deve mandar o seu (estável por job) —
    este é só para quem chamar sem idLote."""
    return str(int(datetime.now(timezone.utc).timestamp() * 1000))[-15:]


def manifestar(req: schemas.ManifestacaoRequest) -> schemas.ManifestacaoResposta:
    ambiente = _ambiente(req.ambiente)
    tipo = (req.tipo or "").strip().lower()
    if tipo not in TIPOS:
        raise DadosInvalidos(
            "Tipo de manifestação inválido. Use ciência, confirmação, "
            "desconhecimento ou operação não realizada."
        )
    chave = validar_digitos(req.chave, "chave de acesso", 44)
    cnpj = validar_digitos(req.cnpj, "CNPJ", 14)

    credencial = _credencial(req)
    evento_xml = montar_evento_assinado(
        credencial=credencial,
        cnpj=cnpj,
        chave=chave,
        tipo=tipo,
        justificativa=req.justificativa,
        tp_amb=ambiente,
        id_lote=req.id_lote or _id_lote_padrao(),
    )

    resposta = transmitir_manifestacao(
        host=enderecos.host_evento(ambiente),
        caminho=enderecos.caminho_evento(),
        contexto=credencial.contexto,
        evento_xml=evento_xml,
        timeout=enderecos.timeout_segundos(),
    )

    codigo_evento = TIPOS[tipo][0]
    log.info(
        "manifestacao empresa=%s chave=%s tipo=%s cStat=%s",
        _empresa_curta(req.empresa_id),
        _chave_curta(chave),
        codigo_evento,
        resposta.evento_cstat,
    )

    if not resposta.sucesso:
        detalhe = {
            "cStat": resposta.evento_cstat,
            "cStatLote": resposta.lote_cstat,
            "xMotivo": resposta.motivo,
        }
        if resposta.retentavel:
            # Rejeição transitória (108/109/999): a fila tenta de novo depois.
            raise ServicoFiscalIndisponivel(
                "O sistema da SEFAZ está em manutenção no momento. "
                "A manifestação será enviada automaticamente mais tarde.",
                detalhe=detalhe,
            )
        raise ManifestacaoRejeitada(
            f"A SEFAZ recusou a manifestação: {resposta.motivo}", detalhe=detalhe
        )

    return schemas.ManifestacaoResposta(
        status="registrada",
        tipo=tipo,
        tipo_evento=codigo_evento,
        chave=chave,
        c_stat=resposta.evento_cstat,
        c_stat_lote=resposta.lote_cstat,
        motivo=resposta.motivo,
        protocolo=resposta.protocolo,
        registrada_em=resposta.registrada_em,
        duplicada=resposta.duplicada,
        ambiente=ambiente,
        xml=evento_xml.decode("utf-8", errors="replace"),
    )


__all__ = ["consultar_chave", "distribuir", "manifestar"]
