import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lista versões de documentos PMOC vinculadas a um contrato (Onda C — v1.9.x).
 *
 * Tabela `pmoc_documents` é criada pela Database nesta onda — até a migration
 * ser aplicada em produção, este hook devolve `[]` defensivamente quando a
 * tabela não existir (erro 42P01) ou quando a coluna ainda não existir.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.1 / §5.3
 */

export type PmocDocumentType = 'dossie_pmoc' | 'cronograma_anual';

export interface PmocDocument {
  id: string;
  company_id: string;
  contract_id: string;
  doc_type: PmocDocumentType;
  version: number;
  content_hash: string;
  pdf_storage_path: string;
  generated_at: string;
  generated_by: string | null;
  notes: string | null;
}

export function usePmocDocuments(contractId: string | null | undefined) {
  const query = useQuery({
    queryKey: ['pmoc-documents', contractId],
    enabled: !!contractId,
    staleTime: 30_000,
    queryFn: async (): Promise<PmocDocument[]> => {
      if (!contractId) return [];
      const { data, error } = await supabase
        .from('pmoc_documents')
        .select('*')
        .eq('contract_id', contractId)
        .order('doc_type', { ascending: true })
        .order('version', { ascending: false });

      if (error) {
        // 42P01 = tabela não existe (ambiente sem migration aplicada)
        const code = (error as { code?: string }).code;
        if (code === '42P01' || /relation .* does not exist/i.test(error.message)) {
          return [];
        }
        // Para outros erros, logamos e retornamos vazio em vez de quebrar a UI.
        console.warn('[usePmocDocuments] erro:', error.message);
        return [];
      }
      return (data ?? []) as PmocDocument[];
    },
  });

  // Conveniência: agrupar por doc_type e expor "latest" de cada tipo
  const documents = query.data ?? [];
  const latestByType = documents.reduce<Record<PmocDocumentType, PmocDocument | undefined>>(
    (acc, doc) => {
      const existing = acc[doc.doc_type];
      if (!existing || doc.version > existing.version) acc[doc.doc_type] = doc;
      return acc;
    },
    { dossie_pmoc: undefined, cronograma_anual: undefined },
  );

  return {
    documents,
    latestByType,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    error: query.error as Error | null,
  };
}
