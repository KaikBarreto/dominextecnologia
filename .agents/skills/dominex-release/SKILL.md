---
name: dominex-release
description: Use para fechar entregas no Dominex: revisar status/diff, separar arquivos de sessoes paralelas, rodar verificacao proporcional, decidir bump/changelog, preparar commit com pathspec explicito, pushar quando o CEO autorizar e registrar handoff final.
---

# Dominex Release

Siga este ritual:

1. Situar: rode `git status --short --untracked-files=all`, `git diff --stat` e `git log --oneline -5`.
2. Separar escopo: incluir so arquivos desta entrega; nunca usar `git add -A`, `git add .` ou `git commit -a`.
3. Verificar: rodar `npx tsc -p tsconfig.app.json` quando houver codigo TS/TSX; para config/docs, usar `git diff --check` e validacao estrutural relevante.
4. Classificar:
   - site publico, docs, agentes, skills, configuracao interna ou processo do time: sem bump e sem changelog de cliente;
   - mudanca que cliente logado ve, sente ou usa: acionar Release Manager para bump e changelog;
   - migration/edge function: confirmar deploy/aplicacao antes do push quando necessario.
5. Changelog: escrever so beneficio visivel ao cliente, em PT-BR leigo, sem tabela, hook, edge function, path interno, tenant ou jargao tecnico.
6. Commit: usar mensagem no padrao recente, com pathspec explicito.
7. Push: so depois de autorizacao explicita do CEO ou quando o CEO ja pediu diretamente `commit e push`.
8. Pos-push: informar commit, branch, push, verificacoes e qualquer pendencia real.

Para entregas internas de Codex/Claude/Conductor, usar `chore(codex): ...` ou `chore(conductor): ...` e nao mexer em `src/config/version.ts` nem `src/pages/Changelog.tsx`.
