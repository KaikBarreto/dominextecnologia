

## Plan: Módulo Contratos (ex-PMOC) — Implementado ✅

### Implementado

1. **Banco de dados**: Tabelas `contracts`, `contract_items`, `contract_occurrences` criadas com RLS por `company_id`. Colunas `contract_id` e `origin` adicionadas a `service_orders`.

2. **Hooks**: `useContracts.ts` (CRUD, stats, geração de OSs em batch) e `useContractDetail.ts` (detalhe, ocorrências, progresso).

3. **ContractFormDialog**: Sheet lateral com stepper de 4 etapas (Informações → Frequência → Itens → Revisão). Atalhos rápidos de frequência, prévia de datas, aviso de fins de semana, itens manuais.

4. **Páginas**: `/contratos` (listagem com KPIs, filtros, tabela) e `/contratos/:id` (detalhe 2 colunas com progresso e ocorrências).

5. **Navegação**: PMOC → Contratos em sidebar, topbar, mobile menu. Rota `/pmoc` redireciona para `/contratos`. Permissão `screen:contracts`.

### Tabelas PMOC antigas mantidas (sem perda de dados)
