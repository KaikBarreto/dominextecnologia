#!/usr/bin/env python3
"""
Otimiza os prints do guia pra o PDF não ficar pesado.

PNG de 2x (retina) vira JPEG redimensionado. Um print de tela cheia ocupa no
máximo ~112mm de altura no A4, então mais que ~1400px de largura é desperdício:
o PDF fica gigante e a página não mostra a diferença.

Gera DOIS conjuntos a partir do mesmo PNG original — um pra web (maior,
melhor qualidade) e um pra o PDF (menor, dentro da caixa real da página).
Isso é o que tirou ~2,3 MB do PDF final no porte de origem (EcoSistema);
preservar os dois conjuntos aqui.

Uso:  python3 scripts/otimizar-prints.py
Saída: docs/guia-tecnico/img-otim/<id>.jpg (web)
       docs/guia-tecnico/img-pdf/<id>.jpg  (pdf)
"""

import os
from PIL import Image

ORIG = "docs/guia-tecnico/img"
DEST = "docs/guia-tecnico/img-otim"       # versão da página web
DEST_PDF = "docs/guia-tecnico/img-pdf"    # versão do PDF (bem menor, ver abaixo)
LARGURA_MAX = 1180
QUALIDADE = 72

# No PDF a imagem é exibida dentro de uma caixa de 178mm x 112mm. A ~200 dpi
# isso dá 1400 x 880 px. Print mais alto que isso entra com pixel que nunca
# aparece e só engorda o arquivo: uma tela de 1180x1909 vira 544x880 na página.
CAIXA_PDF = (960, 620)
QUALIDADE_PDF = 66

os.makedirs(DEST, exist_ok=True)
os.makedirs(DEST_PDF, exist_ok=True)

antes = depois = 0
convertidos = 0

for nome in sorted(os.listdir(ORIG)):
    if not nome.lower().endswith((".png", ".jpg", ".jpeg")):
        continue
    src = os.path.join(ORIG, nome)
    dst = os.path.join(DEST, os.path.splitext(nome)[0] + ".jpg")

    tam_orig = os.path.getsize(src)
    antes += tam_orig

    dst_pdf = os.path.join(DEST_PDF, os.path.splitext(nome)[0] + ".jpg")
    pronto = (
        os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src)
        and os.path.exists(dst_pdf) and os.path.getmtime(dst_pdf) >= os.path.getmtime(src)
    )
    if pronto:
        depois += os.path.getsize(dst)
        continue

    im = Image.open(src)
    if im.mode in ("RGBA", "LA", "P"):
        fundo = Image.new("RGB", im.size, (255, 255, 255))
        im = im.convert("RGBA")
        fundo.paste(im, mask=im.split()[-1])
        im = fundo
    else:
        im = im.convert("RGB")

    if im.width > LARGURA_MAX:
        alt = round(im.height * LARGURA_MAX / im.width)
        im = im.resize((LARGURA_MAX, alt), Image.LANCZOS)

    im.save(dst, "JPEG", quality=QUALIDADE, optimize=True, progressive=True, subsampling=1)
    depois += os.path.getsize(dst)
    convertidos += 1

    # versão do PDF: cabe na caixa da página, sem pixel desperdiçado
    im_pdf = im.copy()
    im_pdf.thumbnail(CAIXA_PDF, Image.LANCZOS)
    im_pdf.save(dst_pdf, "JPEG", quality=QUALIDADE_PDF, optimize=True, progressive=True, subsampling=1)

# dimensões de cada print: sem elas o navegador não reserva espaço e a página
# "pula" enquanto carrega (é o que estraga o CLS nos Core Web Vitals).
import json
dims = {}
for nome in sorted(os.listdir(DEST)):
    if nome.lower().endswith(".jpg"):
        with Image.open(os.path.join(DEST, nome)) as im:
            dims[nome] = [im.width, im.height]
json.dump(dims, open(os.path.join(DEST, "_dimensoes.json"), "w"), indent=1)

tam_pdf = sum(os.path.getsize(os.path.join(DEST_PDF, f)) for f in os.listdir(DEST_PDF) if f.endswith(".jpg"))

print(f"{convertidos} imagens convertidas")
print(f"antes:  {antes/1024/1024:.1f} MB")
print(f"web:    {depois/1024/1024:.1f} MB  ({100*depois/antes:.0f}%)" if antes else "")
print(f"pdf:    {tam_pdf/1024/1024:.1f} MB  ({100*tam_pdf/antes:.0f}%)" if antes else "")
