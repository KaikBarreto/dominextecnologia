import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import type { Json, Tables } from '@/integrations/supabase/types';

/**
 * FRONTEIRA SUPABASE do consumo de materiais dentro da OS (v1.22.0).
 *
 * Regra-lei do projeto: componente nunca chama `supabase.from(...)` direto.
 * Todo acesso a `service_order_materials` e à RPC de confirmação passa por aqui.
 *
 * DOIS TEMPOS (decisão do CEO):
 *   1. RASCUNHO — enquanto preenche a OS, o técnico lança material. NÃO mexe no
 *      estoque, é só linha em `service_order_materials`.
 *   2. COMMIT — ao FINALIZAR, `commit_os_material_consumption` sincroniza o
 *      rascunho com o payload E movimenta o estoque (tipo 'consumo'/'estorno').
 *
 * IDEMPOTÊNCIA (armadilha do contrato):
 *   A RPC aceita linha com `id: null` (cria na hora), mas isso NÃO é idempotente:
 *   reenviar o mesmo payload duplicaria o lançamento. Por isso este hook NUNCA
 *   manda `id: null` — todo lançamento nasce com uuid GERADO NO CLIENT
 *   (regra-lei do PWA: "IDs gerados no client, retry seguro") e é inserido com
 *   esse id explícito. Retry de INSERT com o mesmo id volta 23505 (chave
 *   duplicada) = já está lá, tratado como sucesso.
 *
 * OFFLINE (mitigação, não solução):
 *   A tela do técnico não tem fila offline. O que este hook faz é não deixar o
 *   técnico PERDER o que digitou: lançamento que falha por rede vai pro
 *   localStorage (`pendingLines`) e é reenviado ao voltar a conexão / ao abrir
 *   o resumo. Nada é prometido além disso na copy.
 */

export type OsMaterialRow = Tables<'service_order_materials'>;

export interface OsMaterialLine extends OsMaterialRow {
  /** Material resolvido em lote por inventory_id. */
  material: { name: string; sku: string | null; unit: string | null } | null;
  /** Local de estoque resolvido em lote por stock_id. */
  stock: { name: string } | null;
  /** true = ainda só no aparelho (o envio falhou por rede). */
  pending: boolean;
}

/** Linha guardada no aparelho quando o INSERT falha (sem conexão). */
interface PendingOsMaterial {
  /** uuid gerado no client — vira o PK da linha quando o envio der certo. */
  id: string;
  service_order_id: string;
  inventory_id: string;
  stock_id: string;
  quantity: number;
  notes: string | null;
  created_at: string;
}

/** Estado final COMPLETO de uma linha, do jeito que a RPC espera. */
export interface CommitLineInput {
  id: string;
  inventory_id: string;
  stock_id: string;
  quantity: number;
  notes?: string | null;
}

export interface CommitMovement {
  line_id: string;
  inventory_id: string;
  stock_id: string;
  movement_id: string;
  movement_type: 'consumo' | 'estorno';
  quantity: number;
  stock_after: number;
}

export interface CommitWarning {
  line_id: string;
  inventory_id: string;
  stock_id: string;
  resulting_quantity: number;
  reason: string;
}

export interface CommitResult {
  committed: CommitMovement[];
  warnings: CommitWarning[];
}

/** Rascunho do resumo de finalização (quantidades editadas + linhas removidas). */
export interface OsMaterialsSummaryDraft {
  quantities: Record<string, string>;
  removed: string[];
}

const PENDING_PREFIX = 'dominex.osMaterials.pending.';
const SUMMARY_PREFIX = 'dominex.osMaterials.summary.';
/** Último local de estoque usado pelo técnico (pré-seleção do dialog). */
export const LAST_STOCK_KEY = 'dominex.osMaterials.lastStock';

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  // Fallback (WebView antigo sem crypto.randomUUID): uuid v4 na unha.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function readPending(osId: string): PendingOsMaterial[] {
  try {
    const raw = localStorage.getItem(PENDING_PREFIX + osId);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingOsMaterial[]) : [];
  } catch {
    return [];
  }
}

