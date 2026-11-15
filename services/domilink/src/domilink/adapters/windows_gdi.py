"""Impressão Windows adaptada do EcoTray print_manager.py (ver proveniência)."""

from __future__ import annotations

import importlib
import math
import time
from contextlib import suppress
from typing import Any, Optional

from .base import DeviceOffline, DeviceTimeout, PrintPayload, UnsupportedOperation

THERMAL_DOTS_MIN = 320
THERMAL_DOTS_MAX = 720
PRINTABLE_MM = {58: 48.0, 80: 72.0}


def _compute_target_w(
    user_paper_mm: Optional[float],
    page_width_mm: float,
    horzres: int,
    logpixelsx: int,
) -> tuple[int, str]:
    """
    Calcula a largura alvo de impressão em dots.

    Parâmetros
    ----------
    user_paper_mm : float | None
        Largura de papel configurada pelo usuário no painel web (mm).
        None ou 0 = sem hint explícito (fallback para legado).
    page_width_mm : float
        Largura da página extraída do PDF (mm). Usado apenas no caminho legado.
    horzres : int
        HORZRES do driver (largura imprimível em dots). Usado no clamp e no
        caminho legado.
    logpixelsx : int
        LOGPIXELSX do driver (DPI lógico X).

    Retorna
    -------
    (target_w, target_source)
        target_w  : int — largura alvo em dots (sempre > 0 após fallback)
        target_source : str — string de diagnóstico para o log
    """
    horzres_thermal = THERMAL_DOTS_MIN <= horzres <= THERMAL_DOTS_MAX

    if user_paper_mm and user_paper_mm > 0:
        if horzres_thermal:
            # HORZRES plausível pra térmica = área imprimível REAL reportada pelo
            # driver. É a fonte da verdade: a imagem ocupa a bobina inteira sem
            # faixa branca à direita nem corte. Vale pra mais (POS-80 da Fort
            # Metais, HORZRES > 576) e pra menos (driver honesto que imprime
            # menos que o printable padrão). Só drivers que MENTEM HORZRES caem
            # no printable padrão abaixo.
            target_w = horzres
            target_source = f"HORZRES={horzres} (imprimivel real do driver)"
        else:
            # HORZRES não confiável (0, mente DPI, ou fora da faixa térmica).
            # Cai no printable PADRÃO do tamanho de bobina x DPI efetivo.
            effective_dpi = logpixelsx if logpixelsx >= 180 else 203
            # Largura imprimível padrão do tamanho de bobina. Fallback conservador
            # (x 0.9) para tamanhos desconhecidos: aproxima a margem física típica
            # e NUNCA excede a nominal, evitando corte à direita.
            printable_mm = PRINTABLE_MM.get(round(user_paper_mm), user_paper_mm * 0.9)
            # ceil: arredonda pra cima ao dot inteiro mais próximo. 72mm@203dpi =
            # 575.4 -> 576; 48mm@203dpi = 383.6 -> 384. Sobrescreve <1 dot dentro
            # da área imprimível real — nunca estoura a nominal (o corte à direita).
            target_w = math.ceil(printable_mm / 25.4 * effective_dpi)
            target_source = (
                f"user_paper_mm={user_paper_mm}mm -> printable={printable_mm}mm "
                f"@ {effective_dpi}dpi (HORZRES={horzres} nao confiavel)"
            )
    else:
        # Caminho legado: sem hint do usuário, usa max(HORZRES, pdfxlogpx)
        pdf_at_logpx = (
            int(page_width_mm / 25.4 * logpixelsx) if (page_width_mm > 0 and logpixelsx > 0) else 0
        )
        target_w = max(horzres, pdf_at_logpx) if pdf_at_logpx > 0 else horzres
        target_source = f"max(HORZRES={horzres}, pdf*logpx={pdf_at_logpx})"

        # ── Defense-in-depth (legado): nunca desenhar mais largo que o
        # imprimível real. HORZRES = dots imprimíveis reportados pelo driver.
        # Se target_w (pdfxlogpx) estourar, corta/sobra à direita. Só reduz
        # quando HORZRES é plausível p/ térmica e menor. No caminho com
        # user_paper_mm (acima) o HORZRES térmico já É o target — não reclampa.
        if 0 < horzres < target_w and horzres_thermal:
            target_source += f" -> clamp HORZRES={horzres}"
            target_w = horzres

    # Fallback final: nunca permitir target_w <= 0 (corrompe escala)
    if target_w <= 0:
        target_w = 576  # 80mm @ 203 DPI fallback razoável
        target_source = "fallback 576 (target_w nao calculavel)"

    return target_w, target_source


