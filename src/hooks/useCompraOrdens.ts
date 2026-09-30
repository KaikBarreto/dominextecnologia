import { useMutation, useQuery, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { getErrorMessage } from '@/utils/errorMessages';
import type { Database, Json, Tables } from '@/integrations/supabase/types';

// ─────────────────────────────────────────────────────────────────────────────
// ORDEM DE COMPRA (O.C.)
//
// Fluxo: requisição (compras) → cotações por fornecedor → o comprador escolhe o
// fornecedor POR MATERIAL (compra_materiais.chosen_cotacao_id) → gera 1 O.C. por
// fornecedor → recebe (total ou parcial) → o estoque entra.
//
// A ENTRADA NO ESTOQUE É EXCLUSIVA DO RECEBIMENTO DA O.C. e acontece 100% dentro
// da RPC `receber_ordem_compra` (atômica, respeita `compras.stock_id` como local
// de destino). O client NUNCA soma saldo, NUNCA chama register_inventory_movement
// por conta própria nesse fluxo: duas portas de entrada duplicam saldo.
// ─────────────────────────────────────────────────────────────────────────────

export type CompraOrdemStatus =
  | 'rascunho'
  | 'enviada'
  | 'recebida_parcial'
  | 'recebida'
  | 'cancelada';

/** Status que ocupam a trava do banco (uq_compra_ordens_ativa_por_fornecedor). */
const STATUS_EM_ABERTO: readonly CompraOrdemStatus[] = ['rascunho', 'enviada', 'recebida_parcial'];

export interface CompraOrdemItemRow {
  id: string;
  compra_material_id: string | null;
  inventory_id: string | null;
  /** Nunca null na leitura (fallback no hook). */
  material_name: string;
  /** Nunca null na leitura (fallback 'un'). */
  unit: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: number | null;
}

export interface CompraOrdemRow {
  id: string;
  numero: number;
  compra_id: string;
  supplier_id: string;
  /** Resolvido via suppliers; '' se não achar. */
  supplier_name: string;
  status: CompraOrdemStatus;
  sent_at: string | null;
  received_at: string | null;
  notes: string | null;
  created_at: string;
  items: CompraOrdemItemRow[];
  /** Soma de quantity_ordered × (unit_price ?? 0). */
  total: number;
}

export interface UseCompraOrdensResult {
  ordens: CompraOrdemRow[];
  isLoading: boolean;
  /**
   * Cria uma O.C. por fornecedor escolhido (compra_materiais.chosen_cotacao_id).
   * Itens sem fornecedor escolhido ficam de fora. Não duplica O.C. já em aberto.
   */
  gerarOrdens: UseMutationResult<{ criadas: number; puladas: number }, Error, { compraId: string }, unknown>;
  /** Muda status (enviada / cancelada / volta pra rascunho). */
  setOrdemStatus: UseMutationResult<void, Error, { ordemId: string; status: CompraOrdemStatus }, unknown>;
  /** Recebimento (parcial ou total) via RPC receber_ordem_compra. */
  receber: UseMutationResult<void, Error, { ordemId: string; itens: { item_id: string; quantity: number }[] }, unknown>;
  deleteOrdem: UseMutationResult<void, Error, string, unknown>;
}

type CompraOrdemInsert = Database['public']['Tables']['compra_ordens']['Insert'];

/** Código SQLSTATE do índice único parcial (uma O.C. em aberto por fornecedor). */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  const message = (error as { message?: string } | null)?.message ?? '';
  return code === UNIQUE_VIOLATION || message.includes('uq_compra_ordens_ativa_por_fornecedor');
}

