import { useQuery } from '@tanstack/react-query';
import { useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { INVENTORY_ABC_REPORT_QUERY_KEY, usePdvAuthorizedQueryScope } from '@/hooks/pdvReportCache';
import { parseInventoryAbcReport, type InventoryAbcSourceRow } from '@/lib/inventory-abc';

interface InventoryAbcReportParams {
  startDate?: string;
  endDate?: string;
  stockIds?: string[];
}

export function useInventoryAbcReport({
  startDate,
  endDate,
  stockIds,
}: InventoryAbcReportParams) {
  const scope = usePdvAuthorizedQueryScope();
  const identity = JSON.stringify([scope.key, startDate, endDate, stockIds]);
  const current = useRef(identity);
  current.current = identity;
  const query = useQuery({
    // A raiz `inventory` faz as mutations canônicas do estoque invalidarem
    // também esta leitura derivada, evitando relatório defasado após movimento.
    queryKey: [...INVENTORY_ABC_REPORT_QUERY_KEY, ...scope.key, startDate ?? null, endDate ?? null, stockIds ?? null],
    enabled: scope.ready,
    queryFn: async ({ signal }) => {
      if (!scope.ready) throw new Error('Aguarde a confirmação do acesso ao relatório.');
      const rows: InventoryAbcSourceRow[] = [];
      const seen = new Set<string>();
      while (true) {
        // SETOF RPCs also obey the API row cap. Explicit pages prevent a
        // complete-looking ABC calculated from only the first 1,000 materials.
        const size = Math.min(500, 5_001 - rows.length);
        const { data, error } = await supabase.rpc('get_inventory_abc_report', {
          p_start_date: startDate,
          p_end_date: endDate,
          p_stock_ids: stockIds?.length ? stockIds : undefined,
        }).range(rows.length, rows.length + size - 1).order('inventory_id');
        if (signal.aborted || current.current !== identity) throw new Error('Consulta encerrada.');
        if (error) throw new Error(error.code === '42501'
          ? 'Seu perfil não permite consultar este relatório.'
          : error.code === '22023' ? 'Revise o período e os locais do relatório.'
            : 'Não foi possível carregar a Curva ABC. Tente novamente.');
        const page = parseInventoryAbcReport(data);
        for (const row of page) {
          if (seen.has(row.inventory_id)) throw new Error('Os materiais mudaram durante a consulta. Atualize e tente novamente.');
          seen.add(row.inventory_id); rows.push(row);
        }
        if (rows.length > 5_000) throw new Error('Selecione um local de estoque com menos materiais para consultar a Curva ABC completa.');
        if (page.length < size) return rows;
      }
    },
    retry: false,
  });
  return { ...query, data: scope.ready && !query.isError ? query.data : undefined, isLoading: !scope.ready || query.isLoading };
}
