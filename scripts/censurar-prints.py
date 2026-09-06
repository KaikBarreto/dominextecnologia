#!/usr/bin/env python3
"""
Tarja pedaços de print que não podem ir pro guia, e trava a publicação de
qualquer print que ninguém tenha OLHADO depois da última auditoria — do
CONTEÚDO da imagem E das REGRAS de censura que se aplicam a ela.

Por que existe: a captura roda numa conta DEMO em produção, e o CEO decidiu
que essa conta continua com dado real (não é situação temporária). Toda
captura futura vai reencontrar dado real, pra sempre. Quatro coisas já deram
errado aqui, e as quatro motivam o desenho abaixo:

1) 2ª leva de captura (05/09/2026): 84 prints novos entraram na pasta.
   `REGIOES` NÃO estava vazio (tinha 3 entradas da leva anterior), então a
   trava de "REGIOES vazio" passou quieta — e os 84 novos seguiriam pra
   página pública sem NUNCA terem sido abertos por um humano. A auditoria
   manual, feita depois, achou 11 prints com dado real (nome completo de
   pessoa física, logo de cliente real, nome de cliente real dentro de um
   campo Descrição). A trava de REGIOES vazio só pega "ninguém configurou
   nada"; não pega "chegou print novo depois da última auditoria", que é o
   caso comum e o perigoso.

2) Dois processos de captura rodando em paralelo em background sobrescreveram
   PNGs que já tinham sido tarjados, sem ninguém ver — a nova captura vem
   crua (sem tarja) e pisa por cima do arquivo já tratado. Se o pipeline só
   olhasse "o arquivo existe", isso passaria batido e a tarja removida iria
   pro ar sem ninguém notar.

3) (06/09/2026) Um print JÁ auditado e JÁ tarjado —
   `t11-contrato-visao-geral.png` / `t11-portal-do-contrato.png` —
   escondia um vazamento que só apareceu numa 2ª olhada: a caixa "Portal do
   Contrato" mostrava, em TEXTO PURO, a URL pública do portal PMOC de um
   cliente REAL, com o TOKEN de acesso no próprio link. Não era um nome
   vazando — era uma CREDENCIAL FUNCIONANDO: qualquer leitor do guia
   (público) conseguiria abrir o portal daquele cliente. E o QR Code logo
   abaixo codificava a MESMA url, então tarjar só o texto não bastava (QR é
   legível por máquina). Ao acrescentar as regiões novas em `REGIOES` pros
   dois arquivos e rodar o script, ele respondeu "✅ auditado, sem
   pendência" e NÃO tarjou nada — porque a trava por hash de ARQUIVO só
   pega imagem nova ou alterada; os PNGs não tinham mudado, quem mudou foi
   a CONFIGURAÇÃO DE CENSURA. Foi preciso editar o manifesto na mão pra
   forçar a retarja. Ninguém deveria precisar fazer isso.

4) (06/09/2026, o mais instrutivo dos quatro) Ao liberar nome/foto/logo pro
   guia (decisão do CEO), `REGIOES` esvaziou de propósito — e a trava de
   "REGIOES vazio" (o `if not REGIOES:` no topo do `main()`) interceptava
   TUDO e retornava antes mesmo de chamar `processar_pasta()`. Resultado
   medido na hora: recapturei os 6 prints liberados + 22 vizinhos (a captura
   de modal regrava a seção inteira), 19 desses 28 já estavam com hash de
   ARQUIVO diferente do manifesto — e NENHUMA das duas flags então
   existentes (`--registrar-auditados`, `--sem-censura-confirmado`)
   conseguia registrar que alguém tinha olhado, porque as duas caíam no
   mesmo early-return. O manifesto ficava congelado com hash obsoleto pra
   sempre, sem avisar ninguém, e um print NOVO chegando nesse estado não
   seria pego por nada. A guarda desligou a si mesma exatamente no estado
   que ela deveria proteger — "nada configurado pra tarjar" virou sinônimo
   de "nada pra checar", quando são coisas diferentes. Fix: separar as duas
   perguntas (ver "TRAVA DE SEGURANÇA" abaixo) — `processar_pasta()` roda
   SEMPRE, `REGIOES` vazio só decide se pula o `tarjar()`, nunca se pula a
   checagem de pendência contra o manifesto.

Por isso, ESTE script mantém um manifesto de auditoria versionado
(`docs/guia-tecnico/prints-auditados.json`) com, pra cada PNG já auditado
por olho humano: o HASH do CONTEÚDO do arquivo E o HASH das REGIÕES de
`REGIOES` configuradas pra ele. Hash de conteúdo, não data de modificação:
recapturar um print gera bytes diferentes e TEM que reprovar; copiar o
arquivo de lugar (mesmo conteúdo, mtime novo) não reprova.

A cada execução, cada PNG de `docs/guia-tecnico/img/` cai em 4 baldes:
  - AUDITADO         → hash do arquivo E hash das regiões batem com o
                        manifesto, nada a fazer.
  - NOVO             → nome não está no manifesto (print nunca visto).
  - ALTERADO         → nome está no manifesto, mas o hash do ARQUIVO mudou
                        (recapturado, ou — caso 2 acima — sobrescrito por
                        outro processo).
  - REGRAS ALTERADAS → hash do arquivo bate (a imagem não mudou), mas o
                        hash das REGIÕES declaradas pra ela em `REGIOES`
                        mudou (alguém adicionou/tirou/mexeu numa região
                        depois da última auditoria — caso 3 acima). Trata
                        como pendente: reaplica a tarja a partir do estado
                        ATUAL do arquivo e exige registro de novo.

Se sobrar NOVO, ALTERADO ou REGRAS ALTERADAS, o script GRITA a lista e sai
com código 1, travando qualquer pipeline encadeado (`&&`). Só grava o
manifesto (dizendo "eu olhei estes prints") com a flag
`--registrar-auditados`.

── CUIDADO: tirar região de REGIOES não desfaz tarja nenhuma ─────────────
Se o arquivo já está tarjado e você reaplica a tarja com uma região A MAIS,
tudo bem: você tarja em cima do que já estava tarjado (destrutivo, sem
problema — a região antiga já estava destruída mesmo). MAS isso só é
inofensivo enquanto ninguém TIRA uma região da lista. Se você remover uma
entrada de `REGIOES`, os pixels que ela borrava CONTINUAM borrados no PNG
atual (a tarja já aconteceu, é irreversível) — só que o hash das regiões vai
mudar mesmo assim, e o arquivo vai pedir re-registro achando que "as regras
mudaram" quando na prática nada precisa ser refeito ali. Só NÃO é seguro
achar que remover a entrada "restaura" a imagem — não restaura nada. Pra
tirar uma tarja de verdade, o único jeito é RECAPTURAR o print (pegar a
imagem crua de novo) e reaplicar as regiões corretas do zero.

── ORDEM HASH × TARJA (por que não é "tarja, depois hash, sempre") ────────
A tarja MUTA o PNG (pixeliza + borra a região). Testado e confirmado: aplicar
`tarjar()` duas vezes seguidas no mesmo arquivo produz bytes DIFERENTES nas
duas vezes (blur+resize não é idempotente bit a bit, mesmo sendo idempotente
"visualmente" — a região já tarjada não volta a ficar legível). Se o script
chamasse `tarjar()` em TODO arquivo com entrada em REGIOES a cada execução,
o hash final mudaria a cada execução, e a 2ª chamada (sem nada de novo
capturado) acusaria "alterado" pra sempre — a trava se auto-invalidaria.

Solução adotada: antes de decidir o que fazer com um arquivo, comparamos o
hash do CONTEÚDO ATUAL (como o arquivo está no disco, cru ou já tarjado de
execução anterior) com o hash já REGISTRADO no manifesto — E TAMBÉM o hash
das REGIÕES atualmente configuradas pra ele em `REGIOES` (ver incidente 3
acima: a imagem pode não ter mudado nada e mesmo assim estar pendente,
porque a REGRA de censura é que mudou).
  - Se os dois baterem → o arquivo já está exatamente no estado auditado da
    última vez (seja porque nunca precisou de tarja, seja porque a tarja de
    uma execução anterior já foi aplicada e registrada, com as MESMAS
    regiões de hoje). NÃO tarja de novo.
  - Se o hash do ARQUIVO não bater (nome novo, ou conteúdo mudou) → é uma
    "geração" nova do arquivo.
  - Se o hash do arquivo bater mas o hash das REGIÕES não → a imagem é a
    mesma, mas a config de censura mudou (região nova, tirada ou alterada).
  - Em QUALQUER um dos dois casos acima → aplica `tarjar()` (se houver
    entrada em REGIOES) UMA vez sobre o estado ATUAL do arquivo, calcula o
    hash de como ele FICA ao final dessa execução, e são esses dois hashes
    (arquivo pós-tarja + regiões atuais) que entram no manifesto quando
    alguém rodar `--registrar-auditados` depois de olhar o print.

Ou seja: o hash gravado é sempre "o arquivo como ficou ao final da
execução" mais "a config de censura em vigor nessa execução", e a
idempotência não vem do algoritmo de blur (que não é idempotente por
natureza), vem de nunca reaplicar a tarja numa combinação (arquivo, regras)
que já foi processada e registrada exatamente daquele jeito. Testado
rodando o script duas vezes seguidas sem nada de novo: a 2ª vez não mexe em
nenhum PNG e sai com código 0.
───────────────────────────────────────────────────────────────────────

── TRAVA DE SEGURANÇA (REGIOES vazio) ─────────────────────────────────────
Duas perguntas que ANTES estavam fundidas num só `if`, e que o incidente 4
acima mostrou que precisam ser separadas:

  1. "Existe print NOVO, ALTERADO ou com REGRAS ALTERADAS desde o último
     `--registrar-auditados`?" → esta é a que TRAVA. Sai com código 1, lista
     os nomes pendentes, pede pra abrir e depois rodar
     `--registrar-auditados`. Vale SEMPRE — com `REGIOES` cheio ou vazio.
     `processar_pasta()` roda em toda execução, sem exceção; com `REGIOES`
     vazio ela só não chama `tarjar()` em ninguém (nada configurado pra
     borrar), mas continua comparando hash de arquivo e hash de regras
     contra o manifesto normalmente.
  2. "A lista de censura está vazia?" → isto é só um AVISO, nunca um
     bloqueio isolado. Se há pendência, o aviso vira o alerta alto de
     sempre (nenhuma tarja automática vai rodar nesta execução — cuidado
     redobrado ao abrir os pendentes). Se NÃO há pendência, o aviso é uma
     nota tranquila: "nada pendente, e o manifesto confirma que já foi
     auditado sem achar nada pra tarjar hoje".

`--registrar-auditados` sempre persiste o manifesto quando há pendência,
com `REGIOES` cheio ou vazio — continua sendo a afirmação "eu abri e olhei
cada um destes PNGs" (ver docstring da flag abaixo).

A flag `--sem-censura-confirmado` foi REMOVIDA: ela só existia pra contornar
o bloqueio duro de "REGIOES vazio", que não existe mais como bloqueio
isolado — quem bloqueia agora é sempre a pendência contra o manifesto, e
quem confirma "eu olhei" é sempre `--registrar-auditados`. Manter as duas
flags fazendo a mesma coisa por caminhos diferentes era exatamente o que
causou o incidente 4 (uma delas — e a outra também — engolia a pendência
sem registrar nada). Flag que não muda o resultado é pior que flag nenhuma.
───────────────────────────────────────────────────────────────────────

Uso:
  python3 scripts/censurar-prints.py
      Roda a auditoria — SEMPRE, com REGIOES cheio ou vazio. Se achar print
      NOVO, ALTERADO ou com REGRAS ALTERADAS (mesma imagem, região de
      REGIOES nova/tirada/mudada) desde a última vez que alguém rodou
      --registrar-auditados, lista os nomes com o motivo e sai com código 1
      (trava o pipeline). Se REGIOES tiver a região certa pro arquivo,
      tarja antes de calcular o hash final — inclusive quando só a REGRA
      mudou e a imagem já estava tarjada. Se REGIOES estiver vazio, pula só
      a etapa de tarjar (nada configurado pra borrar) e avisa isso — mas a
      checagem de pendência contra o manifesto roda do mesmo jeito.

  python3 scripts/censurar-prints.py --registrar-auditados
      GRAVA no manifesto (docs/guia-tecnico/prints-auditados.json) o hash
      atual de cada PNG da pasta E o hash das regiões de REGIOES aplicadas
      a ele — com REGIOES cheio ou vazio. Rodar esta flag É A AFIRMAÇÃO "eu
      abri cada um destes PNGs, olhei com meus próprios olhos, e ou não
      achei dado pessoal/de terceiro real/credencial funcionando, ou já
      tarjei o que achei em REGIOES antes de rodar". Quem rodar esta flag
      sem ter aberto e olhado as imagens está, na prática, assumindo a
      responsabilidade por qualquer CPF, telefone, endereço, foto de rosto,
      assinatura, dado bancário, extrato, saldo de conta, chave Pix,
      link/token de acesso funcionando ou nome de cliente/funcionário real
      que escapar pro guia PÚBLICO. Não é uma flag de "confia em mim" — é
      uma flag de "eu já conferi".
"""