function writePending(osId: string, rows: PendingOsMaterial[]) {
  try {
    if (rows.length === 0) localStorage.removeItem(PENDING_PREFIX + osId);
    else localStorage.setItem(PENDING_PREFIX + osId, JSON.stringify(rows));
  } catch {
    /* aparelho sem localStorage: o lançamento simplesmente não é guardado */
  }
}

export function readSummaryDraft(osId: string): OsMaterialsSummaryDraft | null {
  try {
    const raw = localStorage.getItem(SUMMARY_PREFIX + osId);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OsMaterialsSummaryDraft>;
    return {
      quantities: parsed.quantities ?? {},
      removed: Array.isArray(parsed.removed) ? parsed.removed : [],
    };
  } catch {
    return null;
  }
}

export function writeSummaryDraft(osId: string, draft: OsMaterialsSummaryDraft) {
  try {
    localStorage.setItem(SUMMARY_PREFIX + osId, JSON.stringify(draft));
  } catch {
    /* sem localStorage: segue só em memória */
  }
}

export function clearSummaryDraft(osId: string) {
  try {
    localStorage.removeItem(SUMMARY_PREFIX + osId);
  } catch {
    /* noop */
  }
}

/** Erro de rede (offline / servidor inalcançável) vs. erro de regra do banco. */
function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = (err as { message?: string } | null)?.message ?? '';
  return /failed to fetch|network|networkerror|load failed|timeout/i.test(msg);
}

/**
 * Toggle da empresa (`company_settings.os_stock_consumption_enabled`).
 * Lido com cast local de propósito: a UI do toggle é de outro Dev e o campo
 * pode ainda não estar declarado na interface `CompanySettings`.
 */
export function useOsStockConsumptionEnabled(): boolean {
  const { settings } = useCompanySettings();
  return (settings as { os_stock_consumption_enabled?: boolean | null } | null)
    ?.os_stock_consumption_enabled === true;
}

