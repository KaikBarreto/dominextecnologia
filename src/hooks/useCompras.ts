import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type Compra = Tables<'compras'>;
export type CompraMaterial = Tables<'compra_materiais'>;

export type CompraStatus = 'aberta' | 'concluida' | 'cancelada';

/** Linha enriquecida para a listagem (nº de cotações + menor total disponível). */
export interface CompraListRow extends Compra {
  cotacao_count: number;
  /** Menor total entre as cotações da compra; null se nenhuma cotação tem preço. */
  lowest_total: number | null;
}

/**
 * Material da compra no client (draft). `inventory_id` preenchido = item do
 * estoque; null = material manual (precisa de `material_name`).
 */
export interface CompraMaterialDraft {
  inventory_id: string | null;
  material_name: string;
  unit: string;
  quantity: number;
}

/** Payload pra criar/editar a compra (cabeçalho + materiais). */
export interface SaveCompraInput {
  title: string;
  notes?: string | null;
  materials: CompraMaterialDraft[];
}

export function useCompras() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;

  // ---- Listagem (compras + agregados de cotações) ----
  const listQuery = useQuery({
    queryKey: ['compras', companyId],
    queryFn: async (): Promise<CompraListRow[]> => {
      const { data: rows, error } = await supabase
        .from('compras')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const compras = (rows ?? []) as Compra[];
      if (compras.length === 0) return [];

      const ids = compras.map((c) => c.id);

      // Carrega materiais, cotações e preços de todas as compras de uma vez.
      const [matsRes, cotsRes, pricesRes] = await Promise.all([
        supabase.from('compra_materiais').select('*').in('compra_id', ids),
        supabase.from('compra_cotacoes').select('*').in('compra_id', ids),
        supabase.from('compra_cotacao_precos').select('*').in('company_id', companyId ? [companyId] : []),
      ]);
      if (matsRes.error) throw matsRes.error;
      if (cotsRes.error) throw cotsRes.error;
      if (pricesRes.error) throw pricesRes.error;

      const mats = (matsRes.data ?? []) as CompraMaterial[];
      const cots = (cotsRes.data ?? []) as Tables<'compra_cotacoes'>[];
      const prices = (pricesRes.data ?? []) as Tables<'compra_cotacao_precos'>[];

      const qtyByMaterial = new Map<string, number>(mats.map((m) => [m.id, m.quantity]));

      return compras.map((c) => {
        const cCots = cots.filter((q) => q.compra_id === c.id);
        let lowest: number | null = null;
        for (const cot of cCots) {
          const cotPrices = prices.filter((p) => p.cotacao_id === cot.id);
          if (cotPrices.length === 0) continue;
          const total = cotPrices.reduce(
            (acc, p) => acc + (qtyByMaterial.get(p.compra_material_id) ?? 0) * p.unit_price,
            0,
          );
          if (total > 0 && (lowest === null || total < lowest)) lowest = total;
        }
        return { ...c, cotacao_count: cCots.length, lowest_total: lowest };
      });
    },
  });

  // ---- Carregar uma compra com seus materiais ----
  const loadCompra = async (
    compraId: string,
  ): Promise<{ compra: Compra; materials: CompraMaterial[] }> => {
    const [headerRes, matsRes] = await Promise.all([
      supabase.from('compras').select('*').eq('id', compraId).single(),
      supabase
        .from('compra_materiais')
        .select('*')
        .eq('compra_id', compraId)
        .order('created_at'),
    ]);
    if (headerRes.error) throw headerRes.error;
    if (matsRes.error) throw matsRes.error;
    return {
      compra: headerRes.data as Compra,
      materials: (matsRes.data ?? []) as CompraMaterial[],
    };
  };

  // ---- Criar compra (cabeçalho + materiais) ----
  const createCompra = useMutation({
    mutationFn: async (input: SaveCompraInput) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      const { data: header, error: hErr } = await supabase
        .from('compras')
        .insert({
          company_id: companyId,
          created_by: user?.id ?? null,
          status: 'aberta',
          title: input.title.trim(),
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (hErr) throw hErr;
      await writeMaterials(companyId, header.id, input.materials);
      return header as Compra;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast({ title: 'Compra criada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar compra', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Editar compra (regrava os materiais inteiros) ----
  // Os preços (compra_cotacao_precos) referenciam compra_material_id, então
  // só apagamos materiais quando não há cotações em jogo; aqui a edição da
  // compra é destrutiva por design (mexer nos materiais reseta as cotações via
  // CASCADE de compra_materiais → compra_cotacao_precos no banco).
  const updateCompra = useMutation({
    mutationFn: async ({ id, ...input }: SaveCompraInput & { id: string }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      const { error: uErr } = await supabase
        .from('compras')
        .update({ title: input.title.trim(), notes: input.notes ?? null })
        .eq('id', id);
      if (uErr) throw uErr;
      const { error: dErr } = await supabase
        .from('compra_materiais')
        .delete()
        .eq('compra_id', id);
      if (dErr) throw dErr;
      await writeMaterials(companyId, id, input.materials);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes'] });
      toast({ title: 'Compra atualizada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar compra', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Mudar status (concluir / cancelar / reabrir) ----
  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CompraStatus }) => {
      const { error } = await supabase.from('compras').update({ status }).eq('id', id);
      if (error) throw error;
      return { id, status };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      const labels: Record<CompraStatus, string> = {
        aberta: 'Compra reaberta.',
        concluida: 'Compra concluída.',
        cancelada: 'Compra cancelada.',
      };
      toast({ title: labels[res.status] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao mudar status', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Excluir compra (CASCADE remove materiais, cotações e preços) ----
  const deleteCompra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast({ title: 'Compra excluída.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir compra', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    compras: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    loadCompra,
    createCompra,
    updateCompra,
    setStatus,
    deleteCompra,
  };
}

// ---- Helpers ----

/** Grava os materiais da compra. `company_id` obrigatório (RLS bloqueia sem ele). */
async function writeMaterials(
  companyId: string,
  compraId: string,
  materials: CompraMaterialDraft[],
) {
  if (materials.length === 0) return;
  const { error } = await supabase.from('compra_materiais').insert(
    materials.map((m) => ({
      company_id: companyId,
      compra_id: compraId,
      inventory_id: m.inventory_id,
      material_name: m.inventory_id ? m.material_name || null : m.material_name,
      unit: m.unit,
      quantity: m.quantity,
    })),
  );
  if (error) throw error;
}
