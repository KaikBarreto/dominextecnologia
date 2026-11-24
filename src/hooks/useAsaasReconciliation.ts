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
      const balance = (data as { balance?: number })?.balance;
      if (balance == null || !Number.isFinite(Number(balance))) throw new Error('Saldo indisponível');
      return Number(balance);
    },
    // Saldo muda devagar; evita martelar a API do Asaas.
    staleTime: 60_000,
    retry: 1,
  });
}

interface LedgerFilters {
  direction?: LedgerDirection;
  /** Vazio/undefined = todos os status. */
  status?: LedgerStatus[];
  page?: number;
  from?: string;
  to?: string;
}

/** Extrato espelhado do Asaas (`ledger_asaas`), mais recente primeiro. */
export function useLedgerAsaas(filters: LedgerFilters = {}) {
  return useQuery({
    queryKey: [...LEDGER_KEY, filters],
    refetchInterval:30_000,
    queryFn: async (): Promise<{ items: LedgerAsaasItem[]; count: number }> => {
      let query = supabase
        .from('admin_realized_asaas_movements')
        .select('id,asaas_transaction_id,asaas_event_type,asaas_payment_id,direction,amount,occurred_at,description,category,status,source,admin_financial_transaction_id,company_id,created_at', { count: 'exact' })
        .order('occurred_at', { ascending: false }).order('id', { ascending: false });
      if (filters.direction) query=query.eq('direction',filters.direction);
      if (filters.from) query = query.gte('occurred_at', filters.from+'T00:00:00-03:00');
      if (filters.to) query = query.lte('occurred_at', filters.to+'T23:59:59.999999-03:00');

      if (filters.status?.length) {
        query = query.in('status', filters.status);
      }

      const page = filters.page ?? 0;
      const { data, error, count } = await query.range(page*50,page*50+49);
      if (error) throw error;
      return {items: (data ?? []) as unknown as LedgerAsaasItem[], count: count ?? 0};
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
      const r = (data ?? {}) as Partial<SyncResult> & {failed?: number};
      if(Number(r.failed ?? 0)>0)throw new Error('A sincronização terminou com movimentos pendentes. Tente novamente.');
      return {
        imported: Number(r.imported ?? 0),
        known: Number(r.known ?? 0),
        unknown: Number(r.unknown ?? 0),
      };
    },
    onSuccess: ({ imported, known, unknown }) => {
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: BALANCE_KEY });
      qc.invalidateQueries({ queryKey: ['admin-cash-flow'] });
      qc.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
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
      qc.invalidateQueries({queryKey:LEDGER_KEY});
      qc.invalidateQueries({queryKey:BALANCE_KEY});
      qc.invalidateQueries({queryKey:['admin-financial-transactions-all']});
      qc.invalidateQueries({queryKey:['admin-cash-flow']});
      toast.error('Não foi possível concluir toda a sincronização. Confira suas permissões e tente novamente.');
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
    mutationFn: async ({ ledgerId, category }: CategorizePayload) => {
      const {error} = await supabase.rpc('admin_categorize_ledger', {p_ledger_id: ledgerId, p_category: category});
      if(error)throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: LEDGER_KEY });
      qc.invalidateQueries({ queryKey: ['admin-financial-transactions-all'] });
      toast.success('Movimento categorizado.');
    },
    onError: (e: any) => {
      toast.error(e?.message?.includes('linked_movement_mismatch') ? 'O lançamento vinculado tem tipo ou valor incompatível. Confira o vínculo antes de classificar.' : 'Não foi possível categorizar. Confira a categoria e suas permissões.');
    },
  });
}

export function useAdminLedgerSummary() {
  return useQuery({
    queryKey: [...LEDGER_KEY, 'summary'],
    queryFn: async (): Promise<{ balance: number; count: number; pending_count: number; last_imported_at: string | null }> => {
      const { data, error } = await supabase.rpc('admin_ledger_summary');
      if (error) throw error;
      return data as unknown as { balance: number; count: number; pending_count: number; last_imported_at: string | null };
    },
  });
}
