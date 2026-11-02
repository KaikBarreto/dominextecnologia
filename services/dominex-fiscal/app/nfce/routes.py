from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Response

from ..errors import DadosInvalidos
from ..nfe.xml import ErroNfeLocal
from ..security import exigir_escopo
from .api_schemas import GerarDanfceRequest
from .danfce import gerar_danfce, parse_authorized_nfce
from . import api_schemas as schemas
from . import service

leitura = [Depends(exigir_escopo("nfce:read"))]
escrita = [Depends(exigir_escopo("nfce:write"))]
rotas_nfce = APIRouter(prefix="/nfce", tags=["nfce"])


@rotas_nfce.post("/preparar", dependencies=escrita)
def preparar(req: schemas.PrepararNfceRequest) -> dict:
    return service.preparar(req)


@rotas_nfce.post("/status-servico", dependencies=leitura)
def status(req: schemas.StatusNfceRequest) -> dict:
    return service.status(req)


@rotas_nfce.post("/consultar", dependencies=leitura)
def consultar(req: schemas.ConsultarNfceRequest) -> dict:
    return service.consultar(req)


@rotas_nfce.post("/autorizar", dependencies=escrita)
def autorizar(req: schemas.AutorizarNfceRequest) -> dict:
    return service.autorizar(req)


@rotas_nfce.post("/cancelamento/preparar", dependencies=escrita)
def preparar_cancelamento(req: schemas.PrepararCancelamentoNfceRequest) -> dict:
    return service.preparar_cancelamento(req)


@rotas_nfce.post("/cancelamento/transmitir", dependencies=escrita)
def transmitir_cancelamento(req: schemas.TransmitirCancelamentoNfceRequest) -> dict:
    return service.transmitir_cancelamento(req)


@rotas_nfce.post("/danfce", dependencies=leitura)
def danfce(req: GerarDanfceRequest) -> Response:
    try:
        data = parse_authorized_nfce(req.xml_processado)
        pdf = gerar_danfce(req.xml_processado)
    except ErroNfeLocal as exc:
        raise DadosInvalidos(str(exc)) from None
    safe_key = data.key if re.fullmatch(r"\d{44}", data.key) else "nfce"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'inline; filename="danfce-{safe_key}.pdf"',
            "X-Danfce-Origem": "motor-fiscal",
            "X-Danfce-Papel": "80mm",
        },
    )
