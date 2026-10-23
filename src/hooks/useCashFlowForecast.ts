/**
 * Dados do fluxo de caixa PREVISTO.
 *
 * ⚠️ Tem query PRÓPRIA de propósito, em vez de reaproveitar
 * `useFinancial().transactions`. Aquele hook baixa TODAS as transações da
 * empresa, paginadas, com quatro joins embutidos — é o dataset certo para as
 * telas que mostram histórico, e o errado para um relatório que só olha para
 * frente. Aqui buscamos só obrigação EM ABERTO, com as colunas que o motor lê.
 *
 * O saldo de partida vem da RPC `cash_flow_opening_balances`, que tem a régua
 * escrita em um lugar só (ver o comentário em `deriveForecastOpeningBalances`,
 * que é a mesma régua no client e serve de contraprova em teste).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useFinancialAccounts } from '@/hooks/useFinancialAccounts';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { useAllCreditCardBills } from '@/hooks/useCreditCardBills';
import { todayInTz } from '@/lib/timezone';
import {
  buildForecastEvents,
  type ForecastBill,
  type ForecastProjection,
} from '@/lib/cash-flow-forecast-sources';
import {
  buildCashFlowForecast,
  type CashFlowForecastResult,
  type ForecastAccount,
  type OverdueTreatment,
} from '@/lib/cash-flow-forecast';
import type { FinancialTransaction } from '@/types/database';

/** Colunas que o motor lê. Manter estreito: o resto é peso morto na rede. */
const OPEN_TXN_COLUMNS =
  'id, company_id, transaction_type, amount, amount_received, description, category, ' +
  'transaction_date, due_date, paid_date, is_paid, cancelled_at, account_id, ' +
  'transfer_pair_id, credit_card_bill_date, bill_id, parent_transaction_id';

export interface UseCashFlowForecastOptions {
  horizonDays?: number;
  overdueTreatment?: OverdueTreatment;
  /** Projeções recorrentes já montadas por quem chama (assinaturas/contratos). */
  projections?: readonly ForecastProjection[];
}

export interface UseCashFlowForecastResult {
  forecast: CashFlowForecastResult | null;
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => void;
  /** Dias de dívida para trás configurados pela empresa. 0 = sem limite. */
  overdueWindowDays: number;
}

export function useCashFlowForecast(
  options: UseCashFlowForecastOptions = {},
): UseCashFlowForecastResult {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const { timezone } = useAppLocaleContext();
  const {
    accounts,
    isLoading: loadingAccounts,
    isError: accountsIsError,
    error: accountsError,
    refetch: refetchAccounts,
  } = useFinancialAccounts();
  const {
    settings,
    isLoading: loadingSettings,
    isError: settingsIsError,
    error: settingsError,
    refetch: refetchSettings,
  } = useCompanySettings();
  const {
    bills,
    isLoading: loadingBills,
    isError: billsIsError,
    error: billsError,
    refetch: refetchBills,
  } = useAllCreditCardBills();

  const horizonDays = options.horizonDays ?? 15;
  const today = todayInTz(timezone);
  // Mesmo padrão de `FinanceDRE` com `dre_start_date`: o campo já existe no
  // banco e o cast some quando `CompanySettings` for regenerado.
  const overdueWindowDays =
    (settings as { cash_flow_overdue_window_days?: number } | null)?.cash_flow_overdue_window_days ?? 90;

  /**
   * Limite inferior da busca de vencidos.
   *
   * Sem teto, um cliente com três anos de recebível nunca baixado abre o
   * relatório e vê uma dívida gigante de coisa velha, e perde a confiança no
   * primeiro dia. O padrão de 3 meses é do BPO: "passou disso, ele some".
   */
  const overdueFloor = useMemo(() => {
    if (!overdueWindowDays) return null;           // 0 = sem limite
    const anchor = new Date(`${today}T00:00:00.000Z`);
    anchor.setUTCDate(anchor.getUTCDate() - overdueWindowDays);
    return anchor.toISOString().slice(0, 10);
  }, [today, overdueWindowDays]);

  const horizonEnd = useMemo(() => {
    const anchor = new Date(`${today}T00:00:00.000Z`);
    anchor.setUTCDate(anchor.getUTCDate() + horizonDays);
    return anchor.toISOString().slice(0, 10);
  }, [today, horizonDays]);

  const openQuery = useQuery({
    queryKey: ['cash-flow-forecast', 'open', companyId, overdueFloor, horizonEnd],
    enabled: !!companyId,
    queryFn: async () => {
      let query = supabase
        .from('financial_transactions')
        .select(OPEN_TXN_COLUMNS)
        .eq('is_paid', false)
        .is('cancelled_at', null)
        .lte('due_date', horizonEnd);

      if (overdueFloor) query = query.gte('due_date', overdueFloor);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as FinancialTransaction[];
    },
  });

  const balancesQuery = useQuery({
    queryKey: ['cash-flow-forecast', 'balances', companyId, today],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('cash_flow_opening_balances', { p_today: today });
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data ?? []) as Array<{ account_id: string; balance: number }>) {
        map.set(row.account_id, Number(row.balance));
      }
      return map;
    },
  });

  const isLoading =
    loadingAccounts || loadingSettings || loadingBills || openQuery.isLoading || balancesQuery.isLoading;
  const isError = accountsIsError || settingsIsError || billsIsError || openQuery.isError || balancesQuery.isError;
  const error = accountsError ?? settingsError ?? billsError ?? openQuery.error ?? balancesQuery.error ?? null;

  const forecast = useMemo(() => {
    if (isLoading || isError) return null;
    if (!openQuery.data || !balancesQuery.data) return null;

    const forecastAccounts: ForecastAccount[] = accounts.map((a) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      // A coluna nasceu com DEFAULT true, então conta antiga já vem no caixa.
      isCashAccount: a.is_cash_account !== false,
    }));

    const forecastBills: ForecastBill[] = bills.map((b) => ({
      id: b.id,
      account_id: b.account_id,
      due_date: b.due_date,
      closing_date: b.closing_date,
      status: b.status,
      amount_paid: Number(b.amount_paid ?? 0),
      total_amount: Number((b as { total_amount?: number }).total_amount ?? 0),
    }));

    const { events, warnings: sourceWarnings } = buildForecastEvents({
      openTransactions: openQuery.data,
      bills: forecastBills,
      projections: options.projections ?? [],
      today,
    });

    const result = buildCashFlowForecast({
      events,
      accounts: forecastAccounts,
      openingBalances: balancesQuery.data,
      today,
      horizonDays,
      overdueTreatment: options.overdueTreatment,
    });

    return { ...result, warnings: [...sourceWarnings, ...result.warnings] };
  }, [
    isLoading,
    isError,
    openQuery.data,
    balancesQuery.data,
    accounts,
    bills,
    options.projections,
    options.overdueTreatment,
    today,
    horizonDays,
  ]);

  return {
    forecast,
    isLoading,
    isError,
    error,
    refetch: () => {
      refetchAccounts();
      void refetchSettings();
      void refetchBills();
      void openQuery.refetch();
      void balancesQuery.refetch();
    },
    overdueWindowDays,
  };
}
