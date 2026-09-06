#!/usr/bin/env python3
"""
Quebra o Guia Técnico em CHUNKS prontos pra consulta por LLM (RAG).

Por que existe: o guia tem dezenas de milhares de palavras. Nenhum modelo lê
isso a cada pergunta, e busca por substring não acha nada num corpus desse
tamanho. Aqui o guia vira pedaços pequenos, auto-contidos e etiquetados, que
dá pra indexar e recuperar por busca textual (tabela `guia_chunks`, RPC
`buscar_guia`).

Regra do chunk: cada pedaço tem que responder sozinho. Por isso todo chunk
carrega o cabeçalho da seção e do capítulo dentro do próprio texto, mais os
sinônimos que o cliente usa pra falar daquilo.

Tipos de chunk:
  visao_geral  o que é a área, onde fica, quem enxerga
  capitulo     um capítulo do guia (dividido se ficar longo demais)
  problema     uma linha da tabela "Suporte: problemas comuns" (sintoma → causa → solução)
  faq          uma pergunta e resposta
  glossario    as palavras que o cliente usa pra falar da área

Uso:  python3 scripts/gerar-chunks-guia.py

Saída:
  docs/guia-tecnico/Guia-Tecnico-chunks.jsonl   um chunk por linha
  docs/guia-tecnico/Guia-Tecnico-index.json     índice/metadados do corpus

Portado de EcoSistemaSaaS (scripts/gerar-chunks-guia.py). Adaptado pra raiz
docs/guia-tecnico e grade de 18 seções (T0..T17) em 7 fases da Trilha Domiflix.
"""

import json
import os
import re
import unicodedata
from html.parser import HTMLParser

ROOT = "docs/guia-tecnico"
SECOES = os.path.join(ROOT, "secoes")
CAPS = json.load(open(os.path.join(ROOT, "grade/capitulos.json"), encoding="utf-8"))

FASES = [
    ("01", "Deixar o sistema de pé", ["T0", "T1", "T2"]),
    ("02", "Os cadastros que sustentam tudo", ["T3", "T4"]),
    ("03", "A operação rodando", ["T5", "T6", "T7", "T8"]),
    ("04", "Vender", ["T9", "T10"]),
    ("05", "Contratos, PMOC e o cliente", ["T11", "T12"]),
    ("06", "O dinheiro e o fiscal", ["T13", "T14"]),
    ("07", "Gente e crescimento", ["T15", "T16", "T17"]),
]
FASE_DE = {t: (n, tit) for n, tit, ts in FASES for t in ts}

# um chunk grande demais não cabe no contexto junto com os outros; um pequeno
# demais perde o sentido. ~1100 palavras é o teto antes de quebrar o capítulo.
TETO_PALAVRAS = 1100

TROCAS = [
    (r"\bNeste tutorial\b", "Nesta seção"), (r"\bneste tutorial\b", "nesta seção"),
    (r"\bEste tutorial\b", "Esta seção"), (r"\beste tutorial\b", "esta seção"),
    (r"\bo primeiro tutorial( da trilha)?\b", "a primeira seção do guia"),
    (r"\btutorial da trilha\b", "seção do guia"),
    (r"\bO tutorial\b", "A seção"), (r"\bo tutorial\b", "a seção"),
    (r"\bdo tutorial\b", "da seção"), (r"\bno tutorial\b", "na seção"),
    (r"\btutorial mais importante\b", "seção mais importante"),
]


def normalizar(t):
    for de, para in TROCAS:
        t = re.sub(de, para, t)
    return t


