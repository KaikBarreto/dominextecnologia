import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Lista versões de documentos PMOC vinculadas a um contrato (Onda C — v1.9.x).
 *
 * Falhas de leitura são propagadas para a tela apresentar recuperação explícita;
 * nunca são convertidas em lista vazia, pois isso confundiria erro com ausência
 * real de documentos.
 *
 * Plano: docs/planos/2026-05-23-pmoc-onda-C-dossie-cronograma.md §4.1 / §5.3
 */

export type PmocDocumentType =
  | 'dossie_pmoc'
  | 'cronograma_anual'
  | 'termo_rt'
  | 'certificado'
  | 'planilha';

/**
 * Status da assinatura embarcada no PDF (Onda E — v1.9.x).
 *
 * - `'signed'`  → o PDF foi gerado com a imagem real da assinatura do RT.
 * - `'pending'` → o PDF foi gerado com linha em branco (assinar à mão depois).
 * - `null`      → não se aplica (ex.: Cronograma) ou doc gerado antes da Onda E.
 *
 * É armazenado em `pmoc_documents.notes` com o formato `signature:signed`
 * ou `signature:pending` (uma das chaves possíveis no campo livre `notes`).
 * O parsing tolera ausência — assume `null` se não encontrar.
 */
export type PmocDocumentSignatureStatus = 'signed' | 'pending' | null;

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
  /**
   * Data de vencimento do documento (date-only "yyyy-MM-dd"). Preenchida só
   * pra docs regulatórios com validade (TRT e Certificado); `null` pra
   * dossiê/cronograma e docs gerados antes desta feature.
   */
  valid_until: string | null;
  /** Derivado de `notes` (`signature:signed` | `signature:pending`). */
  signature_status: PmocDocumentSignatureStatus;
}

const PMOC_DOCUMENT_FILE_LABELS: Record<PmocDocumentType, string> = {
  dossie_pmoc: 'Dossiê PMOC',
  cronograma_anual: 'Cronograma Anual PMOC',
  termo_rt: 'Termo de Responsabilidade Técnica',
  certificado: 'Certificado de Conformidade',
  planilha: 'Planilha PMOC',
};

/**
 * Nome de download legível e estável. O path privado continua técnico e
 * imutável; este nome é aplicado apenas no Content-Disposition da signed URL.
 */
export function buildPmocDocumentDownloadName(
  document: Pick<PmocDocument, 'doc_type' | 'version' | 'generated_at'>,
  establishmentName?: string | null,
): string {
  const safePart = (value: string) => value
    // eslint-disable-next-line no-control-regex -- nomes de arquivo não podem conter caracteres de controle.
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  const generatedDate = /^\d{4}-\d{2}-\d{2}/.exec(document.generated_at)?.[0] ?? '';
  const parts = [
    PMOC_DOCUMENT_FILE_LABELS[document.doc_type],
    establishmentName ? safePart(establishmentName) : '',
    generatedDate,
    `v${document.version}`,
  ].filter(Boolean);
  return `${parts.join(' - ')}.pdf`;
}

/**
 * Parser defensivo do `notes` pra extrair o status da assinatura.
 *
 * Formato esperado (case-insensitive): `signature:signed` ou `signature:pending`.
 * Pode aparecer em qualquer posição do campo (separado por espaço, vírgula, etc.).
 */
function parseSignatureStatus(notes: string | null): PmocDocumentSignatureStatus {
  if (!notes) return null;
  const match = notes.match(/signature\s*:\s*(signed|pending)/i);
  if (!match) return null;
  return match[1].toLowerCase() as 'signed' | 'pending';
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

      if (error) throw error;
      // Enriquece cada doc com `signature_status` derivado do `notes`.
      return (data ?? []).map((d) => ({
        ...d,
        signature_status: parseSignatureStatus((d as { notes: string | null }).notes ?? null),
      })) as PmocDocument[];
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
    {
      dossie_pmoc: undefined,
      cronograma_anual: undefined,
      termo_rt: undefined,
      certificado: undefined,
      planilha: undefined,
    },
  );

  return {
    documents,
    latestByType,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    refetch: query.refetch,
    error: query.error as Error | null,
    getSignedDownloadUrl: async (
      document: Pick<PmocDocument, 'contract_id' | 'doc_type' | 'version' | 'generated_at' | 'pdf_storage_path'>,
      establishmentName?: string | null,
    ) => {
      if (!contractId || document.contract_id !== contractId) {
        throw new Error('Documento não pertence ao contrato aberto.');
      }
      const fileName = buildPmocDocumentDownloadName(document, establishmentName);
      const { data, error } = await supabase.storage
        .from('pmoc-documents')
        .createSignedUrl(document.pdf_storage_path, 60, { download: fileName });
      if (error || !data?.signedUrl) {
        throw error ?? new Error('Não foi possível preparar o download.');
      }
      return data.signedUrl;
    },
  };
}
