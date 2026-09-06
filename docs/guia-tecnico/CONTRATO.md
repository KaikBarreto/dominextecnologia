# Contrato de escrita — Guia Técnico da Dominex (PDF + web + IA)

## Para que serve

Este texto vira **quatro artefatos** ao mesmo tempo, do mesmo texto-fonte:

1. **PDF A4** diagramado (manual completo, capa por seção).
2. **Página web pública** em `/guia-tecnico` (com busca e ampliação de print).
3. **Markdown + chunks** que uma IA consulta (base de conhecimento do suporte / RAG).
4. **Central de Ajuda** dentro do app.

Isso muda tudo na forma de escrever:

- O leitor final é o **dono de uma empresa de serviço técnico em campo**: refrigeração e
  climatização, elétrica, energia solar, CFTV, dedetização, elevadores, assistência técnica.
  Sem jargão de programador. Ele não sabe o que é "RLS", "RPC" ou "tabela" — sabe o que é
  ordem de serviço, técnico, cliente, contrato, PMOC.
- Texto tem que ser **auto-contido**: nada de "como visto acima", "veja o vídeo", "conforme
  explicado". Cada trecho precisa fazer sentido isolado, porque o RAG vai recortar pedaços.
- **Nomes exatos de tela, botão, campo, aba e mensagem de erro** — é assim que o agente de IA
  casa a pergunta do cliente com a resposta.
- **Nunca inventar.** Se não achou no código, não escreve. Se ficou em dúvida, marca
  `<!-- INCERTO: ... -->` no HTML.

## Vocabulário (não trocar)

- **Cliente** é quem contrata o serviço (tem ficha de cadastro, CPF/CNPJ, endereço de
  atendimento). **Técnico** é quem executa em campo. Nunca inverter.
- **Ordem de Serviço (OS)**: o trabalho a ser feito, agendado e executado.
- **Tarefa**: o tipo de serviço dentro de uma OS (com checklist associado).
- **Checklist**: o roteiro de itens que o técnico confere/preenche numa tarefa.
- **Contrato** e **PMOC**: o vínculo recorrente com o cliente e o Plano de Manutenção,
  Operação e Controle (obrigatório por lei pra climatização acima de determinada capacidade).
- **Unidade** / **Equipamento**: o que está instalado no endereço do cliente e recebe serviço.
- **Orçamento** e **Proposta**: a cotação enviada ao cliente antes de virar contrato ou OS avulsa.

## Fonte da verdade

1. **O código deste repositório** (`src/`, `supabase/`) — é a fonte da verdade sobre o que o
   sistema faz hoje. Em caso de dúvida entre o que a tela parece fazer e o que o código faz,
   vale o código.
2. **`docs/domiflix/trilha-de-tutoriais.md`** — a grade oficial: título, duração, pré-requisito
   e capítulos de cada um dos 18 tutoriais (T0 a T17), validada contra a versão do sistema em
   vigor. Os marcadores da trilha valem também aqui:
   - ⚠️ ponto sensível — vira `<div class="aviso">` ou `<div class="perigo">` no guia.
   - 🔒 depende de módulo pago — vira `<b>Depende do módulo X</b>` no bloco `.meta` ou no texto.
   - 🚫 não prometer — vira conteúdo explícito de "o que NÃO dá pra fazer" na seção, nunca é
     silenciosamente omitido (ver "O que NÃO existe" abaixo).
3. **`src/lib/i18n/appRouteSlugs.ts`** — registro canônico das rotas do app logado. É daqui que
   sai o path exato a citar no bloco `.meta` (`<b>Rotas:</b> <code>/...</code>`), nunca de
   memória ou suposição.

Regra: **a trilha define o índice** (título, ordem, capítulos), **o código define o conteúdo**.

## Onde escrever

Um arquivo por tutorial: `docs/guia-tecnico/secoes/<Tx>.html`, de **T0 a T17**
(ex.: `docs/guia-tecnico/secoes/T7.html`).

