from fastapi import APIRouter, Depends

from ..security import exigir_escopo
from . import api_schemas as schemas
from . import service

rotas_mdfe = APIRouter(prefix="/mdfe", tags=["mdfe"])
leitura = [Depends(exigir_escopo("mdfe:read"))]
escrita = [Depends(exigir_escopo("mdfe:write"))]


@rotas_mdfe.post("/preparar", dependencies=escrita)
async def preparar(req: schemas.PrepararMdfeRequest) -> dict:
    return service.preparar(req)


@rotas_mdfe.post("/consultar", dependencies=leitura)
async def consultar(req: schemas.ConsultarMdfeRequest) -> dict:
    return service.consultar(req)


@rotas_mdfe.post("/autorizar", dependencies=escrita)
async def autorizar(req: schemas.AutorizarMdfeRequest) -> dict:
    return service.autorizar(req)


@rotas_mdfe.post("/eventos/preparar", dependencies=escrita)
async def preparar_evento(req: schemas.PrepararEventoMdfeRequest) -> dict:
    return service.preparar_evento(req)


@rotas_mdfe.post("/eventos/transmitir", dependencies=escrita)
async def transmitir_evento(req: schemas.TransmitirEventoMdfeRequest) -> dict:
    return service.transmitir_evento(req)
