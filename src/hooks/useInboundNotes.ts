import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { getErrorMessage } from '@/utils/errorMessages';

/**
 * Fronteira do Supabase para NOTAS DESTINADAS (NF-e / NFS-e RECEBIDAS pelo
 * CNPJ do cliente). Espelha `docs/planos/2026-09-24-notas-destinadas-e-config-fiscal.md`
 * (Frente C).
 *
 * ⚠️ TIPAGEM MANUAL: `inbound_nfe`, `inbound_nfse`, `dfe_sync_state` e as duas
 * colunas novas de `company_fiscal_settings` (`dfe_nfe_ativo`/`dfe_nfse_ativo`)
 * foram criadas nesta sessão pelo dev-database e AINDA NÃO estão em
 * `src/integrations/supabase/types.ts` (só entram depois do push + regeneração).
 * Por isso o nome das 3 tabelas novas entra com `as any` em `.from(...)` — mesmo
 * padrão já usado no projeto para tabela nova sem types (ver `useAdminCrm.ts`,
 * `useDomiflixSections.ts`). O retorno é castado pra interface própria abaixo,
 * copiada coluna a coluna das migrations (fonte da verdade, não a memória).
 * Quando os types forem regenerados, trocar `as any`/`as unknown as` pelos
 * tipos gerados é faxina segura (mesma forma, nomes batem).
 *
 * REGRA DE ESCRITA DO TENANT (RLS + GRANT por coluna, ver migrations):
 * `inbound_nfe`/`inbound_nfse` só aceitam UPDATE do tenant em
 * `financial_transaction_id` e `supplier_id`. Qualquer outra tentativa de
 * escrita (inclusive INSERT/DELETE) é recusada pelo banco — é documento
 * fiscal, não registro editável. `dfe_sync_state` é SÓ LEITURA pro tenant
 * (quem escreve é a edge/cron via service_role). `dfe_manifestacao_jobs` nem
 * aparece aqui: RLS não dá SELECT pro tenant, e a tela lê o estado da fila via
 * `inbound_nfe.manifestacao_pendente`/`manifestacao_erro`.
 */

// ============================================================================
// Tipos (espelham as migrations 20260924160000/161000/162000 — não o Eco)
// ============================================================================

export type ManifestacaoTipo = 'nenhuma' | 'ciencia' | 'confirmada' | 'desconhecida' | 'nao_realizada';
/** Tipos que a fila `dfe_manifestacao_jobs` aceita — 'ciencia' fica de fora lá,
 *  mas o contrato da edge `dfe-manifestar` aceita os 4 (ver briefing/plano). */
export type ManifestacaoAcaoTipo = 'ciencia' | 'confirmada' | 'desconhecida' | 'nao_realizada';
/**
 * O que pode estar "em processamento" agora.
 *
 * As migrations 162000 (CHECK original) e 170000 (correção, bloco "0) CORREÇÕES
 * DAS PARTES 2/3") discordavam sobre 'ciencia' entrar ou não na fila — a
 * 170000 é quem vale: 'ciencia' (210210) ENTRA na fila (não é automática do
 * motor de distribuição; é o que destrava o XML completo) e a CHECK de
 * `inbound_nfe.manifestacao_pendente` foi corrigida pra aceitá-la. Conferido
 * contra a RPC `dfe_enfileirar_manifestacao`, que grava
 * `manifestacao_pendente = p_tipo` sem excluir 'ciencia'.
 */
export type ManifestacaoPendenteTipo = 'ciencia' | 'confirmada' | 'desconhecida' | 'nao_realizada';

export interface InboundNfe {
  id: string;
  company_id: string;
  chave: string;
  origem: string;
  numero: number | null;
  serie: number | null;
  emitente_cnpj: string | null;
  emitente_nome: string | null;
  valor: number | null;
  data_emissao: string | null;
  natureza: string | null;
  cfop_principal: string | null;
  /** 1=normal, 2=complementar, 3=ajuste, 4=devolução. Devolução NÃO gera despesa. */
  fin_nfe: number | null;
  ref_nfe_key: string | null;
  situacao_sefaz: 'autorizada' | 'cancelada' | 'denegada' | null;
  manifestacao: ManifestacaoTipo;
  manifestacao_data: string | null;
  manifestacao_pendente: ManifestacaoPendenteTipo | null;
  manifestacao_pendente_em: string | null;
  manifestacao_erro: string | null;
  resumo: boolean;
  financial_transaction_id: string | null;
  supplier_id: string | null;
  created_at: string;
}

