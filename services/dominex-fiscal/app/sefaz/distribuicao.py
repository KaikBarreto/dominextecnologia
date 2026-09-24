"""Cliente do NFeDistribuicaoDFe (Ambiente Nacional).

PORTADO de `EcoSistemaSaaS/services/ecosistema-dfe/app/sefaz.py` (produção desde
17/09/2026). Mudou só a camada de erro: lá as exceções eram do worker, aqui
descendem de `ErroFiscal` e já viram resposta HTTP com mensagem PT-BR.

Duas restrições MEDIDAS que ditam toda a forma deste módulo:

1. A SEFAZ não fala HTTP/2. Por isso `http.client.HTTPSConnection` (HTTP/1.1
   sempre) em vez de requests/httpx — bibliotecas que negociam h2 por ALPN e
   levam a SEFAZ a devolver "endpoint requires HTTP/1.1", erro que se disfarça
   de problema de certificado e faz perder horas.
2. O certificado é pedido por RENEGOCIAÇÃO TLS (ver `credencial.py`).

Ler documento destinado NÃO exige assinar XML — só o TLS mútuo.
"""

from __future__ import annotations

import http.client
import logging
import re
import ssl
from dataclasses import dataclass, field

from ..errors import (
    AcessoNegadoNoGoverno,
    DadosInvalidos,
    ErroFiscal,
    ServicoFiscalIndisponivel,
)

log = logging.getLogger("dominex-fiscal.sefaz")

NS_NFE = "http://www.portalfiscal.inf.br/nfe"
NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"
NS_SOAP = "http://www.w3.org/2003/05/soap-envelope"

# cStat que o chamador precisa distinguir pelo NOME, não pelo número solto.
CSTAT_DOC_LOCALIZADO = 138      # veio documento
CSTAT_NADA_NOVO = 137           # nenhum documento novo — PARAR (repetir = 656)
CSTAT_CONSUMO_INDEVIDO = 656    # CNPJ bloqueado por 1 hora
CSTAT_REJEICAO_CONSUMO = 589

INDISPONIVEL = (
    "O sistema da Receita/SEFAZ está indisponível no momento. "
    "Tente novamente em alguns minutos."
)
CERTIFICADO_RECUSADO = (
    "O certificado digital da empresa não foi aceito pela SEFAZ. "
    "Verifique se ele está válido e é o certificado do CNPJ consultado."
)

_SO_DIGITOS = re.compile(r"^\d+$")


class ConsumoIndevido(ErroFiscal):
    """cStat 656/589 — o CNPJ está bloqueado por 1 HORA. Parar a rodada JÁ.

    HTTP 429: é literalmente excesso de consumo, e a edge precisa distinguir
    isto de "governo fora do ar" (503, que pode ser retentado em minutos).

    ⚠️ `detalhe` carrega o `ultNsu`/`maxNsu` que a SEFAZ considera correntes —
    é o ÚNICO jeito de descobrir que o nosso cursor ficou PRA TRÁS (por exemplo
    porque outro provedor consumiu a fila do mesmo CNPJ). Sem isso, um 656
    permanente é indistinguível de um 656 de frequência e a fila trava pra
    sempre sem diagnóstico. Quem conserta o cursor é o lado do banco.
    """

    status = 429
    codigo = "consumo_indevido"


@dataclass
class Documento:
    nsu: str
    schema: str
    conteudo_b64: str


@dataclass
class RespostaDistDFe:
    c_stat: int
    x_motivo: str
    ult_nsu: str = ""
    max_nsu: str = ""
    documentos: list = field(default_factory=list)

    @property
    def ult_nsu_int(self) -> int:
        try:
            return int(self.ult_nsu or 0)
        except ValueError:
            return 0

    @property
    def max_nsu_int(self) -> int:
        try:
            return int(self.max_nsu or 0)
        except ValueError:
            return 0


def validar_digitos(valor: str, campo: str, tamanho: int | None = None) -> str:
    """Tudo que entra no XML é numérico. Validar em vez de escapar deixa a
    injeção impossível por construção — não há caminho pra um '<' chegar lá."""
    limpo = re.sub(r"\D", "", str(valor or ""))
    if not limpo or not _SO_DIGITOS.match(limpo):
        raise DadosInvalidos(f"{campo} inválido: informe apenas números.")
    if tamanho and len(limpo) != tamanho:
        raise DadosInvalidos(
            f"{campo} inválido: são {tamanho} dígitos, vieram {len(limpo)}."
        )
    return limpo


def _envelope(miolo: str, tp_amb: int, c_uf_autor: str, cnpj: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>'
        f'<soap12:Envelope xmlns:soap12="{NS_SOAP}"><soap12:Body>'
        f'<nfeDistDFeInteresse xmlns="{NS_WSDL}"><nfeDadosMsg>'
        f'<distDFeInt xmlns="{NS_NFE}" versao="1.01">'
        f"<tpAmb>{tp_amb}</tpAmb><cUFAutor>{c_uf_autor}</cUFAutor><CNPJ>{cnpj}</CNPJ>"
        f"{miolo}"
        "</distDFeInt></nfeDadosMsg></nfeDistDFeInteresse>"
        "</soap12:Body></soap12:Envelope>"
    )


def _extrair(texto: str, tag: str) -> str:
    achado = re.search(rf"<{tag}>([^<]*)</{tag}>", texto)
    return achado.group(1).strip() if achado else ""


