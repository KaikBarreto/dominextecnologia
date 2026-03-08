

# Plano: Refatorar PMOC → Módulo "Contratos" Agnóstico

## Visão Geral

Transformar o módulo PMOC em um módulo genérico "Contratos" para qualquer empresa que ofereça serviços recorrentes. O fluxo central: Criar Contrato → Definir Frequência → Vincular Itens → Revisar → Gerar OSs.

Este é um trabalho grande que será dividido em fases. A abordagem reutiliza a lógica existente do stepper de 4 etapas do `PmocPlanFormDialog` e a geração em massa de OSs, renomeando e expandindo a funcionalidade.

---

## Fase 1: Banco de Dados (Migrações)

Criar 3 novas tabelas e adicionar colunas à `service_orders`:

**Tabela `contracts`** (substitui `pmoc_plans` conceitualmente):
- `id`, `company_id` (FK companies), `name`, `customer_id` (FK customers), `technician_id`, `service_type_id`, `form_template_id`, `status` (active/paused/cancelled/expired), `notes`, `frequency_type` (days/months), `frequency_value`, `start_date`, `horizon_months`, `created_by`, `created_at`, `updated_at`

**Tabela `contract_items`**:
- `id`, `contract_id` (FK contracts ON DELETE CASCADE), `equipment_id` (nullable FK equipment), `item_name`, `item_description`, `form_template_id` (override por item), `sort_order`

**Tabela `contract_occurrences`**:
- `id`, `contract_id` (FK contracts ON DELETE CASCADE), `scheduled_date`, `service_order_id` (nullable FK service_orders), `status` (scheduled/completed/skipped/rescheduled), `occurrence_number`

**Alterar `service_orders`**:
- Adicionar `contract_id uuid references contracts(id)` (nullable)
- Adicionar `origin text default 'manual'` (manual/contract)

**RLS**: Todas as tabelas isoladas por `company_id` via `get_user_company_id(auth.uid())`, seguindo o padrão existente. Trigger `update_updated_at_column` em `contracts`.

As tabelas PMOC antigas (`pmoc_plans`, `pmoc_items`, `pmoc_generated_os`, `pmoc_contracts`, `pmoc_schedules`) ficam intactas por ora (não serão deletadas para não perder dados).

---

## Fase 2: Hooks e Lógica

**Novo hook `useContracts.ts`**:
- Queries: listar contratos com join em customers, contract_items, contract_occurrences
- Mutations: criar/editar/deletar contratos
- Lógica de geração de ocorrências (função pura `generateOccurrences`)
- Stats: ativos, OSs geradas no mês, próximas 7 dias, vencendo em 30 dias

**Novo hook `useContractDetail.ts`**:
- Query por ID com items + occurrences + service_orders vinculadas
- Mutations: atualizar status de ocorrência (skip, reschedule), adicionar/remover itens

---

## Fase 3: Componentes e Páginas

### 3a. Modal Stepper (refatorar `PmocPlanFormDialog` → `ContractFormDialog`)

4 etapas mantendo a UX existente, expandida:
1. **Informações**: Nome, Cliente, Técnico, Tipo de Serviço, Questionário, Observações, Toggle Ativo
2. **Frequência**: Toggle dias/meses, atalhos rápidos, intervalo, data início, horizonte, prévia de datas com indicação de fim de semana
3. **Itens**: Lista de equipamentos do cliente + opção de adicionar item manual (nome + descrição), questionário por item
4. **Revisão**: Resumo completo com destaque de quantas OSs serão geradas e aviso de fins de semana

Usar Sheet lateral (700px desktop, fullscreen mobile) em vez do Dialog atual.

### 3b. Página Principal `/contratos`

- Header com título + botão "Novo Contrato"
- 4 KPI cards: Ativos, OSs Geradas (mês), Próximas Ocorrências (7d), Vencendo (30d)
- Filtros: busca, status, período
- Tabela: Contrato, Cliente, Frequência, Próxima OS (com badges de cor por urgência), Itens, Status, Ações
- Empty state com ícone e CTA

### 3c. Página de Detalhe `/contratos/:id`

Layout 2 colunas (desktop) / stack (mobile):
- **Esquerda**: Cards de Informações, Itens do Contrato, Tabela de Ocorrências (com ações: ver OS, pular, reagendar)
- **Direita**: Card Resumo (frequência, início, horizonte, próxima OS) + Card Progresso (barra visual concluídas/total)

---

## Fase 4: Navegação e Renomeação

**Arquivos a editar**:
- `src/App.tsx`: Rota `/contratos` + `/contratos/:id`, redirect `/pmoc` → `/contratos`
- `src/components/layout/AppSidebar.tsx`: "PMOC" → "Contratos", ícone `ScrollText`, path `/contratos`
- `src/components/layout/TopbarLayout.tsx`: Idem
- `src/pages/MobileMenu.tsx`: Idem
- `src/hooks/usePermissions.ts`: `screen:pmoc` → `screen:contracts`, label "Contratos"

---

## Fase 5: Integração com Agenda e OS

- Na OS gerada por contrato: banner no topo com link "Ver contrato"
- No `ServiceOrderViewDialog` e `ServiceOrderFormDialog`: detectar `origin === 'contract'` e exibir contexto
- Na agenda: tooltip diferenciado para OSs de contrato

---

## Arquivos Envolvidos

**Criar**:
- `src/hooks/useContracts.ts`
- `src/hooks/useContractDetail.ts`
- `src/components/contracts/ContractFormDialog.tsx`
- `src/pages/Contracts.tsx`
- `src/pages/ContractDetail.tsx`

**Editar**:
- `src/App.tsx` (rotas)
- `src/components/layout/AppSidebar.tsx` (menu)
- `src/components/layout/TopbarLayout.tsx` (menu)
- `src/pages/MobileMenu.tsx` (menu)
- `src/hooks/usePermissions.ts` (permissão)
- `src/components/service-orders/ServiceOrderViewDialog.tsx` (banner contrato)

**Manter (não deletar)**:
- Arquivos PMOC antigos — ficam disponíveis como referência, a rota `/pmoc` redireciona para `/contratos`

**Migrações**:
- 1 migração SQL com as 3 tabelas + ALTER em service_orders + RLS policies + trigger updated_at

---

## Nota Técnica

O ponto arquitetural central é o campo `origin` e a FK `contract_id` na tabela `service_orders` — isso cria rastreabilidade entre Agenda, OS e Contrato sem acoplamento. Qualquer tela que exibe OS pode verificar se veio de um contrato e exibir o contexto adequado.

Devido à extensão, a implementação será feita em etapas sequenciais, começando pelo banco de dados, depois hooks, componentes e por fim a integração.