import hashlib
import json
import os
import sys
from datetime import date

from PIL import Image, ImageFilter, ImageDraw

PASTA = "docs/guia-tecnico/img"
MANIFESTO_PATH = "docs/guia-tecnico/prints-auditados.json"

# ---------------------------------------------------------------------------
# REGIÕES — em FRAÇÃO da imagem (x0, y0, x1, y1), pra não depender da
# resolução do print.
#
# PROPOSITALMENTE VAZIO no porte: as coordenadas dependem de ONDE o dado
# aparece em CADA print, e isso só dá pra saber abrindo o PNG depois da
# captura de verdade (não dá pra advinhar coordenada sem olhar a imagem).
#
# Como preencher, depois de rodar capturar-prints-*.mjs / capturar-modais.mjs:
#   1. Abra cada PNG em docs/guia-tecnico/img/ e procure: nome de cliente,
#      CPF/CNPJ, telefone, endereço, foto de check-in, assinatura, conta
#      bancária/saldo/extrato.
#   2. Meça a região em fração da largura/altura da imagem (0.0 a 1.0),
#      não em pixel — o mesmo print pode ser recapturado em resolução
#      diferente e a fração continua válida.
#   3. Adicione uma entrada com o nome exato do arquivo (com .png).
#   4. Depois de rodar o script e conferir o resultado, rode com
#      --registrar-auditados pra gravar no manifesto que este print foi
#      auditado.
#
# Exemplo (preencher com o real depois de olhar o print):
#   "t3-clientes.png": [
#       (0.10, 0.30, 0.45, 0.34),   # coluna "Telefone" da grade de clientes
#   ],
#   "t13-financeiro-movimentacoes.png": [
#       (0.15, 0.20, 0.55, 0.25),   # nome/saldo da conta bancária no seletor
#   ],
# ---------------------------------------------------------------------------
#
# Preenchido em 05/09/2026 após a 1ª captura completa em produção (auditoria
# visual de TODOS os 26 PNGs, um por um). Coordenadas medidas com régua/grade
# sobreposta ao PNG real (ver processo no relatório da captura).
REGIOES = {
    # t1-configuracoes.png: DESTARJADO em 06/09/2026 — o box "Identidade
    # Visual" mostra o logo real da "Glacial Cold Brasil". O CEO liberou o
    # logo de cliente real usado no white-label da conta demo (junto com o
    # nome de pessoa física do achado abaixo). NÃO recriar sem reconfirmar.

    # t15-funcionarios.png: DESTARJADO em 06/09/2026 — a linha "Kaik Barreto"
    # tinha FOTO + nome de pessoa física real. O CEO liberou nome e foto
    # dessa pessoa especificamente para o guia. NÃO recriar sem reconfirmar.

    # t3-clientes.png: DESTARJADO em 06/09/2026 — o CEO confirmou que os
    # registros da conta demo ("Clínica Vida & Saúde", "Condomínio Jardim das
    # Flores", "João Pereira", "Maria Oliveira") são dado MOCK, não cliente
    # real. Tarja aqui era desnecessária e piorava a leitura do guia (borrão
    # onde deveria mostrar a tela preenchida de verdade). NÃO recriar esta
    # entrada sem reconfirmar com o CEO — a recaptura já saiu limpa.

    # ── Auditoria dos 84 prints novos (modais/situações) — 05/09/2026 ────────
    # Achados abaixo do mesmo padrão do lote de 26: nome de cliente real ou
    # funcionário real vazando em telas que a captura por script alcançou
    # incidentalmente (proposta de exemplo, listagem de contratos, ponto).

    # t9-configurar-proposta.png: DESTARJADO em 06/09/2026 — o preview
    # (Orçamentos → Configurar Proposta) usa a mesma "Glacial Cold Brasil" do
    # t1-configuracoes.png como cabeçalho do documento de exemplo. Mesmo
    # motivo do t1: logo de cliente real liberado pelo CEO. NÃO recriar sem
    # reconfirmar.

    # t15-ponto-hoje.png: DESTARJADO em 06/09/2026 — mesma pessoa do
    # t15-funcionarios.png ("Kaik Barreto") aparecia de novo na tabela de
    # ponto do dia (Funcionários → Controle de Ponto → Hoje). Nome liberado
    # junto com o achado do t15-funcionarios.png. NÃO recriar sem reconfirmar.

    # t11-responsaveis-tecnicos-lista.png: DESTARJADO em 06/09/2026 — único
    # responsável técnico cadastrado na conta demo (Contratos → Configurações
    # de Contrato → Responsáveis Técnicos) é "Kaik Barreto" (pessoa real).
    # Mesmo nome liberado pelo CEO. NÃO recriar sem reconfirmar.

    # t11-contrato-visao-geral.png, t11-portal-do-contrato.png,
    # t11-contrato-documentos.png, t11-contrato-nova-receita.png,
    # t11-contratos.png: DESTARJADOS em 06/09/2026 — o CEO confirmou que o
    # contrato usado nessas capturas ("PMOC - Clínica Vida & Saúde" e os
    # demais nomes de contrato/cliente da listagem) é de exemplo/mock, e que
    # o token do link do Portal do Contrato + QR Code também são de um
    # contrato de exemplo (não um cliente real com credencial funcionando).
    # Achado original (mantido aqui só como HISTÓRICO, não como regra ativa):
    # a caixa "Portal do Contrato" mostrava em texto puro a URL pública
    # (.../contrato/unidade/pmoc-<nome>-<token>) e o QR Code abaixo codificava
    # a mesma URL — o susto foi genuíno (link funcional saindo num guia
    # público), mas a base é a de demonstração. NÃO recriar estas entradas
    # sem reconfirmar com o CEO — a recaptura já saiu limpa e o print de
    # t11-portal-do-contrato agora mostra a URL + QR completos de propósito
    # (é exatamente o que o cliente recebe).

    # t7-os-modo-cliente.png: DESTARJADO em 06/09/2026 — o card preto
    # "Empresa" no topo do relatório (OS #001256 em modo cliente) usava a
    # mesma logo real da Glacial Cold Brasil. Mesmo motivo do t1/t9: logo de
    # cliente real liberado pelo CEO. O resto do conteúdo (cliente
    # "Supermercado Bom Preço Ltda", fotos, checklist, assinaturas) já era
    # mock confirmado. NÃO recriar sem reconfirmar.
}


