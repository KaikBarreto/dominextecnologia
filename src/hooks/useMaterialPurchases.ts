import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import type { Tables } from '@/integrations/supabase/types';
import { getErrorMessage } from '@/utils/errorMessages';

export type MaterialPurchase = Tables<'material_purchases'>;
export type MaterialPurchaseItem = Tables<'material_purchase_items'>;
export type MaterialPurchaseSupplier = Tables<'material_purchase_suppliers'>;
export type MaterialPurchaseQuote = Tables<'material_purchase_quotes'>;

export type PurchaseStatus = 'rascunho' | 'aprovada' | 'cancelada';

/** Cabeçalho enriquecido para a listagem (com nome do fornecedor aprovado + total). */
export interface PurchaseListRow extends MaterialPurchase {
  approved_supplier_name: string | null;
  approved_total: number | null;
  item_count: number;
}

/** Cotação completa carregada para edição/comparação. */
export interface PurchaseDetail {
  purchase: MaterialPurchase;
  items: MaterialPurchaseItem[];
  suppliers: MaterialPurchaseSupplier[];
  quotes: MaterialPurchaseQuote[];
}

/**
 * Payload de uma linha de material da cotação.
 * - Do estoque: `inventory_id` preenchido (+ snapshot em material_name/unit).
 * - Manual: `inventory_id` null, `material_name` obrigatório.
 * O `key` é um id estável usado no client pra amarrar as cotações de preço
 * a este item antes mesmo de ele ter id no banco.
 */
export interface DraftItem {
  key: string;
  inventory_id: string | null;
  material_name: string;
  unit: string;
  quantity: number;
}

/** Payload de um preço (fornecedor × item), keado pelo `key` do DraftItem. */
export interface DraftQuote {
  supplier_id: string;
  item_key: string;
  unit_price: number;
}

/** Payload completo pra criar/atualizar uma cotação. */
export interface SavePurchaseInput {
  notes?: string | null;
  items: DraftItem[];
  supplier_ids: string[];
  quotes: DraftQuote[];
}

