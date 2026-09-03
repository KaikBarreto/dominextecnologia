"""C3 — Custódia do certificado A1. O ponto mais sensível do serviço.

    .pfx  --cifrado com DEK (AES-256-GCM, uma por empresa)--> ciphertext  [Supabase Storage]
    DEK   --cifrada com KEK--------------------------------> DEK envelopada [banco]
    KEK   ................................................. só aqui, na VPS

Propriedade garantida: comprometer a Supabase sozinha não dá nada (não há KEK);
comprometer a VPS sozinha não dá nada (não há acervo — este serviço é stateless
quanto a certificado e NUNCA fala com a Supabase). É preciso comprometer os dois.

REGRAS QUE NÃO SE NEGOCIAM (§Custódia do plano):
  - Uma DEK por empresa. Nunca reusar DEK entre tenants.
  - Nonce único por operação de cifra. NUNCA reaproveitar nonce com a mesma DEK
    (em AES-GCM isso é catastrófico) — por isso cada blob carrega o seu.
  - AAD amarrada à empresa E ao propósito: um envelope de senha não abre no slot
    do .pfx, e o envelope da empresa A não abre para a empresa B.
  - Material decifrado vive em MEMÓRIA. Onde a biblioteca exige caminho de
    arquivo (o `requests` exige para mTLS), usa-se tmpfs 0600 apagado no finally.
  - Nunca logar senha, KEK, DEK, conteúdo do certificado nem company_id inteiro.
"""

from __future__ import annotations

import base64
import binascii
import contextlib
import os
import secrets
from dataclasses import dataclass, field
from typing import Iterator

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    pkcs12,
)

from .config import Config, get_config

# --- Formato do blob cifrado -------------------------------------------------
# MAGIC(4) | VERSAO(1) | KEK_ID(1) | NONCE(12) | CIPHERTEXT+TAG
# Auto-descritivo de propósito: rotação de KEK e mudança de algoritmo não exigem
# adivinhar nada a partir das colunas do banco.
MAGIC = b"DXF1"
VERSAO = 1
TAM_NONCE = 12
TAM_CABECALHO = len(MAGIC) + 2 + TAM_NONCE

ALGORITMO = "AES-256-GCM"

# Domínios de AAD — separam os propósitos (não dá para trocar um blob por outro).
DOM_DEK = b"dominex-fiscal/dek/v1|"
DOM_PFX = b"dominex-fiscal/pfx/v1|"
DOM_SENHA = b"dominex-fiscal/senha/v1|"


class ErroDeCustodia(Exception):
    """Falha ao selar/abrir material custodiado. Mensagem já em PT-BR."""

    def __init__(self, mensagem: str) -> None:
        super().__init__(mensagem)
        self.mensagem = mensagem


def _b64d(valor: str, campo: str) -> bytes:
    try:
        return base64.b64decode((valor or "").strip(), validate=True)
    except (binascii.Error, ValueError):
        raise ErroDeCustodia(
            f"O material do certificado está corrompido ({campo}). "
            "Envie o certificado digital novamente."
        ) from None


def _b64e(valor: bytes) -> str:
    return base64.b64encode(valor).decode("ascii")


def _empacotar(nonce: bytes, ct: bytes, kek_id: int = 0) -> str:
    return _b64e(MAGIC + bytes([VERSAO, kek_id]) + nonce + ct)


def _desempacotar(blob: str, campo: str) -> tuple[int, bytes, bytes]:
    bruto = _b64d(blob, campo)
    if len(bruto) <= TAM_CABECALHO or bruto[: len(MAGIC)] != MAGIC:
        raise ErroDeCustodia(
            f"O material do certificado está em formato desconhecido ({campo}). "
            "Envie o certificado digital novamente."
        )
    versao = bruto[len(MAGIC)]
    if versao != VERSAO:
        raise ErroDeCustodia(
            f"O certificado foi guardado num formato mais novo que este serviço "
            f"({campo}, versão {versao}). Atualize o serviço fiscal."
        )
    kek_id = bruto[len(MAGIC) + 1]
    nonce = bruto[len(MAGIC) + 2 : TAM_CABECALHO]
    return kek_id, nonce, bruto[TAM_CABECALHO:]


def _cifrar(chave: bytes, dados: bytes, aad: bytes, kek_id: int = 0) -> str:
    nonce = secrets.token_bytes(TAM_NONCE)  # NUNCA derivado, NUNCA reaproveitado
    ct = AESGCM(chave).encrypt(nonce, dados, aad)
    return _empacotar(nonce, ct, kek_id)


def _decifrar(chave: bytes, blob: str, aad: bytes, campo: str) -> bytes:
    _kek_id, nonce, ct = _desempacotar(blob, campo)
    try:
        return AESGCM(chave).decrypt(nonce, ct, aad)
    except Exception:
        # Cobre KEK/DEK errada, AAD de outra empresa e adulteração do ciphertext.
        # A mensagem é deliberadamente igual nos três casos: não damos ao
        # atacante um oráculo que diferencia "chave errada" de "dado adulterado".
        raise ErroDeCustodia(
            f"Não foi possível abrir o certificado digital desta empresa ({campo}). "
            "Ele pode ter sido enviado com outra configuração de segurança — "
            "envie o certificado novamente."
        ) from None


