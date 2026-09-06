# Scripts utilitários da Dominex

Scripts one-off ou recorrentes que ajudam tarefas fora do app (build, geração de artefato, manutenção).

## `copy-shell.mjs` / `ssg.mjs` / `gen-i18n-artifacts.mjs`

Fazem parte do build (`npm run build`). Não mexer sem entender o pipeline de build inteiro.

## `trilha-para-capitulos.mjs`

Converte `docs/domiflix/trilha-de-tutoriais.md` (fonte única de verdade da trilha de tutoriais) em `docs/guia-tecnico/grade/capitulos.json`, consumido pelo montador do Guia Técnico.

## Guia Técnico (PDF + página pública + Central de Ajuda) — pipeline de CAPTURA

Scripts que capturam prints reais do sistema pra montar o **Guia Técnico da Dominex**: manual completo do produto, uma seção por tutorial da trilha do Domiflix (`docs/domiflix/trilha-de-tutoriais.md`, T0..T17), com telas reais capturadas por Playwright numa conta demo.

> Esta seção documenta só o pipeline de **captura de print**. O pipeline de **montagem** (PDF, página pública, chunks pro Cato) é objeto de outra frente de trabalho e ainda não existe neste repositório.

### Ordem de execução

```bash
# 0) gerar a sessão da conta demo (uma vez; renova sozinho durante a captura)
set -a; source .env; set +a
DOMINEX_DEMO_PASSWORD='...' node scripts/gerar-sessao-guia.mjs

# 1) telas normais (paralelo, N contextos)
node scripts/capturar-prints-guia.mjs

# 2) telas com token público ou que exigem 1 interação
node scripts/capturar-prints-extras.mjs

# 3) prints de modal/situação (specs em docs/guia-tecnico/prints/<Tx>.json)
node scripts/capturar-modais.mjs

# 4) tarja dado pessoal (OBRIGATÓRIO antes de publicar).
#    Com REGIOES vazio o script FALHA de propósito (ver seção abaixo) — não
#    encadeie com --sem-censura-confirmado sem ter auditado os PNGs primeiro.
python3 scripts/censurar-prints.py

# 5) PNG 2x -> JPEG pra web e pra PDF
python3 scripts/otimizar-prints.py
```

### Onde ficam as coisas

| O quê | Onde |
|---|---|
| Grade da trilha (índice e capítulos) | `docs/guia-tecnico/grade/capitulos.json` (gerado por `trilha-para-capitulos.mjs`) |
| Specs de print de modal/situação | `docs/guia-tecnico/prints/<Tx>.json` |
| Prints originais / otimizados | `docs/guia-tecnico/img/`, `img-otim/` (web) e `img-pdf/` (PDF) |
| Marca (logos usados no guia) | `docs/guia-tecnico/marca/` |

`docs/guia-tecnico/img*/` guarda captura de tela de PRODUÇÃO (mesmo que da conta demo) — está no `.gitignore` do repositório (regeráveis a qualquer momento rodando este pipeline de novo; não precisam de histórico de git).

### Autenticação da captura

Os scripts de print usam um arquivo de sessão local (sessão da conta DEMO `demo@dominex.app`, projeto Supabase `byqldosixshhuiuarszp`) definido em `SESSION_FILE` (`scripts/lib/sessao-guia.mjs`) — **não é `/tmp/session.json`** de propósito (ver "Achado real na Onda 3" abaixo). Pra gerar:

```bash
set -a; source .env; set +a   # VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY já existem aqui
DOMINEX_DEMO_PASSWORD='...' node scripts/gerar-sessao-guia.mjs
```

A senha da conta demo **nunca fica hardcoded** em script versionado — vem de `DOMINEX_DEMO_PASSWORD` (e opcionalmente `DOMINEX_DEMO_EMAIL`, default `demo@dominex.app`).

O token vale 3600s (1h). Captura longa (muitas telas, vários contextos em paralelo) pode passar disso: `scripts/lib/sessao-guia.mjs` renova sozinho pelo `refresh_token` antes de cada captura, sem precisar da senha de novo, e reescreve o arquivo de sessão.

**Achado real na Onda 3 (05/09/2026):** o EcoSistema usa a mesma convenção `/tmp/session.json` no pipeline irmão dele. `/tmp` é da MÁQUINA, não do workspace — rodando os dois pipelines em paralelo, quem escrever por último vence, e o outro passa a autenticar como a conta ERRADA sem aviso (aconteceu de verdade: a captura da Dominex virou a sessão de teste do EcoSistema no meio de uma leva, com o app carregando em inglês e travado, 401/403 em tudo). Por isso o arquivo de sessão daqui tem nome específico do projeto (`/tmp/dominex-guia-tecnico-session.json`) — nunca renomear de volta pra `/tmp/session.json`.

### Regra de ouro da captura

A conta demo roda **em produção**. Os scripts só abrem tela e modal: **nunca** clicam em Salvar, Criar, Finalizar, Concluir, Confirmar, Excluir, Remover, Emitir, Cancelar nota, Pagar, Receber, Baixar, Enviar, Compartilhar, Agendar, Atribuir, Iniciar OS, Check-in, Assinar, Aprovar ou Convidar.

