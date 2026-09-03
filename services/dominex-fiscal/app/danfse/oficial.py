"""DANFSe oficial do ADN (Ambiente de Dados Nacional).

`GET https://adn.nfse.gov.br/danfse/{chave}` com mTLS. É o PDF de referência —
sempre a primeira tentativa.

⚠️ Esteve **503** durante o spike de 2026-09-02. Indisponibilidade dele NÃO pode
impedir o cliente de ver a nota: quem falha aqui cai no gerador local.
"""

from __future__ import annotations

import logging
from typing import Optional

import requests

from ..config import base_adn, get_config
from ..custodia import ParDeChaves

log = logging.getLogger("dominex-fiscal.danfse")


class DanfseOficial:
    nome = "oficial"

    def gerar(
        self,
        *,
        chave: str,
        xml: Optional[bytes] = None,
        ambiente: int = 2,
        certificado: Optional[ParDeChaves] = None,
    ) -> Optional[bytes]:
        if certificado is None:
            return None
        cfg = get_config()
        url = f"{base_adn(ambiente)}/danfse/{chave}"
        try:
            resposta = requests.get(
                url,
                cert=(certificado.cert_pem, certificado.key_pem),
                verify=cfg.verificar_tls,
                timeout=cfg.timeout_segundos,
                headers={"Accept": "application/pdf"},
            )
        except requests.exceptions.RequestException as exc:
            log.info("DANFSe oficial indisponível (%s) — caindo para o gerador local", type(exc).__name__)
            return None

        if resposta.status_code != 200:
            log.info(
                "DANFSe oficial devolveu HTTP %s — caindo para o gerador local",
                resposta.status_code,
            )
            return None

        conteudo = resposta.content or b""
        if not conteudo.startswith(b"%PDF"):
            log.info("DANFSe oficial devolveu conteúdo não-PDF — caindo para o gerador local")
            return None
        return conteudo