@dataclass(frozen=True)
class Envelope:
    """Material selado, exatamente como trafega e como o banco/Storage guarda."""

    pfx_cifrado_b64: str = field(repr=False)
    dek_envelopada_b64: str = field(repr=False)
    senha_cifrada_b64: str = field(repr=False)
    nonce_b64: str
    algoritmo: str = ALGORITMO


def _aad(dominio: bytes, empresa_id: str) -> bytes:
    return dominio + empresa_id.strip().lower().encode("utf-8")


def selar(
    pfx: bytes,
    senha: str,
    empresa_id: str,
    cfg: Config | None = None,
) -> Envelope:
    """Gera DEK nova, cifra .pfx e senha, e envelopa a DEK com a KEK atual.

    Roda no UPLOAD do certificado. A edge manda o .pfx em claro (uma vez, por
    TLS) e recebe de volta só material cifrado — ela nunca vê a DEK nem a KEK.
    """
    cfg = cfg or get_config()
    if not pfx:
        raise ErroDeCustodia("Arquivo de certificado vazio.")
    if not empresa_id or not empresa_id.strip():
        raise ErroDeCustodia("Empresa não identificada na custódia do certificado.")

    dek = AESGCM.generate_key(bit_length=256)  # UMA por empresa, por upload
    kek = cfg.kek_atual

    pfx_cifrado = _cifrar(dek, pfx, _aad(DOM_PFX, empresa_id))
    senha_cifrada = _cifrar(dek, senha.encode("utf-8"), _aad(DOM_SENHA, empresa_id))
    dek_envelopada = _cifrar(kek.chave, dek, _aad(DOM_DEK, empresa_id), kek_id=kek.id)

    # `nonce_b64` existe para preencher a coluna `certificado_nonce` prevista no
    # schema. O nonce que VALE é o que viaja dentro de cada blob (auto-framing);
    # este aqui é o da senha, e serve de verificação cruzada de integridade.
    _kek_id, nonce_senha, _ct = _desempacotar(senha_cifrada, "senha")

    return Envelope(
        pfx_cifrado_b64=pfx_cifrado,
        dek_envelopada_b64=dek_envelopada,
        senha_cifrada_b64=senha_cifrada,
        nonce_b64=_b64e(nonce_senha),
    )


def abrir(envelope: Envelope, empresa_id: str, cfg: Config | None = None) -> tuple[bytes, str]:
    """Desenvelopa a DEK com a KEK e devolve (.pfx em claro, senha em claro).

    Só em memória. Quem chama é responsável por não persistir nada disso.
    """
    cfg = cfg or get_config()
    if not empresa_id or not empresa_id.strip():
        raise ErroDeCustodia("Empresa não identificada na custódia do certificado.")

    kek_id, _nonce, _ct = _desempacotar(envelope.dek_envelopada_b64, "chave")
    kek = cfg.kek(kek_id)

    dek = _decifrar(kek.chave, envelope.dek_envelopada_b64, _aad(DOM_DEK, empresa_id), "chave")

    # Verificação cruzada: se o `nonce_b64` que veio do banco não bate com o nonce
    # embutido no blob da senha, a linha foi editada/truncada. Falhar aqui é
    # melhor que mandar lixo para a prefeitura.
    if envelope.nonce_b64:
        _k, nonce_senha, _c = _desempacotar(envelope.senha_cifrada_b64, "senha")
        if _b64e(nonce_senha) != envelope.nonce_b64.strip():
            raise ErroDeCustodia(
                "O registro do certificado digital está inconsistente. "
                "Envie o certificado novamente."
            )

    pfx = _decifrar(dek, envelope.pfx_cifrado_b64, _aad(DOM_PFX, empresa_id), "certificado")
    senha = _decifrar(dek, envelope.senha_cifrada_b64, _aad(DOM_SENHA, empresa_id), "senha")
    return pfx, senha.decode("utf-8")


def reenvelopar_dek(
    dek_envelopada_b64: str,
    empresa_id: str,
    cfg: Config | None = None,
) -> str:
    """Rotação de KEK: abre a DEK com a KEK que a selou e re-sela com a atual.

    NÃO toca no `.pfx` cifrado (que nem passa por aqui — vive na Supabase). É
    isso que faz a §Custódia valer: **rotacionar a KEK não obriga o cliente a
    enviar o certificado de novo**. Idempotente: já estando na KEK atual, devolve
    o mesmo envelope.
    """
    cfg = cfg or get_config()
    aad = _aad(DOM_DEK, empresa_id)
    kek_id, _nonce, _ct = _desempacotar(dek_envelopada_b64, "chave")
    atual = cfg.kek_atual
    if kek_id == atual.id:
        return dek_envelopada_b64
    dek = _decifrar(cfg.kek(kek_id).chave, dek_envelopada_b64, aad, "chave")
    return _cifrar(atual.chave, dek, aad, kek_id=atual.id)


