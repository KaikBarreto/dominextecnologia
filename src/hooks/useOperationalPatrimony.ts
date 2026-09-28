import { useMemo } from 'react';
import type { FinancialTransaction } from '@/types/database';
import { useAllCreditCardBills } from '@/hooks/useCreditCardBills';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useInventory } from '@/hooks/useInventory';
import { calculateOperationalPatrimony } from '@/lib/operational-patrimony';

export function useOperationalPatrimony(transactions: FinancialTransaction[]) {
  const {
    accounts,
    balances,
    isLoading: isLoadingAccounts,
    isLoadingBalances,
  } = useFinancialAccounts();
  const { bills, isLoading: isLoadingBills } = useAllCreditCardBills();
  const { stats, isLoading: isLoadingInventory } = useInventory();

  const patrimony = useMemo(
    () => calculateOperationalPatrimony({
      accounts,
      balances,
      transactions,
      cardBills: bills,
      // Mesmo conceito exibido no EcoSistema: estoque valorizado pela projeção
      // de venda, com fallback no custo quando o preço de venda não existe.
      stockSaleValue: stats.totalSaleValue,
    }),
    [accounts, balances, bills, stats.totalSaleValue, transactions],
  );

  return {
    patrimony,
    isLoading: isLoadingAccounts || isLoadingBalances || isLoadingBills || isLoadingInventory,
  };
}
