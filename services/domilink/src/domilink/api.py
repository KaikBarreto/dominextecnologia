from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
from collections.abc import Mapping
from dataclasses import asdict
from typing import Any, AsyncIterator, Dict, Optional

from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse

from . import __version__
from .adapters.base import AdapterError, DeviceAdapter, PrintPayload, ScaleAdapter
from .config import Settings
from .jobs import IdempotencyConflict, PrintJob, PrintJobStore
from .logging_utils import safe_event
from .models import PairRequest, PrintRequest
from .registry import DeviceRegistry
from .security import RateLimiter, SecurityError, Session, SessionManager, extract_bearer

API_PREFIX = "/v1"
ALLOWED_METHODS = "GET, POST, DELETE, OPTIONS"
ALLOWED_HEADERS = "Authorization, Content-Type, Idempotency-Key"


def _error(
    status: int,
    code: str,
    message: str,
    headers: Optional[Mapping[str, str]] = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"error": {"code": code, "message": message}},
        headers=headers,
    )


def _job_dict(job: PrintJob) -> Dict[str, Any]:
    return asdict(job)


async def _scale_events(
    scale: ScaleAdapter,
    sessions: SessionManager,
    token: str,
    interval_seconds: float,
) -> AsyncIterator[str]:
    """SSE revalida a sessão a cada leitura e nunca bloqueia o event loop."""
    while True:
        try:
            sessions.authenticate(token)
        except SecurityError:
            yield (
                'event: session-ended\ndata: {"error":{"code":"session_ended",'
                '"message":"Sessão encerrada"}}\n\n'
            )
            return
        try:
            reading = await asyncio.to_thread(scale.read)
            payload = {"reading": asdict(reading)}
        except AdapterError as exc:
            payload = {"error": {"code": exc.code, "message": "Balança indisponível"}}
        yield f"data: {json.dumps(payload, separators=(',', ':'))}\n\n"
        await asyncio.sleep(interval_seconds)