export function useMaterialPurchases() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;

  // ---- Listagem (cabeçalhos + agregados pra exibir total e fornecedor) ----
  const listQuery = useQuery({
    queryKey: ['material-purchases', companyId],
    queryFn: async (): Promise<PurchaseListRow[]> => {
      const { data: headers, error: hErr } = await supabase
        .from('material_purchases')
        .select('*')
        .order('created_at', { ascending: false });
      if (hErr) throw hErr;
      const purchases = (headers ?? []) as MaterialPurchase[];
      if (purchases.length === 0) return [];

      const ids = purchases.map((p) => p.id);

      // Carrega items, quotes e fornecedores de todas as cotações de uma vez.
      const [itemsRes, quotesRes, suppliersRes] = await Promise.all([
        supabase.from('material_purchase_items').select('*').in('purchase_id', ids),
        supabase.from('material_purchase_quotes').select('*').in('purchase_id', ids),
        supabase.from('suppliers').select('id, name'),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      if (quotesRes.error) throw quotesRes.error;
      if (suppliersRes.error) throw suppliersRes.error;

      const items = (itemsRes.data ?? []) as MaterialPurchaseItem[];
      const quotes = (quotesRes.data ?? []) as MaterialPurchaseQuote[];
      const supplierNameById = new Map<string, string>(
        (suppliersRes.data ?? []).map((s) => [s.id, s.name]),
      );

      return purchases.map((p) => {
        const pItems = items.filter((i) => i.purchase_id === p.id);
        let approvedTotal: number | null = null;
        if (p.approved_supplier_id) {
          approvedTotal = computeSupplierTotal(
            p.approved_supplier_id,
            pItems,
            quotes.filter((q) => q.purchase_id === p.id),
          );
        }
        return {
          ...p,
          approved_supplier_name: p.approved_supplier_id
            ? supplierNameById.get(p.approved_supplier_id) ?? null
            : null,
          approved_total: approvedTotal,
          item_count: pItems.length,
        };
      });
    },
  });

  // ---- Carregar uma cotação completa (lazy, por id) ----
  const loadPurchase = async (purchaseId: string): Promise<PurchaseDetail> => {
    const [headerRes, itemsRes, suppliersRes, quotesRes] = await Promise.all([
      supabase.from('material_purchases').select('*').eq('id', purchaseId).single(),
      supabase.from('material_purchase_items').select('*').eq('purchase_id', purchaseId),
      supabase.from('material_purchase_suppliers').select('*').eq('purchase_id', purchaseId),
      supabase.from('material_purchase_quotes').select('*').eq('purchase_id', purchaseId),
    ]);
    if (headerRes.error) throw headerRes.error;
    if (itemsRes.error) throw itemsRes.error;
    if (suppliersRes.error) throw suppliersRes.error;
    if (quotesRes.error) throw quotesRes.error;
    return {
      purchase: headerRes.data as MaterialPurchase,
      items: (itemsRes.data ?? []) as MaterialPurchaseItem[],
      suppliers: (suppliersRes.data ?? []) as MaterialPurchaseSupplier[],
      quotes: (quotesRes.data ?? []) as MaterialPurchaseQuote[],
    };
  };

  // ---- Criar cotação completa (cabeçalho + items + suppliers + quotes) ----
  const createPurchase = useMutation({
    mutationFn: async (input: SavePurchaseInput) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');

      const { data: header, error: hErr } = await supabase
        .from('material_purchases')
        .insert({
          company_id: companyId,
          created_by: user?.id ?? null,
          status: 'rascunho',
          notes: input.notes ?? null,
        })
        .select()
        .single();
      if (hErr) throw hErr;

      await writeChildren(companyId, header.id, input);
      return header as MaterialPurchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação salva!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao salvar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Atualizar cotação (substitui items/suppliers/quotes pelos novos) ----
  const updatePurchase = useMutation({
    mutationFn: async ({ id, ...input }: SavePurchaseInput & { id: string }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');

      const { error: uErr } = await supabase
        .from('material_purchases')
        .update({ notes: input.notes ?? null })
        .eq('id', id);
      if (uErr) throw uErr;

      // Estratégia simples: apaga os filhos e regrava (cotação é editada inteira).
      // Quotes saem primeiro por causa da FK em purchase_item_id.
      const { error: qDelErr } = await supabase
        .from('material_purchase_quotes').delete().eq('purchase_id', id);
      if (qDelErr) throw qDelErr;
      await Promise.all([
        supabase.from('material_purchase_items').delete().eq('purchase_id', id),
        supabase.from('material_purchase_suppliers').delete().eq('purchase_id', id),
      ]);
      await writeChildren(companyId, id, input);
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação atualizada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Aprovar (grava fornecedor escolhido; NÃO mexe no estoque) ----
  const approvePurchase = useMutation({
    mutationFn: async ({ id, supplierId }: { id: string; supplierId: string }) => {
      const { error } = await supabase
        .from('material_purchases')
        .update({
          approved_supplier_id: supplierId,
          status: 'aprovada',
          approved_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação aprovada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao aprovar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Cancelar (mantém o registro, marca status) ----
  const cancelPurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('material_purchases')
        .update({ status: 'cancelada' })
        .eq('id', id);
      if (error) throw error;
      return { id };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação cancelada.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao cancelar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Duplicar (clona itens/fornecedores/preços numa nova rascunho) ----
  const duplicatePurchase = useMutation({
    mutationFn: async (sourceId: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      const detail = await loadPurchase(sourceId);

      const { data: header, error: hErr } = await supabase
        .from('material_purchases')
        .insert({
          company_id: companyId,
          created_by: user?.id ?? null,
          status: 'rascunho',
          notes: detail.purchase.notes ?? null,
        })
        .select()
        .single();
      if (hErr) throw hErr;

      // Reconstrói o payload do detalhe carregado, reusando os ids originais como `key`.
      const input: SavePurchaseInput = {
        notes: detail.purchase.notes ?? null,
        items: detail.items.map((i) => ({
          key: i.id,
          inventory_id: i.inventory_id,
          material_name: i.material_name ?? '',
          unit: i.unit ?? 'un',
          quantity: i.quantity,
        })),
        supplier_ids: detail.suppliers.map((s) => s.supplier_id),
        quotes: detail.quotes.map((q) => ({
          supplier_id: q.supplier_id,
          item_key: q.purchase_item_id,
          unit_price: q.unit_price,
        })),
      };
      await writeChildren(companyId, header.id, input);
      return header as MaterialPurchase;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação duplicada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao duplicar cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Excluir cotação (CASCADE remove os filhos) ----
  const deletePurchase = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('material_purchases')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: 'Cotação excluída.' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao excluir cotação', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  // ---- Registrar entrada no estoque (em cotação aprovada) ----
  // Item do estoque → entrada direta via RPC.
  // Item manual → cria primeiro no estoque (quantity 0) e então dá a entrada via RPC.
  const registerStockEntry = useMutation({
    mutationFn: async (purchaseId: string) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      const detail = await loadPurchase(purchaseId);
      const { purchase, items, quotes } = detail;
      if (purchase.status !== 'aprovada' || !purchase.approved_supplier_id) {
        throw new Error('Só é possível registrar entrada de uma cotação aprovada.');
      }
      const supplierId = purchase.approved_supplier_id;
      let count = 0;

      for (const item of items) {
        const quote = quotes.find(
          (q) => q.supplier_id === supplierId && q.purchase_item_id === item.id,
        );
        const unitCost = quote?.unit_price ?? undefined;
        let inventoryId = item.inventory_id;

        // Item manual: precisa existir no estoque antes da entrada.
        if (!inventoryId) {
          const { data: created, error: cErr } = await supabase
            .from('inventory')
            .insert({
              company_id: companyId,
              name: item.material_name ?? 'Material',
              unit: item.unit ?? 'un',
              cost_price: unitCost ?? 0,
              quantity: 0,
            })
            .select('id')
            .single();
          if (cErr) throw cErr;
          inventoryId = created.id;
          // Rastreio: liga o item da cotação ao novo item de estoque.
          await supabase
            .from('material_purchase_items')
            .update({ inventory_id: inventoryId })
            .eq('id', item.id);
        }

        const { error } = await supabase.rpc('register_inventory_movement', {
          p_inventory_id: inventoryId,
          p_movement_type: 'entrada',
          p_quantity: Math.abs(item.quantity),
          p_supplier_id: supplierId,
          p_unit_cost: unitCost,
          p_notes: `Entrada da cotação #${shortId(purchase.id)}`,
        });
        if (error) throw error;
        count += 1;
      }
      return { id: purchaseId, count };
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['material-purchases'] });
      toast({ title: `Entrada registrada (${res.count} ${res.count === 1 ? 'item' : 'itens'}).` });
    },
    onError: (error) => {
      toast({ title: 'Erro ao registrar entrada', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    purchases: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    error: listQuery.error,
    loadPurchase,
    createPurchase,
    updatePurchase,
    approvePurchase,
    cancelPurchase,
    duplicatePurchase,
    deletePurchase,
    registerStockEntry,
  };
}

// ---- Helpers compartilhados ----

/**
 * Grava items, fornecedores participantes e preços de uma cotação.
 * Os items são inseridos primeiro pra resolver os ids reais; as quotes
 * usam o mapa `item_key` (do DraftItem) → id real do item.
 */
async function writeChildren(companyId: string, purchaseId: string, input: SavePurchaseInput) {
  // 1. Items — guarda o mapa key → id real pra amarrar as quotes.
  const keyToId = new Map<string, string>();
  if (input.items.length > 0) {
    const { data: insertedItems, error } = await supabase
      .from('material_purchase_items')
      .insert(
        input.items.map((i) => ({
          company_id: companyId,
          purchase_id: purchaseId,
          inventory_id: i.inventory_id,
          material_name: i.material_name,
          unit: i.unit,
          quantity: i.quantity,
        })),
      )
      .select('id');
    if (error) throw error;
    (insertedItems ?? []).forEach((row, idx) => {
      const draft = input.items[idx];
      if (draft) keyToId.set(draft.key, row.id);
    });
  }

  // 2. Fornecedores participantes.
  if (input.supplier_ids.length > 0) {
    const { error } = await supabase.from('material_purchase_suppliers').insert(
      input.supplier_ids.map((sid) => ({
        company_id: companyId,
        purchase_id: purchaseId,
        supplier_id: sid,
      })),
    );
    if (error) throw error;
  }

  // 3. Preços — só grava > 0 e que tenha item resolvido (célula vazia = sem cotação).
  const validQuotes = input.quotes
    .filter((q) => q.unit_price > 0 && keyToId.has(q.item_key))
    .map((q) => ({
      company_id: companyId,
      purchase_id: purchaseId,
      supplier_id: q.supplier_id,
      purchase_item_id: keyToId.get(q.item_key)!,
      unit_price: q.unit_price,
    }));
  if (validQuotes.length > 0) {
    const { error } = await supabase.from('material_purchase_quotes').insert(validQuotes);
    if (error) throw error;
  }
}

/** Σ quantidade × preço unitário de um fornecedor numa cotação (por item). */
export function computeSupplierTotal(
  supplierId: string,
  items: Pick<MaterialPurchaseItem, 'id' | 'quantity'>[],
  quotes: Pick<MaterialPurchaseQuote, 'supplier_id' | 'purchase_item_id' | 'unit_price'>[],
): number {
  return items.reduce((acc, item) => {
    const quote = quotes.find(
      (q) => q.supplier_id === supplierId && q.purchase_item_id === item.id,
    );
    if (!quote) return acc;
    return acc + item.quantity * quote.unit_price;
  }, 0);
}

/** Id curto pra exibir em notas/labels. */
export function shortId(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
