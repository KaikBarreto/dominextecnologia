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
}

export interface NfeImportPayload {
  accessKey: string | null;
  supplier: NfeParsedSupplier;
  /** Id do fornecedor já existente (casado por CNPJ), se houver. */
  matchedSupplierId: string | null;
  total: number | null;
  lines: NfeImportLine[];
}

export interface NfeImportResult {
  imported: number;
  created: number;
  failed: number;
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
      for (const line of payload.lines) {
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
              })
              .select('id')
              .single();
            if (itemErr) throw itemErr;
            inventoryId = newItem.id;
            created += 1;
          }

          const { error: rpcErr } = await supabase.rpc('register_inventory_movement', {
            p_inventory_id: inventoryId,
            p_movement_type: 'entrada',
            p_quantity: line.quantity, // delta positivo = entrada
            p_supplier_id: supplierId ?? undefined,
            p_unit_cost: line.unitCost,
            p_notes: notes,
          });
          if (rpcErr) throw rpcErr;
          imported += 1;
        } catch (err) {
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

  return { checkDuplicate, runImport, importing };
}
