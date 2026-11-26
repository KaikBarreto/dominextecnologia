import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import type { NfeParsedSupplier } from '@/lib/nfeParser';

/** Resultado da checagem de duplicidade contra nfe_imports. */
export interface NfeDupCheck {
  /** true se a chave já foi importada nesta empresa. */
  duplicate: boolean;
  /** Data (created_at) da importação anterior, se houver. */
  importedAt: string | null;
}

/** Uma linha de produto pronta para import (já revisada pelo usuário). */
export interface NfeImportFiscalData {
  ncm: string | null;
  cest: string | null;
  gtin: string | null;
  origin: string | null;
  icmsCode: string | null;
  icmsRate: number | null;
  pisCst: string | null;
  pisRate: number | null;
  cofinsCst: string | null;
  cofinsRate: number | null;
  ipiCst: string | null;
  ipiRate: number | null;
}

export interface NfeImportLine {
  /** Nome do produto (editável). */
  name: string;
  unit: string;
  quantity: number;
  unitCost: number;
  /**
   * Item de estoque a casar. Se null, cria item novo.
   */
  matchInventoryId: string | null;
  /** Classificação fiscal observada no XML; nunca é inventada pelo cliente. */
  fiscal: NfeImportFiscalData;
}

export interface NfeImportPayload {
  accessKey: string | null;
  supplier: NfeParsedSupplier;
  /** Id do fornecedor já existente (casado por CNPJ), se houver. */
  matchedSupplierId: string | null;
  total: number | null;
  /** Local geral que receberá os materiais. */
  stockId: string;
  lines: NfeImportLine[];
}

export interface NfeImportResult {
  imported: number;
  created: number;
  failed: number;
}

type GenericRpcResult = { data: unknown; error: unknown | null };
type GenericRpc = (name: string, args: Record<string, unknown>) => Promise<GenericRpcResult>;
const callRpc = supabase.rpc.bind(supabase) as unknown as GenericRpc;

function getInboundImportErrorMessage(error: unknown): string {
  const candidate = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const diagnostic = [candidate.message, candidate.details, candidate.hint]
    .filter((value): value is string => typeof value === 'string')
    .join(' ');
  if (diagnostic.includes('inbound_nfe_inventory_already_imported')) {
    return 'Esta nota já gerou uma entrada no estoque. O saldo não foi alterado novamente.';
  }
  if (diagnostic.includes('inbound_nfe_invalid_fiscal_data')) {
    return 'O XML possui NCM, CEST, GTIN ou origem inválidos. Revise o arquivo antes de importar.';
  }
  return getErrorMessage(error);
}