**Fragmento HTML puro** — sem `<html>`, `<head>`, `<body>`, sem `<style>`, sem CSS inline. O
montador (`scripts/montar-guia-suporte.mjs` / `scripts/montar-guia-web.mjs`) aplica o estilo.

## Estrutura obrigatória do fragmento

```html
<section class="tutorial" id="t7">
  <h1><span class="tcode">T7</span> O técnico em campo + Área do Técnico™</h1>

  <p class="lead">Uma frase explicando o que essa área do sistema resolve na vida do cliente.</p>

  <div class="meta">
    <span><b>Onde fica:</b> Menu → Área do Técnico™ (o técnico acessa pelo celular, sem passar pelo menu do gestor)</span>
    <span><b>Rotas:</b> <code>/tecnico</code>, <code>/tecnico/os/:id</code></span>
    <span><b>Depende de:</b> T5 (Ordens de Serviço), T6 (Agenda e Equipes)</span>
    <span><b>Quem enxerga:</b> Técnico, Admin, Gestor</span>
  </div>

  <!-- 1 bloco <h2> por CAPÍTULO da grade (docs/domiflix/trilha-de-tutoriais.md),
       na mesma ordem e com o mesmo nome -->
  <h2>1. Abrir a Área do Técnico™</h2>
  <p>...</p>

  <h3>Passo a passo</h3>
  <ol>
    <li>...</li>
  </ol>

  <h3>Regras que o sistema aplica</h3>
  <ul>
    <li>...</li>
  </ul>

  <figure>
    <img src="img/t7-checklist-campo.png" alt="Checklist da OS aberto na Área do Técnico, com campos de preenchimento em branco">
    <figcaption>Área do Técnico™ — checklist da OS, sem dado real preenchido.</figcaption>
  </figure>

  <!-- ... demais capítulos ... -->

  <!-- OBRIGATÓRIO no fim de todo tutorial -->
  <h2 class="suporte">Suporte: problemas comuns</h2>
  <table class="faq">
    <thead><tr><th>O cliente diz</th><th>Causa provável</th><th>O que responder / fazer</th></tr></thead>
    <tbody>
      <tr>
        <td>"O técnico não recebeu a notificação da OS"</td>
        <td>Push desativado no celular do técnico ou app fora do ar em segundo plano</td>
        <td>Peça pro técnico conferir a permissão de notificação do navegador/app e abrir a Área do Técnico™ manualmente pra ver a OS atribuída.</td>
      </tr>
    </tbody>
  </table>

  <h2 class="suporte">Perguntas frequentes</h2>
  <dl class="qa">
    <dt>Pergunta exatamente como o cliente faria no suporte?</dt>
    <dd>Resposta curta, direta, em linguagem de dono de empresa de serviço técnico.</dd>
  </dl>

  <div class="glossario">
    <b>Palavras que o cliente usa pra isso:</b> app do técnico, tela do celular, checklist de campo, ordem no celular
  </div>
</section>
```

## Classes de destaque disponíveis

- `<div class="aviso">` — atenção / cuidado (amarelo). Use nos pontos marcados ⚠️ na trilha.
- `<div class="perigo">` — irreversível / risco (vermelho).
- `<div class="dica">` — atalho / truque (verde).
- `<div class="regra">` — regra de negócio dura do sistema (cinza).
- `<table class="dados">` — tabela genérica de campos/valores.
- `<span class="ui">Finalizar</span>` — nome literal de botão/campo na interface.

## Imagens

Use **apenas** ids que existam em `docs/guia-tecnico/img/`. Rode `ls docs/guia-tecnico/img/`
antes de citar um print.
Caminho sempre relativo: `src="img/<id>.png"`.
Se a imagem que você queria não existir, **não invente o arquivo**: escreva
`<!-- PRINT FALTANDO: descrição do que precisa ser printado -->`.

## Profundidade esperada

