"""Cliente da distribuição de DF-e do ADN (NFS-e nacional).

    GET https://adn.nfse.gov.br/contribuintes/DFe/{NSU}?cnpjConsulta=...&lote=true

Conferido contra o OpenAPI oficial "API NFS-e - ADN Contribuinte" v1, cujo texto
de apresentação fixa os padrões técnicos que esta implementação segue:

  * TLS 1.2+ com autenticação MÚTUA (o certificado A1 do contribuinte é a única
    credencial — não existe token, não existe chave de API);
  * mensagens em JSON;
  * documentos em XML 1.0, **GZip com representação base64** (por isso o
    `documento.py` descompacta antes de ler qualquer coisa).

⚠️ POR QUE `http.client` E NÃO `requests`
   Não é a mesma razão do `app/sefaz/`: o ADN não renegocia TLS. É a razão da
   CUSTÓDIA. O `requests` exige CAMINHO de arquivo para o mTLS, o que manteria os
   PEMs vivos no tmpfs durante os 75s da rodada inteira. Com `ssl.SSLContext` o
   OpenSSL já absorveu a chave e os PEMs morrem em milissegundos, ANTES da
   primeira conversa com o governo. É a mesma propriedade que `credencial.py`
   garante para a SEFAZ, e é ela que justifica a decisão D1.
   (`app/danfse/oficial.py` usa `requests` porque é UMA chamada curta; uma
   varredura de várias páginas é outra história.)

⚠️ NÃO MANDAR `Accept-Encoding`
   Sem ele o ADN responde JSON puro. Com `gzip`, a resposta viria comprimida em
   DUAS camadas (transporte + o `ArquivoXml` de cada documento), e o teto de
   `limite_resposta_bytes()` passaria a medir bytes comprimidos — ou seja, deixaria
   de proteger contra bomba de descompressão, que é exatamente o que ele existe
   pra fazer.
"""

from __future__ import annotations

import http.client
import json
import logging
import re
import ssl
from dataclasses import dataclass, field
from typing import Any, Optional
from urllib.parse import urlencode

from ..errors import (
    AcessoNegadoNoGoverno,
    DadosInvalidos,
    ErroFiscal,
    ServicoFiscalIndisponivel,
)

log = logging.getLogger("dominex-fiscal.adn")

# StatusProcessamento do envelope (enum do OpenAPI oficial).
STATUS_DOCUMENTOS = "DOCUMENTOS_LOCALIZADOS"
STATUS_NADA = "NENHUM_DOCUMENTO_LOCALIZADO"
STATUS_REJEICAO = "REJEICAO"

# TipoDocumento do item (enum do OpenAPI oficial).
TIPO_NFSE = "NFSE"
TIPO_EVENTO = "EVENTO"

INDISPONIVEL = (
    "O sistema nacional de NFS-e está indisponível no momento. "
    "Tente novamente em alguns minutos."
)
CERTIFICADO_RECUSADO = (
    "O certificado digital da empresa não foi aceito pelo sistema nacional de "
    "NFS-e. Verifique se ele está válido e é o certificado do CNPJ consultado."
)

_SO_DIGITOS = re.compile(r"^\d+$")


class LimiteDeConsumo(ErroFiscal):
    """HTTP 429 do ADN — pedimos rápido demais. PARAR a rodada e voltar depois.

    ⚠️ `codigo` é `consumo_indevido` DE PROPÓSITO, e não um código novo: a edge e
    a tela já têm estado estável para "o governo pediu pra esperar" (nasceu do
    cStat 656 da SEFAZ) e a reação correta é idêntica — empurrar
    `dfe_sync_state.proxima_consulta_em` e não martelar. Código novo obrigaria a
    mexer no front pra dizer a mesma frase.

    DIFERENÇA REAL PRA SEFAZ, que precisa estar clara pra quem opera: aqui NÃO
    existe bloqueio de 1 hora nem perda de nota. O ADN não "queima" a fila — o
    cursor não anda, e o que não veio agora vem na próxima. `detalhe.retryAfter`
    traz o que o governo pediu, quando ele informa.
    """

    status = 429
    codigo = "consumo_indevido"


class DistribuicaoRejeitada(ErroFiscal):
    """`StatusProcessamento: REJEICAO` — o ADN recusou a consulta.

    É conteúdo/credenciamento, não indisponibilidade: repetir em 5 minutos dá o
    mesmo resultado. O caso mais comum é o CNPJ não estar habilitado no Ambiente
    Nacional. `detalhe.erros` leva os códigos crus do governo pro suporte.
    """

    status = 422
    codigo = "distribuicao_rejeitada"