export function useNfeImport() {
  const { profile, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [importing, setImporting] = useState(false);

  /** Confere se a chave de acesso já foi importada nesta empresa. */
  const checkDuplicate = async (accessKey: string | null): Promise<NfeDupCheck> => {
    if (!accessKey || !companyId) return { duplicate: false, importedAt: null };
    const { data, error } = await supabase
      .from('nfe_imports')
      .select('created_at')
      .eq('company_id', companyId)
      .eq('access_key', accessKey)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      // Não bloqueia o fluxo por falha de checagem — só não avisa.
      console.error('Falha ao checar duplicidade de NF-e:', error);
      return { duplicate: false, importedAt: null };
    }
    if (data && data.length > 0) {
      return { duplicate: true, importedAt: data[0].created_at };
    }
    return { duplicate: false, importedAt: null };
  };

  /**
   * Executa o import. Idempotente por linha: se uma linha falhar, segue as
   * outras e contabiliza no resultado (não derruba tudo).
   */
  const runImport = async (payload: NfeImportPayload): Promise<NfeImportResult> => {
    if (!companyId) {
      throw new Error('Usuário sem empresa associada. Contate o administrador.');
    }
    setImporting(true);
    let imported = 0;
    let created = 0;
    let failed = 0;

    try {
      // 1) Resolver o fornecedor primeiro (uma vez para a nota toda).
      let supplierId = payload.matchedSupplierId;
      const supplierName = payload.supplier.name;
      if (!supplierId && supplierName) {
        try {
          const { data: newSupplier, error: supErr } = await supabase
            .from('suppliers')
            .insert({
              name: supplierName,
              cpf_cnpj: payload.supplier.cnpj,
              company_id: companyId,
              created_by: user?.id ?? null,
            })
            .select('id')
            .single();
          if (supErr) throw supErr;
          supplierId = newSupplier.id;
        } catch (err) {
          // Sem fornecedor a entrada ainda funciona (supplier_id é opcional na RPC).
          console.error('Falha ao criar fornecedor da NF-e:', err);
          supplierId = null;
        }
      }

      const notes = payload.accessKey
        ? `Importado da NF-e ${payload.accessKey}`
        : 'Importado de NF-e (XML)';

      // 2) Para cada linha incluída: casar ou criar item, e dar entrada via RPC.
      //    Idempotente por linha: uma falha não derruba as outras.
      for (const line of payload.lines) {
        // Segurança extra: nunca dar entrada de quantidade ≤ 0 (lixo no Kardex).
        if (!(line.quantity > 0)) {
          failed += 1;
          console.error('Linha ignorada — quantidade não positiva:', line.name);
          continue;
        }

        // Id do item criado NESTA iteração (para rollback se a RPC falhar).
        let createdItemId: string | null = null;
        try {
          let inventoryId = line.matchInventoryId;

          if (!inventoryId) {
            const { data: newItem, error: itemErr } = await supabase
              .from('inventory')
              .insert({
                name: line.name,
                unit: line.unit,
                cost_price: line.unitCost,
                quantity: 0,
                supplier: supplierName,
                company_id: companyId,
                fiscal_ncm: line.fiscal.ncm,
                fiscal_cest: line.fiscal.cest,
                fiscal_gtin: line.fiscal.gtin,
                fiscal_origin: line.fiscal.origin,
              })
              .select('id')
              .single();
            if (itemErr) throw itemErr;
            inventoryId = newItem.id;
            createdItemId = newItem.id;
          }

          const { error: rpcErr } = await supabase.rpc('inventory_register_manual_movement_v3', {
            p_inventory_id: inventoryId,
            p_movement_type: 'entrada',
            p_quantity: line.quantity, // delta positivo = entrada
            p_supplier_id: supplierId ?? undefined,
            p_unit_cost: line.unitCost,
            p_notes: notes,
            p_stock_id: payload.stockId,
          });
          if (rpcErr) throw rpcErr;

          // Só conta "novo" depois que a entrada deu certo (M3/M4).
          if (createdItemId) created += 1;
          imported += 1;
        } catch (err) {
          // Rollback: se acabamos de criar o item e a entrada falhou, remove o
          // item órfão (quantity 0, sem movimento) para não deixar lixo.
          if (createdItemId) {
            const { error: delErr } = await supabase
              .from('inventory')
              .delete()
              .eq('id', createdItemId);
            if (delErr) {
              console.error('Falha ao remover item órfão da NF-e:', line.name, delErr);
            }
          }
          failed += 1;
          console.error('Falha ao importar item da NF-e:', line.name, err);
        }
      }

      // 3) Registrar o log da importação (dup-guard futuro). Não bloqueia em erro.
      if (payload.accessKey && imported > 0) {
        const { error: logErr } = await supabase.from('nfe_imports').insert({
          company_id: companyId,
          access_key: payload.accessKey,
          supplier_id: supplierId,
          supplier_name: supplierName,
          total: payload.total,
          item_count: imported,
          created_by: user?.id ?? null,
        });
        if (logErr) console.error('Falha ao registrar log de NF-e:', logErr);
      }

      // 4) Invalidar caches afetados.
      queryClient.invalidateQueries({ queryKey: ['inventory'] });
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      queryClient.invalidateQueries({ queryKey: ['nfe_imports'] });

      return { imported, created, failed };
    } catch (err) {
      toast({
        title: 'Erro ao importar NF-e',
        description: getErrorMessage(err),
        variant: 'destructive',
      });
      throw err;
    } finally {
      setImporting(false);
    }
  };

  /**
   * Entrada originada na tela de Notas recebidas. Diferente do import genérico,
   * toda a operação roda em uma RPC transacional que trava a própria NF-e:
   * duas pessoas (ou os fluxos avulso/compra) não conseguem duplicar o saldo.
   */
  const runInboundImport = async (
    inboundNfeId: string,
    clientRequestId: string,
    payload: NfeImportPayload,
  ): Promise<NfeImportResult> => {
    setImporting(true);
    try {
      const { data, error } = await callRpc('import_inbound_nfe_inventory', {
        p_inbound_nfe_id: inboundNfeId,
        p_client_request_id: clientRequestId,
        p_stock_id: payload.stockId,
        p_items: payload.lines.map((line) => ({
          inventory_id: line.matchInventoryId,
          name: line.name,
          unit: line.unit,
          quantity: line.quantity,
          unit_cost: line.unitCost,
          fiscal_ncm: line.fiscal.ncm,
          fiscal_cest: line.fiscal.cest,
          fiscal_gtin: line.fiscal.gtin,
          fiscal_origin: line.fiscal.origin,
        })),
      });
      if (error) throw error;
      const result = (data && typeof data === 'object' ? data : {}) as Partial<NfeImportResult>;
      const normalized = {
        imported: Number(result.imported ?? 0),
        created: Number(result.created ?? 0),
        failed: Number(result.failed ?? 0),
      };
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-stock-levels'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory-movements'] }),
        queryClient.invalidateQueries({ queryKey: ['suppliers'] }),
        queryClient.invalidateQueries({ queryKey: ['nfe_imports'] }),
        queryClient.invalidateQueries({ queryKey: ['inbound-nfe', companyId] }),
      ]);
      return normalized;
    } catch (error) {
      toast({
        title: 'Não foi possível registrar a entrada',
        description: getInboundImportErrorMessage(error),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setImporting(false);
    }
  };

  return { checkDuplicate, runImport, runInboundImport, importing };
}
