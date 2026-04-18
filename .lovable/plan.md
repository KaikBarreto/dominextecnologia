
## Plano: CRUD de Usuários Admin + Vendedor vinculado + Financeiro Admin completo

### Bloco 1 — Tabelas e seed (1 migration)

**Novas tabelas:**
- `admin_permissions(id, user_id uuid, permission text, created_at)` — RLS: somente super_admin lê/escreve.
- `admin_financial_categories(id, name, label, type 'income'|'expense', color, icon, is_system, created_at, updated_at)` — RLS: super_admin gerencia.
- Coluna `user_id uuid` em `salespeople` (FK lógica para auth.users, único parcial onde não nulo).
- Coluna `created_at` em `admin_financial_transactions` (já existe).

**Constantes de permissões admin** (referenciadas em código):
- Telas: `admin_dashboard`, `admin_crm`, `admin_empresas`, `admin_vendedores`, `admin_assinaturas`, `admin_financeiro`, `admin_configuracoes`, `admin_usuarios`.
- Funções: `admin_financeiro_lancamentos`, `admin_financeiro_totais`, `admin_vendedores_ver_todos`.

**Seed categorias (espelha Eco):** sale (Vendas), renewal (Renovações), partner_contribution (Aporte de Sócios), other_income (Outras Receitas) — income. salary, marketing, commission, advance, development, infrastructure, administrative, impostos, asaas_fee, other_expense — expense. Todas com `is_system=true`.

### Bloco 2 — Hook `useAdminPermissions`

`src/hooks/useAdminPermissions.ts` retorna `{ hasMasterAccess, hasFullAccess, hasScreenAccess(key), hasFunctionAccess(key), linkedSalespersonId, isLoading }`. Master = super_admin role. Demais usuários admin lêem `admin_permissions`. Se vinculado a salesperson sem `admin_vendedores_ver_todos`, vê apenas seus próprios dados.

### Bloco 3 — CRUD Usuários Admin nas Configurações

- Adicionar aba **"Usuários Admin"** em `AdminSettings.tsx` (ícone `UserCog`).
- Novo componente `AdminUsersSettings.tsx` (porte do Eco):
  - Listagem com email, badge Master, badge "Vendedor: X", chips de permissões.
  - Modal **Criar**: email, nome, senha (vazia até gerar/digitar — segue regra do projeto), select para vincular a vendedor disponível (salesperson com `user_id IS NULL`).
  - Modal **Editar permissões**: checkboxes agrupados (Telas / Funções), com ScrollArea.
  - Modal **Resetar senha** + botão Excluir (oculto para Master).
- Edge Function `manage-admin-users` (criar/listar emails/resetar senha/deletar) — só super_admin pode invocar.
- Proteção de rota: cada página admin checa `hasScreenAccess` e redireciona ao dashboard.

### Bloco 4 — Vincular Vendedor a Usuário

- `SalespersonFormDialog` ganha campo opcional **"Vincular a usuário admin"** (select de admins sem vendedor vinculado) — também ajustável via aba Usuários Admin.
- `useSalespersonData` filtra resultados por `user_id` se o usuário logado tem permissão de vendedor mas não `admin_vendedores_ver_todos`.
- `AdminSalespeople.tsx` e `AdminSalespersonDetail.tsx`: se o usuário é vendedor restrito, esconde lista geral e força navegação para `/admin/vendedores/:linkedId`.

### Bloco 5 — Financeiro Admin (UI/lógica espelhada do Eco)

**Refatorar `AdminFinancial.tsx`** mantendo `admin_financial_transactions` atual:

- Adicionar abas **Resultado** (DRE) e **Configurações** ao `SettingsSidebarLayout`.
- Trocar Select de período por `DateRangeFilter` (componente já existente).
- Para usuários sem `admin_financeiro_totais`: mostra somente abas Receitas/Despesas (sem totais/gráficos/DRE).