export interface InboundNfse {
  id: string;
  company_id: string;
  chave_acesso: string | null;
  chave_natural: string;
  numero: string | null;
  serie: string | null;
  data_emissao: string | null;
  competencia: string | null;
  valor_servico: number | null;
  valor_liquido: number | null;
  valor_iss: number | null;
  iss_retido: boolean | null;
  prestador_documento: string | null;
  prestador_nome: string | null;
  discriminacao: string | null;
  situacao: 'autorizada' | 'cancelada' | 'substituida';
  resumo: boolean;
  financial_transaction_id: string | null;
  supplier_id: string | null;
  created_at: string;
}

export interface DfeSyncState {
  tipo: 'nfe' | 'nfse';
  ultimo_nsu: string | null;
  max_nsu: string | null;
  janela_fim: string | null;
  ultima_consulta_em: string | null;
  proxima_consulta_em: string | null;
  ultimo_cstat: string | null;
  ultimo_erro: string | null;
  documentos_ultimo_lote: number | null;
}

export interface DfeSyncResult {
  ok: boolean;
  novas: number;
  total: number;
  parcial: boolean;
  /**
   * PT-BR já pronta pra tela — a edge é quem decide o texto (ver
   * `supabase/functions/dfe-sync/index.ts`). `ok:false` com HTTP 200 é ESTADO
   * LEGÍTIMO (em espera, opt-in desligado, consumo indevido): não vira erro
   * destrutivo, só mostra `aviso` verbatim.
   *
   * ⚠️ `ok:true` com `novas: 0` também é NORMAL na NFS-e, não falha: o feed do
   * ADN mistura nota emitida e recebida, e as emitidas avançam o cursor sem
   * entrar nesta lista. A edge manda o `aviso` explicando — mostre-o.
   */
  aviso?: string;
  /** Código estável do motivo (nunca comparar por texto de `aviso`). */
  motivo?: string;
}

export interface DfeManifestarResult {
  ok: boolean;
  /** 'enfileirada' (sucesso) | 'ja_manifestada' | 'em_andamento' (estados legítimos, não erro). */
  status: string;
  /** Presente nos estados `ok:false` — mesma régua do `aviso` de dfe-sync: PT-BR pronto pra tela, nunca toast vermelho. */
  message?: string;
}

const NFE_COLS =
  'id, company_id, chave, origem, numero, serie, emitente_cnpj, emitente_nome, valor, data_emissao, natureza, cfop_principal, fin_nfe, ref_nfe_key, situacao_sefaz, manifestacao, manifestacao_data, manifestacao_pendente, manifestacao_pendente_em, manifestacao_erro, resumo, financial_transaction_id, supplier_id, created_at';
// `xml_content` NÃO entra aqui: pode ser um XML grande, e esta é a query da
// LISTA (todas as notas). Buscamos sob demanda em `fetchInboundNfeXml`, só
// quando o usuário abre "Lançar como despesa" pra uma nota específica.

const NFSE_COLS =
  'id, company_id, chave_acesso, chave_natural, numero, serie, data_emissao, competencia, valor_servico, valor_liquido, valor_iss, iss_retido, prestador_documento, prestador_nome, discriminacao, situacao, resumo, financial_transaction_id, supplier_id, created_at';

/**
 * Invoca edge de dfe-* lendo a mensagem PT-BR do corpo do erro quando existe
 * (mesmo padrão de `useNfseTierChange.ts`) — sem isso cai no fallback genérico
 * em inglês do client do Supabase.
 */
async function invokeDfeFunction<T>(
  name: string,
  body: Record<string, unknown>,
  fallbackMessage: string,
): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    const resp = (error as { context?: Response })?.context;
    let bodyMsg: string | undefined;
    try {
      const respBody = (await resp?.json?.()) as { message?: string; error?: string } | undefined;
      bodyMsg = respBody?.message || respBody?.error;
    } catch {
      /* corpo não-JSON — usa o fallback abaixo */
    }
    throw new Error(bodyMsg || error.message || fallbackMessage);
  }
  if (data?.error) throw new Error(data.message || data.error || fallbackMessage);
  return data as T;
}

