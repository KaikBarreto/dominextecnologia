#!/usr/bin/env python3
"""
Gera a versão em texto (.md) do Guia Técnico a partir do guia.html montado.

O PDF é o entregável pro humano. Este .md é o que o agente de IA ingere
melhor: sem layout, sem imagem, cada seção com cabeçalho estável e
auto-contido pro RAG recortar sem perder contexto.

Uso:  python3 scripts/guia-para-markdown.py docs/guia-tecnico/guia.html

Portado de EcoSistemaSaaS (scripts/guia-para-markdown.py). Adaptado pra raiz
docs/guia-tecnico, nome do .md e grade de 18 seções (T0..T17) em 7 fases da
Trilha Domiflix.
"""
import json
import os
import re
import sys
from html.parser import HTMLParser

ENTRADA = sys.argv[1] if len(sys.argv) > 1 else "docs/guia-tecnico/guia.html"
SAIDA = os.path.join(os.path.dirname(ENTRADA), "Guia-Tecnico-Dominex.md")
CAPS = json.load(open("docs/guia-tecnico/grade/capitulos.json", encoding="utf-8"))

FASES = [
    ("01", "Deixar o sistema de pé", ["T0", "T1", "T2"]),
    ("02", "Os cadastros que sustentam tudo", ["T3", "T4"]),
    ("03", "A operação rodando", ["T5", "T6", "T7", "T8"]),
    ("04", "Vender", ["T9", "T10"]),
    ("05", "Contratos, PMOC e o cliente", ["T11", "T12"]),
    ("06", "O dinheiro e o fiscal", ["T13", "T14"]),
    ("07", "Gente e crescimento", ["T15", "T16", "T17"]),
]
FASE_DE = {t: (n, titulo) for n, titulo, ts in FASES for t in ts}

TITULOS = {"h1": "##", "h2": "###", "h3": "####", "h4": "#####"}


class Conversor(HTMLParser):
    """HTML -> texto. Guarda a estrutura mínima que o RAG usa (títulos, listas, tabelas)."""

    def __init__(self):
        super().__init__()
        self.out = []
        self.pular = 0
        self.linha_tabela = []
        self.na_celula = False
        self.celula = []
        self.meta_prof = 0   # profundidade de div dentro do bloco .meta

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag in ("style", "script"):
            self.pular += 1
        elif tag == "div" and "meta" in (d.get("class") or "").split():
            self.meta_prof = 1
            self.out.append("\n")
        elif tag == "div" and self.meta_prof:
            self.meta_prof += 1
        elif tag == "span" and self.meta_prof:
            # no bloco .meta cada span é uma linha ("Onde fica", "Rotas", ...)
            self.out.append("\n")
        elif tag in TITULOS:
            self.out.append("\n\n" + TITULOS[tag] + " ")
        elif tag == "li":
            self.out.append("\n- ")
        elif tag == "dt":
            self.out.append("\n\n**P:** ")
        elif tag == "dd":
            self.out.append("\n**R:** ")
        elif tag == "tr":
            self.linha_tabela = []
        elif tag in ("th", "td"):
            self.na_celula = True
            self.celula = []
        elif tag == "img":
            alt = (d.get("alt") or "").strip()
            self.out.append(f"\n[Print da tela: {alt}]\n" if alt else "")
        elif tag in ("p", "div", "figcaption", "figure", "table", "dl", "ul", "ol"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("style", "script"):
            self.pular = max(0, self.pular - 1)
        elif tag in ("th", "td"):
            self.na_celula = False
            self.linha_tabela.append(re.sub(r"\s+", " ", "".join(self.celula)).strip())
        elif tag == "tr":
            if any(self.linha_tabela):
                self.out.append("\n| " + " | ".join(self.linha_tabela) + " |")
            self.linha_tabela = []
        elif tag == "div" and self.meta_prof:
            self.meta_prof -= 1
            self.out.append("\n")
        elif tag in TITULOS or tag in ("p", "div", "li", "dd", "table", "figure"):
            self.out.append("\n")

    def handle_data(self, data):
        if self.pular:
            return
        t = re.sub(r"\s+", " ", data)
        if not t.strip():
            return
        if self.na_celula:
            self.celula.append(t)
        else:
            self.out.append(t)


def html_para_texto(html):
    c = Conversor()
    c.feed(html)
    t = "".join(c.out)
    t = re.sub(r"[ \t]+\n", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    t = re.sub(r"[ \t]{2,}", " ", t)
    return t.strip()


def main():
    doc = open(ENTRADA, encoding="utf-8").read()
    secoes = re.findall(r'<section class="tutorial" id="(t\d+)">(.*?)</section>', doc, re.S)
    if not secoes:
        print("Nenhuma seção encontrada em", ENTRADA)
        sys.exit(1)

    partes = [
        "# Guia Técnico — Dominex",
        "",
        "Manual completo do produto, seção por seção, na ordem da Trilha Domiflix.",
        "Base de conhecimento do suporte da Dominex, sistema de gestão para empresas",
        "de serviço técnico em campo: refrigeração e climatização, elétrica, energia",
        "solar, CFTV, dedetização, elevadores e assistência técnica.",
        "",
        "Cada seção é auto-contida: dá pra responder um cliente lendo só ela.",
        "",
        "---",
    ]

    for sid, html in secoes:
        code = sid.upper()
        m = CAPS.get(code, {})
        fase = FASE_DE.get(code)
        partes.append("")
        partes.append(f"# {code} · {m.get('titulo', code)}")
        partes.append("")
        if fase:
            partes.append(f"**Fase {fase[0]} da trilha:** {fase[1]}")
        if m.get("resumo"):
            partes.append(f"**Do que trata:** {m['resumo']}")
        if m.get("prereq"):
            partes.append(f"**Depende de:** {m['prereq']}")
        if m.get("capitulos"):
            partes.append("")
            partes.append("**Assuntos desta seção:**")
            for i, c in enumerate(m["capitulos"], 1):
                partes.append(f"{i}. {c['nome']}")
        partes.append("")
        partes.append(html_para_texto(html))
        partes.append("")
        partes.append("---")

    txt = "\n".join(partes)
    txt = re.sub(r"\n{4,}", "\n\n\n", txt)
    open(SAIDA, "w", encoding="utf-8").write(txt + "\n")
    print(f"markdown: {SAIDA} ({len(txt.split())} palavras, {len(secoes)} seções)")


if __name__ == "__main__":
    main()