@dataclass
class ItemDfe:
    """Um item do `LoteDFe`, ainda cru (o XML continua gzip+base64)."""

    nsu: int
    chave_acesso: str = ""
    tipo_documento: str = ""
    tipo_evento: str = ""
    arquivo_xml_b64: str = ""
    data_hora_geracao: str = ""


@dataclass
class RespostaLote:
    status: str
    itens: list = field(default_factory=list)
    alertas: list = field(default_factory=list)
    erros: list = field(default_factory=list)
    ambiente: str = ""
    #: HTTP 404 = fim do feed. Não é erro (confirmado no OpenAPI: o 404 devolve o
    #: MESMO envelope das demais respostas, não um corpo de erro).
    fim_do_feed: bool = False

    @property
    def maior_nsu(self) -> int:
        return max((item.nsu for item in self.itens), default=0)


def validar_digitos(valor: str, campo: str, tamanho: int | None = None) -> str:
    limpo = re.sub(r"\D", "", str(valor or ""))
    if not limpo or not _SO_DIGITOS.match(limpo):
        raise DadosInvalidos(f"{campo} inválido: informe apenas números.")
    if tamanho and len(limpo) != tamanho:
        raise DadosInvalidos(
            f"{campo} inválido: são {tamanho} dígitos, vieram {len(limpo)}."
        )
    return limpo


def _sem_caixa(dicionario: Any) -> dict:
    """Índice do dicionário por chave em minúsculas.

    O contrato oficial é PascalCase (`LoteDFe`, `ArquivoXml`). Serializadores .NET
    trocam pra camelCase conforme a configuração do host, e já houve cliente na
    praça se defendendo dos dois. Normalizar aqui custa nada e evita a pior falha
    possível deste serviço: rodada "bem-sucedida" com zero nota porque a chave
    mudou de caixa e todo `.get()` devolveu None em silêncio.
    """
    if not isinstance(dicionario, dict):
        return {}
    return {str(k).lower(): v for k, v in dicionario.items()}


def _texto(fonte: dict, *nomes: str) -> str:
    for nome in nomes:
        valor = fonte.get(nome.lower())
        if valor is None:
            continue
        if isinstance(valor, (str, int, float)):
            return str(valor).strip()
    return ""


def _mensagens(bruto: Any) -> list:
    """`Alertas` / `Erros` → lista de {codigo, descricao} enxuta pro log e suporte."""
    saida: list = []
    for item in bruto or []:
        campo = _sem_caixa(item)
        saida.append(
            {
                "codigo": _texto(campo, "Codigo") or None,
                "descricao": _texto(campo, "Descricao", "Mensagem") or None,
                "complemento": _texto(campo, "Complemento") or None,
            }
        )
    return saida


def _retry_after(cabecalhos: Any) -> Optional[int]:
    bruto = ""
    try:
        bruto = (cabecalhos.get("Retry-After") or "").strip()
    except AttributeError:
        return None
    if not bruto.isdigit():
        return None
    # Teto de 1h: um Retry-After absurdo não pode virar uma espera eterna gravada
    # em `proxima_consulta_em` e deixar o cliente sem nota até alguém notar.
    return max(0, min(3600, int(bruto)))


def _ler_com_teto(resposta: Any, teto: int) -> bytes:
    corpo = resposta.read(teto + 1)
    if len(corpo) > teto:
        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe="adn:resposta acima do tamanho máximo aceito"
        )
    return corpo


