

## Plan: Fix pastel colors, seed default categories, add quick-create buttons to Visão Geral

### 1. Fix pastel colors across the Finance module

**FinanceDRE.tsx** — KPI cards and DRE table rows:
- Cards "Margem de Lucro" and "Resultado (EBITDA)": Replace `border-success/20 bg-success/5` / `border-destructive/20 bg-destructive/5` with solid `bg-success text-white` / `bg-destructive text-white`. Inner text becomes white instead of `text-success`/`text-destructive`.
- DRE table final row: Replace `bg-success/10` / `bg-destructive/10` with `bg-success text-white` / `bg-destructive text-white`.

**FinanceOverview.tsx** — Summary cards and icon circles:
- "Receitas" card: Replace `border-success/20 bg-success/5` with solid `bg-success text-white`. All inner text white.
- "Despesas" card: Replace `border-destructive/20 bg-destructive/5` with solid `bg-destructive text-white`. All inner text white.
- Icon circles (all 4 cards): Replace `bg-primary/10`, `bg-success/10`, `bg-destructive/10`, `bg-warning/10` with solid `bg-primary`, `bg-success`, `bg-destructive`, `bg-warning` + white icons.
- Recent transactions icon circles: Replace `bg-success/10` / `bg-destructive/10` with solid `bg-success` / `bg-destructive` + white icons.

**Other pages** (CRM.tsx, Inventory.tsx) — Icon circles:
- Replace all `bg-primary/10 p-3`, `bg-success/10 p-3`, `bg-warning/10 p-3` patterns with solid `bg-primary p-3`, `bg-success p-3`, `bg-warning p-3` + ensure icons use `text-white`.

### 2. Seed default financial categories

Insert default categories into `financial_categories` table using the data insert tool:
- **Receitas**: Serviços Prestados, Vendas de Peças/Materiais, Contratos PMOC
- **Impostos/Deduções** (type: saida): Impostos e Taxas
- **CPV** (type: saida): Custo de Materiais, Fornecedores e Insumos
- **OPEX** (type: saida): Alimentação, Luz/Energia, Aluguel, Combustível/Transporte, Salários e Encargos, Marketing e Publicidade, Ferramentas e Equipamentos, Outros

### 3. Add quick-create buttons to Visão Geral

**FinanceOverview.tsx**:
- Add `onNewReceita` and `onNewDespesa` callback props.
- Add two buttons below the summary cards row: "Nova Receita" (green solid) and "Nova Despesa" (red solid), using `Plus` icon.

**Finance.tsx**:
- Pass `onNewReceita={() => handleNew('entrada')}` and `onNewDespesa={() => handleNew('saida')}` to `FinanceOverview`.

### Files to modify:
- `src/components/financial/FinanceDRE.tsx`
- `src/components/financial/FinanceOverview.tsx`
- `src/pages/Finance.tsx`
- `src/pages/CRM.tsx`
- `src/pages/Inventory.tsx`

### Data to insert:
- ~12 rows into `financial_categories` table

