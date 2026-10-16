import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';

/**
 * Fronteira do Supabase pra fila de NFS-e automática (`nfse_auto_jobs`),
 * Onda 3 — tela "Emissões automáticas" em Fiscal.
 *
 * LEITURA: SELECT direto na tabela. RLS (migration 20261016140000) já filtra
 * por `company_id` da empresa do usuário (ou super_admin) + entitlement de
 * assinatura; o `.eq('company_id', ...)` aqui é só UX, não segurança.
 *
 * ESCRITA: NUNCA insert/update direto nesta tabela — authenticated não tem
 * policy nenhuma de escrita (de propósito, ver comentário da migration). A
 * ÚNICA ação do usuário é a RPC `nfse_auto_enfileirar`, que:
 *   - é o "tentar de novo" pra falhou/cancelada/bloqueada_* (reabre o job);
 *   - é o "emitir mesmo assim" da R7.5 pra aguardando_decisao (competência
 *     encerrada, decisão humana explícita).
 * A RPC já valida sessão, permissão (a mesma de emitir nota à mão) e posse
 * por dentro, e já devolve a mensagem de erro pronta em PT-BR leigo — o
 * chamador NUNCA reescreve essa mensagem por cima (ver `useNfseAutoRetryError`
 * neste arquivo).
 */

/** Os 9 status possíveis de um job (CHECK `nfse_auto_jobs_status_check`). */
export type NfseAutoJobStatus =
  | 'pendente'
  | 'processando'
  | 'emitida'
  | 'falhou'
  | 'cancelada'
  | 'bloqueada_assinatura'
  | 'bloqueada_modulo'
  | 'bloqueada_cota'
  | 'aguardando_decisao'
  | string;

/**
 * Linha "achatada" pra tela: o job + os três dados que ele precisa mostrar
 * (cliente, contrato, parcela) via embedding do PostgREST. O embedding sai
 * aninhado (`contracts.customers.*`); achatamos aqui pra quem consome não
 * precisar navegar objeto por objeto em todo lugar.
 */
export interface NfseAutoJobRow {
  id: string;
  company_id: string;
  contract_id: string;
  financial_transaction_id: string;
  competencia: string;
  trigger_reason: string;
  status: NfseAutoJobStatus;
  attempts: number;
  /** Motivo em PT-BR leigo, gravado pelo runner (R7.5/R7 do plano). */
  last_error: string | null;
  nfse_emission_id: string | null;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
  contract_name: string | null;
  customer_name: string | null;
  customer_company_name: string | null;
  transaction_amount: number | null;
  transaction_due_date: string | null;
  transaction_date: string | null;
  transaction_description: string | null;
}

/** Shape bruto que volta do PostgREST com os embeddings (antes de achatar). */
interface RawNfseAutoJobRow {
  id: string;
  company_id: string;
  contract_id: string;
  financial_transaction_id: string;
  competencia: string;
  trigger_reason: string;
  status: string;
  attempts: number;
  last_error: string | null;
  nfse_emission_id: string | null;
  scheduled_for: string;
  created_at: string;
  updated_at: string;
  contracts: {
    name: string | null;
    customers: { name: string | null; company_name: string | null } | null;
  } | null;
  financial_transactions: {
    amount: number | null;
    due_date: string | null;
    transaction_date: string | null;
    description: string | null;
  } | null;
}

function flattenRow(row: RawNfseAutoJobRow): NfseAutoJobRow {
  return {
    id: row.id,
    company_id: row.company_id,
    contract_id: row.contract_id,
    financial_transaction_id: row.financial_transaction_id,
    competencia: row.competencia,
    trigger_reason: row.trigger_reason,
    status: row.status,
    attempts: row.attempts,
    last_error: row.last_error,
    nfse_emission_id: row.nfse_emission_id,
    scheduled_for: row.scheduled_for,
    created_at: row.created_at,
    updated_at: row.updated_at,
    contract_name: row.contracts?.name ?? null,
    customer_name: row.contracts?.customers?.name ?? null,
    customer_company_name: row.contracts?.customers?.company_name ?? null,
    transaction_amount: row.financial_transactions?.amount ?? null,
    transaction_due_date: row.financial_transactions?.due_date ?? null,
    transaction_date: row.financial_transactions?.transaction_date ?? null,
    transaction_description: row.financial_transactions?.description ?? null,
  };
}

export function useNfseAutoJobs() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const listKey = ['nfse-auto-jobs', companyId];

  const jobsQuery = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    queryFn: async (): Promise<NfseAutoJobRow[]> => {
      const { data, error } = await supabase
        .from('nfse_auto_jobs')
        .select(`
          id, company_id, contract_id, financial_transaction_id, competencia,
          trigger_reason, status, attempts, last_error, nfse_emission_id,
          scheduled_for, created_at, updated_at,
          contracts ( name, customers ( name, company_name ) ),
          financial_transactions ( amount, due_date, transaction_date, description )
        `)
        .eq('company_id', companyId!)
        .order('scheduled_for', { ascending: false });
      if (error) throw error;
      return (data as unknown as RawNfseAutoJobRow[] ?? []).map(flattenRow);
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: listKey });

  /**
   * "Tentar de novo" / "Emitir mesmo assim": a ÚNICA escrita que esta tela
   * faz, sempre via RPC. `motivo` vai pro rastro (`reenfileirado_motivo`).
   */
  const retryMutation = useMutation({
    mutationFn: async ({
      financialTransactionId,
      motivo,
    }: {
      financialTransactionId: string;
      motivo?: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('nfse_auto_enfileirar', {
        p_financial_transaction_id: financialTransactionId,
        p_motivo: motivo && motivo.trim() ? motivo.trim() : 'Reenfileirado manualmente pela tela de pendências.',
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidate(),
  });

  return {
    jobs: jobsQuery.data ?? [],
    isLoading: jobsQuery.isLoading,
    isError: jobsQuery.isError,
    refetch: jobsQuery.refetch,
    invalidate,

    retry: retryMutation.mutateAsync,
    isRetrying: retryMutation.isPending,
  };
}

/**
 * Extrai a mensagem de erro de uma chamada a `nfse_auto_enfileirar` SEM
 * reescrever o texto: a RPC já devolve a frase pronta em PT-BR leigo (gates de
 * sessão/permissão/posse/elegibilidade, todos com `RAISE EXCEPTION` com texto
 * final). `getErrorMessage` (utils/errorMessages) não serve aqui: ele troca
 * `code='42501'` (insufficient_privilege, usado pelos gates de sessão/
 * permissão desta RPC) por um texto genérico, e a regra desta tela é mostrar
 * a frase que veio, não inventar outra por cima.
 */
export function nfseAutoRetryErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = (error as { message?: unknown }).message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  }
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
