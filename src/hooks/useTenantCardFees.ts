import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import {
  grossUpForCustomer,
  tierPercent,
  type CardFeeTable,
  type PixFee,
  type BankSlipFee,
  type AnticipationFee,
  type SettlementDays,
  type CardGrossUp,
} from '@/lib/asaasFeeSimulator';

// ─────────────────────────────────────────────────────────────────────────────
// useTenantFees — taxas EFETIVAS da conta Asaas do tenant (cartão, Pix, boleto
// e antecipação), via edge `tenant-asaas-card-fees`
// (override → cache → Asaas myAccount/fees → fallback).
//
// Usada no card "Taxas da Asaas" das Configurações, no Simulador de venda e no
// PREVIEW do repasse da tela de cobrança. O gross-up autoritativo (o valor
// realmente cobrado) roda no edge de criação — aqui é espelho pro usuário ver
// o número antes de gerar.
//
// HONESTIDADE: bloco que a Asaas não devolveu vem `null` (nunca zero inventado).
// A tela mostra "não informado pela Asaas" ou faixa rotulada como referência.
//
// `useTenantCardFees` continua exportado com o MESMO retorno de antes (o modal
// de cobrança depende dele) — hoje é só um alias de `useTenantFees`.
// ─────────────────────────────────────────────────────────────────────────────

// Reexporta os tipos/fórmulas que agora moram no helper puro (fonte única).
export type {
  CardFeeTable,
  PixFee,
  BankSlipFee,
  AnticipationFee,
  SettlementDays,
  CardGrossUp,
} from '@/lib/asaasFeeSimulator';
export { grossUpForCustomer, tierPercent };

export type CardFeeSource = 'override' | 'cache' | 'asaas' | 'fallback';
export type FeeExtrasSource = 'cache' | 'asaas' | 'fallback';

/** Contrato devolvido pela edge `tenant-asaas-card-fees`. */
export interface TenantFees {
  /** Tabela de cartão efetiva. */
  card: CardFeeTable;
  /** Tarifa de Pix recebido. null = a Asaas não informou. */
  pix: PixFee | null;
  /** Tarifa de boleto liquidado. null = a Asaas não informou. */
  bankSlip: BankSlipFee | null;
  /** Percentuais de antecipação (ao mês). null = a Asaas não expôs. */
  anticipation: AnticipationFee | null;
  /** Prazos D+ informados pela Asaas (null onde não expôs). */
  settlementDays: SettlementDays;
  /** Procedência da tabela de CARTÃO. */
  source: CardFeeSource;
  /** Procedência dos blocos Pix/boleto/antecipação. */
  extrasSource: FeeExtrasSource;
  /** Preferência padrão de quem paga a taxa do cartão. */
  feePayerDefault: 'company' | 'customer';
  /** Quando o cache foi sincronizado com a Asaas (ISO). */
  syncedAt: string | null;
}

/** Compat: shape antigo (só cartão) — mantido pra não quebrar quem importava. */
export interface TenantCardFees {
  fees: CardFeeTable;
  source: CardFeeSource;
  feePayerDefault: 'company' | 'customer';
  syncedAt: string | null;
}

const EMPTY_SETTLEMENT: SettlementDays = { pix: null, bankSlip: null, card: null };

/** Normaliza a resposta crua da edge no contrato `TenantFees`. */
function parseResponse(raw: unknown): TenantFees | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown> & {
    settlementDays?: Partial<SettlementDays> | null;
  };
  const card = (d.card ?? d.fees) as CardFeeTable | undefined;
  if (!card || typeof card !== 'object') return null;
  return {
    card,
    pix: (d.pix ?? null) as PixFee | null,
    bankSlip: (d.bankSlip ?? null) as BankSlipFee | null,
    anticipation: (d.anticipation ?? null) as AnticipationFee | null,
    settlementDays: {
      pix: d.settlementDays?.pix ?? null,
      bankSlip: d.settlementDays?.bankSlip ?? null,
      card: d.settlementDays?.card ?? null,
    },
    source: (d.source ?? 'fallback') as CardFeeSource,
    extrasSource: (d.extrasSource ?? 'fallback') as FeeExtrasSource,
    feePayerDefault: d.feePayerDefault === 'customer' ? 'customer' : 'company',
    syncedAt: typeof d.syncedAt === 'string' ? d.syncedAt : null,
  };
}

export function useTenantFees(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const { companyId } = useUserCompany();
  const enabled = (options?.enabled ?? true) && !!companyId;

  const query = useQuery({
    queryKey: ['tenant-card-fees', companyId],
    enabled,
    staleTime: 10 * 60 * 1000, // taxa muda raramente; cache local generoso
    queryFn: async (): Promise<TenantFees | null> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-card-fees', {
        body: {},
      });
      if (error) throw error;
      return parseResponse(data);
    },
  });

  // Força rebuscar no Asaas e atualizar o cache (botão "Atualizar taxas").
  const sync = useMutation({
    mutationFn: async (): Promise<TenantFees | null> => {
      const { data, error } = await supabase.functions.invoke('tenant-asaas-card-fees', {
        body: { refresh: true },
      });
      if (error) throw error;
      return parseResponse(data);
    },
    onSuccess: (data) => {
      if (data) queryClient.setQueryData(['tenant-card-fees', companyId], data);
      queryClient.invalidateQueries({ queryKey: ['tenant-card-fees', companyId] });
    },
  });

  return {
    /** Alias legado de `card` (o modal de cobrança usa este nome). */
    fees: query.data?.card ?? null,
    card: query.data?.card ?? null,
    pix: query.data?.pix ?? null,
    bankSlip: query.data?.bankSlip ?? null,
    anticipation: query.data?.anticipation ?? null,
    settlementDays: query.data?.settlementDays ?? EMPTY_SETTLEMENT,
    source: query.data?.source ?? null,
    extrasSource: query.data?.extrasSource ?? null,
    feePayerDefault: query.data?.feePayerDefault ?? 'company',
    syncedAt: query.data?.syncedAt ?? null,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    sync,
  };
}

/** Compat histórico — mesmo retorno de `useTenantFees`. */
export const useTenantCardFees = useTenantFees;
