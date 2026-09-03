"""Pedido de registro de evento — hoje só o 101101 (cancelamento).

⚠️ Cancelar NFS-e é REGISTRAR UM EVENTO, não apagar a nota. A NFS-e continua com
`cStat 100`; a situação de cancelada vem do evento vinculado à chave. Quem
consulta precisa perguntar pelos dois.
"""

from __future__ import annotations

import re
from datetime import datetime

from nfelib.nfse.bindings.v1_0 import ped_reg_evento_v1_00 as pre
from nfelib.nfse.bindings.v1_0 import tipos_eventos_v1_00 as te
from nfelib.nfse.bindings.v1_0 import tipos_simples_v1_00 as ts

from ..config import VER_APLIC
from ..errors import DadosInvalidos
from .dps import FUSO_BR
from .serializacao import serializar

TIPO_EVENTO_CANCELAMENTO = "101101"

MOTIVO_MINIMO = 15
MOTIVO_MAXIMO = 255


def id_do_evento(chave: str, tipo_evento: str = TIPO_EVENTO_CANCELAMENTO) -> str:
    """Armadilha 5 do spike.

    Id = "PRE" + chave(50) + tipoEvento(6) = **56 DÍGITOS, SEM sequencial**
    (59 caracteres contando o prefixo literal "PRE").

    ⚠️ A `nfelib` v1.00 declara o padrão como `PRE[0-9]{59}` — 59 dígitos, isto
    é, com 3 dígitos de número sequencial no fim. Está DESATUALIZADA: o servidor
    devolve E1235 para esse formato. Foram testados 6 formatos no spike; só
    este passou.
    """
    chave = re.sub(r"\D", "", chave or "")
    if len(chave) != 50:
        raise DadosInvalidos("A chave de acesso da nota fiscal deve ter 50 dígitos.")
    return "PRE" + chave + tipo_evento


def montar_cancelamento(
    *,
    chave: str,
    cnpj_autor: str,
    motivo: str,
    codigo_motivo: str = "1",
    ambiente: int = 2,
    agora: datetime | None = None,
) -> bytes:
    """Devolve o pedido de evento serializado (ainda SEM assinatura)."""
    agora = agora or datetime.now(FUSO_BR)

    motivo = (motivo or "").strip()
    if len(motivo) < MOTIVO_MINIMO:
        raise DadosInvalidos(
            "Descreva o motivo do cancelamento com mais detalhes "
            f"(mínimo de {MOTIVO_MINIMO} caracteres)."
        )
    motivo = motivo[:MOTIVO_MAXIMO]

    documento = re.sub(r"\D", "", cnpj_autor or "")
    if len(documento) not in (11, 14):
        raise DadosInvalidos("O CNPJ da empresa emissora está incompleto.")

    try:
        c_motivo = ts.TscodJustCanc(codigo_motivo or "1")
    except ValueError:
        # Domínio do layout: 1 (erro na emissão), 2 (serviço não prestado), 9 (outros).
        c_motivo = ts.TscodJustCanc("1")

    evento = te.Te101101(
        xDesc=te.Te101101XDesc.CANCELAMENTO_DE_NFS_E,
        cMotivo=c_motivo,
        xMotivo=motivo,
    )

    inf = te.TcinfPedReg(
        tpAmb=ts.TstipoAmbiente("1") if ambiente == 1 else ts.TstipoAmbiente("2"),
        verAplic=VER_APLIC,
        dhEvento=agora.replace(microsecond=0).isoformat(),
        CNPJAutor=documento if len(documento) == 14 else None,
        CPFAutor=documento if len(documento) == 11 else None,
        chNFSe=re.sub(r"\D", "", chave),
        # ⚠️ nPedRegEvento é preenchido aqui só porque a nfelib o exige no
        # dataclass; a tag é REMOVIDA na serialização (armadilha 6, ver
        # serializacao.TAGS_REMOVIDAS). Não tente "consertar" tirando daqui:
        # o ponto único de remoção é o serializador.
        nPedRegEvento="1",
        e101101=evento,
        Id=id_do_evento(chave),
    )
    return serializar(pre.PedRegEvento(infPedReg=inf, versao="1.00"))
