---
name: dominex-quality
description: Use em implementacao, revisao, debug ou release no Dominex para manter escopo minimo, seguranca, testes e handoff final consistentes.
---

# Dominex Quality

Siga este checklist antes de editar e antes de entregar:

1. Contexto: leia `AGENTS.md` antes de implementar/revisar quando a tarefa envolver o repo Dominex.
2. Git safety: rode `git status --short --untracked-files=all`; nao use `git stash`, `git add -A`, `git add .`, `git reset --hard` ou checkout amplo; nao reverta nem sobrescreva mudancas de outro agente.
3. Escopo minimo: identifique o dominio, toque so nos arquivos necessarios e preserve padroes existentes.
4. Seguranca: para auth, billing, fiscal, RLS, edge functions, dados pessoais ou multi-tenant, trate como alto risco.
5. Banco/API: mudanca de schema exige migration; edge function privilegiada valida `Authorization` e role/permissao.
6. UI: copy em PT-BR; estados de loading/erro/vazio; responsivo; sem componente chamando Supabase direto quando ja houver hook.
7. Testes: rode teste focado quando existir; amplie para `npm run test`, `npm run lint` ou `npm run build` conforme risco.
8. Build: se mexeu em rotas, SSG, Vite, i18n ou integracao ampla, preferir `npm run build`.
9. Handoff final: informe arquivos alterados, verificacao rodada, riscos restantes e se ha migration/deploy/commit pendente.
