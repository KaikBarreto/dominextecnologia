"""Geração LOCAL do DANFSe (layout oficial v2.0, com QR Code).

┌──────────────────────────────────────────────────────────────────────────────┐
│ ⚠️ ÚNICO ponto do serviço que importa `BrazilFiscalReport`.                  │
│    Licença AMBÍGUA (metadado: LGPL-3.0 · classificador: AGPL-3.0), em        │
│    revisão jurídica. Se o veto vier, este arquivo inteiro é descartável:     │
│    ninguém mais importa a biblioteca. NÃO espalhar o import.                 │
│                                                                              │
│    O import é feito DENTRO do método de propósito — assim o serviço sobe e   │
│    emite normalmente mesmo se a dependência for removida da imagem.          │
└──────────────────────────────────────────────────────────────────────────────┘
"""

from __future__ import annotations

import logging
from typing import Optional

from ..custodia import ParDeChaves

log = logging.getLogger("dominex-fiscal.danfse")


class DanfseLocal:
    nome = "local"

    def gerar(
        self,
        *,
        chave: str,
        xml: Optional[bytes] = None,
        ambiente: int = 2,
        certificado: Optional[ParDeChaves] = None,
    ) -> Optional[bytes]:
        if not xml:
            return None
        try:
            from brazilfiscalreport.danfse import Danfse  # import isolado (licença)
        except ImportError:
            log.warning("gerador local de DANFSe indisponível nesta imagem")
            return None

        try:
            documento = Danfse(xml=xml.decode("utf-8") if isinstance(xml, bytes) else xml)
            saida = documento.output()
        except Exception as exc:  # layout novo / XML inesperado não pode derrubar a rota
            log.warning("falha ao gerar DANFSe local: %s", type(exc).__name__)
            return None

        conteudo = bytes(saida) if saida else b""
        return conteudo if conteudo.startswith(b"%PDF") else None
