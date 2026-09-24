"""Contrato HTTP das rotas de DF-e (o que a edge manda e recebe).

Mesmo vocabulário do resto do serviço: PT-BR no nome interno, camelCase no fio.
Herda `RequisicaoAutenticada` de `app/schemas.py` — o bloco `certificado` chega a
CADA requisição porque a VPS não guarda acervo.

⚠️ NENHUM CAMPO DE ESTADO. Não existe `companyId` de banco, não existe "última
rodada", não existe cursor persistido. O serviço recebe de onde começar e
devolve onde parou; quem lembra é a tabela `dfe_sync_state`.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import RequisicaoAutenticada


class DistribuicaoRequest(RequisicaoAutenticada):
    """Caminha a fila de documentos destinados ao CNPJ."""

    #: CNPJ do destinatário (a própria empresa). Só dígitos.
    cnpj: str
    #: Sigla da UF do autor da consulta ("SP") ou o código IBGE ("35").
    uf: str
    #: ÚLTIMO NSU JÁ CONSUMIDO. 0 na primeira vez. Mandar um valor menor que um
    #: já servido é o gatilho do cStat 656 (1 hora de bloqueio do CNPJ).
    ultimo_nsu: int = Field(default=0, alias="ultimoNsu")
    #: Páginas de até 50 documentos nesta rodada. Ausente = padrão do serviço.
    max_paginas: Optional[int] = Field(default=None, alias="maxPaginas")


class ConsultaChaveRequest(RequisicaoAutenticada):
    """Diagnóstico: busca UM documento pela chave. Não mexe no cursor de NSU.

    ⚠️ Consome a MESMA cota horária da distribuição. Quem chamar tem que marcar
    a batida na trava anti-656, senão um teste inocente custa uma hora de nota.
    """

    cnpj: str
    uf: str
    #: Chave de acesso de 44 dígitos. Vai no CORPO, não na URL, pra não cair no
    #: log de acesso do Caddy (a chave identifica a operação comercial).
    chave: str


class ManifestacaoRequest(RequisicaoAutenticada):
    """Evento do destinatário. IRREVERSÍVEL — não existe 'desfazer'."""

    #: CNPJ de quem manifesta (o destinatário). Só dígitos.
    cnpj: str
    chave: str
    #: ciencia | confirmada | desconhecida | nao_realizada
    tipo: str
    #: Obrigatória (15..255) só em `nao_realizada`. Ignorada nos demais tipos,
    #: porque a NT 2020.001 v1.50 só serializa xJust nesse caso.
    justificativa: Optional[str] = None
    #: Numérico, até 15 dígitos. Ausente = gerado pelo serviço.
    id_lote: Optional[str] = Field(default=None, alias="idLote")


class DocumentoDfe(BaseModel):
    """Uma nota recebida, já interpretada. Campos nulos são nulos de propósito:
    o resumo (`resumo: true`) não traz natureza, CFOP nem finalidade."""

    model_config = ConfigDict(populate_by_name=True)

    nsu: str
    chave: Optional[str] = None
    emitente_cnpj: Optional[str] = Field(default=None, alias="emitenteCnpj")
    emitente_nome: Optional[str] = Field(default=None, alias="emitenteNome")
    valor: Optional[float] = None
    data_emissao: Optional[str] = Field(default=None, alias="dataEmissao")
    natureza: Optional[str] = None
    #: autorizada | cancelada | denegada | outra
    situacao_sefaz: Optional[str] = Field(default=None, alias="situacaoSefaz")
    numero: Optional[int] = None
    serie: Optional[int] = None
    cfop_principal: Optional[str] = Field(default=None, alias="cfopPrincipal")
    fin_nfe: Optional[int] = Field(default=None, alias="finNfe")
    ref_nfe_chave: Optional[str] = Field(default=None, alias="refNfeChave")
    #: True = só o resumo (resNFe). Vira False quando a manifestação destrava o
    #: XML completo e o documento reaparece na fila como procNFe.
    resumo: bool = False
    xml: Optional[str] = None


class Aviso(BaseModel):
    codigo: str
    mensagem: str
    detalhe: Optional[Any] = None


class DistribuicaoResposta(BaseModel):
    """⚠️ `ultNsu` É O CURSOR. Gravar SEMPRE, inclusive quando `parcial` é true.

    O que a SEFAZ já serviu está servido: pedir de novo o mesmo NSU é cStat 656.
    Se a rodada parou no meio (orçamento de tempo, 656 na página 3, governo caiu),
    a resposta vem com `parcial: true`, o `aviso` do motivo e o `ultNsu` do que
    JÁ FOI ENTREGUE. Ignorar esse cursor porque "deu erro" é o caminho mais curto
    pra travar a fila do cliente por uma hora.
    """

    model_config = ConfigDict(populate_by_name=True)

    c_stat: int = Field(alias="cStat")
    x_motivo: str = Field(alias="xMotivo")
    #: 15 dígitos com zeros à esquerda — o formato exato que a coluna
    #: `dfe_sync_state.ultimo_nsu` exige (CHECK `^[0-9]{15}$`). Último NSU
    #: servido = o valor a gravar no cursor.
    #: ⚠️ AUSENTE na consulta por chave: lá não existe cursor, e omitir é melhor
    #: que mandar vazio, porque o vazio quebraria o CHECK se alguém gravasse.
    ult_nsu: Optional[str] = Field(default=None, alias="ultNsu")
    #: 15 dígitos. Fim da fila do lado da SEFAZ (mede o atraso). Ausente quando a
    #: SEFAZ não informou.
    max_nsu: Optional[str] = Field(default=None, alias="maxNsu")
    #: True quando `ultNsu` alcançou `maxNsu` — nada mais a buscar agora.
    fila_drenada: bool = Field(default=False, alias="filaDrenada")
    #: True quando sobrou fila (teto de páginas, orçamento de tempo ou erro).
    parcial: bool = False
    paginas: int = 0
    #: Tipado de propósito: com `list` solta, o model_dump(by_alias=True) não
    #: aplicaria os apelidos camelCase dos itens e a edge receberia snake_case.
    documentos: list[DocumentoDfe] = Field(default_factory=list)
    #: Contadores do que NÃO virou nota, pra rodada silenciosa não virar mistério.
    eventos_ignorados: int = Field(default=0, alias="eventosIgnorados")
    ilegiveis: int = 0
    sem_chave: int = Field(default=0, alias="semChave")
    aviso: Optional[Aviso] = None


class ManifestacaoResposta(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    #: registrada (inclui duplicidade) — rejeição vira erro HTTP, não status.
    status: str
    tipo: str
    tipo_evento: str = Field(alias="tipoEvento")
    chave: str
    c_stat: int = Field(alias="cStat")
    c_stat_lote: int = Field(alias="cStatLote")
    motivo: str
    protocolo: Optional[str] = None
    registrada_em: Optional[str] = Field(default=None, alias="registradaEm")
    #: True quando a SEFAZ devolveu 573 — o evento JÁ existia. É sucesso.
    duplicada: bool = False
    ambiente: int = 1
    #: `envEvento` assinado, pro tenant arquivar a prova do que foi declarado.
    xml: Optional[str] = None