def _extrair_documentos(texto: str) -> list:
    documentos: list = []
    for achado in re.finditer(r"<docZip\s+([^>]*)>(.*?)</docZip>", texto, re.DOTALL):
        atributos, conteudo = achado.group(1), achado.group(2)
        nsu = (re.search(r'NSU="([^"]*)"', atributos) or [None, ""])[1]
        schema = (re.search(r'schema="([^"]*)"', atributos) or [None, ""])[1]
        documentos.append(
            Documento(nsu=nsu, schema=schema, conteudo_b64="".join(conteudo.split()))
        )
    return documentos


def _postar(
    host: str, caminho: str, corpo: str, contexto: ssl.SSLContext, timeout: int
) -> str:
    conexao = http.client.HTTPSConnection(host, 443, context=contexto, timeout=timeout)
    try:
        conexao.request(
            "POST",
            caminho,
            corpo.encode("utf-8"),
            {
                "Content-Type": "application/soap+xml; charset=utf-8",
                "Accept": "application/soap+xml",
            },
        )
        resposta = conexao.getresponse()
        texto = resposta.read().decode("utf-8", "replace")
        if resposta.status != 200:
            raise ServicoFiscalIndisponivel(
                INDISPONIVEL, detalhe=f"distdfe:http{resposta.status}"
            )
        return texto
    except ErroFiscal:
        raise
    except ssl.SSLError as exc:
        # Handshake mTLS recusado = problema do certificado do cliente.
        raise AcessoNegadoNoGoverno(
            CERTIFICADO_RECUSADO, detalhe=type(exc).__name__
        ) from None
    except (http.client.HTTPException, OSError) as exc:
        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe=type(exc).__name__
        ) from None
    finally:
        conexao.close()


def interpretar(texto: str) -> RespostaDistDFe:
    c_stat_bruto = _extrair(texto, "cStat")
    if not c_stat_bruto:
        raise ServicoFiscalIndisponivel(
            INDISPONIVEL, detalhe="resposta sem cStat"
        )

    try:
        c_stat = int(c_stat_bruto)
    except ValueError:
        raise ServicoFiscalIndisponivel(INDISPONIVEL, detalhe="cStat não numérico") from None

    resposta = RespostaDistDFe(
        c_stat=c_stat,
        x_motivo=_extrair(texto, "xMotivo"),
        ult_nsu=_extrair(texto, "ultNSU"),
        max_nsu=_extrair(texto, "maxNSU"),
        documentos=_extrair_documentos(texto),
    )

    if resposta.c_stat in (CSTAT_CONSUMO_INDEVIDO, CSTAT_REJEICAO_CONSUMO):
        raise ConsumoIndevido(
            "A SEFAZ bloqueou a consulta de notas deste CNPJ por 1 hora "
            "(consumo indevido). A próxima busca acontece automaticamente "
            "depois desse prazo.",
            detalhe={
                "cStat": resposta.c_stat,
                "xMotivo": resposta.x_motivo,
                "ultNsu": resposta.ult_nsu or None,
                "maxNsu": resposta.max_nsu or None,
            },
        )
    return resposta


def consultar_por_nsu(
    *,
    contexto: ssl.SSLContext,
    host: str,
    caminho: str,
    tp_amb: int,
    c_uf_autor: str,
    cnpj: str,
    ultimo_nsu: int,
    timeout: int,
) -> RespostaDistDFe:
    """distNSU — caminha a fila. Traz até 50 documentos por chamada.

    ⚠️ `ultimo_nsu` é o ÚLTIMO JÁ CONSUMIDO. A SEFAZ devolve o que vem DEPOIS
    dele. Mandar um valor menor que um já servido = cStat 656 = 1h de bloqueio.
    """
    cnpj = validar_digitos(cnpj, "CNPJ", 14)
    c_uf_autor = validar_digitos(c_uf_autor, "código da UF", 2)
    if ultimo_nsu < 0:
        raise DadosInvalidos("O ponteiro de leitura da fila (NSU) não pode ser negativo.")

    miolo = f"<distNSU><ultNSU>{ultimo_nsu:015d}</ultNSU></distNSU>"
    log.info("sefaz distNSU cnpj=%s cUF=%s ultNSU=%015d", cnpj, c_uf_autor, ultimo_nsu)
    texto = _postar(
        host, caminho, _envelope(miolo, tp_amb, c_uf_autor, cnpj), contexto, timeout
    )
    return interpretar(texto)


def consultar_por_chave(
    *,
    contexto: ssl.SSLContext,
    host: str,
    caminho: str,
    tp_amb: int,
    c_uf_autor: str,
    cnpj: str,
    chave: str,
    timeout: int,
) -> RespostaDistDFe:
    """consChNFe — busca UM documento pela chave de acesso.

    Este caminho NÃO mexe na fila de NSU, então é o único seguro pra testar o
    encanamento sem risco de o ponteiro andar.

    ⚠️ MAS CONSOME A MESMA COTA HORÁRIA (medido no Eco em 17/09/2026: varredura
    53 min depois de um consChNFe tomou 656). Quem chama esta rota TEM que
    registrar a batida na mesma trava anti-656 da distribuição — senão um
    diagnóstico inocente custa uma hora de nota do cliente.
    """
    cnpj = validar_digitos(cnpj, "CNPJ", 14)
    c_uf_autor = validar_digitos(c_uf_autor, "código da UF", 2)
    chave = validar_digitos(chave, "chave de acesso", 44)

    miolo = f"<consChNFe><chNFe>{chave}</chNFe></consChNFe>"
    log.info("sefaz consChNFe cnpj=%s chave=%s", cnpj, f"{chave[:6]}...{chave[-6:]}")
    texto = _postar(
        host, caminho, _envelope(miolo, tp_amb, c_uf_autor, cnpj), contexto, timeout
    )
    return interpretar(texto)