export function useCompraOrdens(compraId: string | null): UseCompraOrdensResult {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.inventory.compras.ordens;
  const companyId = profile?.company_id ?? null;

  const invalidateOrdens = () => {
    queryClient.invalidateQueries({ queryKey: ['compra-ordens', compraId] });
    queryClient.invalidateQueries({ queryKey: ['compras'] });
  };

  // ---- Ordens da compra (cabeçalho + itens + nome do fornecedor) ----
  const listQuery = useQuery({
    queryKey: ['compra-ordens', compraId],
    enabled: !!compraId,
    queryFn: async (): Promise<CompraOrdemRow[]> => {
      if (!compraId) return [];
      const { data: ordensData, error } = await supabase
        .from('compra_ordens')
        .select('*')
        .eq('compra_id', compraId)
        .order('numero');
      if (error) throw error;
      const ordens = (ordensData ?? []) as Tables<'compra_ordens'>[];
      if (ordens.length === 0) return [];

      const ordemIds = ordens.map((o) => o.id);
      const [itensRes, supsRes] = await Promise.all([
        supabase.from('compra_ordem_itens').select('*').in('ordem_id', ordemIds).order('created_at'),
        supabase.from('suppliers').select('id, name'),
      ]);
      if (itensRes.error) throw itensRes.error;
      if (supsRes.error) throw supsRes.error;

      const itens = (itensRes.data ?? []) as Tables<'compra_ordem_itens'>[];
      const supplierName = new Map<string, string>(
        (supsRes.data ?? []).map((s) => [s.id, s.name]),
      );

      return ordens.map((o) => {
        const items: CompraOrdemItemRow[] = itens
          .filter((i) => i.ordem_id === o.id)
          .map((i) => ({
            id: i.id,
            compra_material_id: i.compra_material_id,
            inventory_id: i.inventory_id,
            material_name: i.material_name?.trim() || 'Material',
            unit: i.unit?.trim() || 'un',
            quantity_ordered: Number(i.quantity_ordered) || 0,
            quantity_received: Number(i.quantity_received) || 0,
            unit_price: i.unit_price === null ? null : Number(i.unit_price),
          }));
        return {
          id: o.id,
          numero: o.numero,
          compra_id: o.compra_id,
          supplier_id: o.supplier_id,
          supplier_name: supplierName.get(o.supplier_id) ?? '',
          status: o.status as CompraOrdemStatus,
          sent_at: o.sent_at,
          received_at: o.received_at,
          notes: o.notes,
          created_at: o.created_at,
          items,
          total: items.reduce((acc, i) => acc + i.quantity_ordered * (i.unit_price ?? 0), 0),
        };
      });
    },
  });

  // ---- Gerar O.C. a partir do fornecedor escolhido por material ----
  // Agrupa compra_materiais por chosen_cotacao_id → supplier_id e cria uma O.C.
  // por fornecedor. Fornecedor que já tem O.C. EM ABERTO é PULADO (o índice
  // único do banco é a rede de segurança, não o caminho normal).
  const gerarOrdens = useMutation<{ criadas: number; puladas: number }, Error, { compraId: string }>({
    mutationFn: async ({ compraId: targetCompraId }) => {
      if (!companyId) throw new Error('Usuário sem empresa associada. Contate o administrador.');
      if (!targetCompraId) throw new Error('Requisição inválida.');

      const { data: matsData, error: matsErr } = await supabase
        .from('compra_materiais')
        .select('*')
        .eq('compra_id', targetCompraId)
        .not('chosen_cotacao_id', 'is', null);
      if (matsErr) throw matsErr;

      const escolhidos = ((matsData ?? []) as Tables<'compra_materiais'>[]).filter(
        (m) => !!m.chosen_cotacao_id && Number(m.quantity) > 0,
      );
      if (escolhidos.length === 0) return { criadas: 0, puladas: 0 };

      const cotacaoIds = Array.from(new Set(escolhidos.map((m) => m.chosen_cotacao_id as string)));
      const inventoryIds = Array.from(
        new Set(escolhidos.map((m) => m.inventory_id).filter((id): id is string => !!id)),
      );

      const [cotsRes, precosRes, existentesRes] = await Promise.all([
        supabase.from('compra_cotacoes').select('id, supplier_id').in('id', cotacaoIds),
        supabase
          .from('compra_cotacao_precos')
          .select('cotacao_id, compra_material_id, unit_price')
          .in('cotacao_id', cotacaoIds),
        supabase.from('compra_ordens').select('supplier_id, status').eq('compra_id', targetCompraId),
      ]);
      if (cotsRes.error) throw cotsRes.error;
      if (precosRes.error) throw precosRes.error;
      if (existentesRes.error) throw existentesRes.error;

      // Nome/unidade de quem veio do estoque: `compra_materiais.material_name`
      // fica null quando o material é um item cadastrado, e a O.C. precisa do
      // nome preenchido (a RPC de recebimento usa ele).
      let invRows: { id: string; name: string; unit: string | null }[] = [];
      if (inventoryIds.length > 0) {
        const { data, error } = await supabase
          .from('inventory')
          .select('id, name, unit')
          .in('id', inventoryIds);
        if (error) throw error;
        invRows = data ?? [];
      }

      const supplierByCotacao = new Map<string, string>(
        (cotsRes.data ?? []).map((c) => [c.id, c.supplier_id]),
      );
      const priceKey = (cotacaoId: string, materialId: string) => `${cotacaoId}::${materialId}`;
      const priceByKey = new Map<string, number>(
        (precosRes.data ?? []).map((p) => [
          priceKey(p.cotacao_id, p.compra_material_id),
          Number(p.unit_price),
        ]),
      );
      const invById = new Map<string, { name: string; unit: string | null }>(
        invRows.map((i) => [i.id, { name: i.name, unit: i.unit }]),
      );
      // Fornecedores que já ocupam a trava do banco nesta requisição.
      const jaEmAberto = new Set<string>(
        (existentesRes.data ?? [])
          .filter((o) => STATUS_EM_ABERTO.includes(o.status as CompraOrdemStatus))
          .map((o) => o.supplier_id),
      );

      // Agrupa por fornecedor preservando a cotação de origem (o preço unitário
      // vem daquela cotação específica, não da "melhor" da requisição).
      const porFornecedor = new Map<string, { cotacaoId: string; material: Tables<'compra_materiais'> }[]>();
      for (const material of escolhidos) {
        const cotacaoId = material.chosen_cotacao_id as string;
        const supplierId = supplierByCotacao.get(cotacaoId);
        // Cotação apagada depois da escolha: material fica de fora (sem fornecedor).
        if (!supplierId) continue;
        const linhas = porFornecedor.get(supplierId) ?? [];
        linhas.push({ cotacaoId, material });
        porFornecedor.set(supplierId, linhas);
      }

      let criadas = 0;
      let puladas = 0;

      for (const [supplierId, linhas] of porFornecedor) {
        if (jaEmAberto.has(supplierId)) {
          puladas += 1;
          continue;
        }

        // `numero` é gerado pelo trigger (sequencial por empresa) e `company_id`
        // é validado contra a compra dona, mas o tipo gerado marca os dois como
        // obrigatórios (colunas NOT NULL sem DEFAULT). Daí o cast: mandamos
        // company_id e deixamos `numero` para o banco.
        const payload = {
          company_id: companyId,
          compra_id: targetCompraId,
          supplier_id: supplierId,
          status: 'rascunho',
        } as CompraOrdemInsert;

        const { data: ordem, error: ordemErr } = await supabase
          .from('compra_ordens')
          .insert(payload)
          .select('id')
          .single();

        if (ordemErr) {
          // Corrida com outra aba/sessão: a trava do banco pegou. Não é erro
          // pro usuário, é o mesmo caso de "já tinha O.C. em aberto".
          if (isUniqueViolation(ordemErr)) {
            puladas += 1;
            continue;
          }
          throw ordemErr;
        }

        const itens = linhas.map(({ cotacaoId, material }) => {
          const inv = material.inventory_id ? invById.get(material.inventory_id) : undefined;
          return {
            company_id: companyId,
            ordem_id: ordem.id,
            compra_material_id: material.id,
            inventory_id: material.inventory_id,
            // A RPC de recebimento usa material_name pra nomear o item criado no
            // estoque e pra montar o erro de teto: nunca pode chegar vazio.
            material_name: material.material_name?.trim() || inv?.name?.trim() || 'Material',
            unit: material.unit?.trim() || inv?.unit?.trim() || 'un',
            quantity_ordered: Number(material.quantity),
            unit_price: priceByKey.get(priceKey(cotacaoId, material.id)) ?? null,
          };
        });

        const { error: itensErr } = await supabase.from('compra_ordem_itens').insert(itens);
        if (itensErr) {
          // O.C. sem item não serve pra nada e ainda ocupa a trava do fornecedor.
          // Desfaz antes de propagar.
          await supabase.from('compra_ordens').delete().eq('id', ordem.id);
          throw itensErr;
        }

        criadas += 1;
      }

      return { criadas, puladas };
    },
    onSuccess: ({ criadas, puladas }) => {
      invalidateOrdens();
      if (criadas === 0 && puladas === 0) {
        toast({ title: t.generateNothing });
        return;
      }
      const title =
        criadas === 1
          ? t.generateSuccess.replace('{count}', '1')
          : t.generateSuccessPlural.replace('{count}', String(criadas));
      const skipped =
        puladas === 0
          ? undefined
          : puladas === 1
            ? t.generateSkipped.replace('{count}', '1')
            : t.generateSkippedPlural.replace('{count}', String(puladas));
      // Só pulou (nada criado): a informação principal vira o título.
      if (criadas === 0 && skipped) {
        toast({ title: skipped });
        return;
      }
      toast({ title, description: skipped });
    },
    onError: (error) => {
      // Nunca deixar texto cru de constraint chegar no usuário.
      const description = isUniqueViolation(error) ? t.errors.alreadyOpen : getErrorMessage(error);
      toast({ title: t.generateError, description, variant: 'destructive' });
    },
  });

  // ---- Status da O.C. (enviada / cancelada / volta pra rascunho) ----
  // `sent_at` é carimbado pelo trigger compra_ordens_set_defaults no primeiro
  // envio; o client só manda o status.
  const setOrdemStatus = useMutation<void, Error, { ordemId: string; status: CompraOrdemStatus }>({
    mutationFn: async ({ ordemId, status }) => {
      const { error } = await supabase.from('compra_ordens').update({ status }).eq('id', ordemId);
      if (error) throw error;
    },
    onSuccess: (_data, { status }) => {
      invalidateOrdens();
      const labels: Record<CompraOrdemStatus, string> = {
        rascunho: t.reopenSuccess,
        enviada: t.markSentSuccess,
        recebida_parcial: t.statusLabels.recebida_parcial,
        recebida: t.statusLabels.recebida,
        cancelada: t.cancelSuccess,
      };
      toast({ title: labels[status] });
    },
    onError: (error) => {
      const description = isUniqueViolation(error) ? t.errors.alreadyOpen : getErrorMessage(error);
      toast({ title: t.statusError, description, variant: 'destructive' });
    },
  });

  // ---- Recebimento (parcial ou total) ----
  // Tudo acontece na RPC, dentro de UMA transação: soma o recebido, dá entrada
  // no local de `compras.stock_id`, cria o material de estoque quando o item é
  // manual e move o status pra recebida_parcial/recebida.
  const receber = useMutation<
    void,
    Error,
    { ordemId: string; itens: { item_id: string; quantity: number }[] }
  >({
    mutationFn: async ({ ordemId, itens }) => {
      const validos = (itens ?? [])
        .filter((i) => !!i.item_id && Number(i.quantity) > 0)
        .map((i) => ({ item_id: i.item_id, quantity: Number(i.quantity) }));
      if (validos.length === 0) throw new Error(t.receiveEmpty);

      const { error } = await supabase.rpc('receber_ordem_compra', {
        p_ordem_id: ordemId,
        p_itens: validos as unknown as Json,
      });
      if (error) throw error;
    },
    onSuccess: (_data, { itens }) => {
      invalidateOrdens();
      // O saldo mudou no banco: derruba tudo que lê estoque.
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['low-stock'] });
      const count = (itens ?? []).filter((i) => Number(i.quantity) > 0).length;
      toast({
        title:
          count === 1
            ? t.receiveSuccess.replace('{count}', '1')
            : t.receiveSuccessPlural.replace('{count}', String(count)),
      });
    },
    onError: (error) => {
      toast({
        title: t.receiveError,
        description: translateReceiveError(error, t),
        variant: 'destructive',
      });
    },
  });

  // ---- Excluir O.C. (CASCADE remove os itens) ----
  const deleteOrdem = useMutation<void, Error, string>({
    mutationFn: async (ordemId: string) => {
      const { error } = await supabase.from('compra_ordens').delete().eq('id', ordemId);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidateOrdens();
      toast({ title: t.deleteSuccess });
    },
    onError: (error) => {
      toast({ title: t.deleteError, description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    ordens: listQuery.data ?? [],
    isLoading: listQuery.isLoading,
    gerarOrdens,
    setOrdemStatus,
    receber,
    deleteOrdem,
  };
}

// ---- Helpers ----

type OrdensMessages = (typeof MESSAGES)['pt-br']['app']['inventory']['compras']['ordens'];

/**
 * Traduz os tokens estáveis da RPC `receber_ordem_compra` pra PT-BR (ou o idioma
 * da empresa). Match por PREFIXO: o texto do token é contrato com o banco, o
 * texto que o usuário lê é nosso.
 *
 *   receipt_exceeds_ordered: <material>  → recebeu mais que o pedido
 *                                          (é também a trava de duplo-clique)
 *   ordem_cancelada: ...                 → O.C. cancelada
 *   payload_invalido: ...                → payload malformado
 */
function translateReceiveError(error: unknown, t: OrdensMessages): string {
  const raw = (error as { message?: string } | null)?.message ?? '';

  const exceeds = raw.match(/receipt_exceeds_ordered:\s*([^\n]*)/);
  if (exceeds) {
    const material = (exceeds[1] ?? '').trim() || 'material';
    return t.errors.exceedsOrdered.replace('{material}', material);
  }
  if (raw.includes('ordem_cancelada')) return t.errors.cancelled;
  if (raw.includes('payload_invalido')) return t.errors.generic;
  // Guarda de quantidade vazia (mensagem nossa, já traduzida).
  if (raw === t.receiveEmpty) return raw;

  const friendly = getErrorMessage(error);
  return friendly || t.errors.generic;
}
