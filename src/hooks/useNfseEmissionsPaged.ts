import { useState, useCallback, useRef, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Linha retornada pela RPC `get_nfse_emissions_paged`.
 * A RPC é SECURITY DEFINER e já isola por tenant — NÃO passa company_id.
 */
export interface NfseEmissionRow {
  id: string;
  status: string;
  numero_nfse: string | null;
  customer_id: string | null;
  customer_name: string | null;
  valor_servico: number | null;
  valor_iss: number | null;
  data_competencia: string | null;
  created_at: string;
  emitida_em: string | null;
  pdf_url: string | null;
  xml_url: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  error_message: string | null;
  total_count: number;

  // ---- Detalhe expandido da nota (migration 20260903210000).
  descricao_servico: string | null;
  codigo_servico: string | null;
  codigo_tributacao_municipal: string | null;
  codigo_nbs: string | null;
  aliquota_issqn: number | null;
  /** Tributação do ISSQN: '1' operação tributável, '2'..'4' demais casos. */
  trib_issqn: string | null;
  /** Retenção do ISSQN: '1' = NÃO retido, '2' = retido pelo tomador. */
  tp_ret_issqn: string | null;
  /** % total de tributos do Simples Nacional. */
  percentual_trib_sn: number | null;
  valor_pis: number | null;
  valor_cofins: number | null;
  valor_csll: number | null;
  municipio_incidencia_ibge: string | null;
  service_type_id: string | null;
  /** CPF/CNPJ do tomador (`customers.document`). */
  customer_document: string | null;

  // ---- Autoria (`nfse_emissions.created_by`).
  // NULL em notas anteriores a 2026-09-03: não havia de onde inferir o autor.
  // A RPC usa LEFT JOIN, então a linha VEM na lista mesmo sem autor — a UI tem
  // que aguentar os três campos nulos.
  created_by: string | null;
  created_by_name: string | null;
  created_by_avatar_url: string | null;
}

export interface FetchEmissionsPagedParams {
  /** undefined / [] = sem filtro (todos os status). */
  statuses?: string[];
  dateStart?: string | null;
  dateEnd?: string | null;
  /** Busca por número, tomador ou descrição. */
  search?: string;
  /** created_at | numero_nfse | valor_servico | status. Default created_at. */
  sortKey?: string;
  /** asc | desc. Default desc. */
  sortDir?: string;
  /** 1-based. */
  page?: number;
  /** Tamanho da página. Default 10. */
  pageSize?: number;
}

export interface UseNfseEmissionsPagedReturn {
  rows: NfseEmissionRow[];
  totalCount: number;
  loading: boolean;
  fetch: (params: FetchEmissionsPagedParams, silent?: boolean) => Promise<void>;
  refetch: () => void;
}

/** Status não-terminais — disparar polling/refetch enquanto presentes. */
const PENDING_STATUSES = new Set(['pendente', 'processando', 'rascunho']);

/**
 * Hook de listagem paginada de NFS-e — fronteira do Supabase.
 * Chama a RPC `get_nfse_emissions_paged` (SECURITY DEFINER, sem company_id).
 * Espelha o padrão do `useNfseInvoices` do EcoSistema.
 */
export function useNfseEmissionsPaged(): UseNfseEmissionsPagedReturn {
  const [rows, setRows] = useState<NfseEmissionRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const lastParamsRef = useRef<FetchEmissionsPagedParams | null>(null);

  const fetch = useCallback(async (params: FetchEmissionsPagedParams, silent?: boolean) => {
    lastParamsRef.current = params;
    if (!silent) setLoading(true);

    try {
      const { data, error } = await (supabase.rpc as any)('get_nfse_emissions_paged', {
        p_statuses: params.statuses && params.statuses.length ? params.statuses : null,
        p_date_start: params.dateStart ?? null,
        p_date_end: params.dateEnd ?? null,
        p_search: params.search && params.search.trim() ? params.search.trim() : null,
        p_sort_key: params.sortKey ?? 'created_at',
        p_sort_dir: params.sortDir ?? 'desc',
        p_page: params.page ?? 1,
        p_page_size: params.pageSize ?? 10,
      });

      if (error) throw error;

      // A RPC é RETURNS TABLE → devolve um ARRAY de linhas, com `total_count`
      // repetido em cada linha (count(*) OVER()). Não é um objeto {rows,total_count}.
      const arr = (Array.isArray(data) ? data : []) as (NfseEmissionRow & { total_count?: number })[];
      setRows(arr as NfseEmissionRow[]);
      setTotalCount(arr.length ? Number(arr[0].total_count ?? 0) : 0);
    } catch (err) {
      console.error('[useNfseEmissionsPaged] erro ao buscar emissões:', err);
      if (!silent) {
        toast.error('Erro ao carregar notas fiscais.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const refetch = useCallback(() => {
    const last = lastParamsRef.current;
    if (!last) return;
    fetch(last, true);
  }, [fetch]);

  // Polling leve enquanto houver emissões não-terminais.
  const hasPending = rows.some((r) => PENDING_STATUSES.has(r.status));
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (!hasPending) return;
    const id = setInterval(() => refetchRef.current(), 15_000);
    return () => clearInterval(id);
  }, [hasPending]);

  return { rows, totalCount, loading, fetch, refetch };
}
