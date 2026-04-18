

## Plano

### 1. Visão Geral do Financeiro (`FinanceOverview.tsx`)
Reordenar os 3 cards do topo: **Receitas → Despesas → Saldo do Período** (renomear "Saldo" para "Saldo do Período").

### 2. Conta/Caixa obrigatória em transações
- `TransactionFormDialog.tsx`: tornar `account_id` obrigatório no Zod (`z.string().min(1, 'Selecione uma conta ou caixa')`), remover "(opcional)" do label, adicionar asterisco. Se não houver contas, mostrar alerta com link para `/financeiro/caixas-bancos`.
- `AdminFinancialMovementModal.tsx`: como não existe tabela `admin_financial_accounts`, deixo apenas tenant.
- `ContaFormDialog.tsx`: adicionar campo `account_id` obrigatório (Select de contas).

### 3. Filtro de data no drawer do CRM Admin (`AdminCRM.tsx`)
Substituir os 2 inputs de data por `Select` com presets: **Hoje, Esta Semana, Este Mês (padrão), Este Ano, Personalizado**. "Personalizado" exibe os 2 inputs De/Até. Default `'this_month'` via `date-fns`. Atualizar `filteredLeads`.

### 4. Banco de dados — colunas de instituição
Migration: `ALTER TABLE financial_accounts ADD COLUMN institution_code int, ADD COLUMN institution_name text, ADD COLUMN institution_ispb text;` (mantém `bank_name` para retrocompatibilidade).

### 5. Logo/instituição bancária (espelhando o Eco)
**Novos arquivos:**
- `src/hooks/useBrazilBanks.ts` — copiado do Eco (BrasilAPI + Google favicon S2 + map de domínios populares + name-based fallback). Função `getBankLogo(code, name)`.
- `src/components/financial/BankInstitutionCombobox.tsx` — combobox com Popover, busca, "Mais populares" (Nubank, Itaú, Bradesco, Santander, Caixa, BB, Inter, C6, Sicredi), seção "Todos os bancos", ícone via `BankLogo` com favicon. Exporta também `BankLogo`.

### 6. Refatorar `FinanceBanks.tsx` (criação/edição igual ao Eco)
- Modal "Nova/Editar Conta" com:
  - Nome da conta (obrigatório)
  - `BankInstitutionCombobox` (instituição com logo)
  - Saldo (R$) — texto de aviso ao editar
  - **ColorPicker** com 21 cores preset + cor personalizada (Popover com input color HTML)
  - **Pré-visualização** (card com cor de fundo + logo do banco + nome)
- Cards da listagem: usar `BankLogo` no lugar do ícone Lucide genérico, manter cor identificadora.

### 7. Refatorar `useFinancialAccounts.ts`
- Adicionar `institution_code`, `institution_name`, `institution_ispb` na interface `FinancialAccount` e `AccountInput`.

### 8. Select de conta nas transações (`TransactionFormDialog.tsx`)
Renderizar opções com `BankLogo` + bolinha de cor (mesmo padrão do `BankAccountSelect.tsx` do Eco).

### 9. Versão
Bump para **1.7.3** com nota: "Saldo do Período renomeado, conta/caixa obrigatórios em transações, filtro de presets no CRM admin, instituições bancárias com logo automático".

### Arquivos
**Novos:**
- `src/hooks/useBrazilBanks.ts`
- `src/components/financial/BankInstitutionCombobox.tsx`
- Migration SQL (3 colunas em `financial_accounts`)

**Editados:**
- `src/components/financial/FinanceOverview.tsx`
- `src/components/financial/TransactionFormDialog.tsx`
- `src/components/financial/ContaFormDialog.tsx`
- `src/components/financial/FinanceBanks.tsx`
- `src/hooks/useFinancialAccounts.ts`
- `src/pages/admin/AdminCRM.tsx`
- `src/config/version.ts`

