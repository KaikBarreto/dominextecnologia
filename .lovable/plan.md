

# Contas Bancárias / Centros de Custo no Financeiro

## Conceito

Criar uma tabela `financial_accounts` (contas financeiras) que representa caixas/contas bancárias da empresa. Cada transação financeira pode ser vinculada a uma conta. A visão geral mostra o saldo por conta. Transferências entre contas são registradas como duas transações vinculadas (saída de uma, entrada de outra).

## Estrutura

### 1. Nova tabela `financial_accounts`
```
id, company_id, name, type (caixa/banco/cartao), bank_name?, 
initial_balance, color, icon, is_active, sort_order, created_at
```
- Seed automático ao criar empresa: "Caixa" e "Conta Principal"
- RLS por `company_id`

### 2. Nova coluna em `financial_transactions`
- `account_id UUID` (nullable, FK para `financial_accounts`)
- `transfer_pair_id UUID` (nullable — vincula as duas pontas de uma transferência)

### 3. Lógica de saldo por conta
- Saldo = `initial_balance` + soma(entradas pagas) - soma(saídas pagas) filtradas por `account_id`
- Calculado no frontend via query existente (sem function extra)

### 4. Transferências entre contas
- O usuário escolhe "conta origem" e "conta destino" + valor
- Gera 2 transações: uma `saida` na origem e uma `entrada` no destino, ambas com `transfer_pair_id` igual e categoria "Transferência entre contas"
- Transferências não contam no DRE (filtradas pelo `dre_group` ou flag)

## Mudanças na UI

### TransactionFormDialog
- Novo campo `Select` de "Conta" (opcional) listando as contas ativas da empresa
- Quando `payment_method` é preenchido, pode sugerir conta padrão (ex: PIX → conta banco)

### FinanceOverview
- Novo card/seção "Saldo por Conta" com mini-cards mostrando nome da conta, ícone e saldo atual
- Clicável para filtrar transações daquela conta

### Nova aba "Contas Bancárias" (ou dentro de Contas)
- CRUD de contas: nome, tipo, banco, saldo inicial, cor
- Botão "Transferir entre contas" abre modal simples (origem, destino, valor, data)
- Cada conta mostra saldo calculado

### Finance.tsx
- Nova aba no menu lateral: "Caixas e Bancos" (com ícone Landmark)
- Ou integrar dentro da aba "Contas" existente como sub-seção

## Arquivos a criar/editar

| Arquivo | Ação |
|---------|------|
| Migration SQL | Criar tabela `financial_accounts`, add colunas em `financial_transactions` |
| `src/hooks/useFinancialAccounts.ts` | Novo hook CRUD + cálculo de saldo |
| `src/components/financial/FinanceBanks.tsx` | Novo componente — CRUD de contas + transferências |
| `src/components/financial/TransferFormDialog.tsx` | Novo — modal de transferência |
| `src/components/financial/TransactionFormDialog.tsx` | Add campo "Conta" |
| `src/components/financial/FinanceOverview.tsx` | Add seção saldo por conta |
| `src/pages/Finance.tsx` | Add aba "Caixas e Bancos" |
| `src/hooks/useFinancial.ts` | Salvar `account_id` nas transações |
| Edge functions (create-company, self-register) | Seed contas padrão |

## Integração com forma de pagamento
- O campo `payment_method` já existe. A "conta" é onde o dinheiro entra/sai fisicamente
- Exemplo: pagamento via PIX pode cair na "Conta Banco X" ou no "Caixa"
- Não há vínculo automático obrigatório — o usuário escolhe a conta ao registrar

