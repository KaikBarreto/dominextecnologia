"""
protocols/upx.py - Protocolo de balança UPX EA-32 (e compatíveis)

Parâmetros seriais de fábrica: 8N1, baud configurável (default 9600).

Modos de envio da balança (parâmetro "Cont"):
    0 = Demanda  -> o computador precisa enviar ENQ (0x05) para receber 1 frame.
    1 = Contínuo -> a balança envia frames continuamente.
(O envio do ENQ é responsabilidade do scale_reader; aqui só parseamos o frame.)

Formatos de frame (parâmetro "tIPo Prot"):
    Tipo 0 e 1 (padrão):  STX S PPPPP B VVVVVV B TTTTTT B CCCC ETX
    Tipo 2 (só peso):     STX S PPPPP CR
    Tipo 3 (microterm.):  STX PP.PPP CR

Onde:
    STX = 0x02, ETX = 0x03, CR = 0x0D, B = espaço (0x20)
    S   = sinal do peso: espaço (positivo) ou '-' (negativo)
    P   = tipos 0/1/2: 5 dígitos de peso líquido em GRAMAS (kg = valor / 1000)
          tipo 3: peso já em kg com ponto decimal explícito (PP.PPP)
    V/T/C = preço/kg, total e código -> IGNORADOS (só interessa o peso).
"""

from __future__ import annotations

import re

STX = 0x02
ETX = 0x03
CR = 0x0D

# Frame do tipo 3 (microterminal): STX seguido de peso decimal PP.PPP e CR.
# Ex.: b"\x0201.250\r". Sinal opcional antes do decimal.
_TYPE3_RE = re.compile(rb"([ \-]?)(\d{1,3}\.\d{1,3})")

# Frame dos tipos 0/1/2: STX + sinal (espaço ou '-') + 5 dígitos de peso (gramas).
# Nos tipos 0/1 seguem mais campos até ETX; no tipo 2 vem CR logo após.
_WEIGHT5_RE = re.compile(rb"([ \-])(\d{5})")


def _extract_frame(raw: bytes) -> bytes | None:
    """
    Localiza um frame completo delimitado por STX e (ETX ou CR),
    tolerando lixo antes e depois. Retorna o conteúdo ENTRE STX e o
    terminador (exclusive), ou None se não houver frame completo.
    """
    start = raw.find(STX)
    if start < 0:
        return None

    # Procura o primeiro terminador (ETX ou CR) após o STX.
    end = -1
    for i in range(start + 1, len(raw)):
        b = raw[i]
        if b == ETX or b == CR:
            end = i
            break
    if end < 0:
        # Frame parcial: STX presente mas ainda sem terminador.
        return None

    return raw[start + 1 : end]


def parse(raw: bytes) -> str | None:
    """
    Extrai o peso de um frame UPX EA-32 (tipos 0/1/2/3).
    Retorna o peso como string numérica (ex: "1.250", "-0.500") ou None.

    Robusto a lixo antes/depois do frame e a frames parciais
    (retorna None se não houver STX...terminador completo).
    """
    if not raw:
        return None

    body = _extract_frame(raw)
    if body is None:
        return None

    # ── Tipo 3 (microterminal): peso decimal já em kg ──────────────
    # Só tratamos como tipo 3 se houver ponto decimal no corpo.
    if b"." in body:
        m = _TYPE3_RE.search(body)
        if m:
            sign = m.group(1)
            value_str = m.group(2).decode("ascii", errors="ignore")
            try:
                value = float(value_str)
            except ValueError:
                return None
            if sign == b"-":
                value = -value
            return f"{value:.3f}"
        return None

    # ── Tipos 0, 1 e 2: sinal + 5 dígitos em gramas ────────────────
    m = _WEIGHT5_RE.search(body)
    if m:
        sign = m.group(1)
        grams_str = m.group(2).decode("ascii", errors="ignore")
        try:
            grams = int(grams_str)
        except ValueError:
            return None
        value = grams / 1000.0
        if sign == b"-":
            value = -value
        return f"{value:.3f}"

    return None