def tarjar(caminho, regioes):
    im = Image.open(caminho).convert("RGB")
    L, A = im.size
    d = ImageDraw.Draw(im)
    for (x0, y0, x1, y1) in regioes:
        cx = (round(x0 * L), round(y0 * A), round(x1 * L), round(y1 * A))
        if cx[2] <= cx[0] or cx[3] <= cx[1]:
            continue
        pedaco = im.crop(cx)
        # pixeliza e depois borra: texto some de vez, forma geral continua
        peq = pedaco.resize((max(1, pedaco.width // 22), max(1, pedaco.height // 22)), Image.BILINEAR)
        pedaco = peq.resize(pedaco.size, Image.NEAREST).filter(ImageFilter.GaussianBlur(6))
        im.paste(pedaco, cx)
        d.rectangle(cx, outline=(150, 160, 170), width=2)
    im.save(caminho, "PNG", optimize=True)


def calcular_hash(caminho):
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        h.update(f.read())
    return h.hexdigest()


def calcular_hash_regioes(nome):
    """Hash da CONFIGURAÇÃO de censura (a lista de regiões de REGIOES) pra um
    arquivo — não do arquivo em si. Arquivo sem entrada em REGIOES tem hash
    da lista vazia, e isso conta: se alguém REMOVER a entrada inteira depois
    de já ter sido registrada, o hash muda (de "tinha região" pra "lista
    vazia") e o arquivo volta a ficar pendente de revisão — nem que seja só
    pra confirmar que a remoção foi intencional.
    """
    payload = json.dumps(REGIOES.get(nome, []), sort_keys=True).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def carregar_manifesto():
    if not os.path.exists(MANIFESTO_PATH):
        return {}
    with open(MANIFESTO_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def salvar_manifesto(manifesto):
    os.makedirs(os.path.dirname(MANIFESTO_PATH), exist_ok=True)
    with open(MANIFESTO_PATH, "w", encoding="utf-8") as f:
        json.dump(manifesto, f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")


def processar_pasta(manifesto):
    """Percorre docs/guia-tecnico/img/, tarja o que precisa e classifica cada
    PNG em auditado / novo / alterado / regras_alteradas. Retorna dict
    nome -> {status, hash, hash_regioes, tarjado_agora}.

    Um arquivo só é passado por `tarjar()` quando o hash do ARQUIVO ou o hash
    das REGIÕES (config de censura) não batem com o que está registrado no
    manifesto — ou seja, quando é uma geração nova do arquivo (nunca visto,
    recapturado/sobrescrito) OU quando a imagem é a mesma mas a REGRA de
    censura mudou (achado do incidente 3, ver topo do arquivo). Isso evita
    rodar a tarja (não-idempotente bit a bit) em cima de uma combinação
    (arquivo, regras) que uma execução anterior já processou e já teve
    registrada — ver comentário "ORDEM HASH × TARJA" no topo do arquivo.

    Manifesto "legado" (registrado antes deste hash de regras existir, sem a
    chave "hash_regioes") é tratado como NÃO batendo — fail-closed: força
    passar de novo pela tarja e por --registrar-auditados, em vez de confiar
    silenciosamente que a regra em vigor na época ainda é a de hoje.
    """
    resultados = {}
    arquivos = sorted(f for f in os.listdir(PASTA) if f.lower().endswith(".png"))

    for nome in arquivos:
        caminho = os.path.join(PASTA, nome)
        hash_atual = calcular_hash(caminho)
        hash_regioes_atual = calcular_hash_regioes(nome)
        registro_anterior = manifesto.get(nome)

        arquivo_bate = bool(registro_anterior) and registro_anterior.get("hash") == hash_atual
        regras_batem = bool(registro_anterior) and registro_anterior.get("hash_regioes") == hash_regioes_atual

        if arquivo_bate and regras_batem:
            # Já está exatamente como ficou da última vez que foi auditado
            # e registrado, com as MESMAS regras de censura — não mexe.
            resultados[nome] = {
                "status": "auditado",
                "hash": hash_atual,
                "hash_regioes": hash_regioes_atual,
                "tarjado_agora": False,
            }
            continue

        if registro_anterior is None:
            status = "novo"
        elif not arquivo_bate:
            status = "alterado"
        else:
            # Arquivo é o mesmo, só a config de REGIOES mudou.
            status = "regras_alteradas"

        # Reaplica a tarja com a config ATUAL (se houver), a partir do
        # estado atual do arquivo (cru se for novo/alterado, já tarjado com
        # a região antiga se for regras_alteradas — tarjar em cima é
        # inofensivo, ver aviso "não desfaz tarja" no topo do arquivo).
        tarjado_agora = False
        if nome in REGIOES:
            tarjar(caminho, REGIOES[nome])
            hash_atual = calcular_hash(caminho)
            tarjado_agora = True

        resultados[nome] = {
            "status": status,
            "hash": hash_atual,
            "hash_regioes": hash_regioes_atual,
            "tarjado_agora": tarjado_agora,
        }

    return resultados


def main():
    argv = sys.argv[1:]
    registrar_auditados = "--registrar-auditados" in argv

    if "--help" in argv or "-h" in argv:
        print(__doc__)
        return

    if not os.path.isdir(PASTA):
        print(f"⚠️  pasta {PASTA} não existe, nada a fazer")
        return

    # `processar_pasta()` roda SEMPRE, com REGIOES cheio ou vazio — é a
    # correção do incidente 4 (ver docstring do módulo). REGIOES vazio só
    # significa que nenhum arquivo tem entrada pra `tarjar()`; a checagem de
    # pendência contra o manifesto (novo/alterado/regras_alteradas) continua
    # rodando igual, senão print novo chegando com REGIOES vazio passaria
    # batido — exatamente o buraco que apareceu na prática.
    manifesto = carregar_manifesto()
    resultados = processar_pasta(manifesto)
    regioes_vazio = not REGIOES

    tarjados_agora = [n for n, r in resultados.items() if r.get("tarjado_agora")]
    for nome in sorted(tarjados_agora):
        print(f"🕶️  tarjado agora: {nome} ({len(REGIOES[nome])} região(ões))")

    pendentes = {n: r for n, r in resultados.items() if r["status"] != "auditado"}

    MARCAS = {
        "novo": "NOVO",
        "alterado": "ALTERADO",
        "regras_alteradas": "REGRAS ALTERADAS",
    }

    if pendentes:
        if regioes_vazio:
            # Aqui SIM é o alerta alto: tem pendência E nenhuma tarja
            # automática vai rodar nesta execução.
            print("=" * 78)
            print("🚨 REGIOES está vazio — nenhuma tarja automática vai rodar nesta")
            print("   execução. Se algum dos prints listados abaixo tiver CPF, CNPJ,")
            print("   telefone, endereço, foto de check-in, assinatura, dado bancário,")
            print("   extrato, saldo de conta ou chave Pix de gente real, ele vai pro")
            print("   guia PÚBLICO exposto do jeito que está.")
            print("=" * 78)

        print("=" * 78)
        print(f"🚨 {len(pendentes)} print(s) SEM auditoria humana registrada:")
        for nome, info in sorted(pendentes.items()):
            print(f"   - [{MARCAS[info['status']]}] {nome}")
        print()
        print("   O que fazer:")
        print("   1. Abra cada arquivo listado acima em docs/guia-tecnico/img/.")
        print("      Marcado como REGRAS ALTERADAS: a imagem não mudou, mas a")
        print("      região de REGIOES pra ela mudou desde o último registro —")
        print("      confira se a tarja nova saiu como esperado.")
        print("   2. Procure: nome de cliente/funcionário real, CPF/CNPJ, telefone,")
        print("      endereço, foto de check-in, assinatura, dado bancário/saldo,")
        print("      logo de cliente real, ou LINK/TOKEN de acesso funcionando")
        print("      (URL de portal público com credencial embutida, e o QR Code")
        print("      que porventura codifique a mesma URL — QR é legível por")
        print("      máquina, tarjar só o texto ao lado não resolve).")
        print("   3. Se achar algo, acrescente a região em REGIOES (fração da")
        print("      imagem) neste script e rode de novo — ele tarja sozinho.")
        print("      Se REGIOES estiver vazio e você não achar nada sensível, não")
        print("      precisa adicionar nada — só siga pro passo 4.")
        print("      Atenção: tirar uma região de REGIOES NÃO desfaz a tarja já")
        print("      aplicada nos pixels — pra isso só recapturando o print.")
        print("   4. Depois de olhar TODOS os arquivos listados (e tarjar o que")
        print("      precisar), rode:")
        print("        python3 scripts/censurar-prints.py --registrar-auditados")
        print("      Isso grava no manifesto que você OLHOU estes prints. Rodar")
        print("      essa flag sem ter aberto e olhado as imagens é assumir a")
        print("      responsabilidade por qualquer dado pessoal ou credencial que")
        print("      escapar pro guia público.")
        print("=" * 78)

        if not registrar_auditados:
            sys.exit(1)

        hoje = date.today().isoformat()
        for nome, info in pendentes.items():
            manifesto[nome] = {
                "hash": info["hash"],
                "hash_regioes": info["hash_regioes"],
                "auditado_em": hoje,
            }
        salvar_manifesto(manifesto)
        print(f"\n📝 Manifesto atualizado: {len(pendentes)} print(s) registrado(s) como auditado(s) em {hoje}.")
        print(f"   Total no manifesto: {len(manifesto)} print(s). Arquivo: {MANIFESTO_PATH}")
        return

    # Sem pendência: manifesto bate 100% com o estado atual da pasta.
    if regioes_vazio:
        print(
            f"✅ REGIOES está vazio, mas não há pendência: os {len(resultados)} print(s) "
            "da pasta já foram auditados e o manifesto confirma que nenhum precisa de "
            "tarja hoje."
        )
    else:
        print(f"\n✅ {len(resultados)} print(s) auditado(s) e sem pendência (manifesto bate 100%).")

    if registrar_auditados:
        # Nada pendente, mas alguém pediu pra registrar mesmo assim — ok,
        # não muda nada (idempotente: já está tudo com hash igual).
        print("   (--registrar-auditados não teve o que gravar — nada pendente.)")


if __name__ == "__main__":
    main()