Isso é ainda mais sensível na Dominex do que em outros sistemas: existe Ordem de Serviço, agendamento e **notificação push pro celular do técnico** — um clique errado avisa uma pessoa de verdade. Ao escrever spec novo em `docs/guia-tecnico/prints/`, mantenha essa regra.

### `censurar-prints.py` falha alto de propósito quando não há nada a tarjar

Esse script roda **entre** a captura e a otimização. Se `REGIOES` estiver vazio e ele passasse quieto, o pipeline seguiria pra frente e a página pública sairia com CPF, telefone, assinatura ou foto de gente real sem tarja — foi o que aconteceu no EcoSistema (extrato bancário real com nome completo de quatro pessoas físicas, num guia público).

Por isso: `REGIOES = {}` faz o script imprimir um aviso grande e **sair com código 1**, travando qualquer pipeline encadeado com `&&`. Só passa quieto (código 0) com a flag `--sem-censura-confirmado`, que existe pra forçar quem for rodar tudo de uma vez a **primeiro abrir os PNGs e auditar visualmente**, e só então confirmar por escrito que não achou nada a tarjar:

```bash
python3 scripts/censurar-prints.py --sem-censura-confirmado
```

Preencher `REGIOES` com uma região real (ver instruções no topo do script) também zera a trava — nesse caso a flag não é necessária.

### Pendências conhecidas deste porte (05/09/2026)

- **Bug real corrigido em produção (1ª captura completa, 05/09/2026):** `limpar()` apertava Escape mesmo DEPOIS de uma `acao`/`passos` abrir um modal de propósito, fechando o próprio modal antes do print (achado ao auditar `t2-novo-usuario.png`, que saiu sem o diálogo). Corrigido em `capturar-prints-extras.mjs` e `capturar-modais.mjs`: `limpar()` agora só esconde CSS; o Escape mora em `fecharModalResidual()`, chamado só ANTES de qualquer ação. Recapturado e confirmado visualmente.
- **`t13-financeiro-contas.png` não mostra Contas a Pagar/Receber:** a empresa demo não tem o módulo `finance_advanced` contratado, e `Finance.tsx:95-98` redireciona sozinho pra `/financeiro/relatorio` quando isso acontece (comportamento correto e documentado — ver trilha T13: "Sem o módulo, a URL direta redireciona"). Não é bug de script. Pra ter o print real, é preciso habilitar `finance_advanced` na empresa demo e recapturar só esse item: `node scripts/capturar-prints-guia.mjs --only=t13-financeiro-contas`.
- `capturar-prints-extras.mjs` tem 5 telas públicas com token (Portal do Cliente, OS compartilhada, Ponto público, Orçamento público, Portal do Contrato/PMOC) que dependem de um id/token **real da empresa demo** — a conta é nova e nenhum desses ainda foi gerado nela. Preencher via env (`GUIA_TOKEN_PORTAL_CLIENTE`, `GUIA_ID_OS_PUBLICA`, `GUIA_SLUG_PONTO`, `GUIA_TOKEN_ORCAMENTO`, `GUIA_TOKEN_CONTRATO_UNIDADE`) depois de abrir o sistema logado e copiar o link real de cada tela.
- `censurar-prints.py` está com `REGIOES = {}` de propósito — as coordenadas só dá pra saber depois de olhar os PNGs capturados de verdade (ver comentário no topo do script).
- Detalhe dinâmico não entra em `capturar-prints-guia.mjs` (precisa de um id real) — fica pra um spec de `capturar-modais.mjs` com um passo `{ "clicar": "..." }` que abre o primeiro registro da lista. Lista nomeada pra não sumir da vista (registro em `appRouteSlugs.ts`):
  - `/clientes/:id`, `/equipamentos/:id`, `/contratos/:id`, `/os-tecnico/:id` (execução de OS)
  - **`/checklists/:id` (`checklistDetail`) — rota VIVA**, não confundir com a lista `/checklists` que redireciona pra `/servicos`. É conteúdo central do T4 e ainda não tem spec — abrir a partir de `/servicos` (aba Checklists) clicando num item da lista.
- Abas que não têm o estado na URL (Equipes dentro de Funcionários, Histórico dentro do Mapa, abas de Estoque) também ficam pra specs de `capturar-modais.mjs` com passo de clique — não entraram na lista estática de `capturar-prints-guia.mjs`.

### Manter o guia vivo depois de um release

```bash
node scripts/guia-impacto.mjs v1.22.5..HEAD
```

Cruza os arquivos que o release tocou com as rotas que cada seção documenta e com as rotas dos prints declarados, e responde: quais seções revisar, quais prints refazer e os comandos exatos pra atualizar só isso. É análise estática de diff, não custa nada e não lê o guia.

Se a saída for "nada foi afetado", acabou. Detalhe importante: a ferramenta detecta que a **área** foi mexida, não *o que* mudou nela. Se o release alterou regra de negócio (validação nova, campo obrigatório, mensagem de erro diferente), o texto da seção precisa ser reescrito, não só o print.
