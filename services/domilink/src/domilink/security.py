from __future__ import annotations

import hashlib
import hmac
import secrets
import threading
import time
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Callable, Deque, Dict, Optional, Tuple


class SecurityError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass(frozen=True)
class Session:
    id: str
    client_name: str
    expires_at: float


@dataclass
class _PairingCode:
    digest: str
    expires_at: float
    attempts_left: int
    used: bool = False


class SessionManager:
    """Pairing e sessões somente em memória; nenhum segredo é persistido."""

    def __init__(
        self,
        pairing_ttl: int,
        session_ttl: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._pairing_ttl = pairing_ttl
        self._session_ttl = session_ttl
        self._clock = clock
        self._pepper = secrets.token_bytes(32)
        self._pairing: Optional[_PairingCode] = None
        self._sessions: Dict[str, Session] = {}
        self._lock = threading.RLock()

    def _digest(self, value: str) -> str:
        return hmac.new(self._pepper, value.encode("utf-8"), hashlib.sha256).hexdigest()

    def create_pairing_code(self) -> Tuple[str, float]:
        code = f"{secrets.randbelow(1_000_000):06d}"
        expires_at = self._clock() + self._pairing_ttl
        with self._lock:
            self._pairing = _PairingCode(self._digest(code), expires_at, attempts_left=5)
        return code, expires_at

    def pair(self, code: str, client_name: str) -> Tuple[str, Session]:
        normalized_name = client_name.strip()[:80]
        if not normalized_name:
            raise SecurityError("invalid_client", "Nome do cliente é obrigatório")
        with self._lock:
            pairing = self._pairing
            now = self._clock()
            if pairing is None or pairing.used or now >= pairing.expires_at:
                raise SecurityError("pairing_expired", "Código de pareamento expirado")
            if pairing.attempts_left <= 0:
                raise SecurityError(
                    "pairing_locked", "Pareamento bloqueado por tentativas inválidas"
                )
            if not hmac.compare_digest(pairing.digest, self._digest(code)):
                pairing.attempts_left -= 1
                raise SecurityError("invalid_pairing_code", "Código de pareamento inválido")
            pairing.used = True
            return self._issue(normalized_name, now)

    def _issue(
        self,
        client_name: str,
        now: Optional[float] = None,
        session_id: Optional[str] = None,
    ) -> Tuple[str, Session]:
        issued_at = self._clock() if now is None else now
        token = secrets.token_urlsafe(32)
        session = Session(
            id=session_id or secrets.token_hex(16),
            client_name=client_name,
            expires_at=issued_at + self._session_ttl,
        )
        self._sessions[self._digest(token)] = session
        return token, session

    def authenticate(self, token: str) -> Session:
        digest = self._digest(token)
        with self._lock:
            session = self._sessions.get(digest)
            if session is None:
                raise SecurityError("invalid_session", "Sessão inválida")
            if self._clock() >= session.expires_at:
                self._sessions.pop(digest, None)
                raise SecurityError("session_expired", "Sessão expirada")
            return session

    def rotate(self, token: str) -> Tuple[str, Session]:
        digest = self._digest(token)
        with self._lock:
            session = self.authenticate(token)
            self._sessions.pop(digest, None)
            return self._issue(session.client_name, session_id=session.id)

    def revoke(self, token: str) -> None:
        with self._lock:
            self._sessions.pop(self._digest(token), None)


class RateLimiter:
    """Janela deslizante em memória por origem/IP e grupo de rota."""

    def __init__(
        self,
        requests: int,
        window_seconds: int,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self._limit = requests
        self._window = window_seconds
        self._clock = clock
        self._events: Dict[str, Deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def check(self, key: str) -> Tuple[bool, int]:
        now = self._clock()
        cutoff = now - self._window
        with self._lock:
            events = self._events[key]
            while events and events[0] <= cutoff:
                events.popleft()
            if len(events) >= self._limit:
                retry_after = max(1, int(self._window - (now - events[0])))
                return False, retry_after
            events.append(now)
            return True, 0


def extract_bearer(header: Optional[str]) -> str:
    if not header:
        raise SecurityError("missing_session", "Sessão não informada")
    scheme, separator, value = header.partition(" ")
    if not separator or scheme.lower() != "bearer" or not value:
        raise SecurityError("invalid_session", "Cabeçalho de sessão inválido")
    return value