def interpretar(corpo: bytes, status_http: int) -> RespostaLote:
    """Envelope `LoteDistribuicaoNSUResponse` → `RespostaLote`.

    ⚠️ O ENVELOPE NÃO TEM `ultNSU` NEM `maxNSU`. Isso não é esquecimento nosso:
    o contrato oficial realmente não devolve nem o ponteiro nem o tamanho da fila
    (diferente do `distDFeInt` da SEFAZ). Consequências que o chamador HERDA:
      * o cursor é o MAIOR `NSU` dos itens recebidos, e nada mais;
      * não dá pra saber quanto falta — "fila drenada" só se descobre quando a
        página volta vazia (ou 404). Inventar um `maxNsu` aqui seria mentira.
    """
    if not corpo.strip():
        # 404 com corpo vazio é o fim do feed na prática.
        if status_http == 404:
            return RespostaLote(status=STATUS_NADA, fim_do_feed=True)
        raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe="adn:resposta vazia")

    try:
        bruto = json.loads(corpo.decode("utf-8", "replace"))
    except (json.JSONDecodeError, UnicodeDecodeError):
        if status_http == 404:
            return RespostaLote(status=STATUS_NADA, fim_do_feed=True)
        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe="adn:resposta não é JSON"
        ) from None

    envelope = _sem_caixa(bruto)
    status = (_texto(envelope, "StatusProcessamento") or "").upper()
    erros = _mensagens(envelope.get("erros"))
    alertas = _mensagens(envelope.get("alertas"))

    itens: list = []
    lote = envelope.get("lotedfe") or []
    if isinstance(lote, dict):
        # `lote=false` devolve um documento só; aceitar os dois formatos é de graça.
        lote = [lote]
    for cru in lote:
        campo = _sem_caixa(cru)
        nsu_bruto = _texto(campo, "NSU")
        if not nsu_bruto.isdigit():
            log.warning("adn: item sem NSU numérico (%r) — fora do lote", nsu_bruto)
            continue
        itens.append(
            ItemDfe(
                nsu=int(nsu_bruto),
                chave_acesso=re.sub(r"\D", "", _texto(campo, "ChaveAcesso")),
                tipo_documento=_texto(campo, "TipoDocumento").upper(),
                tipo_evento=_texto(campo, "TipoEvento").upper(),
                arquivo_xml_b64="".join(_texto(campo, "ArquivoXml").split()),
                data_hora_geracao=_texto(campo, "DataHoraGeracao"),
            )
        )

    resposta = RespostaLote(
        status=status or (STATUS_DOCUMENTOS if itens else STATUS_NADA),
        itens=itens,
        alertas=alertas,
        erros=erros,
        ambiente=_texto(envelope, "TipoAmbiente"),
        fim_do_feed=status_http == 404,
    )

    if resposta.status == STATUS_REJEICAO or (status_http == 400 and not itens):
        raise DistribuicaoRejeitada(
            "O sistema nacional de NFS-e recusou a busca de notas deste CNPJ. "
            "Verifique se a empresa está habilitada a receber documentos no "
            "Ambiente Nacional.",
            detalhe={"status": resposta.status, "erros": erros or None},
        )
    return resposta


def consultar_por_nsu(
    *,
    contexto: ssl.SSLContext,
    host: str,
    caminho: str,
    cnpj: str,
    timeout: int,
    teto_resposta: int,
) -> RespostaLote:
    """Uma página do feed. O NSU já vem embutido em `caminho`.

    ⚠️ SEMÂNTICA DO NSU NO CAMINHO — LER ANTES DE "OTIMIZAR"
       O resumo oficial da operação é "Retorna o Documento Fiscal de Serviço
       correspondente ao NSU informado", ou seja, o NSU pedido é INCLUSIVO. Mas
       implementações na praça divergem (umas pedem o último consumido, outras
       pedem último+1), e o texto não é normativo o bastante pra apostar uma nota
       do cliente nisso.

       Por isso o `servico.py` pede sempre o ÚLTIMO NSU JÁ CONSUMIDO, nunca
       último+1. Essa escolha é correta nas DUAS leituras:
         - se for inclusivo, o pior que acontece é o documento daquele NSU voltar
           repetido — e ele é deduplicado pelo `chave_natural` no upsert;
         - se fosse exclusivo e pedíssemos último+1, o documento que estivesse
           exatamente em último+1 seria PULADO PARA SEMPRE, sem erro nenhum.
       Entre repetir e perder nota fiscal, repete.
    """
    consulta = urlencode({"cnpjConsulta": cnpj, "lote": "true"})
    conexao = http.client.HTTPSConnection(host, 443, context=contexto, timeout=timeout)
    try:
        conexao.request(
            "GET",
            f"{caminho}?{consulta}",
            None,
            {
                "Accept": "application/json",
                # Sem Accept-Encoding: ver a nota no topo do módulo.
                "User-Agent": "dominex-fiscal",
            },
        )
        resposta = conexao.getresponse()
        status_http = resposta.status
        corpo = _ler_com_teto(resposta, teto_resposta)

        if status_http == 429:
            espera = _retry_after(resposta.headers)
            raise LimiteDeConsumo(
                "O sistema nacional de NFS-e pediu para aguardar antes de uma "
                "nova busca. A próxima tentativa acontece automaticamente.",
                detalhe={"http": 429, "retryAfter": espera},
            )
        if status_http in (401, 403):
            raise AcessoNegadoNoGoverno(CERTIFICADO_RECUSADO, detalhe=f"adn:http{status_http}")
        if status_http >= 500:
            raise ServicoFiscalIndisponivel(
                INDISPONIVEL, detalhe=f"adn:http{status_http}"
            )
        if status_http not in (200, 400, 404):
            raise ServicoFiscalIndisponivel(
                INDISPONIVEL, detalhe=f"adn:http{status_http}"
            )

        return interpretar(corpo, status_http)
    except ErroFiscal:
        raise
    except ssl.SSLError as exc:
        raise AcessoNegadoNoGoverno(
            CERTIFICADO_RECUSADO, detalhe=type(exc).__name__
        ) from None
    except (http.client.HTTPException, OSError) as exc:
        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe=type(exc).__name__
        ) from None
    finally:
        conexao.close()