# -----------------------------------------------------------------------------
# Materialização em tmpfs (o `requests` exige CAMINHO de arquivo para mTLS)
# -----------------------------------------------------------------------------


@dataclass(frozen=True)
class ParDeChaves:
    """Caminhos efêmeros em tmpfs + o mesmo material em memória.

    Os CAMINHOS existem só porque o `requests` exige arquivo para o mTLS.
    Os BYTES existem para a assinatura XMLDSig, que trabalha em memória — assim
    não relemos do disco o que já temos na RAM. Ambos morrem ao sair do `with`.
    """

    cert_pem: str
    key_pem: str
    cert_pem_bytes: bytes = field(repr=False, default=b"")
    key_pem_bytes: bytes = field(repr=False, default=b"")


def _escrever_0600(caminho: str, conteudo: bytes) -> None:
    # O_EXCL evita seguir symlink plantado; 0600 já na criação (sem janela de
    # chmod, ao contrário do spike, que criava e só depois ajustava a permissão).
    fd = os.open(caminho, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        os.write(fd, conteudo)
    finally:
        os.close(fd)


def _apagar(caminho: str) -> None:
    """Sobrescreve e remove. Em tmpfs a sobrescrita é simbólica (RAM), mas custa
    nada e protege caso alguém aponte FISCAL_TMPFS_DIR para disco por engano."""
    with contextlib.suppress(OSError):
        tamanho = os.path.getsize(caminho)
        with open(caminho, "r+b") as fh:
            fh.write(secrets.token_bytes(tamanho))
            fh.flush()
            os.fsync(fh.fileno())
    with contextlib.suppress(OSError):
        os.remove(caminho)


@contextlib.contextmanager
def materializar_pem(
    pfx: bytes,
    senha: str,
    cfg: Config | None = None,
) -> Iterator[ParDeChaves]:
    """Converte o .pfx em PEM (cadeia + chave) num tmpfs, com remoção garantida.

    ⚠️ O `finally` roda mesmo com exceção, `return` ou timeout de rede — é ele
    que garante que nenhum PEM sobrevive à requisição. Não mexer sem teste.
    """
    cfg = cfg or get_config()
    chave, cert, cadeia = _carregar_pkcs12(pfx, senha)

    os.makedirs(cfg.tmpfs_dir, mode=0o700, exist_ok=True)
    sufixo = secrets.token_hex(8)
    p_cert = os.path.join(cfg.tmpfs_dir, f"c{sufixo}.pem")
    p_key = os.path.join(cfg.tmpfs_dir, f"k{sufixo}.pem")

    try:
        pem_cert = cert.public_bytes(Encoding.PEM)
        # A cadeia vai junto: sem os intermediários da AC, servidores exigentes
        # recusam o handshake mTLS.
        for intermediario in cadeia or []:
            pem_cert += intermediario.public_bytes(Encoding.PEM)
        pem_key = chave.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption())
        _escrever_0600(p_cert, pem_cert)
        _escrever_0600(p_key, pem_key)
        yield ParDeChaves(
            cert_pem=p_cert,
            key_pem=p_key,
            # ⚠️ Só a folha vai para a assinatura (sem a cadeia): é o certificado
            # do signatário que entra no KeyInfo do XMLDSig.
            cert_pem_bytes=cert.public_bytes(Encoding.PEM),
            key_pem_bytes=pem_key,
        )
    finally:
        _apagar(p_cert)
        _apagar(p_key)


def _carregar_pkcs12(pfx: bytes, senha: str):
    try:
        chave, cert, cadeia = pkcs12.load_key_and_certificates(
            pfx, (senha or "").encode("utf-8")
        )
    except Exception:
        raise ErroDeCustodia(
            "Não foi possível abrir o certificado digital. Confira se o arquivo "
            "é um .pfx/.p12 válido e se a senha está correta."
        ) from None
    if chave is None or cert is None:
        raise ErroDeCustodia(
            "O certificado digital enviado não contém chave privada. "
            "Exporte o arquivo novamente incluindo a chave."
        )
    return chave, cert, cadeia


def inspecionar(pfx: bytes, senha: str) -> dict:
    """Metadados públicos do certificado (validade, titular, CNPJ do emitente).

    Serve para o upload já devolver `certificate_expires_at` — hoje sempre nulo,
    porque o provedor terceirizado não informava a validade. Só dado do titular:
    nada de chave privada aqui.
    """
    _chave, cert, _cadeia = _carregar_pkcs12(pfx, senha)
    titular = ""
    for atributo in cert.subject:
        if atributo.oid.dotted_string == "2.5.4.3":  # CN
            titular = str(atributo.value)
            break
    documento = "".join(ch for ch in titular if ch.isdigit())
    # O CN de e-CNPJ costuma ser "RAZAO SOCIAL:12345678000199".
    cnpj = documento[-14:] if len(documento) >= 14 else ""
    validade = getattr(cert, "not_valid_after_utc", None) or cert.not_valid_after
    return {
        "titular": titular.split(":")[0].strip(),
        "cnpj": cnpj,
        "validade_ate": validade.isoformat(),
        "numero_serie": format(cert.serial_number, "x"),
    }
