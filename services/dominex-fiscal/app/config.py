"""Configuração do microserviço fiscal — TUDO por ambiente, segredo por ARQUIVO.

Contrato com a infraestrutura (docker-compose.yml / RUNBOOK):

    FISCAL_SERVICE_TOKEN_FILE       arquivo com o token de serviço (docker secret)
    FISCAL_SERVICE_TOKEN_PREV_FILE  token anterior, aceito durante a rotação
    KEK_FISCAL_FILE                 arquivo com a(s) KEK(s)
    FISCAL_TMPFS_DIR                tmpfs onde o PEM efêmero pode existir
    SEFIN_BASE                      base do governo "liberada" neste servidor
    SEFIN_BASE_HOMOLOGACAO          base de homologação
    SEFIN_TIMEOUT                   timeout (s) da chamada ao governo
    LOG_LEVEL                       INFO em produção (NUNCA DEBUG: vaza header/corpo)

⚠️ Segredo por ARQUIVO e não por `environment:` de propósito: valor em env
aparece em `docker inspect`, em `/proc/<pid>/environ` e em dump de crash. As
variantes sem `_FILE` existem só para rodar teste local.

Se faltar variável obrigatória, o serviço NÃO sobe. É melhor não subir do que
subir sem KEK e descobrir na primeira emissão do cliente.
"""

from __future__ import annotations

import base64
import binascii
import os
from dataclasses import dataclass, field
from functools import lru_cache

# --- Bases oficiais (provadas no spike de 2026-09-02) ------------------------
SEFIN_PRODUCAO_PADRAO = "https://sefin.nfse.gov.br/SefinNacional"
SEFIN_HOMOLOGACAO_PADRAO = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional"

# ADN (Ambiente de Dados Nacional): DANFSe oficial e parametrização municipal.
ADN_BASE_PRODUCAO = "https://adn.nfse.gov.br"
ADN_BASE_HOMOLOGACAO = "https://adn.producaorestrita.nfse.gov.br"

#: Aliases estáveis — `app/infra_routes.py` (🖥️ Infra) importa por estes nomes.
SEFIN_BASE_PRODUCAO = SEFIN_PRODUCAO_PADRAO
SEFIN_BASE_HOMOLOGACAO = SEFIN_HOMOLOGACAO_PADRAO

#: Marca do ambiente de teste do governo dentro da URL.
MARCA_HOMOLOGACAO = "producaorestrita"

#: Identificação do emissor no XML (campo verAplic da DPS/evento).
VER_APLIC = os.environ.get("FISCAL_VER_APLIC", "Dominex-1.0")


class ConfiguracaoInvalida(RuntimeError):
    """Serviço mal configurado. Estoura no boot, nunca no meio de uma emissão."""


def _ler_segredo(nome_arquivo: str, nome_env: str) -> str:
    """Prioriza o arquivo (docker secret); cai para env só em teste local."""
    caminho = os.environ.get(nome_arquivo, "").strip()
    if caminho:
        try:
            with open(caminho, "r", encoding="utf-8") as fh:
                return fh.read().strip()
        except OSError as exc:
            raise ConfiguracaoInvalida(
                f"Não foi possível ler o segredo em {nome_arquivo}: {type(exc).__name__}."
            ) from None
    return os.environ.get(nome_env, "").strip()


@dataclass(frozen=True)
class Kek:
    """Key Encryption Key: cifra a DEK de cada empresa. Vive SÓ aqui, na VPS."""

    id: int
    chave: bytes = field(repr=False)  # repr=False: nunca vaza em traceback/log

    def __post_init__(self) -> None:
        if not (1 <= self.id <= 255):
            raise ConfiguracaoInvalida("id de KEK deve estar entre 1 e 255.")
        if len(self.chave) != 32:
            raise ConfiguracaoInvalida("KEK deve ter exatamente 32 bytes (AES-256).")


@dataclass(frozen=True)
class Config:
    token: str = field(repr=False)
    keks: dict = field(repr=False)
    kek_atual_id: int
    tmpfs_dir: str
    timeout_segundos: float
    verificar_tls: bool
    base_producao: str = SEFIN_PRODUCAO_PADRAO
    base_homologacao: str = SEFIN_HOMOLOGACAO_PADRAO
    #: True enquanto este servidor só está liberado para homologação.
    producao_bloqueada: bool = False
    token_anterior: str = field(repr=False, default="")

    @property
    def kek_atual(self) -> Kek:
        return self.keks[self.kek_atual_id]

    def kek(self, kek_id: int) -> Kek:
        try:
            return self.keks[kek_id]
        except KeyError:
            raise ConfiguracaoInvalida(
                f"Envelope cifrado com a KEK #{kek_id}, que não está configurada "
                "neste serviço. Verifique a rotação de KEK."
            ) from None


def _decodificar_chave(valor: str) -> bytes:
    try:
        return base64.b64decode(valor.strip(), validate=True)
    except (binascii.Error, ValueError):
        raise ConfiguracaoInvalida(
            "KEK inválida: o valor precisa ser 32 bytes em base64."
        ) from None


