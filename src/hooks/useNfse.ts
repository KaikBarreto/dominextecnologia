import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { invokeFisqal, type FisqalEdgeResult } from '@/utils/fisqalEdge';
import { isNfseTerminal } from '@/components/fiscal/nfseStatus';
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

/** Intervalo entre consultas de status (ms). Sensato pra não martelar a API. */
const POLL_INTERVAL_MS = 4500;
/** Duração máxima do polling automático (ms). ~2,5 min e desiste. */
const POLL_MAX_DURATION_MS = 150_000;

export interface NfseStatusPolling {
  /** true enquanto há um intervalo ativo consultando o status. */
  isPolling: boolean;
  /** true quando o polling parou por timeout sem chegar a um estado final. */
  timedOut: boolean;
}

/**
 * Polling AUTOMÁTICO do status de uma emissão (sem webhook — a Fisqal é por
 * consulta). Enquanto a emissão estiver em estado NÃO-terminal e `enabled`,
 * consulta `fisqal-nfse-status` a cada ~4,5s, atualizando a lista do `useNfse`
 * a cada sucesso, até:
 *   - o status virar terminal (autorizada/rejeitada/falhou/cancelada) → para;
 *   - estourar ~2,5 min (POLL_MAX_DURATION_MS) → para e sinaliza `timedOut`;
 *   - a edge responder 503 (integração não ativada) → para;
 *   - o componente desmontar / `enabled` virar false → limpa o intervalo.
 *
 * Garante UM único intervalo por emissão: ao trocar de `emissionId` ou ao
 * reciclar, o intervalo anterior é sempre limpo. Não inicia se já-terminal.
 *
 * IMPORTANTE: o caller decide quando o alvo é terminal (passando `enabled`
 * já considerando o status) — mas o hook também checa o retorno da consulta
 * pra parar assim que o desfecho chega, sem depender de re-render do caller.
 */
export function useNfseStatusPolling(
  emissionId: string | null | undefined,
  enabled: boolean,
): NfseStatusPolling {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();

  const [isPolling, setIsPolling] = useState(false);
  const [timedOut, setTimedOut] = useState(false);

  // Refs pra ler valores frescos dentro do intervalo sem recriá-lo.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  useEffect(() => {
    setTimedOut(false);

    if (!enabled || !emissionId) {
      stop();
      return;
    }

    startedAtRef.current = Date.now();
    setIsPolling(true);

    const tick = async () => {
      // Evita duas consultas sobrepostas pra mesma emissão.
      if (inFlightRef.current) return;

      // Limite de duração: desiste sem desfecho.
      if (Date.now() - startedAtRef.current >= POLL_MAX_DURATION_MS) {
        setTimedOut(true);
        stop();
        return;
      }

      inFlightRef.current = true;
      try {
        const res = await invokeFisqal('fisqal-nfse-status', { emissionId });

        // 503 (integração ainda não ativada): não adianta insistir — para.
        if (res.unconfigured) {
          stop();
          return;
        }

        // A cada consulta bem-sucedida, reflete na lista/detalhe.
        if (res.ok) {
          queryClient.invalidateQueries({ queryKey: ['nfse-emissions', companyId] });
        }

        // Parou? Lê o status atualizado direto do cache (já invalidado acima
        // dispara refetch async, então conferimos o retorno da edge).
        const status =
          (res.data?.status as string | undefined) ??
          (res.errorBody?.status as string | undefined);
        if (status && isNfseTerminal(status)) {
          stop();
        }
      } catch {
        // Falha de rede pontual: não derruba o polling, tenta de novo no próximo
        // tick (o limite de duração eventualmente encerra).
      } finally {
        inFlightRef.current = false;
      }
    };

    // Primeira consulta quase imediata, depois no intervalo regular.
    const kickoff = setTimeout(tick, 800);
    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(kickoff);
      stop();
      inFlightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [emissionId, enabled, companyId]);

  return { isPolling, timedOut };
}

/**
 * Polling em lote pra lista: enquanto houver emissões NÃO-terminais entre os
 * `ids` informados, consulta o status de cada uma a cada ciclo e atualiza a
 * lista. Um único intervalo pro conjunto (não um por nota), pra não martelar.
 * Para quando todos os ids viram terminais, no unmount ou ao estourar o tempo.
 *
 * Recebe os ids já filtrados como NÃO-terminais pelo caller (deriva do dataset).
 */
export function useNfseListPolling(pendingIds: string[]): void {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef<number>(0);
  const inFlightRef = useRef(false);
  const idsRef = useRef<string[]>(pendingIds);
  idsRef.current = pendingIds;

  // Chave estável do conjunto pra (re)iniciar só quando o conjunto muda.
  const key = [...pendingIds].sort().join(',');

  useEffect(() => {
    const clear = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    if (!key) {
      clear();
      return;
    }

    startedAtRef.current = Date.now();

    const tick = async () => {
      if (inFlightRef.current) return;
      if (Date.now() - startedAtRef.current >= POLL_MAX_DURATION_MS) {
        clear();
        return;
      }
      const ids = idsRef.current;
      if (ids.length === 0) {
        clear();
        return;
      }

      inFlightRef.current = true;
      try {
        const results = await Promise.all(
          ids.map((id) => invokeFisqal('fisqal-nfse-status', { emissionId: id })),
        );
        // 503 em qualquer consulta = integração não ativada: não insiste.
        if (results.some((r) => r.unconfigured)) {
          clear();
          return;
        }
        if (results.some((r) => r.ok)) {
          queryClient.invalidateQueries({ queryKey: ['nfse-emissions', companyId] });
        }
      } catch {
        // Falha pontual: tenta de novo no próximo ciclo.
      } finally {
        inFlightRef.current = false;
      }
    };

    intervalRef.current = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      clear();
      inFlightRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, companyId]);
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