export function useOsMaterials(serviceOrderId?: string | null) {
  const queryClient = useQueryClient();
  const osId = serviceOrderId ?? null;

  // Linhas que falharam no envio e vivem no aparelho. Estado espelhado do
  // localStorage pra a lista re-renderizar quando a fila muda.
  const [pending, setPending] = useState<PendingOsMaterial[]>(() =>
    osId ? readPending(osId) : [],
  );

  useEffect(() => {
    setPending(osId ? readPending(osId) : []);
  }, [osId]);

  const persistPending = useCallback(
    (rows: PendingOsMaterial[]) => {
      if (!osId) return;
      writePending(osId, rows);
      setPending(rows);
    },
    [osId],
  );

  const query = useQuery({
    queryKey: ['os-materials', osId],
    enabled: !!osId,
    queryFn: async (): Promise<OsMaterialLine[]> => {
      const { data, error } = await supabase
        .from('service_order_materials')
        .select('*')
        .eq('service_order_id', osId!)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = (data ?? []) as OsMaterialRow[];
      if (rows.length === 0) return [];

      // Joins resolvidos em LOTE (nada de N+1 por linha).
      const inventoryIds = [...new Set(rows.map((r) => r.inventory_id))];
      const materialMap = new Map<string, { name: string; sku: string | null; unit: string | null }>();
      if (inventoryIds.length > 0) {
        const { data: invRows } = await supabase
          .from('inventory')
          .select('id, name, sku, unit')
          .in('id', inventoryIds);
        (invRows ?? []).forEach((i) => {
          materialMap.set(i.id, { name: i.name, sku: i.sku ?? null, unit: i.unit ?? null });
        });
      }

      const stockIds = [...new Set(rows.map((r) => r.stock_id))];
      const stockMap = new Map<string, { name: string }>();
      if (stockIds.length > 0) {
        const { data: stockRows } = await supabase
          .from('stocks')
          .select('id, name')
          .in('id', stockIds);
        (stockRows ?? []).forEach((s) => stockMap.set(s.id, { name: s.name }));
      }

      return rows.map((r) => ({
        ...r,
        material: materialMap.get(r.inventory_id) ?? null,
        stock: stockMap.get(r.stock_id) ?? null,
        pending: false,
      }));
    },
  });

  const savedLines = useMemo(() => query.data ?? [], [query.data]);

  // Linhas pendentes viram OsMaterialLine "de mentira" só pra renderizar junto —
  // com `pending: true`, que a UI usa pra mostrar "Aguardando envio".
  const pendingLines = useMemo<OsMaterialLine[]>(
    () =>
      pending.map((p) => ({
        id: p.id,
        company_id: '',
        service_order_id: p.service_order_id,
        inventory_id: p.inventory_id,
        stock_id: p.stock_id,
        quantity: p.quantity,
        committed_quantity: 0,
        unit_cost: null,
        notes: p.notes,
        created_by: null,
        created_at: p.created_at,
        updated_at: p.created_at,
        material: null,
        stock: null,
        pending: true,
      })),
    [pending],
  );

  /** Tudo que o técnico lançou nesta OS: o que está no banco + o que ficou no aparelho. */
  const lines = useMemo(() => [...savedLines, ...pendingLines], [savedLines, pendingLines]);

  const invalidateAfterCommit = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['os-materials', osId] });
    queryClient.invalidateQueries({ queryKey: ['inventory'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
  }, [queryClient, osId]);

  /**
   * INSERT com id explícito (gerado no client). Chave duplicada (23505) =
   * a linha já entrou numa tentativa anterior → sucesso, não erro.
   */
  const insertLine = useCallback(async (row: PendingOsMaterial) => {
    const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
    const companyId = await getCurrentUserCompanyId();
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await supabase.from('service_order_materials').insert({
      id: row.id,
      company_id: companyId,
      service_order_id: row.service_order_id,
      inventory_id: row.inventory_id,
      stock_id: row.stock_id,
      quantity: row.quantity,
      notes: row.notes,
      created_by: auth.user?.id ?? null,
    });
    if (error && error.code !== '23505') throw error;
  }, []);

  /**
   * Anota um material. Se o envio falhar por REDE, guarda no aparelho e devolve
   * `queued: true` (a tela avisa o técnico com todas as letras).
   * Erro de regra (permissão, material de outra empresa) sobe como exceção.
   */
  const addMaterial = useCallback(
    async (input: {
      inventoryId: string;
      stockId: string;
      quantity: number;
      notes?: string | null;
    }): Promise<{ id: string; queued: boolean }> => {
      if (!osId) throw new Error('Ordem de serviço não identificada.');
      const row: PendingOsMaterial = {
        id: newId(),
        service_order_id: osId,
        inventory_id: input.inventoryId,
        stock_id: input.stockId,
        quantity: input.quantity,
        notes: input.notes?.trim() ? input.notes.trim() : null,
        created_at: new Date().toISOString(),
      };
      try {
        await insertLine(row);
        await queryClient.invalidateQueries({ queryKey: ['os-materials', osId] });
        return { id: row.id, queued: false };
      } catch (err) {
        if (isNetworkError(err)) {
          persistPending([...readPending(osId), row]);
          return { id: row.id, queued: true };
        }
        throw err;
      }
    },
    [osId, insertLine, persistPending, queryClient],
  );

  /** Edita quantidade/observação de uma linha (rascunho ou pendente). */
  const updateMaterial = useCallback(
    async (input: {
      id: string;
      quantity: number;
      notes?: string | null;
      inventoryId?: string;
      stockId?: string;
    }) => {
      if (!osId) return;
      const notes = input.notes?.trim() ? input.notes.trim() : null;

      const local = readPending(osId);
      const localIdx = local.findIndex((p) => p.id === input.id);
      if (localIdx >= 0) {
        const next = [...local];
        next[localIdx] = {
          ...next[localIdx],
          quantity: input.quantity,
          notes,
          inventory_id: input.inventoryId ?? next[localIdx].inventory_id,
          stock_id: input.stockId ?? next[localIdx].stock_id,
        };
        persistPending(next);
        return;
      }

      const patch: Partial<OsMaterialRow> = { quantity: input.quantity, notes };
      if (input.inventoryId) patch.inventory_id = input.inventoryId;
      if (input.stockId) patch.stock_id = input.stockId;
      const { error } = await supabase
        .from('service_order_materials')
        .update(patch)
        .eq('id', input.id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['os-materials', osId] });
    },
    [osId, persistPending, queryClient],
  );

  /**
   * Remove uma linha do rascunho. Linha JÁ baixada no estoque
   * (committed_quantity > 0) não deve ser apagada por aqui: quem estorna é a
   * RPC, quando a linha não vem no payload do resumo.
   */
  const removeMaterial = useCallback(
    async (id: string) => {
      if (!osId) return;
      const local = readPending(osId);
      if (local.some((p) => p.id === id)) {
        persistPending(local.filter((p) => p.id !== id));
        return;
      }
      const { error } = await supabase.from('service_order_materials').delete().eq('id', id);
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: ['os-materials', osId] });
    },
    [osId, persistPending, queryClient],
  );

  /**
   * Tenta enviar o que ficou no aparelho. Devolve o que subiu e o que continua
   * preso. Chamado ao voltar a conexão, ao abrir o dialog e antes do resumo.
   */
  const flushPending = useCallback(async (): Promise<{
    flushed: PendingOsMaterial[];
    failed: PendingOsMaterial[];
  }> => {
    if (!osId) return { flushed: [], failed: [] };
    const queue = readPending(osId);
    if (queue.length === 0) return { flushed: [], failed: [] };

    const flushed: PendingOsMaterial[] = [];
    const failed: PendingOsMaterial[] = [];
    for (const row of queue) {
      try {
        await insertLine(row);
        flushed.push(row);
      } catch {
        failed.push(row);
      }
    }
    persistPending(failed);
    if (flushed.length > 0) {
      await queryClient.invalidateQueries({ queryKey: ['os-materials', osId] });
    }
    return { flushed, failed };
  }, [osId, insertLine, persistPending, queryClient]);

  // Reenvio automático quando a internet volta.
  const flushRef = useRef(flushPending);
  flushRef.current = flushPending;
  useEffect(() => {
    if (!osId) return;
    const onOnline = () => { void flushRef.current(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [osId]);

  /**
   * Confirma o consumo: manda o ESTADO FINAL COMPLETO do resumo. Linha que
   * existe no banco e não vem no payload é estornada e apagada pela RPC.
   * Todas as linhas vão COM id (nunca `id: null`) — ver nota de idempotência
   * no topo do arquivo.
   */
  const commitMutation = useMutation({
    mutationFn: async (payload: CommitLineInput[]): Promise<CommitResult> => {
      if (!osId) throw new Error('Ordem de serviço não identificada.');
      const { data, error } = await supabase.rpc('commit_os_material_consumption', {
        p_service_order_id: osId,
        p_lines: payload as unknown as Json,
      });
      if (error) throw error;
      const result = (data ?? {}) as unknown as Partial<CommitResult>;
      return {
        committed: result.committed ?? [],
        warnings: result.warnings ?? [],
      };
    },
    // Invalida também no ERRO: se a resposta se perdeu na volta, o servidor pode
    // ter gravado. Refazer o fetch antes de qualquer novo envio é a regra.
    onSettled: () => invalidateAfterCommit(),
  });

  const commitConsumption = useCallback(
    (payload: CommitLineInput[]) => commitMutation.mutateAsync(payload),
    [commitMutation],
  );

  return {
    /** Rascunho + pendentes do aparelho, na ordem de lançamento. */
    lines,
    /** Só o que já está no banco (base do payload de commit). */
    savedLines,
    /** Só o que ficou preso no aparelho. */
    pendingLines,
    isLoading: query.isLoading,
    isFetched: query.isFetched,
    error: query.error,
    refetch: query.refetch,
    addMaterial,
    updateMaterial,
    removeMaterial,
    flushPending,
    commitConsumption,
    isCommitting: commitMutation.isPending,
  };
}