def create_app(
    settings: Settings,
    registry: Optional[DeviceRegistry] = None,
    sessions: Optional[SessionManager] = None,
) -> FastAPI:
    app = FastAPI(
        title="DomiLink",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.settings = settings
    app.state.registry = registry or DeviceRegistry(settings.devices)
    app.state.sessions = sessions or SessionManager(
        settings.pairing_ttl_seconds, settings.session_ttl_seconds
    )
    app.state.rate_limiter = RateLimiter(
        settings.rate_limit_requests, settings.rate_limit_window_seconds
    )
    app.state.jobs = PrintJobStore(settings.job_retention)
    app.state.logger = logging.getLogger("domilink")

    @app.middleware("http")
    async def security_boundary(request: Request, call_next: Any) -> Response:
        client_host = request.client.host if request.client else "unknown"
        # Defesa adicional: rejeita tráfego não loopback mesmo se a inicialização for incorreta.
        if client_host not in {"127.0.0.1", "::1", "testclient", "unknown"}:
            return _error(403, "loopback_required", "DomiLink aceita apenas conexões locais")

        origin = request.headers.get("origin")
        if origin is not None and origin.rstrip("/") not in settings.allowed_origins:
            return _error(403, "origin_not_allowed", "Origem não autorizada")

        if request.method == "OPTIONS":
            if origin is None:
                return _error(400, "origin_required", "Origem obrigatória no preflight")
            requested_method = request.headers.get("access-control-request-method", "")
            if requested_method not in {"GET", "POST", "DELETE"}:
                return _error(405, "method_not_allowed", "Método não autorizado")
            response = Response(status_code=204)
            response.headers["Access-Control-Allow-Origin"] = origin.rstrip("/")
            response.headers["Access-Control-Allow-Methods"] = ALLOWED_METHODS
            response.headers["Access-Control-Allow-Headers"] = ALLOWED_HEADERS
            response.headers["Access-Control-Max-Age"] = "600"
            response.headers["Vary"] = "Origin"
            return response

        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > settings.max_body_bytes:
                    return _error(413, "body_too_large", "Corpo da requisição excede o limite")
            except ValueError:
                return _error(400, "invalid_content_length", "Content-Length inválido")
        if request.method in {"POST", "PUT", "PATCH"}:
            # Sem Content-Length (chunked), interrompe assim que o limite é cruzado.
            # Mantemos em memória no máximo limite + um chunk, nunca o corpo inteiro abusivo.
            chunks: list[bytes] = []
            total = 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > settings.max_body_bytes:
                    return _error(413, "body_too_large", "Corpo da requisição excede o limite")
                if chunk:
                    chunks.append(chunk)
            body = b"".join(chunks)
            # BaseHTTPMiddleware reutiliza o cache e o repassa ao endpoint.
            request._body = body

        route_group = request.url.path.split("/", 3)[:3]
        allowed, retry_after = app.state.rate_limiter.check(
            f"{client_host}:{'/'.join(route_group)}"
        )
        if not allowed:
            return _error(
                429,
                "rate_limited",
                "Muitas requisições; tente novamente em instantes",
                {"Retry-After": str(retry_after)},
            )

        response = await call_next(request)
        if origin is not None:
            response.headers["Access-Control-Allow-Origin"] = origin.rstrip("/")
            response.headers["Vary"] = "Origin"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    def current_auth(
        authorization: Optional[str] = Header(default=None),
    ) -> tuple[Session, str]:
        try:
            token = extract_bearer(authorization)
            return app.state.sessions.authenticate(token), token
        except SecurityError as exc:
            raise HTTPException(
                status_code=401,
                detail={"code": exc.code, "message": exc.message},
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    @app.exception_handler(HTTPException)
    async def http_error(_request: Request, exc: HTTPException) -> JSONResponse:
        if isinstance(exc.detail, dict) and "code" in exc.detail:
            return _error(
                exc.status_code,
                str(exc.detail["code"]),
                str(exc.detail["message"]),
                exc.headers,
            )
        return _error(
            exc.status_code,
            "request_failed",
            "Não foi possível concluir a requisição",
            exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return _error(422, "invalid_request", "Revise os dados enviados e tente novamente")

    @app.get("/health")
    async def health() -> Dict[str, str]:
        return {"name": "DomiLink", "status": "ok", "version": __version__, "bind": "loopback"}

    @app.post(f"{API_PREFIX}/pair")
    async def pair(payload: PairRequest) -> Dict[str, Any]:
        try:
            token, session = app.state.sessions.pair(payload.code, payload.client_name)
        except SecurityError as exc:
            app.state.logger.warning(safe_event("pair_failed", reason=exc.code))
            raise HTTPException(
                status_code=401, detail={"code": exc.code, "message": exc.message}
            ) from exc
        app.state.logger.info(safe_event("pair_completed", client=payload.client_name))
        return {"token": token, "token_type": "Bearer", "expires_in": settings.session_ttl_seconds}

    @app.post(f"{API_PREFIX}/session/rotate")
    async def rotate(auth: tuple[Session, str] = Depends(current_auth)) -> Dict[str, Any]:
        _, old_token = auth
        token, _ = app.state.sessions.rotate(old_token)
        return {"token": token, "token_type": "Bearer", "expires_in": settings.session_ttl_seconds}

    @app.delete(f"{API_PREFIX}/session", status_code=204)
    async def revoke(auth: tuple[Session, str] = Depends(current_auth)) -> Response:
        _, token = auth
        app.state.sessions.revoke(token)
        return Response(status_code=204)

    @app.get(f"{API_PREFIX}/version")
    async def version(_auth: tuple[Session, str] = Depends(current_auth)) -> Dict[str, str]:
        return {"name": "DomiLink", "version": __version__}

    @app.get(f"{API_PREFIX}/capabilities")
    async def capabilities(_auth: tuple[Session, str] = Depends(current_auth)) -> Dict[str, Any]:
        return {
            "fiscal": False,
            "printing": ["system-pdf", "escpos-network", "escpos-usb", "escpos-serial"],
            "scales": ["serial", "virtual"],
            "barcodes": ["hid-keyboard", "serial", "virtual"],
            "paper_widths_mm": [58, 80],
        }

    @app.get(f"{API_PREFIX}/devices")
    async def devices(_auth: tuple[Session, str] = Depends(current_auth)) -> Dict[str, Any]:
        async def describe(adapter: DeviceAdapter) -> Dict[str, Any]:
            return {
                "id": adapter.device_id,
                "kind": adapter.kind,
                "label": adapter.label,
                "online": await asyncio.to_thread(adapter.probe),
                "capabilities": adapter.capabilities(),
            }

        return {
            "devices": await asyncio.gather(
                *(describe(adapter) for adapter in app.state.registry.list())
            )
        }

    @app.post(f"{API_PREFIX}/print/jobs", status_code=202)
    async def create_print_job(
        payload: PrintRequest,
        background: BackgroundTasks,
        idempotency_key: Optional[str] = Header(default=None, alias="Idempotency-Key"),
        auth: tuple[Session, str] = Depends(current_auth),
    ) -> JSONResponse:
        if idempotency_key is None or not 8 <= len(idempotency_key) <= 128:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "idempotency_key_required",
                    "message": "Informe Idempotency-Key entre 8 e 128 caracteres",
                },
            )
        try:
            content = base64.b64decode(payload.content_base64, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_content", "message": "Conteúdo Base64 inválido"},
            ) from exc
        if payload.format == "pdf" and (
            not content.startswith(b"%PDF-")
            or b"/Type /Page " not in content
            or not content.rstrip().endswith(b"%%EOF")
        ):
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_pdf", "message": "Documento PDF inválido"},
            )
        try:
            printer = app.state.registry.printer(payload.device_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "device_not_found", "message": "Impressora não encontrada"},
            ) from exc
        if payload.format not in printer.supported_formats:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "unsupported_format",
                    "message": "Formato não aceito por esta impressora",
                },
            )
        print_payload = PrintPayload(content, payload.format, payload.copies, payload.title)
        session, _token = auth
        scope = session.id
        try:
            job, created = app.state.jobs.create(
                scope, idempotency_key, payload.device_id, print_payload
            )
        except IdempotencyConflict as exc:
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "idempotency_conflict",
                    "message": "A chave já foi usada com outro trabalho",
                },
            ) from exc
        if created:
            async def execute_job() -> None:
                await asyncio.to_thread(app.state.jobs.execute, job.id, printer, print_payload)

            background.add_task(execute_job)
            app.state.logger.info(
                safe_event(
                    "print_queued",
                    job_id=job.id,
                    device_id=payload.device_id,
                    client=session.client_name,
                )
            )
        status = 202 if created else 200
        return JSONResponse(
            status_code=status, content={"job": _job_dict(job), "replayed": not created}
        )

    @app.get(f"{API_PREFIX}/print/jobs/{{job_id}}")
    async def print_status(
        job_id: str, _auth: tuple[Session, str] = Depends(current_auth)
    ) -> Dict[str, Any]:
        try:
            job = app.state.jobs.get(job_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "job_not_found", "message": "Trabalho não encontrado"},
            ) from exc
        return {"job": _job_dict(job)}

    @app.get(f"{API_PREFIX}/scales/{{device_id}}/read")
    async def scale_read(
        device_id: str, _auth: tuple[Session, str] = Depends(current_auth)
    ) -> Dict[str, Any]:
        try:
            reading = await asyncio.to_thread(app.state.registry.scale(device_id).read)
            return {"reading": asdict(reading)}
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "device_not_found", "message": "Balança não encontrada"},
            ) from exc
        except AdapterError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": exc.code, "message": "Balança indisponível"},
            ) from exc

    @app.post(f"{API_PREFIX}/scales/{{device_id}}/tare", status_code=204)
    async def scale_tare(
        device_id: str, _auth: tuple[Session, str] = Depends(current_auth)
    ) -> Response:
        try:
            await asyncio.to_thread(app.state.registry.scale(device_id).tare)
            return Response(status_code=204)
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "device_not_found", "message": "Balança não encontrada"},
            ) from exc
        except AdapterError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": exc.code, "message": "Não foi possível executar a tara"},
            ) from exc

    @app.get(f"{API_PREFIX}/scales/{{device_id}}/stream")
    async def scale_stream(
        device_id: str,
        interval_ms: int = 500,
        auth: tuple[Session, str] = Depends(current_auth),
    ) -> StreamingResponse:
        try:
            scale = app.state.registry.scale(device_id)
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "device_not_found", "message": "Balança não encontrada"},
            ) from exc
        safe_interval = min(5000, max(100, interval_ms)) / 1000

        _session, token = auth
        return StreamingResponse(
            _scale_events(scale, app.state.sessions, token, safe_interval),
            media_type="text/event-stream",
        )

    @app.get(f"{API_PREFIX}/barcodes/{{device_id}}/read")
    async def barcode_read(
        device_id: str, _auth: tuple[Session, str] = Depends(current_auth)
    ) -> Dict[str, Any]:
        try:
            code = await asyncio.to_thread(app.state.registry.barcode(device_id).read)
            return {"code": code}
        except KeyError as exc:
            raise HTTPException(
                status_code=404,
                detail={"code": "device_not_found", "message": "Leitor não encontrado"},
            ) from exc
        except AdapterError as exc:
            raise HTTPException(
                status_code=503,
                detail={"code": exc.code, "message": "Leitor indisponível"},
            ) from exc

    return app