def _carregar_keks() -> tuple:
    """Lê a(s) KEK(s).

    Formato do arquivo/variável (uma linha, para o runbook ficar simples):

        2:<base64>,1:<base64>

    A PRIMEIRA é a atual (sela material novo). As demais existem só para ABRIR
    envelopes antigos — é isso que torna a rotação de KEK possível sem pedir
    re-upload de certificado ao cliente.

    Aceita também uma base64 solta (sem "id:"), tratada como KEK #1 — é o
    formato natural de quem gerou com `openssl rand -base64 32`.
    """
    bruto = _ler_segredo("KEK_FISCAL_FILE", "FISCAL_KEKS")
    if not bruto:
        bruto = os.environ.get("FISCAL_KEK_B64", "").strip()
    if not bruto:
        raise ConfiguracaoInvalida(
            "KEK ausente (KEK_FISCAL_FILE / FISCAL_KEKS). Sem KEK o serviço não "
            "consegue abrir nenhum certificado — e não deve subir."
        )

    keks: dict = {}
    atual = None
    for parte in bruto.replace("\n", ",").split(","):
        parte = parte.strip()
        if not parte:
            continue
        if ":" in parte:
            id_texto, chave_texto = parte.split(":", 1)
            try:
                kek_id = int(id_texto.strip())
            except ValueError:
                raise ConfiguracaoInvalida("id de KEK deve ser um número.") from None
        else:
            kek_id, chave_texto = 1, parte
        if kek_id in keks:
            raise ConfiguracaoInvalida(f"KEK #{kek_id} declarada duas vezes.")
        keks[kek_id] = Kek(id=kek_id, chave=_decodificar_chave(chave_texto))
        if atual is None:
            atual = kek_id

    if atual is None:
        raise ConfiguracaoInvalida("Nenhuma KEK válida configurada.")
    return keks, atual


@lru_cache(maxsize=1)
def get_config() -> Config:
    token = _ler_segredo("FISCAL_SERVICE_TOKEN_FILE", "FISCAL_SERVICE_TOKEN")
    if len(token) < 32:
        raise ConfiguracaoInvalida(
            "Token de serviço ausente ou curto demais (mínimo 32 caracteres)."
        )
    token_anterior = _ler_segredo(
        "FISCAL_SERVICE_TOKEN_PREV_FILE", "FISCAL_SERVICE_TOKEN_PREV"
    )

    keks, atual = _carregar_keks()

    # tmpfs: volume em RAM montado pelo compose. NUNCA disco persistente — é
    # onde o PEM decifrado existe pelos milissegundos em que o `requests`
    # precisa de um caminho de arquivo para o mTLS.
    tmpfs_dir = os.environ.get("FISCAL_TMPFS_DIR", "/run/fiscal").rstrip("/")

    bruto_timeout = os.environ.get("SEFIN_TIMEOUT") or os.environ.get(
        "FISCAL_HTTP_TIMEOUT", "90"
    )
    try:
        timeout = float(bruto_timeout)
    except ValueError:
        raise ConfiguracaoInvalida("SEFIN_TIMEOUT deve ser numérico.") from None

    base_homologacao = (
        os.environ.get("SEFIN_BASE_HOMOLOGACAO", "").strip() or SEFIN_HOMOLOGACAO_PADRAO
    )

    # ⚠️ REGRA DE SEGURANÇA DO AMBIENTE — ler com atenção.
    # `SEFIN_BASE` é o ambiente que ESTE SERVIDOR está liberado a usar. Enquanto
    # apontar para produção restrita (homologação), qualquer requisição pedindo
    # produção é RECUSADA com mensagem clara. NÃO redirecionamos silenciosamente
    # a produção para homologação: o cliente acharia que emitiu uma nota que não
    # existe — mentira pior que erro.
    base_liberada = os.environ.get("SEFIN_BASE", "").strip()
    base_producao = os.environ.get("SEFIN_BASE_PRODUCAO", "").strip()
    producao_bloqueada = False
    if base_producao:
        pass
    elif base_liberada and MARCA_HOMOLOGACAO not in base_liberada:
        base_producao = base_liberada
    else:
        base_producao = SEFIN_PRODUCAO_PADRAO
        producao_bloqueada = bool(base_liberada) and MARCA_HOMOLOGACAO in base_liberada
    if os.environ.get("FISCAL_BLOQUEAR_PRODUCAO") == "1":
        producao_bloqueada = True

    # Só existe para diagnóstico local. Em produção JAMAIS desligar: sem
    # verificação de TLS o mTLS do governo perde metade do sentido.
    verificar_tls = os.environ.get("FISCAL_TLS_VERIFY", "1") != "0"

    return Config(
        token=token,
        token_anterior=token_anterior,
        keks=keks,
        kek_atual_id=atual,
        tmpfs_dir=tmpfs_dir,
        timeout_segundos=timeout,
        verificar_tls=verificar_tls,
        base_producao=base_producao,
        base_homologacao=base_homologacao,
        producao_bloqueada=producao_bloqueada,
    )


def base_sefin(ambiente: int, cfg: Config = None) -> str:
    """1 = produção · 2 = homologação. O ambiente vem SEMPRE do request."""
    cfg = cfg or get_config()
    return cfg.base_producao if ambiente == 1 else cfg.base_homologacao


def base_adn(ambiente: int) -> str:
    return ADN_BASE_PRODUCAO if ambiente == 1 else ADN_BASE_HOMOLOGACAO
