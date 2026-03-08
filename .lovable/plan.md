

# Plano: Responsividade Global + Exclusão de Funcionário com Usuário Vinculado

Este plano aborda duas frentes: (1) responsividade de todas as telas restantes e (2) lógica de exclusão de funcionário com usuário vinculado.

---

## Parte A — Mapa ao Vivo: z-index + Responsividade

**Arquivo:** `src/pages/LiveMap.tsx`

- O mapa Leaflet tem z-index alto por padrão. Adicionar CSS para limitar: `.leaflet-container { z-index: 0 !important; }` no bloco `<style>` existente
- Header: empilhar titulo + botões em mobile (`flex-col gap-3`)
- Badge de técnicos ativos: mover para abaixo do titulo em mobile
- Legenda: já usa `flex-wrap`, OK

---

## Parte B — Responsividade das Telas Restantes

### B1. Ordens de Serviço (`ServiceOrders.tsx`)
- Já tem card-view mobile da etapa anterior. Verificar abas (OS, Relatórios, NPS, Configurações).
- Sub-componentes `OsReportDashboard`, `NpsDashboard`, `ServiceTypesPanel`: garantir `grid-cols-1` em mobile para stats cards

### B2. Orçamentos (`Quotes.tsx`)
- Já tem card-view mobile. OK.

### B3. Serviços (`Services.tsx`)
- Página simples com `ServiceTypesPanel`. Garantir tabela responsiva.

### B4. Equipes (`Teams.tsx`)
- Já ajustado na etapa anterior. OK.

### B5. Questionários (`Questionnaires.tsx`)
- Tabela já tem `overflow-x-auto` e colunas hidden em mobile. OK.

### B6. Rastreamento (`TechnicianTracking.tsx`)
- Já tem `flex-col sm:flex-row` nos filtros e `grid-cols-2 sm:grid-cols-4` nos stats. OK.

### B7. Agenda (`Schedule.tsx`)
- Já tem `MobileAgendaView` para mobile. OK.

### B8. Cliente Detalhe (`CustomerDetail.tsx`)
- Tabs internas (geral, equipamentos, historico, financeiro, chamados, contratos)
- Tabelas dentro das tabs: adicionar card-view mobile usando `useIsMobile()`
- Header do cliente: empilhar info + ações em mobile

### B9. Equipamento Detalhe (`EquipmentDetail.tsx`)
- Tabs (geral, anexos, tarefas)
- Tabela de OS vinculadas: card-view mobile
- Info grid: `grid-cols-1 sm:grid-cols-2`

### B10. Estoque (`Inventory.tsx`)
- Já tem card-view mobile da etapa anterior. OK.

### B11. Funcionários (`Employees.tsx`)
- Já ajustado. OK.

### B12. Contratos (`Contracts.tsx`)
- Já tem card-view mobile. OK.

### B13. CRM (`CRM.tsx`)
- Kanban: colunas com `min-w-[260px]` em mobile (reduzir de 280)
- Stats cards: já tem `grid-cols-2`. Adicionar `truncate` nos valores
- Lead cards: garantir `min-w-0` e `truncate`

### B14. Financeiro (`Finance.tsx`)
- Nav lateral: já tem `flex lg:flex-col` com scroll horizontal em mobile. OK.
- Sub-componentes (`FinanceOverview`, `TransactionListPanel`, `FinanceContas`, `FinanceDRE`):
  - `FinanceOverview`: verificar stats cards e tabela de últimas transações
  - `TransactionListPanel`: adicionar card-view mobile para tabela de transações
  - `FinanceContas`: card-view mobile

### B15. Assinatura (`Billing.tsx`)
- Já tem responsividade boa com `grid-cols-1 sm:grid-cols-2` e padding mobile. OK.

### B16. Usuários (`Users.tsx`)
- Cards já têm `flex-col sm:flex-row` e `truncate`. OK.
- Botões de ação: já mostram só icons em mobile. OK.

### B17. Tutoriais (`Tutorials.tsx`)
- Grid `md:grid-cols-2 xl:grid-cols-3` e pills com `overflow-x-auto`. OK.

### B18. Configurações (`Settings.tsx`)
- `SettingsSidebarLayout` já tem Select mobile. 
- Grids de inputs: já têm `sm:grid-cols-2`. OK.

### B19. PMOC (`PMOC.tsx`)
- Tabs laterais + tabelas de planos/contratos/cronograma
- Adicionar card-view mobile para as 3 tabelas

---

## Parte C — Exclusão de Funcionário com Usuário Vinculado

### C1. EmployeeCard — Dialog de confirmação com opção de excluir usuário

Ao clicar em excluir funcionário que tem `user_id` vinculado:
- Mostrar dialog perguntando: "Este funcionário está vinculado a um usuário do sistema. Deseja excluir o usuário também?"
- Opções: "Excluir apenas funcionário", "Excluir funcionário e usuário", "Cancelar"

### C2. Employees.tsx — Handler de exclusão

- Criar `handleDeleteEmployee(employee)` que:
  1. Se `employee.user_id` existe, abre dialog com opção
  2. Se "excluir ambos": chama `deleteEmployee` + `manage-user` com `delete_user`
  3. Se "só funcionário": chama `deleteEmployee` normalmente (user_id é desvinculado automaticamente pelo manage-user, mas aqui só exclui o employee)

### C3. manage-user edge function
- Já tem `delete_user` que desvincula employees e deleta auth user. Funciona como está.

---

## Resumo de Arquivos Impactados

**Responsividade (~8 arquivos com mudanças significativas):**
- `src/pages/LiveMap.tsx` — z-index fix + header mobile
- `src/pages/CustomerDetail.tsx` — card-view mobile nas tabs
- `src/pages/EquipmentDetail.tsx` — card-view mobile
- `src/pages/CRM.tsx` — ajustes kanban + truncate
- `src/pages/PMOC.tsx` — card-view mobile nas 3 tabelas
- `src/components/financial/TransactionListPanel.tsx` — card-view mobile
- `src/components/financial/FinanceContas.tsx` — card-view mobile
- `src/components/service-orders/OsReportDashboard.tsx` — stats grid mobile

**Exclusão de funcionário (~3 arquivos):**
- `src/components/employees/EmployeeCard.tsx` — dialog de confirmação
- `src/pages/Employees.tsx` — handler de exclusão com opção de excluir usuário