- **2.000 a 4.000 palavras por tutorial.** É o manual completo: exaustivo, não resumo.
- Cobrir **todos os campos** dos formulários principais (nome do campo, obrigatório ou não, o
  que aceita, o que o sistema faz com ele).
- Cobrir **todas as mensagens de erro** que a tela pode mostrar, copiando o texto literal do
  código (`toast`, `throw`, validações).
- Cobrir **permissões**: quem vê a tela, o que cada papel pode/não pode (o editor de
  permissões da v1.22.5 é tela por tela, ação por ação — cite as ações reais, não genéricas).
- Cobrir **o que NÃO dá pra fazer** — limitação é a dúvida nº1 do suporte.

## O que NÃO existe (não inventar, e não omitir)

`docs/domiflix/trilha-de-tutoriais.md` tem, no fim, três listas de coisas fora do ar hoje.
**Toda seção que tocar num desses itens precisa citar explicitamente que aquilo não existe ou
está desligado** — nunca deixar o cliente achar sozinho, isso é a dúvida nº1 do suporte:

1. **Telas mortas que redirecionam** (ex.: `/equipes`, `/checklists`, `/pmoc` redirecionam pra
   outro lugar — grave/escreva pelo destino real, nunca pela URL antiga).
2. **Funcionalidades desligadas hoje** (ex.: conectar WhatsApp por QR Code mostra "Em breve";
   o banner de instalar como app não está ativo). Escreva a frase de aviso, não o passo a passo
   de uma coisa que não roda.
3. **Coisas que parecem existir e não existem** (ex.: não existe conversão automática de
   Orçamento em Contrato; não existe baixa automática de estoque ao concluir OS; não existe
   fila de sincronização offline de verdade; não existe "Gerar Folha"; não existe assinatura
   eletrônica de proposta/contrato; não existe login social ou senha pro cliente no Portal).
   Cada seção relevante deve ter uma frase clara tipo: `<div class="regra">O sistema NÃO faz
   X. Se você precisa disso, o caminho hoje é Y.</div>`.

Antes de escrever qualquer seção, releia a lista completa em
`docs/domiflix/trilha-de-tutoriais.md` (seção "❌ O que ficou de fora da trilha") — ela é maior
do que os exemplos acima.

## Regras de escrita

- Português do Brasil, tom de colega explicando, **sem travessão** (usar vírgula ou
  ponto-e-vírgula; hífen de palavra composta é ok).
- Nada de "clique aqui", "veja acima", "no vídeo".
- Valores em reais no formato `R$ 1.234,56`.
- "Cliente" é quem contrata o serviço. "Técnico" é quem executa. Nunca trocar.
- Não citar detalhe de implementação (nome de tabela, RPC, edge function) no texto corrido.
  Isso só entra se ajudar o suporte a explicar um comportamento, e aí em linguagem de negócio.

---

# A regra de ouro da captura de tela

**A conta demo usada pra printar roda EM PRODUÇÃO.** Diferente de um ERP comum, a Dominex tem
ordem de serviço, agendamento e **notificação push pro celular do técnico**. Um clique errado
não é só "sujar um cadastro de teste": pode **notificar gente de verdade** (técnico recebendo
push de uma OS que não existe, cliente recebendo mensagem, nota fiscal saindo pro governo).

## Botões PROIBIDOS na captura (lista nominal, não é exaustiva por analogia)

Nunca clicar em, mesmo "só pra ver o modal depois fechar sem salvar":

**Salvar, Criar, Finalizar, Concluir, Confirmar, Excluir, Remover, Emitir, Cancelar nota,
Pagar, Receber, Baixar, Enviar, Compartilhar, Agendar, Atribuir, Iniciar OS, Check-in, Assinar,
Aprovar, Convidar.**

Se o print que você precisa só existe DEPOIS de um desses botões (ex.: "tela de OS concluída"),
**não simule clicando** — escreva `<!-- PRINT FALTANDO: descrição do que precisa ser printado,
e por que exige uma ação proibida -->` e reporte. Alguém com uma OS de teste isolada (não a
conta demo pública) resolve depois.

