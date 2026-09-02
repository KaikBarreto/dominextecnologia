---
name: dominex-claude-memory
description: Use quando precisar consultar memoria, agentes ou governanca Claude do Dominex sem carregar tudo nem copiar segredo.
---

# Dominex Claude Memory

- Consulte `CLAUDE.md` primeiro para mapa e regras duraveis.
- Antes de ler arquivos grandes em `.claude/agents/**` ou `docs/team/**`, busque por termos do dominio/tarefa.
- Trate memoria Claude como apoio operacional, nao verdade absoluta; confirme no codigo atual antes de implementar.
- Diferencie:
  - memoria confirmada: existe no arquivo e se aplica ao repo atual;
  - hipotese: inferencia sem evidencia suficiente;
  - legado: regra de outro projeto que nao aparece no Dominex.
- Nunca copie segredos, tokens, dados de cliente, dumps, `.env` ou certificados para respostas, skills ou docs versionados.
- Promova para `AGENTS.md` ou skills apenas regras duraveis com evidencia e uso futuro claro.
- Se a memoria Claude estiver ausente no workspace, registre a lacuna e siga pelo codigo real do repo.
