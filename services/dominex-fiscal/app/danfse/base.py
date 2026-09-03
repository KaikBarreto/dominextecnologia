"""C5 — DANFSe: interface do gerador de PDF.

Existe UMA razão para esta interface: a biblioteca de geração local
(`BrazilFiscalReport`) está com a **licença ambígua** — o metadado do pacote diz
LGPL-3.0 e o classificador diz AGPL-3.0. Enquanto o jurídico não decide, ela fica
atrás desta fronteira, importada em UM único módulo (`local.py`).

Se o veto vier: apaga-se `local.py`, tira-se a linha do `requirements.txt` e
escreve-se outro gerador com a mesma assinatura. Nenhum outro arquivo muda.
"""

from __future__ import annotations

from typing import Optional, Protocol

from ..custodia import ParDeChaves


class GeradorDanfse(Protocol):
    nome: str

    def gerar(
        self,
        *,
        chave: str,
        xml: Optional[bytes],
        ambiente: int,
        certificado: Optional[ParDeChaves],
    ) -> Optional[bytes]:
        """PDF em bytes, ou `None` quando este gerador não conseguiu produzir."""
        ...