## Dado pessoal a censurar em TODO print

Antes de salvar qualquer captura, confira que não aparece:

- Ficha do cliente: **CPF/CNPJ**, **telefone**.
- **Endereço de atendimento** (rua, número, bairro do cliente).
- **Telefone do técnico**.
- **Foto de check-in** (rosto/local real de visita).
- **Assinatura digital** (do cliente ou do técnico).
- **Extrato e conta bancária** no Financeiro (saldo real, dados bancários).

Se o dado sensível é o próprio assunto do print (ex.: "aqui aparece o CPF do cliente na
ficha"), use um cliente de teste com dado plausível e visivelmente fictício, nunca um cliente
real da base demo.

---

# Segunda onda: prints de modal e de situação

O guia não pode ter só print de tela cheia. **Todo assunto explicado precisa de apoio visual**:
modal aberto, diálogo de confirmação, aba específica, estado de erro, painel lateral, menu
suspenso.

## Como pedir um print

Crie `docs/guia-tecnico/prints/<Tx>.json`:

```json
{
  "secao": "T7",
  "prints": [
    {
      "id": "t7-checklist-campo",
      "url": "/tecnico",
      "legenda": "Checklist de uma OS aberta na Área do Técnico™, com os campos de preenchimento em branco.",
      "passos": [
        { "esperar": 2500 },
        { "clicar": "Ver checklist" },
        { "esperar": 1500 }
      ],
      "recorte": "dialog"
    }
  ]
}
```

Passos: `ir`, `clicar`, `clicarSeletor` (+`forcar`), `campo`+`valor`, `preencher`+`valor`,
`digitar`, `tecla`, `esperar`, `esperarTexto`, `rolarAte`. Qualquer passo aceita
`"opcional": true` (se falhar, segue).

Recortes: `"dialog"` (modal), `"main"`, `"pagina"` (+`"full": true` pra página inteira) ou
`{ "seletor": "css" }` pra recortar um bloco específico.

## Rodar

```bash
node scripts/capturar-modais.mjs T7
```

Saída em `docs/guia-tecnico/img/<id>.png`. Itere até parar de falhar.

## Regras invioláveis da captura

A conta é a **empresa de TESTE em produção**. A captura navega no sistema de verdade — releia
"A regra de ouro da captura" no topo deste documento antes de escrever o primeiro `prints/*.json`.

- Nunca clicar em nenhum dos botões da lista proibida acima.
- Abrir o modal, printar, e pronto. Não persistir nada.
- Não mexer em Configurações (não salvar preferência nenhuma).
- Se o print exigir salvar algo, **não faça**: escreva `<!-- PRINT FALTANDO: ... -->` explicando.

## Onde colocar no texto

Uma `<figure>` logo depois do parágrafo que ela ilustra, dentro do capítulo certo:

```html
<figure>
  <img src="img/t7-checklist-campo.png" alt="Checklist de uma OS aberta na Área do Técnico™, com os campos de preenchimento em branco">
  <figcaption>Área do Técnico™: checklist da OS, campos em branco antes do preenchimento.</figcaption>
</figure>
```

O `alt` é lido pelo agente de IA, então descreva o que está na imagem, não "print da tela".

---

# Pendência conhecida antes da primeira montagem

`scripts/montar-guia-suporte.mjs`, `scripts/finalizar-guia.py`, `scripts/guia-para-markdown.py`
e `scripts/gerar-chunks-guia.py` leem `docs/guia-tecnico/grade/capitulos.json` — um JSON com
título, resumo, duração, pré-requisito e capítulos de cada seção (T0..T17). Esse arquivo ainda
não existe neste repositório: precisa ser derivado de `docs/domiflix/trilha-de-tutoriais.md`
antes de rodar a montagem pela primeira vez. Não é responsabilidade deste dev de Landing &
Growth decidir quem gera esse arquivo — reportar ao Tech Lead antes de escrever a primeira
seção pra não travar o pipeline no fim.
