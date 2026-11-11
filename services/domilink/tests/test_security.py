from __future__ import annotations

import pytest

from domilink.security import RateLimiter, SecurityError, SessionManager


def test_pairing_is_one_time_and_rotation_invalidates_old_token() -> None:
    now = [100.0]
    manager = SessionManager(120, 900, clock=lambda: now[0])
    code, _ = manager.create_pairing_code()

    token, _ = manager.pair(code, "PDV Caixa 1")
    original_session = manager.authenticate(token)
    assert original_session.client_name == "PDV Caixa 1"
    with pytest.raises(SecurityError, match="expirado"):
        manager.pair(code, "Replay")

    rotated, _ = manager.rotate(token)
    with pytest.raises(SecurityError, match="inválida"):
        manager.authenticate(token)
    rotated_session = manager.authenticate(rotated)
    assert rotated_session.client_name == "PDV Caixa 1"
    assert rotated_session.id == original_session.id


def test_pairing_and_session_expire() -> None:
    now = [0.0]
    manager = SessionManager(30, 60, clock=lambda: now[0])
    code, _ = manager.create_pairing_code()
    now[0] = 31
    with pytest.raises(SecurityError, match="expirado"):
        manager.pair(code, "PDV")

    code, _ = manager.create_pairing_code()
    token, _ = manager.pair(code, "PDV")
    now[0] = 92
    with pytest.raises(SecurityError, match="expirada"):
        manager.authenticate(token)


def test_rate_limiter_uses_sliding_window() -> None:
    now = [0.0]
    limiter = RateLimiter(2, 10, clock=lambda: now[0])
    assert limiter.check("local")[0]
    assert limiter.check("local")[0]
    allowed, retry = limiter.check("local")
    assert not allowed
    assert retry > 0
    now[0] = 11
    assert limiter.check("local")[0]
