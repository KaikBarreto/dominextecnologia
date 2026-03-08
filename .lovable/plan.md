

## Plan: Redesign Transaction Form, Add Historico Tab, Plan Contas a Pagar/Receber

### 1. Redesign TransactionFormDialog UI

Match the reference screenshot layout:
- **Type selector**: Replace dropdown with two toggle buttons side-by-side ("Receita" with green active state, "Despesa" with red active state), using icons TrendingUp/TrendingDown.
- **Field order**: Tipo de Movimentacao > Categoria (select) > Valor (R$) with currency mask > Descricao (textarea) > Data (date input).
- **Remove fields**: Remove `due_date`, `customer_id`, `is_paid`, `notes` from the simplified form (these are secondary — keep only essential fields as shown in reference).
- **Subtitle**: Add "Registre uma receita ou despesa" below the title.
- **Button row**: "Cancelar" (outline) + "Salvar" (solid green/red based on type).
- Use `ResponsiveModal` for mobile drawer behavior.

### 2. Add "Historico" Tab to Finance

New sidebar tab between Despesas and Categorias:
- **Icon**: `History` from lucide-react
- **Content**: Reuse `TransactionListPanel` but without type filter — show ALL transactions (receitas + despesas).
- Add a type badge column (green "Receita" / red "Despesa") to distinguish entries.
- Include search, pagination, edit/delete actions.
- No "Nova" button since it's a unified view.

### 3. Plan: Contas a Pagar / Contas a Receber

Add a new sidebar tab "Contas" (icon: `CalendarClock`) that shows:
- **Two sub-tabs**: "A Pagar" / "A Receber" toggle at top.
- **Filters**: Pendentes / Vencidas / Pagas, date range.
- Lists transactions filtered by `is_paid = false` and grouped by due date.
- Highlight overdue items (where `due_date < today` and `is_paid = false`) in red.
- Quick action to mark as paid.
- Summary cards: Total pendente, Total vencido, Proximos 7 dias.

This requires adding `due_date` back to the transaction form as an optional "advanced" field — but NOT in the simplified quick-create modal. Instead, the full edit form (when editing from Contas tab) will show it.

### Files to modify:
- `src/components/financial/TransactionFormDialog.tsx` — Full UI redesign
- `src/pages/Finance.tsx` — Add Historico and Contas tabs
- `src/components/financial/TransactionListPanel.tsx` — Support "all types" mode for Historico

### New files:
- `src/components/financial/FinanceContas.tsx` — Contas a pagar/receber panel

### Tabs order after changes:
1. Visao Geral
2. Receitas
3. Despesas
4. Historico
5. Contas (A Pagar / A Receber)
6. Categorias
7. DRE - Resultado

