from __future__ import annotations

import hashlib
import json
import threading
import time
import uuid
from collections import OrderedDict
from dataclasses import dataclass, replace
from typing import Callable, Optional, Tuple

from .adapters.base import AdapterError, PrintAdapter, PrintPayload

IDEMPOTENCY_WINDOW_SECONDS = 3600


class JobQueueFull(ValueError):
    pass


class IdempotencyConflict(ValueError):
    pass


@dataclass(frozen=True)
class PrintJob:
    id: str
    device_id: str
    status: str
    created_at: float
    updated_at: float
    error_code: Optional[str] = None


class PrintJobStore:
    def __init__(self, retention: int, clock: Callable[[], float] = time.time) -> None:
        self._retention = retention
        self._clock = clock
        self._jobs: OrderedDict[str, PrintJob] = OrderedDict()
        self._idempotency: DictKey = {}
        self._scopes: dict[str, str] = {}
        self._lock = threading.RLock()

    def create(
        self, scope: str, idempotency_key: str, device_id: str, payload: PrintPayload
    ) -> Tuple[PrintJob, bool]:
        fingerprint = self.fingerprint(device_id, payload)
        lookup = (scope, idempotency_key)
        with self._lock:
            existing = self._idempotency.get(lookup)
            if existing is not None:
                existing_fingerprint, job_id = existing
                if existing_fingerprint != fingerprint:
                    raise IdempotencyConflict("chave já usada com outro conteúdo")
                return self._jobs[job_id], False
            self._trim()
            if len(self._jobs) >= self._retention:
                raise JobQueueFull("Fila local cheia; aguarde antes de imprimir novamente")
            now = self._clock()
            job = PrintJob(
                id=str(uuid.uuid4()),
                device_id=device_id,
                status="queued",
                created_at=now,
                updated_at=now,
            )
            self._jobs[job.id] = job
            self._scopes[job.id] = scope
            self._idempotency[lookup] = (fingerprint, job.id)
            self._trim()
            return job, True

    @staticmethod
    def fingerprint(device_id: str, payload: PrintPayload) -> str:
        digest = hashlib.sha256()
        # Cabeçalho estruturado evita colisão por concatenação: copies=1/content=23
        # e copies=12/content=3 não podem ter o mesmo fingerprint.
        digest.update(
            json.dumps([device_id, payload.format, payload.copies], separators=(",", ":")).encode()
        )
        digest.update(payload.content)
        return digest.hexdigest()

    def _trim(self) -> None:
        # Jobs ativos nunca somem. Chaves terminais sobrevivem por uma hora após o fim.
        now = self._clock()
        for job_id, job in list(self._jobs.items()):
            if job.status not in {"completed", "failed"}:
                continue
            if now - job.updated_at < IDEMPOTENCY_WINDOW_SECONDS:
                continue
            self._jobs.pop(job_id)
            self._scopes.pop(job_id, None)
            stale = [key for key, value in self._idempotency.items() if value[1] == job_id]
            for key in stale:
                self._idempotency.pop(key, None)

    def get(self, job_id: str, scope: Optional[str] = None) -> PrintJob:
        with self._lock:
            if scope is not None and self._scopes.get(job_id) != scope:
                raise KeyError(job_id)
            try:
                return self._jobs[job_id]
            except KeyError as exc:
                raise KeyError(job_id) from exc

    def execute(self, job_id: str, adapter: PrintAdapter, payload: PrintPayload) -> None:
        with self._lock:
            if self._jobs[job_id].status != "queued":
                return
            self._update(job_id, "printing")
        try:
            adapter.print(payload)
        except AdapterError as exc:
            self._update(job_id, "failed", exc.code)
        except Exception:
            # Não propaga mensagem/driver payload aos logs ou à API.
            self._update(job_id, "failed", "unexpected_adapter_error")
        else:
            self._update(job_id, "completed")

    def _update(self, job_id: str, status: str, error_code: Optional[str] = None) -> None:
        with self._lock:
            current = self._jobs[job_id]
            self._jobs[job_id] = replace(
                current,
                status=status,
                updated_at=self._clock(),
                error_code=error_code,
            )


DictKey = dict[tuple[str, str], tuple[str, str]]
