import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantCardFees — tabela de taxa de cartão EFETIVA do tenant, via edge
// `tenant-asaas-card-fees` (override → cache → Asaas → fallback).
//
// Usada só para o PREVIEW do repasse na tela de cobrança e na config de Ajustes.
// O gross-up autoritativo (o valor realmente cobrado) roda no edge de criação —
// aqui é espelho para o usuário ver o número antes de gerar.
// ─────────────────────────────────────────────────────────────────────────────

export interface CardFeeTable {
  operationValue: number;
  oneInstallment: number;
  upToSix: number;
  upToTwelve: number;
  upToTwentyOne: number;
}

export type CardFeeSource = 'override' | 'cache' | 'asaas' | 'fallback';

export interface TenantCardFees {
  fees: CardFeeTable;
  source: CardFeeSource;
  feePayerDefault: 'company' | 'customer';
  syncedAt: string | null;
}

/** Mesma fórmula do edge (_shared/asaas-card-fees.ts) — mantém o preview fiel. */
export function tierPercent(fees: CardFeeTable, installmentCount: number): number {
  const n = Math.max(1, Math.floor(installmentCount));
  if (n <= 1) return fees.oneInstallment;
  if (n <= 6) return fees.upToSix;
  if (n <= 12) return fees.upToTwelve;
  return fees.upToTwentyOne;
}

export interface CardGrossUp {
  totalValue: number;
  installmentValue: number;
  feePassedOn: number;
}

export function grossUpForCustomer(
  value: number,
  installmentCount: number,
  fees: CardFeeTable,
): CardGrossUp {
  const n = Math.max(1, Math.floor(installmentCount));
  const pct = tierPercent(fees, n);
  const fixed = Number.isFinite(fees.operationValue) ? Math.max(0, fees.operationValue) : 0;
  const rate = Number.isFinite(pct) && pct > 0 ? Math.min(pct, 100) / 100 : 0;

  const rawTotal = rate < 1 ? (value + fixed) / (1 - rate) : value + fixed;
  const totalValue = Math.max(value, Math.round(rawTotal * 100) / 100);
  const installmentValue = Math.round((totalValue / n) * 100) / 100;
  const feePassedOn = Math.round((totalValue - value) * 100) / 100;

  return { totalValue, installmentValue, feePassedOn };
}

export function useTenantCardFees(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const enabled = (options?.enabled ?? true) && !!companyId;

  const query = useQuery({
    queryKey: ['tenant-card-fees', companyId],
    enabled,
    staleTime: 10 * 60 * 1000, // taxa muda raramente; cache local generoso
    queryFn: async (): Promise<TenantCardFees | null> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-card-fees', {
        body: {},
      });
      if (error) throw error;
      if (!data || typeof data !== 'object' || !('fees' in data)) return null;
      return data as TenantCardFees;
    },
  });

  // Força rebuscar no Asaas e atualizar o cache (botão "Sincronizar taxas").
  const sync = useMutation({
    mutationFn: async (): Promise<TenantCardFees | null> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-card-fees', {
        body: { refresh: true },
      });
      if (error) throw error;
      return (data as TenantCardFees) ?? null;
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(['tenant-card-fees', companyId], data);
      queryClient.invalidateQueries({ queryKey: ['tenant-card-fees', companyId] });
    },
  });

  return {
    fees: query.data?.fees ?? null,
    source: query.data?.source ?? null,
    feePayerDefault: query.data?.feePayerDefault ?? 'company',
    syncedAt: query.data?.syncedAt ?? null,
    isLoading: query.isLoading,
    sync,
  };
}
