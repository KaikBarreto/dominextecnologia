"""Contrato HTTP da distribuição de NFS-e recebida (o que a edge manda e recebe).

Mesmo vocabulário do resto do serviço: PT-BR no nome interno, camelCase no fio.
Herda `RequisicaoAutenticada` de `app/schemas.py` — o bloco `certificado` chega a
CADA requisição porque a VPS não guarda acervo.

⚠️ NENHUM CAMPO DE ESTADO. Não existe `companyId` de banco, não existe "última
rodada", não existe cursor persistido. O serviço recebe de onde começar e devolve
onde parou; quem lembra é a tabela `dfe_sync_state`.

⚠️ OS NOMES DOS CAMPOS DE `DocumentoNfse` SÃO OS DA TABELA `inbound_nfse`
   (migration 20260924161000), em camelCase. Isso é de propósito: a edge faz
   upsert direto, sem uma camada de tradução que possa errar em silêncio. Quem
   mudar um nome aqui tem que mudar a coluna lá — e vice-versa.
"""

from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field

from ..schemas import RequisicaoAutenticada


class DistribuicaoNfseRequest(RequisicaoAutenticada):
    """Caminha a fila de NFS-e do ADN para o CNPJ."""

    #: CNPJ da própria empresa. É ele que decide o que é RECEBIDA (a empresa é o
    #: tomador) e o que é EMITIDA (a empresa é o prestador) — o ADN serve as duas
    #: coisas no MESMO feed, sem separar.
    cnpj: str

    #: ÚLTIMO NSU JÁ CONSUMIDO. 0 na primeira vez.
    #:
    #: ⚠️ É "último consumido", não "próximo a buscar". O serviço pede ao ADN
    #: exatamente este NSU (e não este + 1) porque a documentação oficial descreve
    #: a operação como inclusiva, mas não de forma normativa o bastante pra
    #: apostar uma nota do cliente: se for exclusiva, pedir +1 PULARIA o documento
    #: que estiver nessa posição, para sempre e sem erro. Pedir o mesmo devolve no
    #: máximo um documento repetido, que o upsert por `chave_natural` deduplica.
    ultimo_nsu: int = Field(default=0, alias="ultimoNsu")

    #: Páginas nesta rodada. Ausente = padrão do serviço.
    max_paginas: Optional[int] = Field(default=None, alias="maxPaginas")

    #: True (padrão) = só volta o que a empresa TOMOU. As notas emitidas por ela
    #: continuam fazendo o cursor andar, mas não voltam no corpo — `inbound_nfse`
    #: é tabela de nota RECEBIDA, e deixar nota própria entrar lá viraria despesa
    #: de um serviço que a empresa vendeu.
    somente_recebidas: bool = Field(default=True, alias="somenteRecebidas")


class DocumentoNfse(BaseModel):
    """Uma NFS-e do feed, já interpretada. Nome de campo = coluna de `inbound_nfse`."""

    model_config = ConfigDict(populate_by_name=True)

    nsu: str
    #: 50 dígitos. None quando o documento veio sem chave utilizável — nesse caso
    #: a identidade cai no par prestador+número (ver `chave_natural` na migration).
    chave_acesso: Optional[str] = Field(default=None, alias="chaveAcesso")
    numero: Optional[str] = None
    serie: Optional[str] = None
    codigo_verificacao: Optional[str] = Field(default=None, alias="codigoVerificacao")
    municipio_incidencia_ibge: Optional[str] = Field(
        default=None, alias="municipioIncidenciaIbge"
    )
    data_emissao: Optional[str] = Field(default=None, alias="dataEmissao")
    #: `dCompet` — pode ser MÊS ANTERIOR à emissão. É a data certa pro regime de
    #: competência quando a nota virar despesa.
    competencia: Optional[str] = None
    valor_servico: Optional[float] = Field(default=None, alias="valorServico")
    valor_liquido: Optional[float] = Field(default=None, alias="valorLiquido")
    valor_iss: Optional[float] = Field(default=None, alias="valorIss")
    #: None = o documento não informou `tpRetISSQN`. NÃO tratar como false: o
    #: valor que o cliente paga ao prestador depende disto.
    iss_retido: Optional[bool] = Field(default=None, alias="issRetido")
    prestador_documento: Optional[str] = Field(default=None, alias="prestadorDocumento")
    prestador_nome: Optional[str] = Field(default=None, alias="prestadorNome")
    prestador_im: Optional[str] = Field(default=None, alias="prestadorIm")
    prestador_municipio_ibge: Optional[str] = Field(
        default=None, alias="prestadorMunicipioIbge"
    )
    tomador_documento: Optional[str] = Field(default=None, alias="tomadorDocumento")
    tomador_nome: Optional[str] = Field(default=None, alias="tomadorNome")
    codigo_tributacao_nacional: Optional[str] = Field(
        default=None, alias="codigoTributacaoNacional"
    )
    codigo_tributacao_municipal: Optional[str] = Field(
        default=None, alias="codigoTributacaoMunicipal"
    )
    discriminacao: Optional[str] = None
    #: Sempre 'autorizada' aqui: cancelamento chega como EVENTO, em outro NSU.
    situacao: str = "autorizada"
    resumo: bool = False
    xml: Optional[str] = None
    #: Carimbo do ADN pro documento (`DataHoraGeracao`). Rastreio, nunca identidade.
    origem_ref: Optional[str] = Field(default=None, alias="origemRef")
    #: recebida (a empresa é o tomador) · emitida · indefinida (nenhum dos dois
    #: documentos casou com o CNPJ — acontece com nota de intermediário).
    direcao: str = "indefinida"