def _modules() -> tuple[Any, Any, Any, Any, Any]:
    try:
        return tuple(
            importlib.import_module(name)
            for name in ("win32print", "win32ui", "PIL.Image", "PIL.ImageWin", "fitz")
        )  # type: ignore[return-value]
    except ImportError as exc:
        raise DeviceOffline("Instale o suporte de impressão Windows do DomiLink") from exc


def available() -> bool:
    try:
        _modules()
        return True
    except DeviceOffline:
        return False


def print_pdf(
    payload: PrintPayload,
    printer_name: str,
    paper_width_mm: Optional[float],
    timeout_seconds: float,
) -> None:
    """Mesmo raster/GDI EcoTray, com cleanup, cópias, limites e erros seguros."""
    win32print, win32ui, image, imagewin, fitz = _modules()
    deadline = time.monotonic() + timeout_seconds
    dc = None
    doc = None
    started = False
    try:
        name = printer_name or str(win32print.GetDefaultPrinter())
        handle = win32print.OpenPrinter(name)
        try:
            info = win32print.GetPrinter(handle, 2)
        finally:
            win32print.ClosePrinter(handle)
        driver = str(info.get("pDriverName", "")).lower()
        if any(
            pattern in driver
            for pattern in ("generic / text only", "generic text only", "text only")
        ):
            raise UnsupportedOperation(
                "O driver de texto não imprime PDF; instale o driver oficial da impressora"
            )
        doc = fitz.open(stream=payload.content, filetype="pdf")
        if len(doc) < 1 or len(doc) > 100:
            raise UnsupportedOperation("PDF deve conter entre 1 e 100 páginas")
        dc = win32ui.CreateDC()
        dc.CreatePrinterDC(name)
        offset_x, offset_y = dc.GetDeviceCaps(112), dc.GetDeviceCaps(113)
        dc.StartDoc("Documento DomiLink")
        started = True
        for _ in range(payload.copies):
            for page in doc:
                if time.monotonic() >= deadline:
                    raise DeviceTimeout("Tempo limite da impressão excedido")
                # EcoTray: raster 4x, cinza, escala proporcional pela largura.
                if page.rect.width * page.rect.height * 16 > 40_000_000:
                    raise UnsupportedOperation("Página PDF muito grande para impressão local")
                target_w, _ = _compute_target_w(
                    paper_width_mm,
                    page.rect.width / 72 * 25.4,
                    dc.GetDeviceCaps(8),
                    dc.GetDeviceCaps(88),
                )
                pix = page.get_pixmap(matrix=fitz.Matrix(4.0, 4.0), colorspace=fitz.csGRAY)
                bitmap = image.frombytes("L", [pix.width, pix.height], pix.samples)
                try:
                    dib = imagewin.Dib(bitmap)
                    new_h = int(bitmap.size[1] * target_w / bitmap.size[0])
                    dc.StartPage()
                    dib.draw(
                        dc.GetHandleOutput(),
                        (-offset_x, -offset_y, target_w - offset_x, new_h - offset_y),
                    )
                    dc.EndPage()
                finally:
                    bitmap.close()
        dc.EndDoc()
        started = False
    except (DeviceOffline, DeviceTimeout, UnsupportedOperation):
        raise
    except Exception as exc:
        # Erros pywin32/fitz variam por versão; nunca entregar detalhes nativos à API.
        raise DeviceOffline(
            "Não foi possível imprimir; confira a fila e o driver do Windows"
        ) from exc
    finally:
        if dc is not None:
            if started:
                with suppress(Exception):
                    dc.AbortDoc()
            with suppress(Exception):
                dc.DeleteDC()
        if doc is not None:
            with suppress(Exception):
                doc.close()
