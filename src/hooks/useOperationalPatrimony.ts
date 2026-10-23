import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { FinancialTransaction } from '@/types/database';
import { useAllCreditCardBills } from '@/hooks/useCreditCardBills';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useInventory } from '@/hooks/useInventory';
import { calculateOperationalPatrimony } from '@/lib/operational-patrimony';

export function useOperationalPatrimony(transactions: FinancialTransaction[]) {
  const queryClient = useQueryClient();
  const {
    accounts,
    balances,
    isLoading: isLoadingAccounts,
    isLoadingBalances,
    isError: isErrorAccounts,
    isErrorBalances,
    error: accountsError,
    balancesError,
    refetch: refetchAccounts,
  } = useFinancialAccounts();
  const {
    bills,
    isLoading: isLoadingBills,
    isError: isErrorBills,
    error: billsError,
    refetch: refetchBills,
  } = useAllCreditCardBills();
  const { stats, isLoading: isLoadingInventory, error: inventoryError } = useInventory();

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
    isError: isErrorAccounts || isErrorBalances || isErrorBills || Boolean(inventoryError),
    error: accountsError ?? balancesError ?? billsError ?? inventoryError ?? null,
    refetch: () => {
      refetchAccounts();
      void refetchBills();
      void queryClient.refetchQueries({ queryKey: ['inventory'] });
    },
  };
}