class Texto(HTMLParser):
    """HTML -> texto corrido, preservando listas e tabelas de forma legível."""

    def __init__(self):
        super().__init__()
        self.out = []
        self.celula = None
        self.linha = []

    def handle_starttag(self, tag, attrs):
        if tag == "li":
            self.out.append("\n- ")
        elif tag in ("th", "td"):
            self.celula = []
        elif tag == "tr":
            self.linha = []
        elif tag == "dt":
            self.out.append("\nPergunta: ")
        elif tag == "dd":
            self.out.append("\nResposta: ")
        elif tag == "img":
            alt = dict(attrs).get("alt", "").strip()
            if alt:
                self.out.append(f"\n(imagem: {alt})\n")
        elif tag == "br":
            self.out.append("\n")
        elif tag in ("p", "div", "h3", "h4", "ul", "ol", "table", "figcaption"):
            self.out.append("\n")

    def handle_endtag(self, tag):
        if tag in ("th", "td"):
            if self.celula is not None:
                self.linha.append(re.sub(r"\s+", " ", "".join(self.celula)).strip())
            self.celula = None
        elif tag == "tr":
            if any(self.linha):
                self.out.append("\n" + " | ".join(self.linha))
            self.linha = []
        elif tag in ("p", "div", "li", "dd", "h3", "h4", "table"):
            self.out.append("\n")

    def handle_data(self, data):
        t = re.sub(r"\s+", " ", data)
        if not t.strip():
            return
        if self.celula is not None:
            self.celula.append(t)
        else:
            self.out.append(t)