/** NF-e RECEBIDAS (produto, emitidas CONTRA o CNPJ do cliente). */
export function useInboundNfe() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const listKey = ['inbound-nfe', companyId];
  const syncStateKey = ['dfe-sync-state', companyId, 'nfe'];

  const query = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    queryFn: async (): Promise<InboundNfe[]> => {
      const { data, error } = await supabase
        .from('inbound_nfe' as any)
        .select(NFE_COLS)
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as InboundNfe[];
    },
  });

  const syncStateQuery = useQuery({
    queryKey: syncStateKey,
    enabled: !!companyId,
    queryFn: async (): Promise<DfeSyncState | null> => {
      const { data, error } = await supabase
        .from('dfe_sync_state' as any)
        .select(
          'tipo, ultimo_nsu, max_nsu, janela_fim, ultima_consulta_em, proxima_consulta_em, ultimo_cstat, ultimo_erro, documentos_ultimo_lote',
        )
        .eq('company_id', companyId!)
        .eq('tipo', 'nfe')
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DfeSyncState) ?? null;
    },
  });

  const sync = useMutation({
    mutationFn: async (): Promise<DfeSyncResult> =>
      invokeDfeFunction<DfeSyncResult>(
        'dfe-sync',
        { tipo: 'nfe' },
        'Não foi possível sincronizar as NF-e agora. Tente de novo em instantes.',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: syncStateKey });
    },
  });

  const manifestar = useMutation({
    mutationFn: async (input: {
      inboundNfeId: string;
      tipo: ManifestacaoAcaoTipo;
      justificativa?: string;
    }): Promise<DfeManifestarResult> =>
      invokeDfeFunction<DfeManifestarResult>(
        'dfe-manifestar',
        {
          inboundNfeId: input.inboundNfeId,
          tipo: input.tipo,
          ...(input.justificativa ? { justificativa: input.justificativa } : {}),
        },
        'Não foi possível enviar a manifestação agora. Tente de novo em instantes.',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  const linkTransaction = useMutation({
    mutationFn: async (input: {
      id: string;
      financial_transaction_id: string | null;
      supplier_id?: string | null;
    }) => {
      const payload: Record<string, unknown> = {
        financial_transaction_id: input.financial_transaction_id,
      };
      if (input.supplier_id !== undefined) payload.supplier_id = input.supplier_id;
      const { error } = await supabase.from('inbound_nfe' as any).update(payload).eq('id', input.id);
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível vincular a nota ao lançamento.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    syncState: syncStateQuery.data ?? null,
    sync: sync.mutateAsync,
    isSyncing: sync.isPending,
    manifestar: manifestar.mutateAsync,
    isManifesting: manifestar.isPending,
    linkTransaction: linkTransaction.mutateAsync,
  };
}

export interface InboundNfeXml {
  /**
   * XML completo — `null` quando a nota ainda é só resumo (resNFe), sem
   * manifestação de ciência: a SEFAZ não libera o XML até lá.
   */
  xml_content: string | null;
  resumo: boolean;
}

/**
 * XML completo de UMA NF-e, sob demanda — fora de `NFE_COLS` de propósito
 * (ver comentário acima): a lista não pode carregar N XMLs inteiros só pra
 * mostrar cartões. Usado por `LancarNotaDespesaDialog` pra ler o bloco
 * `<cobr>` (duplicatas/vencimentos) na hora de lançar a despesa.
 */
export function useInboundNfeXml(id: string | null) {
  return useQuery({
    queryKey: ['inbound-nfe-xml', id],
    enabled: !!id,
    queryFn: async (): Promise<InboundNfeXml | null> => {
      const { data, error } = await supabase
        .from('inbound_nfe' as any)
        .select('xml_content, resumo')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as InboundNfeXml) ?? null;
    },
  });
}

/** NFS-e RECEBIDAS (serviço TOMADO, emitidas CONTRA o CNPJ do cliente). Sem manifestação. */
export function useInboundNfse() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const listKey = ['inbound-nfse', companyId];
  const syncStateKey = ['dfe-sync-state', companyId, 'nfse'];

  const query = useQuery({
    queryKey: listKey,
    enabled: !!companyId,
    queryFn: async (): Promise<InboundNfse[]> => {
      const { data, error } = await supabase
        .from('inbound_nfse' as any)
        .select(NFSE_COLS)
        .order('data_emissao', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as InboundNfse[];
    },
  });

  const syncStateQuery = useQuery({
    queryKey: syncStateKey,
    enabled: !!companyId,
    queryFn: async (): Promise<DfeSyncState | null> => {
      const { data, error } = await supabase
        .from('dfe_sync_state' as any)
        .select(
          'tipo, ultimo_nsu, max_nsu, janela_fim, ultima_consulta_em, proxima_consulta_em, ultimo_cstat, ultimo_erro, documentos_ultimo_lote',
        )
        .eq('company_id', companyId!)
        .eq('tipo', 'nfse')
        .maybeSingle();
      if (error) throw error;
      return (data as unknown as DfeSyncState) ?? null;
    },
  });

  const sync = useMutation({
    mutationFn: async (): Promise<DfeSyncResult> =>
      invokeDfeFunction<DfeSyncResult>(
        'dfe-sync',
        { tipo: 'nfse' },
        'Não foi possível sincronizar as NFS-e agora. Tente de novo em instantes.',
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
      queryClient.invalidateQueries({ queryKey: syncStateKey });
    },
  });

  const linkTransaction = useMutation({
    mutationFn: async (input: {
      id: string;
      financial_transaction_id: string | null;
      supplier_id?: string | null;
    }) => {
      const payload: Record<string, unknown> = {
        financial_transaction_id: input.financial_transaction_id,
      };
      if (input.supplier_id !== undefined) payload.supplier_id = input.supplier_id;
      const { error } = await supabase.from('inbound_nfse' as any).update(payload).eq('id', input.id);
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível vincular a nota ao lançamento.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: listKey });
    },
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    syncState: syncStateQuery.data ?? null,
    sync: sync.mutateAsync,
    isSyncing: sync.isPending,
    linkTransaction: linkTransaction.mutateAsync,
  };
}

export interface DfeOptIn {
  dfe_nfe_ativo: boolean;
  dfe_nfse_ativo: boolean;
}

/**
 * Opt-in de recebimento automático (`dfe_nfe_ativo`/`dfe_nfse_ativo` em
 * `company_fiscal_settings`). Nasce desligado nos dois — ver migration
 * 20260924160000. Ligar é um UPDATE parcial (upsert por `company_id`, só a
 * coluna do tipo ligado entra no payload): o Supabase faz merge por coluna no
 * conflito, então as demais configurações fiscais da empresa não são tocadas.
 */
export function useDfeOptIn() {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['dfe-optin', companyId];

  const query = useQuery({
    queryKey,
    enabled: !!companyId,
    queryFn: async (): Promise<DfeOptIn> => {
      const cols = 'dfe_nfe_ativo, dfe_nfse_ativo';
      const { data, error } = await supabase
        .from('company_fiscal_settings')
        .select(cols)
        .eq('company_id', companyId!)
        .maybeSingle();
      if (error) throw error;
      const row = (data ?? {}) as unknown as Record<string, unknown>;
      return {
        dfe_nfe_ativo: !!row.dfe_nfe_ativo,
        dfe_nfse_ativo: !!row.dfe_nfse_ativo,
      };
    },
  });

  const activate = useMutation({
    mutationFn: async (tipo: 'nfe' | 'nfse') => {
      if (!companyId) throw new Error('Empresa não identificada.');
      const column = tipo === 'nfe' ? 'dfe_nfe_ativo' : 'dfe_nfse_ativo';
      const { error } = await supabase
        .from('company_fiscal_settings')
        .upsert({ company_id: companyId, [column]: true } as never, { onConflict: 'company_id' });
      if (error) throw new Error(getErrorMessage(error, 'Não foi possível ligar o recebimento automático agora.'));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    optIn: query.data ?? { dfe_nfe_ativo: false, dfe_nfse_ativo: false },
    isLoading: query.isLoading,
    activate: activate.mutateAsync,
    isActivating: activate.isPending,
  };
}
