

## Plan: Redesign Financial Module with Sidebar Navigation, Categories, and DRE

### Overview
Redesign the Finance page to use the same sidebar navigation pattern as Settings/other modules. Add dedicated sections for Receitas, Despesas, Categorias, and DRE (Resultado Financeiro).

### 1. Database Changes
- Create `financial_categories` table:
  - `id` (uuid), `name` (text), `type` (text: 'entrada'|'saida'|'ambos'), `color` (text), `is_active` (boolean, default true), `created_at`, `updated_at`
  - RLS: authenticated can view, admin/gestor can manage
- No other DB changes needed; `financial_transactions.category` already exists as text and will reference category names

### 2. Restructure Finance Page (`src/pages/Finance.tsx`)
Replace current tabs layout with sidebar navigation pattern (matching Settings.tsx):

**Sidebar tabs:**
- Visao Geral (icon: LayoutDashboard)
- Receitas (icon: TrendingUp)
- Despesas (icon: TrendingDown)
- Categorias (icon: Tag)
- DRE - Resultado (icon: FileBarChart)

**Layout**: `flex flex-col lg:flex-row gap-6` with `nav lg:w-52` sidebar on the left, content on the right. Active tab uses `bg-primary text-white`.

### 3. Visao Geral Tab
Inspired by the reference screenshots:
- **Summary cards**: Saldo do Sistema, Receitas totais (green bg), Despesas totais (red bg)
- **Resultado do periodo** row showing net result
- **Distribuicao por Categoria**: Donut chart (recharts PieChart) showing breakdown by category, with toggle Despesas/Receitas
- **Ultimas Movimentacoes**: Timeline-style list of recent transactions (last 10), with "Ver todas" linking to Receitas/Despesas tabs

### 4. Receitas Tab
- Header with "Receitas" title + "Nova Receita" button (green)
- Search input
- Table listing only `transaction_type === 'entrada'` transactions
- Reuse existing `TransactionTable` component, filtered
- Edit/Delete/Mark as paid actions

### 5. Despesas Tab
- Header with "Despesas" title + "Nova Despesa" button (red)
- Same structure as Receitas but filtered for `transaction_type === 'saida'`

### 6. Categorias Tab
- CRUD for financial categories
- List with name, type badge (Receita/Despesa/Ambos), color indicator
- Add/Edit dialog with name, type select, color picker
- Categories will be used in the TransactionFormDialog dropdown (replacing hardcoded list)

### 7. DRE - Resultado Tab
Inspired by the reference screenshot:
- **KPI cards at top**: Margem de Lucro (%), Receita Liquida, Resultado (EBITDA) - colored cards (red/green)
- **Line chart**: Evolucao Receita vs Despesas over months (recharts AreaChart)
- **DRE table**: Structured financial statement rows:
  - (+) RECEITA BRUTA
  - (-) IMPOSTOS E DEDUCOES
  - (=) RECEITA LIQUIDA (highlighted row)
  - (-) CPV (Custo do Servico)
  - (=) LUCRO BRUTO (highlighted)
  - (-) DESPESAS OPERACIONAIS (OPEX)
  - (=) RESULTADO LIQUIDO (EBITDA) (green/red highlighted)
- All values computed from existing `financial_transactions` data, grouped by category

### 8. New Components
- `src/components/financial/FinanceOverview.tsx` - Visao Geral content
- `src/components/financial/FinanceReceitas.tsx` - Receitas list
- `src/components/financial/FinanceDespesas.tsx` - Despesas list  
- `src/components/financial/FinanceCategorias.tsx` - Categories CRUD
- `src/components/financial/FinanceDRE.tsx` - DRE/Resultado
- `src/components/financial/CategoryFormDialog.tsx` - Category form

### 9. Hook Updates
- Create `useFinancialCategories.ts` - CRUD for `financial_categories` table
- Update `useFinancial.ts` to add monthly summary query for DRE chart data
- Update `TransactionFormDialog.tsx` to load categories from DB instead of hardcoded array

### 10. Version & Changelog
- Update `APP_VERSION` to `1.2.0`
- Add changelog entry for v1.2.0
- Add database version entry

### Technical Notes
- Recharts (already installed) will be used for the donut chart and area chart
- The sidebar pattern matches exactly what Settings.tsx uses: `cn('flex items-center gap-3 rounded-lg px-3 py-2.5...', isActive ? 'bg-primary text-white' : '...')`
- DRE categories mapping: categories with names containing "imposto"/"taxa" map to IMPOSTOS, "custo"/"material"/"peca" map to CPV, others map to OPEX
- Period filter (month selector) at the top will filter all data across tabs

