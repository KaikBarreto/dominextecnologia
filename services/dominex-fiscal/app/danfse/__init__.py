"""Orquestração do DANFSe: tenta o oficial, cai para o local."""

from __future__ import annotations

from typing import Optional

from ..custodia import ParDeChaves
from ..errors import ServicoFiscalIndisponivel
from .base import GeradorDanfse
from .local import DanfseLocal
from .oficial import DanfseOficial

#: Ordem importa: o PDF oficial é a referência; o local é a rede de segurança.
GERADORES: tuple[GeradorDanfse, ...] = (DanfseOficial(), DanfseLocal())


def gerar_danfse(
    *,
    chave: str,
    xml: Optional[bytes],
    ambiente: int,
    certificado: Optional[ParDeChaves],
) -> tuple[bytes, str]:
    """(pdf, nome_do_gerador). Levanta se NENHUM caminho produziu PDF."""
    for gerador in GERADORES:
        pdf = gerador.gerar(
            chave=chave, xml=xml, ambiente=ambiente, certificado=certificado
        )
        if pdf:
            return pdf, gerador.nome
    raise ServicoFiscalIndisponivel(
        "Não foi possível gerar o PDF da nota fiscal agora. "
        "A nota continua válida — tente baixar novamente em alguns minutos."
    )
