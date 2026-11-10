from __future__ import annotations

from fastapi import APIRouter, Depends

from ..security import exigir_escopo
from . import api_schemas as schemas
from . import service

leitura = [Depends(exigir_escopo("nfe:read"))]
escrita = [Depends(exigir_escopo("nfe:write"))]

rotas_nfe = APIRouter(prefix="/nfe", tags=["nfe"])


@rotas_nfe.post("/preparar", dependencies=escrita)
def preparar(req: schemas.PrepararNfeRequest) -> dict:
    return service.preparar(req)


@rotas_nfe.post("/status-servico", dependencies=leitura)
def status(req: schemas.StatusNfeRequest) -> dict:
    return service.status(req)


@rotas_nfe.post("/consultar", dependencies=leitura)
def consultar(req: schemas.ConsultarNfeRequest) -> dict:
    return service.consultar(req)


@rotas_nfe.post("/autorizar", dependencies=escrita)
def autorizar(req: schemas.AutorizarNfeRequest) -> dict:
    return service.autorizar(req)


@rotas_nfe.post("/eventos/preparar", dependencies=escrita)
def preparar_evento(req: schemas.PrepararEventoNfeRequest) -> dict:
    return service.preparar_evento(req)


@rotas_nfe.post("/eventos/transmitir", dependencies=escrita)
def transmitir_evento(req: schemas.TransmitirEventoNfeRequest) -> dict:
    return service.transmitir_evento(req)


@rotas_nfe.post("/inutilizacoes/preparar", dependencies=escrita)
def preparar_inutilizacao(req: schemas.PrepararInutilizacaoNfeRequest) -> dict:
    return service.preparar_inutilizacao(req)


@rotas_nfe.post("/inutilizacoes/transmitir", dependencies=escrita)
def transmitir_inutilizacao(req: schemas.TransmitirInutilizacaoNfeRequest) -> dict:
    return service.transmitir_inutilizacao(req)