**Novos componentes (em `src/components/admin/financial/`):**
- `FinancialSummaryCards.tsx` — cards Saldo do Período + Receitas/Despesas + botões clicáveis.
- `FinancialCharts.tsx` — donut Pizza por categoria com toggle Receitas/Despesas (recharts, já no projeto).
- `FinancialIncomeSection.tsx` / `FinancialExpenseSection.tsx` — seções dedicadas com filtros, mini-stats (vendas, renovações para receitas) e tabela.
- `FinancialDRESection.tsx` — DRE colapsável (Receita Bruta → Impostos → Receita Líquida → CPV → Lucro Bruto → OPEX → EBITDA), cards de Margem/Receita Líquida/Resultado, botão Exportar HTML (`utils/adminDreHtmlGenerator.ts` novo).
- `FinancialSettingsSection.tsx` — CRUD de `admin_financial_categories` com ColorPicker e seleção de ícone.
- `RecentTransactionsList.tsx` — usado em "Visão Geral".
- `AdminFinancialMovementModal.tsx` — atualizar para usar categorias dinâmicas em vez de lista hardcoded.

**Visão de Vendas e Renovações:** dentro de Receitas, agrupa contadores `first_sale`/`sale` e `renewal` no topo (cards com totais e número de transações).

**O que NÃO incluir** (específico Eco que não se aplica): integração Asaas, sync, alerta Asaas Pro, IA para DRE.

### Bloco 6 — Versão e changelog

Bump para `1.7.0` com entrada descrevendo CRUD usuários admin, vínculo vendedor↔usuário, e financeiro admin (DRE, gráficos, configuração de categorias).

### Arquivos principais

**Novos:**
- `supabase/migrations/<ts>_admin_users_financeiro.sql`
- `supabase/functions/manage-admin-users/index.ts`
- `src/hooks/useAdminPermissions.ts`
- `src/components/admin/AdminUsersSettings.tsx`
- `src/components/admin/financial/{FinancialSummaryCards,FinancialCharts,FinancialIncomeSection,FinancialExpenseSection,FinancialDRESection,FinancialSettingsSection,RecentTransactionsList}.tsx`
- `src/utils/adminDreHtmlGenerator.ts`

**Editados:**
- `src/pages/admin/AdminSettings.tsx` (+aba Usuários)
- `src/pages/admin/AdminFinancial.tsx` (refator completo)
- `src/pages/admin/AdminSalespeople.tsx` + `AdminSalespersonDetail.tsx` (filtro por vínculo)
- `src/components/admin/salesperson/SalespersonFormDialog.tsx` (+select usuário)
- `src/hooks/useSalespersonData.ts` (filtro por usuário)
- `src/components/admin/AdminFinancialMovementModal.tsx` (categorias dinâmicas)
- `src/config/version.ts`, `src/pages/Changelog.tsx`

### Observações

- Senhas em todos os modais novos respeitam a regra: campo vazio inicial, só preenche se digitar ou clicar em "Gerar".
- DRE usa o mesmo mapeamento de categorias do Eco (REVENUE/TAX/CPV/OPEX) — categorias custom criadas pelo admin caem em "other_income" ou "other_expense" para o cálculo até serem mapeadas (futuro).
- Tudo responsivo seguindo padrão admin já estabelecido.

<lov-actions>
<lov-suggestion message="Implemente o plano completo (Blocos 1 a 6)">Implementar tudo</lov-suggestion>
<lov-suggestion message="Implemente apenas os Blocos 1, 2 e 3 (CRUD de usuários admin com permissões) primeiro, depois revisamos antes do Financeiro.">Só CRUD usuários primeiro</lov-suggestion>
<lov-suggestion message="Implemente apenas o Bloco 5 (refator do Financeiro Admin com DRE, gráficos e categorias) primeiro.">Só Financeiro primeiro</lov-suggestion>
<lov-suggestion message="Antes de implementar, ajuste o plano para também portar a aba 'Avisos/Banners' e 'Tasks' do EcoSistema para o admin do Dominex.">Adicionar Avisos e Tasks</lov-suggestion>
</lov-actions>
