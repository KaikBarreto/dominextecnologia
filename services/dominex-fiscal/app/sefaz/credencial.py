"""Do envelope cifrado ao contexto mTLS da SEFAZ — só em memória.

REESCRITO (não portado). O `ecosistema-dfe` recebia `pfx_b64` + senha da RPC da
Supabase; aqui o material chega cifrado no corpo da requisição e é aberto pela
custódia que já existe (`app/custodia.py`: KEK → DEK → .pfx). Uma implementação
de cripto só no serviço — ver o aviso no topo de `app/security.py`.

⚠️ POR QUE OPENSSL E NÃO `requests` (e por que o resto do serviço usa `requests`)
   O `NFeDistribuicaoDFe` NÃO pede o certificado no handshake inicial: ele
   RENEGOCIA a conexão depois para pedir. Isso exige um stack que fale
   renegociação legada (OpenSSL) e HTTP/1.1 — daí o `http.client` com
   `ssl.SSLContext` neste caminho, em vez do `requests` usado no `app/sefin/`.
   Não "modernizar" este contexto: desligar renegociação quebra o DF-e inteiro.

⚠️ JANELA DO PEM EM TMPFS
   `materializar_pem` mantém os PEMs vivos enquanto o `with` estiver aberto,
   porque o `requests` precisa do CAMINHO durante a conversa toda. Aqui não:
   o `SSLContext` já carregou a chave para dentro do OpenSSL, então saímos do
   `with` ANTES de falar com a SEFAZ. Resultado: o PEM existe por
   milissegundos, não pelos 75s da rodada. É a mesma propriedade do Eco.
"""

from __future__ import annotations

import ssl
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from cryptography import x509
from cryptography.hazmat.primitives.serialization import load_pem_private_key

from ..custodia import Envelope, abrir, materializar_pem
from ..errors import CertificadoInvalido


@dataclass(frozen=True)
class CredencialSefaz:
    """mTLS + material de assinatura, ambos estritamente em memória."""

    contexto: ssl.SSLContext = field(repr=False)
    chave: Any = field(repr=False)
    certificado: Any = field(repr=False)


def _conferir_validade(certificado: Any) -> None:
    """Certificado vencido: recusar AQUI, com mensagem que o cliente entende.

    Sem isto o erro chega como "falha de TLS", que manda o suporte caçar rede
    quando o problema é o cliente precisar renovar o certificado.
    """
    validade = getattr(certificado, "not_valid_after_utc", None)
    if validade is None:  # cryptography antigo
        validade = certificado.not_valid_after.replace(tzinfo=timezone.utc)
    if validade < datetime.now(timezone.utc):
        raise CertificadoInvalido(
            f"O certificado digital da empresa venceu em {validade:%d/%m/%Y}. "
            "Envie um certificado novo para voltar a consultar notas na SEFAZ."
        )


def abrir_credencial(envelope: Envelope, empresa_id: str) -> CredencialSefaz:
    """Abre o envelope e devolve a credencial pronta. Os PEMs JÁ FORAM APAGADOS
    do tmpfs quando esta função retorna."""
    pfx, senha = abrir(envelope, empresa_id)
    with materializar_pem(pfx, senha) as par:
        contexto = ssl.create_default_context()
        # check_hostname e verificação da cadeia do SERVIDOR ficam LIGADOS: o
        # mTLS só vale metade se não autenticarmos a ponta do governo.
        contexto.load_cert_chain(par.cert_pem, par.key_pem)
        chave = load_pem_private_key(par.key_pem_bytes, password=None)
        certificado = x509.load_pem_x509_certificate(par.cert_pem_bytes)

    _conferir_validade(certificado)
    return CredencialSefaz(contexto=contexto, chave=chave, certificado=certificado)
