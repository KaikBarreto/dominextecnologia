

# Plano: Blindagem de Erros do Sistema

## Contexto

Analisei todo o codebase e identifiquei diversas categorias de erros que podem ocorrer mas **ainda nao sao tratados** adequadamente. Atualmente, apenas 5 hooks usam o `getErrorMessage()` centralizado; os outros ~20 hooks mostram `error.message` cru (em ingles tecnico do Postgres) direto para o usuario.

## Problemas Identificados

### 1. Mensagens de erro cruas exibidas ao usuario
A maioria dos hooks (useLeads, useContracts, usePmocPlans, useFormTemplates, useFinancial, useCostResources, useCustomers, etc.) exibem `error.message` diretamente, sem passar pelo `getErrorMessage()`. Isso mostra mensagens tecnicas em ingles como "violates foreign key constraint" ou "row-level security".

### 2. Erros de FK nao mapeados no `errorMessages.ts`
O mapa de erros atual cobre apenas ~9 cenarios. Faltam mapeamentos para:
- **Excluir cliente com OS vinculadas** (`customers` referenciado por `service_orders`, `contracts`, `equipment`, `leads`, `quotes`)
- **Excluir equipamento com OS vinculadas** (`equipment` referenciado por `service_orders`, `service_order_equipment`, `pmoc_items`)
- **Excluir funcionario vinculado** (`employees` referenciado por `time_records`)
- **Excluir contrato com ocorrencias** (`contracts` referenciado por `contract_occurrences`, `service_orders`)
- **Excluir questionario com respostas** (`form_templates` referenciado por `form_responses`, `service_order_equipment`)
- **Excluir item de estoque vinculado** (`inventory` referenciado por `inventory_movements`, `service_materials`, `quote_items`)
- **Excluir categoria financeira/equipamento em uso**
- **Excluir equipe vinculada a OS** (`teams` referenciado por `service_orders`)
- **Excluir estagio CRM com leads** (`crm_stages` referenciado por `leads`)

### 3. Erros de rede/timeout nao tratados
Nenhum hook trata erros de rede (offline, timeout, 5xx). O usuario ve mensagens genericas ou nada.

### 4. Hooks sem `normalizeOptionalForeignKeys`
Alguns hooks que fazem inserts com campos UUID opcionais ainda nao usam a sanitizacao:
- `useContracts.ts` (no insert de `service_orders` dentro da criacao de contrato, linhas 189-206)
- `useCustomerContacts.ts`, `useEquipment.ts`, `useInventory.ts`

### 5. Erros de permissao (RLS) genericos
A mensagem "Voce nao tem permissao" e unica para todos os casos de RLS. Poderia ser mais especifica.

## Plano de Implementacao

### Etapa 1 — Expandir `errorMessages.ts` com todos os erros comuns
Adicionar ~15 novos mapeamentos de FK para cobrir exclusoes de clientes, equipamentos, funcionarios, contratos, categorias, equipes, estagios CRM, itens de estoque e questionarios. Tambem adicionar mapeamentos para erros de rede/timeout e erros `not null violation`.

### Etapa 2 — Migrar todos os hooks para usar `getErrorMessage()`
Substituir `error.message` por `getErrorMessage(error)` em todos os `onError` dos seguintes hooks:
- `useLeads.ts`
- `useContracts.ts`
- `useFinancial.ts`
- `useFormTemplates.ts`
- `usePmocPlans.ts`
- `usePmocContracts.ts`
- `useCostResources.ts`
- `useServiceCostResources.ts`
- `useServiceCosts.ts`
- `usePricingSettings.ts`
- `useCustomers.ts`
- `useCustomerContacts.ts`
- `useEquipmentCategories.ts`
- `useEquipmentFieldConfig.ts`
- `useInventory.ts`
- `useTimeRecords.ts`
- `useTeams.ts`
- `useUsers.ts`
- `usePermissions.ts`
- `useCrmWebhooks.ts`
- `useQuoteConversion.ts`
- `useServiceMaterials.ts`
- `useEmployees.ts` / `useEmployeeMovements.ts`
- `useFinancialCategories.ts`

### Etapa 3 — Aplicar `normalizeOptionalForeignKeys` nos hooks restantes
Garantir que todos os payloads com campos UUID opcionais passem pela sanitizacao antes de ir ao banco.

### Etapa 4 — Adicionar tratamento de erros de rede
Adicionar no `getErrorMessage` deteccao de erros como `Failed to fetch`, `NetworkError`, `timeout`, `ECONNREFUSED` com mensagens amigaveis em portugues ("Sem conexao com a internet. Verifique sua rede e tente novamente.").

## Detalhes Tecnicos

**Arquivos modificados:**
- `src/utils/errorMessages.ts` — expandir DATABASE_ERROR_MAP (~20 novos mapeamentos)
- ~24 hooks em `src/hooks/` — importar e usar `getErrorMessage`
- ~3-4 hooks — adicionar `normalizeOptionalForeignKeys` onde falta

**Impacto:** Nenhuma mudanca visual ou de banco de dados. Apenas melhoria na experiencia do usuario quando erros ocorrem.

