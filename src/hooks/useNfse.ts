import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { invokeFisqal, type FisqalEdgeResult } from '@/utils/fisqalEdge';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Fronteira do Supabase para o módulo Notas Fiscais (NFS-e via Fisqal),
 * fluxo STANDALONE — emissão por cliente, sem Ordem de Serviço.
 *
 * - Leitura: `nfse_emissions` (lista da empresa) e `nfse_events` (histórico).
 *   Ambas têm RLS por company_id; o filtro client é só UX.
 * - Mutations: via edges Fisqal (`fisqal-emit-nfse`, `fisqal-nfse-status`,
 *   `fisqal-cancel-nfse`) normalizadas pelo helper `invokeFisqal`, que já trata
 *   o 503 `fisqal_unconfigured` ("Integração fiscal ainda não ativada").
 *
 * Tipos vêm do schema gerado (`Tables<'nfse_emissions'>` / `'nfse_events'`).
 */

export type NfseStatus =
  | 'pendente'
  | 'processando'
  | 'autorizada'
  | 'rejeitada'
  | 'cancelada'
  | 'falhou'
  | string;

/** Linha de `nfse_emissions` com `status` estreitado pro union de exibição. */
export type NfseEmission = Omit<Tables<'nfse_emissions'>, 'status'> & {
  status: NfseStatus;
};

/** Linha de `nfse_events` (histórico de uma emissão). */
export type NfseEvent = Tables<'nfse_events'>;

export interface EmitNfseInput {
  customerId: string;
  descricao: string;
  valorServico: number;
  codigoServico?: string;
  dataCompetencia?: string;
  idempotencyKey?: string;
}

const EMISSION_COLS =
  'id, company_id, customer_id, financial_transaction_id, status, fisqal_dps_id, fisqal_fiscal_request_id, numero_nfse, chave_acesso, protocolo, pdf_url, xml_url, valor_servico, valor_iss, descricao_servico, idempotency_key, error_message, emitida_em, created_at, updated_at';

export function useNfse() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const listKey = ['nfse-emissions', companyId];

  const emissionsQuery = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    queryFn: async (): Promise<NfseEmission[]> => {
      const { data, error } = await supabase
        .from('nfse_emissions')
        .select(EMISSION_COLS)
        .eq('company_id', companyId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as NfseEmission[];
    },
  });

  const invalidateList = () => queryClient.invalidateQueries({ queryKey: listKey });

  /** Emite uma NFS-e standalone (por cliente). Retorna o resultado normalizado. */
  const emitMutation = useMutation({
    mutationFn: async (input: EmitNfseInput): Promise<FisqalEdgeResult> => {
      return invokeFisqal('fisqal-emit-nfse', {
        customerId: input.customerId,
        servico: {
          descricao: input.descricao,
          ...(input.codigoServico ? { codigoServico: input.codigoServico } : {}),
        },
        valores: { valorServico: input.valorServico },
        ...(input.dataCompetencia ? { dataCompetencia: input.dataCompetencia } : {}),
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      });
    },
    onSuccess: () => invalidateList(),
  });

  /** Consulta/atualiza o status de uma emissão na Fisqal. */
  const statusMutation = useMutation({
    mutationFn: async (emissionId: string): Promise<FisqalEdgeResult> => {
      return invokeFisqal('fisqal-nfse-status', { emissionId });
    },
    onSuccess: () => invalidateList(),
  });

  /** Cancela uma NFS-e autorizada (edge `fisqal-cancel-nfse`). */
  const cancelMutation = useMutation({
    mutationFn: async ({
      emissionId,
      motivo,
    }: {
      emissionId: string;
      motivo?: string;
    }): Promise<FisqalEdgeResult> => {
      return invokeFisqal('fisqal-cancel-nfse', {
        emissionId,
        ...(motivo ? { motivo } : {}),
      });
    },
    onSuccess: () => invalidateList(),
  });

  return {
    emissions: emissionsQuery.data ?? [],
    isLoading: emissionsQuery.isLoading,
    isError: emissionsQuery.isError,
    refetch: emissionsQuery.refetch,
    invalidate: invalidateList,

    emitNfse: emitMutation.mutateAsync,
    isEmitting: emitMutation.isPending,

    refreshStatus: statusMutation.mutateAsync,
    isRefreshingStatus: statusMutation.isPending,

    cancel: cancelMutation.mutateAsync,
    isCancelling: cancelMutation.isPending,
  };
}

/** Histórico de eventos de uma emissão específica (SELECT direto, RLS permite). */
export function useNfseEvents(emissionId: string | null) {
  return useQuery({
    queryKey: ['nfse-events', emissionId],
    enabled: !!emissionId,
    queryFn: async (): Promise<NfseEvent[]> => {
      const { data, error } = await supabase
        .from('nfse_events')
        .select('id, nfse_emission_id, company_id, event_type, status, payload, created_at')
        .eq('nfse_emission_id', emissionId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as NfseEvent[];
    },
  });
}
