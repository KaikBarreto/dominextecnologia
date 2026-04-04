

# Refatorar Modal de Pagamento de Funcionário

## O que muda

O modal de pagamento atual é simples demais — mostra o resumo e confirma. O novo modal seguirá o padrão do EcoSistema (imagem de referência):

1. **Resumo financeiro** no topo (salário, bônus, vales, faltas)
2. **Campo editável** para escolher quanto descontar dos vales (padrão: 100%)
3. **Valor a pagar** calculado dinamicamente conforme o desconto de vales
4. **Forma de pagamento** — selecionar entre contas financeiras cadastradas (Dinheiro, PIX, etc.) com saldo exibido
5. **Observações** opcionais
6. **Ao confirmar**, registrar no extrato:
   - Movimentação tipo `pagamento` com o valor pago e detalhes (salário base, subtotal, valor pago, diferença, forma)
   - Movimentação tipo `ajuste` para resetar o saldo de volta ao salário base
   - Se sobraram vales não descontados (desconto parcial), re-lançar como vale pendente

## Fluxo de cálculo

```text
Salário Base:        R$ 10.000
+ Bônus:             R$    250
- Faltas:            R$      0
Subtotal:            R$ 10.250
- Desconto Vales:    R$    300  (editável, máx = totalVales)
= Valor a Pagar:     R$  9.950

Vales restantes = totalVales - descontoVales
```

## Movimentações geradas ao confirmar

1. **Pagamento** — `amount = valorPago`, `balance_after = 0`, com `payment_details` contendo breakdown (salário, bônus, faltas, desconto vales, forma de pagamento)
2. **Ajuste** — `amount = salário base`, `balance_after = salário base`, descrição "Reset para salário base"
3. **Vale remanescente** (se descontoVales < totalVales) — `type = vale`, `amount = valesRestantes`, `balance_after = salário - valesRestantes`

Também registra a transação financeira (saída) na tabela `financial_transactions` com `account_id` da conta selecionada.

## Arquivos afetados

- **`src/components/employees/EmployeePaymentModal.tsx`** — reescrever completamente com novo layout
- **`src/pages/Employees.tsx`** — atualizar `handlePayment` para aceitar os novos parâmetros (desconto de vales, account_id, observações) e registrar as 2-3 movimentações em sequência
- **`src/hooks/useFinancialAccounts.ts`** — já existe, será importado no modal para listar contas disponíveis

## Interface do novo modal

Baseado na referência:
- Card com resumo (Salário, Bônus, Descontos com sub-itens Vales/Faltas)
- Input para "Quanto descontar dos vales" com hint "Valor padrão: 100% dos vales (R$ X)"
- Card destacado com "Valor a Pagar" em fonte grande
- Radio group para forma de pagamento (lista contas financeiras com saldo)
- Select para qual conta/caixa quando há múltiplas
- Textarea para observações

## Callback atualizado

O `onSubmit` do modal passará:
```typescript
{
  valeDiscount: number;     // quanto descontar dos vales
  accountId: string;        // conta financeira selecionada
  description?: string;     // observações
}
```

O `Employees.tsx` processará criando as movimentações sequenciais e a transação financeira vinculada à conta.

