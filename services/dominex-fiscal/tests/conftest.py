"""Ambiente de teste: KEKs e token fabricados, tmpfs apontando para um diretório
temporário. Nada aqui toca rede, banco ou certificado real."""

from __future__ import annotations

import base64
import os
import secrets
import tempfile

# ⚠️ Precisa acontecer ANTES de importar app.config (get_config é cacheado).
KEK_ATUAL = base64.b64encode(b"A" * 32).decode()
KEK_ANTIGA = base64.b64encode(b"B" * 32).decode()
KEK_INTRUSA = base64.b64encode(b"C" * 32).decode()

os.environ.setdefault("FISCAL_SERVICE_TOKEN", secrets.token_urlsafe(48))
os.environ.setdefault("FISCAL_KEKS", f"2:{KEK_ATUAL},1:{KEK_ANTIGA}")
os.environ.setdefault(
    "FISCAL_TMPFS_DIR", os.path.join(tempfile.gettempdir(), "dominex-fiscal-tests")
)

import pytest  # noqa: E402

from app.config import Config, Kek, get_config  # noqa: E402


@pytest.fixture
def cfg() -> Config:
    return get_config()


@pytest.fixture
def cfg_intrusa(cfg: Config) -> Config:
    """Mesma configuração, KEK diferente: simula VPS comprometida SEM a KEK certa."""
    return Config(
        token=cfg.token,
        keks={2: Kek(id=2, chave=base64.b64decode(KEK_INTRUSA))},
        kek_atual_id=2,
        tmpfs_dir=cfg.tmpfs_dir,
        timeout_segundos=cfg.timeout_segundos,
        verificar_tls=cfg.verificar_tls,
    )


@pytest.fixture(scope="session")
def pfx_de_teste() -> tuple[bytes, str]:
    """(.pfx, senha) autoassinado, gerado na hora. Nunca um certificado real."""
    from datetime import datetime, timedelta, timezone

    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    chave = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    nome = x509.Name(
        [x509.NameAttribute(NameOID.COMMON_NAME, "EMPRESA DE TESTE LTDA:12345678000199")]
    )
    agora = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(nome)
        .issuer_name(nome)
        .public_key(chave.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(agora - timedelta(days=1))
        .not_valid_after(agora + timedelta(days=365))
        .sign(chave, hashes.SHA256())
    )
    senha = "senha-de-teste-123"
    pfx = serialization.pkcs12.serialize_key_and_certificates(
        name=b"teste",
        key=chave,
        cert=cert,
        cas=None,
        encryption_algorithm=serialization.BestAvailableEncryption(senha.encode()),
    )
    return pfx, senha