class EventoNfse(BaseModel):
    """Evento vinculado a uma NFS-e. NÃO é nota — é mudança de situação.

    ⚠️ O evento pode chegar numa rodada em que a nota dele NÃO está no lote (ela
    entrou meses atrás). A edge tem que tratar "evento sem nota correspondente"
    como normal: atualiza se achar, ignora se não achar, nunca cria linha.
    """

    model_config = ConfigDict(populate_by_name=True)

    nsu: str
    chave_acesso: Optional[str] = Field(default=None, alias="chaveAcesso")
    #: Código de 6 dígitos do XML (ex.: '101101'), quando identificável.
    codigo: Optional[str] = None
    #: Enum do ADN (ex.: 'CANCELAMENTO'). Cru de propósito: é o que o suporte lê.
    tipo_evento: Optional[str] = Field(default=None, alias="tipoEvento")
    #: 'cancelada' | 'substituida' | None.
    #:
    #: ⚠️ None significa "NÃO SEI traduzir este evento em situação", e não
    #: "nada mudou". Acontece nos eventos de análise fiscal, cuja numeração este
    #: serviço não confirmou. Tratar None como cancelamento cancelaria nota
    #: válida; a instrução é DEIXAR A NOTA COMO ESTÁ e registrar o evento.
    situacao_sugerida: Optional[str] = Field(default=None, alias="situacaoSugerida")
    chave_substituta: Optional[str] = Field(default=None, alias="chaveSubstituta")
    data_evento: Optional[str] = Field(default=None, alias="dataEvento")
    xml: Optional[str] = None


class Aviso(BaseModel):
    codigo: str
    mensagem: str
    detalhe: Optional[Any] = None


class DistribuicaoNfseResposta(BaseModel):
    """⚠️ `ultimoNsu` É O CURSOR. Gravar SEMPRE, inclusive com `parcial: true`.

    Se a rodada parou no meio (orçamento de tempo, teto de páginas, 429 na página
    3, governo caiu), a resposta vem com `parcial: true`, o `aviso` do motivo e o
    `ultimoNsu` do que JÁ FOI ENTREGUE. Descartar esse cursor porque "deu erro"
    faz a próxima rodada varrer tudo de novo do mesmo ponto — e varredura repetida
    contra o governo é o caminho mais curto pro HTTP 429.

    ⚠️ NÃO EXISTE `maxNsu` NESTE CONTRATO, e a falta é do ADN, não nossa: o
    envelope oficial (`LoteDistribuicaoNSUResponse`) não devolve o tamanho da fila.
    Consequência para quem opera: NÃO DÁ pra mostrar "faltam N notas". O único
    sinal de fim é `filaDrenada`. Se um dia alguém "achar" um maxNSU aqui, é
    porque o governo mudou o contrato — confirmar antes de usar.
    """

    model_config = ConfigDict(populate_by_name=True)

    #: DOCUMENTOS_LOCALIZADOS | NENHUM_DOCUMENTO_LOCALIZADO (enum do ADN).
    #: REJEICAO não aparece aqui: vira erro HTTP 422.
    status: str
    #: 15 dígitos com zeros à esquerda — o formato exato que a coluna
    #: `dfe_sync_state.ultimo_nsu` exige (CHECK `^[0-9]{15}$`).
    ultimo_nsu: str = Field(alias="ultimoNsu")
    #: True quando o feed acabou (página vazia, 404 ou NSU que não avança).
    fila_drenada: bool = Field(default=False, alias="filaDrenada")
    #: True quando sobrou fila (teto de páginas, orçamento de tempo ou erro).
    parcial: bool = False
    paginas: int = 0
    documentos: list[DocumentoNfse] = Field(default_factory=list)
    eventos: list[EventoNfse] = Field(default_factory=list)
    #: Notas EMITIDAS pela empresa que passaram no feed e foram descartadas por
    #: `somenteRecebidas`. Contador existe pra rodada silenciosa não virar mistério
    #: ("o governo tinha 40 documentos e vocês me deram 2").
    emitidas_ignoradas: int = Field(default=0, alias="emitidasIgnoradas")
    #: Itens que não são nota nem evento (DPS, CNC, item sem XML).
    ignorados: int = 0
    ilegiveis: int = 0
    #: Notas descartadas por não terem identidade mínima (sem chave E sem o par
    #: prestador+número). Entrariam colidindo na `chave_natural` do banco.
    sem_identidade: int = Field(default=0, alias="semIdentidade")
    aviso: Optional[Aviso] = None
    ambiente: int = 1
