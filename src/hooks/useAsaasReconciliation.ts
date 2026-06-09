import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Hooks da CONCILIAÇÃO bancária Asaas (painel master Auctus).
 *
 * Fronteira do Supabase pra tela de conciliação: nenhum componente toca
 * `supabase.from`/`functions.invoke` direto — tudo passa por aqui.
 *
 * - `useAsaasBalance`        → saldo real no Asaas (edge get-asaas-balance).
 * - `useLedgerAsaas`         → extrato espelhado em `ledger_asaas`.
 * - `useSyncAsaasLedger`     → puxa o extrato do Asaas (edge sync-asaas-ledger).
 * - `useCategorizeLedgerItem`→ categoriza um movimento "a categorizar".
 *
 * Segurança: as edges validam Authorization + super_admin server-side; as
 * tabelas estão sob RLS `is_admin_user(auth.uid())`. UI é só conveniência.
 */

export type LedgerDirection = 'credit' | 'debit';
export type LedgerStatus =
  | 'auto_categorized'
  | 'pending_categorization'
  | 'manually_categorized';

export interface LedgerAsaasItem {
  id: string;
  asaas_transaction_id: string | null;
  asaas_event_type: string | null;
  asaas_payment_id: string | null;
  direction: LedgerDirection;
  amount: number;
  occurred_at: string;
  description: string | null;
  category: string | null;
  status: LedgerStatus;
  source: string;
  admin_financial_transaction_id: string | null;
  company_id: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

const LEDGER_KEY = ['ledger-asaas'] as const;
const BALANCE_KEY = ['asaas-balance'] as const;

/** Saldo real disponível na conta Asaas (edge get-asaas-balance). */
export function useAsaasBalance() {
  return useQuery({
    queryKey: BALANCE_KEY,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase.functions.invoke('get-asaas-balance');
      if (error) throw error;
      return Number((data as { balance?: number })?.balance ?? 0);
    },
    // Saldo muda devagar; evita martelar a API do Asaas.
    staleTime: 60_000,
    retry: 1,
  });
}

interface LedgerFilters {
  /** Vazio/undefined = todos os status. */
  status?: LedgerStatus[];
}

/** Extrato espelhado do Asaas (`ledger_asaas`), mais recente primeiro. */
export function useLedgerAsaas(filters: LedgerFilters = {}) {
  return useQuery({
    queryKey: [...LEDGER_KEY, filters],
    queryFn: async (): Promise<LedgerAsaasItem[]> => {
      let query = supabase
        .from('ledger_asaas' as any)
        .select('*')
        .order('occurred_at', { ascending: false })
        .limit(5000);

      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as LedgerAsaasItem[];
    },
  });
}

interface SyncResult {
  imported: number;
  known: number;
  unknown: number;
}

/**
 * Sincroniza o extrato com o Asaas. Invalida ledger + saldo ao terminar e
 * mostra toast com o resumo (importados / conhecidos / desconhecidos).
 */
export function useSyncAsaasLedger() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (opts?: { fullSync?: boolean }): Promise<SyncResult> => {
      const { data, error } = await supabase.functions.invoke('sync-asaas-ledger', {
        body: opts?.fullSync ? { fullSync: true } : {},
      });
      if (error) throw error;
      const r = (data ?? {}) as Partial<SyncResult>;
      return {
        imported: Number(r.imported ?? 0),
        known: Number(r.known ?? 0),
        unknown: Number(r.unknown ?? 0),
      };
    },
    onSuccess: ({ imported, known, unknown }) => {
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: BALANCE_KEY });
      if (imported === 0) {
        toast.success('Tudo em dia — nenhum lançamento novo no Asaas.');
      } else {
        const partes: string[] = [];
        if (known > 0) partes.push(`${known} já identificado${known > 1 ? 's' : ''}`);
        if (unknown > 0) partes.push(`${unknown} a categorizar`);
        toast.success(
          `${imported} lançamento${imported > 1 ? 's' : ''} importado${imported > 1 ? 's' : ''}` +
            (partes.length ? ` (${partes.join(', ')}).` : '.'),
        );
      }
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Não foi possível sincronizar com o Asaas.');
    },
  });
}

interface CategorizePayload {
  ledgerId: string;
  /** name da admin_financial_categories. */
  category: string;
  /** Lançamento linkado, se houver — recebe a mesma categoria. */
  adminTransactionId?: string | null;
}

/**
 * Categoriza um movimento "a categorizar": grava a categoria no `ledger_asaas`
 * (status → manually_categorized) e, quando há lançamento linkado, espelha a
 * categoria em `admin_financial_transactions`.
 *
 * Update direto via RLS: ambas as tabelas têm policy UPDATE
 * `is_admin_user(auth.uid())` e nenhuma trava de imutabilidade — não precisa
 * de edge function service_role.
 */
export function useCategorizeLedgerItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ledgerId, category, adminTransactionId }: CategorizePayload) => {
      const { error: ledgerErr } = await supabase
        .from('ledger_asaas' as any)
        .update({ category, status: 'manually_categorized' })
        .eq('id', ledgerId);
      if (ledgerErr) throw ledgerErr;

      if (adminTransactionId) {
        const { error: txErr } = await supabase
          .from('admin_financial_transactions' as any)
          .update({ category })
          .eq('id', adminTransactionId);
        if (txErr) throw txErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
      toast.success('Movimento categorizado.');
    },
    onError: (e: any) => {
      toast.error(e?.message || 'Não foi possível categorizar o movimento.');
    },
  });
}
