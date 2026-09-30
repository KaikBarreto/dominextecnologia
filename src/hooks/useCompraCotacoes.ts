import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';
import type { CompraMaterial } from '@/hooks/useCompras';

export type CompraCotacao = Tables<'compra_cotacoes'>;
export type CompraCotacaoPreco = Tables<'compra_cotacao_precos'>;

export type CotacaoStatus = 'pendente' | 'aceita' | 'recusada';

/** Cotação enriquecida com nome do fornecedor e total calculado. */
export interface CotacaoRow extends CompraCotacao {
  supplier_name: string;
  total: number;
  /** Quantos materiais da compra já têm preço informado. */
  priced_count: number;
}

/** Preço de um material numa cotação (string do input, antes de gravar). */
export type PriceDraft = Record<string, string>; // compra_material_id → valor digitado

export function useCompraCotacoes(compraId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  // ---- Cotações de uma compra (com supplier + total) ----
  const listQuery = useQuery({
    queryKey: ['compra-cotacoes', compraId],
    enabled: !!compraId,
    queryFn: async (): Promise<CotacaoRow[]> => {
      if (!compraId) return [];
      const [cotsRes, matsRes, pricesRes, suppliersRes] = await Promise.all([
        supabase
          .from('compra_cotacoes')
          .select('*')
          .eq('compra_id', compraId)
          .order('created_at'),
        supabase.from('compra_materiais').select('id, quantity').eq('compra_id', compraId),
        supabase.from('compra_cotacao_precos').select('*'),
        supabase.from('suppliers').select('id, name'),
      ]);
      if (cotsRes.error) throw cotsRes.error;
      if (matsRes.error) throw matsRes.error;
      if (pricesRes.error) throw pricesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      const cots = (cotsRes.data ?? []) as CompraCotacao[];
      const mats = (matsRes.data ?? []) as Pick<CompraMaterial, 'id' | 'quantity'>[];
      const prices = (pricesRes.data ?? []) as CompraCotacaoPreco[];
      const qtyById = new Map<string, number>(mats.map((m) => [m.id, m.quantity]));
      const supplierName = new Map<string, string>(
        (suppliersRes.data ?? []).map((s) => [s.id, s.name]),
      );

      return cots.map((cot) => {
        const cotPrices = prices.filter((p) => p.cotacao_id === cot.id);
        const total = cotPrices.reduce(
          (acc, p) => acc + (qtyById.get(p.compra_material_id) ?? 0) * p.unit_price,
          0,
        );
        return {
          ...cot,
          supplier_name: supplierName.get(cot.supplier_id) ?? 'Fornecedor',
          total,
          priced_count: cotPrices.length,
        };
      });
    },
  });

  // ---- Criar cotação (uma por fornecedor — UNIQUE compra+supplier) ----
  const createCotacao = useMutation({
    mutationFn: async (supplierId: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      if (!compraId) throw new Error('Compra inválida.');
      const { data, error } = await supabase
        .from('compra_cotacoes')
        .insert({
          company_id: companyId,
          compra_id: compraId,
          supplier_id: supplierId,
          status: 'pendente',
        })
        .select()
        .single();
      if (error) throw error;
      return data as CompraCotacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes', compraId] });
      toast({ title: 'Cotação adicionada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Criar cotação + gravar preços de uma vez (fluxo do modal de nova cotação) ----
  const createCotacaoWithPrices = useMutation({
    mutationFn: async ({
      supplierId,
      prices,
    }: {
      supplierId: string;
      prices: { compra_material_id: string; unit_price: number }[];
    }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      if (!compraId) throw new Error('Compra inválida.');
      const { data: cot, error: cErr } = await supabase
        .from('compra_cotacoes')
        .insert({
          company_id: companyId,
          compra_id: compraId,
          supplier_id: supplierId,
          status: 'pendente',
        })
        .select()
        .single();
      if (cErr) throw cErr;
      const cotacao = cot as CompraCotacao;

      const valid = prices.filter((p) => p.unit_price > 0);
      if (valid.length > 0) {
        const { error: iErr } = await supabase.from('compra_cotacao_precos').insert(
          valid.map((p) => ({
            company_id: companyId,
            cotacao_id: cotacao.id,
            compra_material_id: p.compra_material_id,
            unit_price: p.unit_price,
          })),
        );
        if (iErr) throw iErr;
      }
      return cotacao;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes', compraId] });
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast({ title: 'Cotação criada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Carregar preços de uma cotação (compra_material_id → unit_price) ----
  const loadPrices = async (cotacaoId: string): Promise<CompraCotacaoPreco[]> => {
    const { data, error } = await supabase
      .from('compra_cotacao_precos')
      .select('*')
      .eq('cotacao_id', cotacaoId);
    if (error) throw error;
    return (data ?? []) as CompraCotacaoPreco[];
  };

  // ---- Salvar preços (replace: apaga e regrava só os > 0) ----
  const savePrices = useMutation({
    mutationFn: async ({
      cotacaoId,
      prices,
    }: {
      cotacaoId: string;
      prices: { compra_material_id: string; unit_price: number }[];
    }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      // Replace simples: apaga os preços atuais da cotação e regrava os válidos.
      const { error: dErr } = await supabase
        .from('compra_cotacao_precos')
        .delete()
        .eq('cotacao_id', cotacaoId);
      if (dErr) throw dErr;
      const valid = prices.filter((p) => p.unit_price > 0);
      if (valid.length > 0) {
        const { error: iErr } = await supabase.from('compra_cotacao_precos').insert(
          valid.map((p) => ({
            company_id: companyId,
            cotacao_id: cotacaoId,
            compra_material_id: p.compra_material_id,
            unit_price: p.unit_price,
          })),
        );
        if (iErr) throw iErr;
      }
      // Toca a cotação pra atualizar updated_at.
      await supabase
        .from('compra_cotacoes')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', cotacaoId);
      return { cotacaoId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes', compraId] });
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast({ title: 'Preços salvos!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar preços', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Aceitar / Recusar (não mexe em outras cotações nem no estoque) ----
  const decideCotacao = useMutation({
    mutationFn: async ({ cotacaoId, status }: { cotacaoId: string; status: CotacaoStatus }) => {
      const { error } = await supabase
        .from('compra_cotacoes')
        .update({
          status,
          decided_at: status === 'pendente' ? null : new Date().toISOString(),
        })
        .eq('id', cotacaoId);
      if (error) throw error;
      return { cotacaoId, status };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes', compraId] });
      const labels: Record<CotacaoStatus, string> = {
        aceita: 'Cotação aceita!',
        recusada: 'Cotação recusada.',
        pendente: 'Cotação reaberta.',
      };
      toast({ title: labels[res.status] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao decidir cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Excluir cotação (CASCADE remove os preços) ----
  const deleteCotacao = useMutation({
    mutationFn: async (cotacaoId: string) => {
      const { error } = await supabase.from('compra_cotacoes').delete().eq('id', cotacaoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['compra-cotacoes', compraId] });
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      toast({ title: 'Cotação removida.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- NÃO EXISTE MAIS: registerStockEntry ----------------------------------
  // Tinha um "Registrar entrada no estoque" aqui, na cotação aceita, que dava
  // entrada de TUDO de uma vez e sem local de destino (caía sempre no estoque
  // principal, furando o multi-local).
  //
  // Foi REMOVIDO de propósito: com a Ordem de Compra, existiria uma SEGUNDA
  // porta de entrada e dava pra duplicar saldo (receber pela O.C. e ainda clicar
  // no botão antigo). O índice único do banco não cobre esse caso, ele só impede
  // duas O.C. em aberto pro mesmo fornecedor.
  //
  // A entrada no estoque agora é EXCLUSIVA do recebimento da O.C.:
  // `useCompraOrdens().receber` → RPC `receber_ordem_compra` (atômica, respeita
  // `compras.stock_id`). Não ressuscite este atalho.
  // ---------------------------------------------------------------------------

  return {
    cotacoes: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    createCotacao,
    createCotacaoWithPrices,
    loadPrices,
    savePrices,
    decideCotacao,
    deleteCotacao,
  };
}
