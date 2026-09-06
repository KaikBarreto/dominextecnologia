#!/usr/bin/env python3
"""
Pós-processa o PDF do Guia Técnico:

1. Carimba o número da página no rodapé — só nas páginas de miolo (as capas
   escuras ficam limpas, sem rodapé).
2. Cria os marcadores (bookmarks) do PDF, um por tutorial, pra navegar no leitor.
3. Grava os metadados do documento.
4. Salva com compressão e limpeza de objetos (garbage collect + deflate).

Uso:  python3 scripts/finalizar-guia.py <arquivo.pdf>

Portado de EcoSistemaSaaS (scripts/finalizar-guia.py). Adaptado pra raiz
docs/guia-tecnico, nome do PDF e grade de 18 seções (T0..T17) da Dominex.
"""

import json
import os
import sys

import fitz

PDF = sys.argv[1] if len(sys.argv) > 1 else "docs/guia-tecnico/Guia-Tecnico-Dominex.pdf"
CAPS = json.load(open("docs/guia-tecnico/grade/capitulos.json"))

CINZA = (0.60, 0.64, 0.68)
MARGEM_X = 15 * 72 / 25.4   # 15mm
BASE_Y = 297 * 72 / 25.4 - 10 * 72 / 25.4   # 10mm da borda de baixo


def pagina_escura(page):
    """Amostra o canto inferior esquerdo. Capa = fundo escuro."""
    r = fitz.Rect(2, page.rect.height - 12, 14, page.rect.height - 2)
    pix = page.get_pixmap(clip=r, colorspace=fitz.csGRAY)
    return (sum(pix.samples) / len(pix.samples)) < 110


def main():
    doc = fitz.open(PDF)
    tam_antes = os.path.getsize(PDF)

    # --- 1. rodapé só no miolo -------------------------------------------
    numeradas = 0
    for i, page in enumerate(doc):
        if pagina_escura(page):
            continue
        n = str(i + 1)
        page.insert_text(
            (MARGEM_X, BASE_Y),
            "GUIA TÉCNICO · DOMINEX",
            fontname="helv", fontsize=6.2, color=CINZA,
        )
        largura = fitz.get_text_length(n, fontname="helv", fontsize=7)
        page.insert_text(
            (page.rect.width - MARGEM_X - largura, BASE_Y),
            n, fontname="helv", fontsize=7, color=CINZA,
        )
        numeradas += 1

    # --- 2. marcadores ----------------------------------------------------
    textos = []
    for page in doc:
        try:
            textos.append(" ".join((page.get_text() or "").split()))
        except Exception:
            textos.append("")

    toc = [[1, "Capa", 1], [1, "Índice", 2]]
    for code in [f"T{i}" for i in range(18)]:
        meta = CAPS.get(code)
        if not meta:
            continue
        alvo = " ".join(meta["titulo"].split())[:30]
        for i, t in enumerate(textos):
            if i < 2:
                continue
            if alvo and alvo in t:
                toc.append([1, f"{code} · {meta['titulo']}", i + 1])
                break
    doc.set_toc(toc)

    # --- 3. metadados -----------------------------------------------------
    doc.set_metadata({
        "title": "Guia Técnico — Dominex",
        "author": "Dominex",
        "subject": "Manual completo do produto, na ordem da Trilha Domiflix. Base de conhecimento do suporte.",
        "keywords": "Dominex, suporte, manual, ordem de serviço, PMOC, campo, refrigeração, ERP, Domiflix",
        "creator": "scripts/montar-guia-suporte.mjs",
    })

    # --- 4. salva comprimido ---------------------------------------------
    tmp = PDF + ".tmp"
    doc.save(tmp, garbage=4, deflate=True, deflate_images=True, deflate_fonts=True, clean=True)
    doc.close()
    os.replace(tmp, PDF)

    tam_depois = os.path.getsize(PDF)
    print(f"rodapé em {numeradas} páginas de miolo · {len(toc) - 2} marcadores de tutorial")
    print(f"tamanho: {tam_antes/1024/1024:.2f} MB → {tam_depois/1024/1024:.2f} MB")


if __name__ == "__main__":
    main()