def texto(html):
    p = Texto()
    p.feed(html)
    t = "".join(p.out)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def sem_acento(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def termos(*partes):
    """Palavras-chave em minúsculo e sem acento, pra casar com o jeito que o cliente digita."""
    bruto = " ".join(p for p in partes if p)
    palavras = re.findall(r"[a-zA-ZÀ-ÿ0-9/\-]{3,}", bruto.lower())
    parada = {
        "que", "com", "para", "por", "dos", "das", "uma", "não", "nao", "the", "and",
        "seu", "sua", "ele", "ela", "isso", "esse", "essa", "está", "esta", "são", "sao",
        "mais", "quando", "onde", "como", "você", "voce", "pra", "pro", "num", "nos",
        # andaime dos próprios chunks, não diz nada sobre o assunto
        "pergunta", "resposta", "sintoma", "relatado", "usuario", "causa", "provavel",
        "resolver", "problema", "secao", "guia", "tambem", "chamado",
    }
    vistos, saida = set(), []
    for p in palavras:
        p = sem_acento(p)
        if p in parada or p in vistos:
            continue
        vistos.add(p)
        saida.append(p)
    return saida[:40]


# ---------------------------------------------------------------------------
# Lacuna de vocabulário: o guia escreve a SIGLA (documentação técnica), o
# cliente digita diferente no WhatsApp.
#
# "NFS-e" e "nfse" geram lexemas DIFERENTES no tsvector (o hífen quebra a
# palavra em `to_tsvector`) — quem digita sem hífen, que é o normal em
# conversa de WhatsApp, casava ZERO chunk antes deste ajuste (medido).
#
# Cada item: (gatilho = a forma como o guia escreve, presente em algum lugar
# da seção) -> (sinônimo extra a injetar, forma como o cliente digita),
# (já_tem = regex que, se já bater no glossário da seção, pula a injeção pra
# não duplicar).
#
# REVERTIDA a entrada de "OS" que existiu aqui (ordem de serviço, ordens de
# serviço, chamado, atendimento): medição pós-carga mostrou que o mecanismo
# é por SEÇÃO (o campo `sinonimos` viaja em todo chunk da seção, não só no
# chunk que cita a sigla) e 13 das 18 seções citam "OS" em algum lugar — a
# injeção se espalhou por ~76% do corpus. A RPC `buscar_guia` pondera cada
# termo pela raridade (IDF) e descarta o que passa de 30% do corpus (df/N);
# "chamado" foi de fora do índice pra 100% dos chunks, "atendimento" pra
# 76%, e o "ordem" que já existia (118 chunks, 18%, RARO E ÚTIL) foi
# arrastado pra 485 chunks (75,7%) e passou a ser descartado também. Ou
# seja: piorou quem já era bem atendido. Num guia SOBRE ordem de serviço,
# "ordem de serviço" é vocabulário de fundo (como "sistema" ou "tela") —
# não é o que separa um capítulo do outro; quem discrimina é o termo
# específico (cronograma, fatura, checklist, pmoc, kardex). Não tentar de
# novo "mais fino" (por chunk em vez de por seção): mesmo só nos 232 chunks
# que citam a sigla (36% do corpus) o termo já fica acima do corte de
# 30%. É o IDF funcionando certo, não um defeito a contornar.
#
# "NFS-e" -> "nfse" foi mantida: aplicada só na seção-lar (T14, 40/40 chunks
# citavam "NFS-e" e 0/40 casavam "nfse") mais 4 seções que citam a nota de
# passagem; ficou em 159/641 chunks (24,8%), abaixo do corte, ainda
# discriminando. É o exemplo do que dá certo: sinônimo onde o assunto É
# aquele, não em toda menção de passagem.
SINONIMOS_GLOBAIS = [
    (
        re.compile(r"NFS-e", re.I),
        "nfse",  # só a forma sem hífen: "nota fiscal de serviço" já está na prosa do T14 e arrastar "serviço" (já genérico, 39,5% do corpus) só piorava sem ganho
        re.compile(r"\bnfse\b", re.I),
    ),
]


def expandir_sinonimos(sinonimos, texto_secao):
    """Acrescenta sinônimo global quando a seção usa a sigla/forma do guia e o
    glossário ainda não carrega a forma que o cliente digita. Não mexe na
    prosa dos capítulos — só no metadado que viaja com todo chunk da seção."""
    extras = []
    for gatilho, extra, ja_tem in SINONIMOS_GLOBAIS:
        if gatilho.search(texto_secao) and not ja_tem.search(sinonimos):
            extras.append(extra)
    if not extras:
        return sinonimos
    return (sinonimos + ", " + ", ".join(extras)).strip(", ") if sinonimos else ", ".join(extras)


def partir(txt, teto=TETO_PALAVRAS):
    """Quebra um texto longo em pedaços, sempre num limite de parágrafo."""
    paras = [p for p in txt.split("\n\n") if p.strip()]
    blocos, atual, conta = [], [], 0
    for p in paras:
        n = len(p.split())
        if atual and conta + n > teto:
            blocos.append("\n\n".join(atual))
            atual, conta = [], 0
        atual.append(p)
        conta += n
    if atual:
        blocos.append("\n\n".join(atual))
    return blocos or [txt]


def processar(code, html):
    meta = CAPS.get(code, {})
    fase = FASE_DE.get(code, ("", ""))
    titulo_secao = meta.get("titulo", code)
    html = normalizar(html)

    # ---- glossário: os sinônimos viajam junto de TODO chunk da seção -------
    mg = re.search(r'<div class="glossario">(.*?)</div>', html, re.S)
    sinonimos = ""
    if mg:
        sinonimos = re.sub(r"^[^:]*:?\s*", "", texto(mg.group(1))).strip()
    sinonimos = expandir_sinonimos(sinonimos, texto(html))

    # ---- bloco meta: onde fica, rotas, quem enxerga -----------------------
    mm = re.search(r'<div class="meta">(.*?)</div>\s*(?=<h2|<p|<figure|$)', html, re.S)
    bloco_meta = texto(mm.group(1).replace("<span", "<br><span")) if mm else ""
    rotas = sorted(set(re.findall(r"<code>(/[a-z0-9\-/:]+)</code>", html)))

    ml = re.search(r'<p class="lead">(.*?)</p>', html, re.S)
    lead = texto(ml.group(1)) if ml else ""

    prints_secao = sorted(set(re.findall(r'src="(?:\./)?img/([^"]+?)\.(?:png|jpg|jpeg)"', html)))

    base = {
        "secao": code,
        "secao_titulo": titulo_secao,
        "fase": fase[0],
        "fase_titulo": fase[1],
        "rotas": rotas,
        "sinonimos": sinonimos,
        "fonte": f"Guia Técnico Dominex, seção {code} ({titulo_secao})",
    }

    chunks = []

    def novo(sufixo, tipo, titulo, corpo, capitulo=None, prints=None):
        if not corpo.strip():
            return
        cabecalho = f"[{code} · {titulo_secao}] {titulo}"
        texto_final = f"{cabecalho}\n\n{corpo.strip()}"
        if sinonimos:
            # Rótulo com palavra RARA de propósito ("sinônimos" tem df=0 na
            # prosa medida do corpus, contra "também"/"chamado" que tinham
            # 100% cada — o antigo rótulo "Também chamado de:" se auto-
            # queimava (aparecia em TODO chunk que tem sinônimo, ou seja,
            # quase todo chunk do corpus) e arrastava "chamado" — uma das
            # palavras mais discriminantes do vocabulário real do cliente
            # ("abri um chamado", "meu chamado sumiu") — de 5,8% (excelente,
            # rara) pra 100% (inútil, descartada pelo IDF). Ao trocar o
            # rótulo, MEÇA o candidato antes de fixar: qualquer rótulo novo
            # vai pra 100% dos chunks, então tem que ser palavra que nenhum
            # cliente jamais buscaria.
            texto_final += f"\n\nSinônimos: {sinonimos}"
        chunks.append({
            **base,
            "id": f"{code.lower()}-{sufixo}",
            "tipo": tipo,
            "titulo": titulo,
            "capitulo": capitulo,
            "prints": prints or [],
            "texto": texto_final,
            "palavras": len(texto_final.split()),
            "chaves": termos(titulo, corpo[:900], sinonimos, titulo_secao),
        })

    # ---- 1. visão geral ---------------------------------------------------
    visao = "\n".join(x for x in [lead, bloco_meta] if x)
    if meta.get("resumo"):
        visao = normalizar(meta["resumo"]) + "\n" + visao
    novo("visao", "visao_geral", f"O que é e onde fica: {titulo_secao}", visao, prints=prints_secao[:1])

    # ---- 2. capítulos -----------------------------------------------------
    partes = re.split(r'<h2([^>]*)>(.*?)</h2>', html, flags=re.S)
    # partes = [antes, attrs1, titulo1, corpo1, attrs2, titulo2, corpo2, ...]
    i, n_cap = 1, 0
    while i + 2 < len(partes) + 1 and i + 2 <= len(partes) - 1:
        attrs, titulo_h2, corpo = partes[i], texto(partes[i + 1]), partes[i + 2]
        i += 3
        suporte = "suporte" in (attrs or "")
        prints_cap = sorted(set(re.findall(r'src="(?:\./)?img/([^"]+?)\.(?:png|jpg|jpeg)"', corpo)))

        # tabela "Suporte: problemas comuns" -> um chunk por linha
        if suporte and re.search(r"problemas?\s+comuns", titulo_h2, re.I):
            linhas = re.findall(r"<tr>(.*?)</tr>", corpo, re.S)
            k = 0
            for ln in linhas:
                celulas = [texto(c) for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", ln, re.S)]
                if len(celulas) < 3 or celulas[0].lower().startswith("o cliente diz"):
                    continue
                k += 1
                # Rótulo ENCURTADO, não trocado por palavra estranha: o chunk é lido
                # por uma IA pra montar resposta, não só indexado. "Sintoma:"/
                # "Causa:" são inerentes ao formato problema->causa->solução e já
                # estavam dentro do corte de 30% (34,2% e 34,3%, medido) — não
                # pioram. O que saiu foi o que estava ACIMA do corte e É
                # vocabulário real de cliente: "problema" (36,7%, "tenho um
                # problema no sistema"), "relatado", "usuário", "provável",
                # "como resolver". O título também perdeu o prefixo "Problema:"
                # (o texto do título entra com peso A no tsvector, o mais
                # pesado) — segue o mesmo padrão que a FAQ logo abaixo já usava
                # (título = a pergunta crua, sem rótulo).
                corpo_p = (
                    f"Sintoma: {celulas[0]}\n"
                    f"Causa: {celulas[1]}\n"
                    f"Solução: {celulas[2]}"
                )
                novo(f"prob-{k:02d}", "problema", celulas[0], corpo_p, capitulo=titulo_h2)
            continue

        # perguntas frequentes -> um chunk por pergunta
        if suporte and re.search(r"perguntas?\s+frequentes", titulo_h2, re.I):
            pares = re.findall(r"<dt[^>]*>(.*?)</dt>\s*<dd[^>]*>(.*?)</dd>", corpo, re.S)
            for k, (perg, resp) in enumerate(pares, 1):
                # Mesma cirurgia: "Pergunta:"/"Resposta:" viravam 39,0%/36,5% do
                # corpus (acima do corte) sem ganhar clareza nenhuma pra IA — o
                # formato "P: / R:" já é auto-explicativo (pergunta sempre em
                # cima, resposta sempre embaixo) e tira as duas palavras do
                # índice sem perder legibilidade.
                novo(f"faq-{k:02d}", "faq", texto(perg), f"P: {texto(perg)}\nR: {texto(resp)}",
                     capitulo=titulo_h2)
            continue

        n_cap += 1
        corpo_txt = texto(corpo)
        blocos = partir(corpo_txt)
        for j, b in enumerate(blocos, 1):
            sufixo = f"c{n_cap:02d}" if len(blocos) == 1 else f"c{n_cap:02d}-{j}"
            rot = titulo_h2 if len(blocos) == 1 else f"{titulo_h2} (parte {j} de {len(blocos)})"
            novo(sufixo, "capitulo", rot, b, capitulo=titulo_h2, prints=prints_cap if j == 1 else [])

    # ---- 3. glossário -----------------------------------------------------
    if sinonimos:
        novo("glossario", "glossario", f"Como o cliente chama: {titulo_secao}",
             f"Palavras que o usuário usa pra falar de {titulo_secao}: {sinonimos}")

    return chunks


def main():
    todos = []
    for i in range(18):
        code = f"T{i}"
        f = os.path.join(SECOES, f"{code}.html")
        if not os.path.exists(f):
            continue
        html = open(f, encoding="utf-8").read()
        html = re.sub(r"<!--.*?-->", "", html, flags=re.S)  # tira anotação interna
        todos.extend(processar(code, html))

    saida = os.path.join(ROOT, "Guia-Tecnico-chunks.jsonl")
    with open(saida, "w", encoding="utf-8") as fh:
        for c in todos:
            fh.write(json.dumps(c, ensure_ascii=False) + "\n")

    por_tipo = {}
    por_secao = {}
    for c in todos:
        por_tipo[c["tipo"]] = por_tipo.get(c["tipo"], 0) + 1
        por_secao.setdefault(c["secao"], 0)
        por_secao[c["secao"]] += 1

    indice = {
        "documento": "Guia Técnico — Dominex",
        "descricao": (
            "Manual completo da Dominex, sistema de gestão para empresas de serviço técnico em "
            "campo (refrigeração e climatização, elétrica, energia solar, CFTV, dedetização, "
            "elevadores e assistência técnica). Uma seção por área do sistema, na ordem da "
            "Trilha Domiflix. Cada chunk é auto-contido e pode ser recuperado isoladamente."
        ),
        "gerado_em": __import__("datetime").date.today().isoformat(),
        "total_chunks": len(todos),
        "total_palavras": sum(c["palavras"] for c in todos),
        "chunks_por_tipo": por_tipo,
        "secoes": [
            {
                "secao": f"T{i}",
                "titulo": CAPS.get(f"T{i}", {}).get("titulo"),
                "fase": FASE_DE.get(f"T{i}", ("", ""))[0],
                "fase_titulo": FASE_DE.get(f"T{i}", ("", ""))[1],
                "chunks": por_secao.get(f"T{i}", 0),
                "capitulos": [c["nome"] for c in CAPS.get(f"T{i}", {}).get("capitulos", [])],
            }
            for i in range(18)
            if por_secao.get(f"T{i}")
        ],
        "tipos": {
            "visao_geral": "o que é a área, onde fica no menu, quais rotas, quem enxerga",
            "capitulo": "explicação e passo a passo de um assunto",
            "problema": "sintoma relatado pelo usuário, causa provável e como resolver",
            "faq": "uma pergunta e a resposta",
            "glossario": "as palavras que o usuário usa pra falar da área",
        },
    }
    json.dump(indice, open(os.path.join(ROOT, "Guia-Tecnico-index.json"), "w", encoding="utf-8"),
              ensure_ascii=False, indent=1)

    print(f"chunks: {len(todos)} ({sum(c['palavras'] for c in todos)} palavras)")
    for t, n in sorted(por_tipo.items(), key=lambda x: -x[1]):
        print(f"  {t:12s} {n}")
    grandes = [c for c in todos if c["palavras"] > TETO_PALAVRAS * 1.3]
    if grandes:
        print(f"⚠️  {len(grandes)} chunks acima do teto: {[c['id'] for c in grandes][:8]}")


if __name__ == "__main__":
    main()
