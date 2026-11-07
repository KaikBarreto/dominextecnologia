import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useUserCompany } from '@/hooks/useUserCompany';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { tenantFileOptions } from '@/utils/tenantStorage';

type CustomerDocumentRow = Tables<'customer_documents'>;
export type CustomerDocument = CustomerDocumentRow & {
  source: 'manual' | 'pmoc';
  pmoc_document_id?: string | null;
  service_order_id?: string | null;
};
export type CustomerDocumentKind = 'invoice' | 'document';
export type CustomerDocumentType = 'nfse' | 'nfe_product' | 'contract' | 'other';

export interface UploadCustomerDocumentInput {
  file: File;
  kind: CustomerDocumentKind;
  type: CustomerDocumentType;
  title: string;
  description?: string;
  documentNumber?: string;
  issueDate?: string;
  amount?: number | null;
  visibleInPortal: boolean;
}

interface LinkedPmocDocument {
  id: string;
  doc_type: string;
  file_name: string;
  pdf_storage_path: string;
  generated_at: string;
  valid_until: string | null;
  service_order_id: string;
  service_orders: { order_number: number | null } | Array<{ order_number: number | null }> | null;
}

interface CustomerPmocLink {
  id: string;
  company_id: string;
  customer_id: string;
  created_at: string;
  service_order_pmoc_documents: LinkedPmocDocument | LinkedPmocDocument[] | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

const BUCKET = 'customer-documents';
export const CUSTOMER_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;

const GENERAL_EXTENSIONS = new Set([
  'pdf', 'xml', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx',
]);
const INVOICE_EXTENSIONS = new Set(['pdf', 'xml']);

function validateFile(file: File, kind: CustomerDocumentKind): void {
  if (file.size <= 0) throw new Error('O arquivo está vazio.');
  if (file.size > CUSTOMER_DOCUMENT_MAX_BYTES) {
    throw new Error('O arquivo deve ter no máximo 15 MB.');
  }
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowed = kind === 'invoice' ? INVOICE_EXTENSIONS : GENERAL_EXTENSIONS;
  if (!allowed.has(extension)) {
    throw new Error(kind === 'invoice'
      ? 'Notas fiscais aceitam arquivos PDF ou XML.'
      : 'Formato não permitido. Use PDF, XML, imagem, Word, Excel ou texto.');
  }
}

export function useCustomerDocuments(customerId?: string) {
  const { companyId } = useUserCompany();
  const queryClient = useQueryClient();
  const queryKey = ['customer-documents', customerId];

  const list = useQuery({
    queryKey,
    enabled: !!customerId,
    queryFn: async () => {
      const [manualResult, pmocResult] = await Promise.all([
        supabase
          .from('customer_documents')
          .select('*')
          .eq('customer_id', customerId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_order_pmoc_document_links')
          .select(`
            id, company_id, customer_id, created_at,
            service_order_pmoc_documents!inner(
              id, doc_type, file_name, pdf_storage_path, generated_at,
              valid_until, service_order_id,
              service_orders!inner(order_number)
            )
          `)
          .eq('customer_id', customerId!)
          .order('created_at', { ascending: false }),
      ]);
      if (manualResult.error) throw manualResult.error;
      if (pmocResult.error) throw pmocResult.error;

      const manual = (manualResult.data ?? []).map((document) => ({
        ...document,
        source: 'manual' as const,
      }));
      const links = (pmocResult.data ?? []) as unknown as CustomerPmocLink[];
      const pmoc = links.flatMap((link): CustomerDocument[] => {
        const document = firstRelation(link.service_order_pmoc_documents);
        if (!document) return [];
        const order = firstRelation(document.service_orders);
        const certificate = document.doc_type === 'certificado_conformidade';
        return [{
          id: link.id,
          company_id: link.company_id,
          customer_id: link.customer_id,
          document_kind: 'document',
          document_type: 'other',
          title: certificate ? 'Certificado de conformidade' : 'Relatório de serviço PMOC',
          description: 'Gerado automaticamente a partir de uma ordem de serviço concluída.',
          document_number: order?.order_number != null ? `OS ${String(order.order_number).padStart(6, '0')}` : null,
          issue_date: document.generated_at?.slice(0, 10) ?? null,
          amount: null,
          storage_path: document.pdf_storage_path,
          file_name: document.file_name,
          mime_type: 'application/pdf',
          size_bytes: null,
          is_visible_in_portal: false,
          uploaded_by: null,
          created_at: document.generated_at ?? link.created_at,
          updated_at: document.generated_at ?? link.created_at,
          source: 'pmoc',
          pmoc_document_id: document.id,
          service_order_id: document.service_order_id,
        }];
      });
      return [...manual, ...pmoc].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
  });

  const upload = useMutation({
    mutationFn: async (input: UploadCustomerDocumentInput) => {
      if (!customerId) throw new Error('Cliente não informado.');
      if (!companyId) throw new Error('Empresa do usuário não encontrada.');
      if (!input.title.trim()) throw new Error('Informe um título para o arquivo.');
      validateFile(input.file, input.kind);

      const safeName = sanitizeStorageFileName(input.file.name);
      const storagePath = `${companyId}/${customerId}/${crypto.randomUUID()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, input.file, await tenantFileOptions({
          contentType: input.file.type || undefined,
          upsert: false,
        }));
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('customer_documents')
        .insert({
          company_id: companyId,
          customer_id: customerId,
          document_kind: input.kind,
          document_type: input.type,
          title: input.title.trim(),
          description: input.description?.trim() || null,
          document_number: input.documentNumber?.trim() || null,
          issue_date: input.issueDate || null,
          amount: input.amount ?? null,
          storage_path: storagePath,
          file_name: input.file.name,
          mime_type: input.file.type || null,
          size_bytes: input.file.size,
          is_visible_in_portal: input.visibleInPortal,
        })
        .select()
        .single();

      if (error) {
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
        throw error;
      }
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const setVisibility = useMutation({
    mutationFn: async ({ id, visible }: { id: string; visible: boolean }) => {
      const { error } = await supabase
        .from('customer_documents')
        .update({ is_visible_in_portal: visible })
        .eq('id', id)
        .eq('customer_id', customerId!);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const remove = useMutation({
    mutationFn: async (document: Pick<CustomerDocument, 'id' | 'storage_path' | 'source'>) => {
      if (document.source === 'pmoc') throw new Error('Documentos gerados pela OS fazem parte do histórico e não podem ser excluídos por esta tela.');
      const { error } = await supabase
        .from('customer_documents')
        .delete()
        .eq('id', document.id)
        .eq('customer_id', customerId!);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([document.storage_path]).catch(() => undefined);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const getSignedUrl = async (document: Pick<CustomerDocument, 'storage_path' | 'file_name' | 'source'>) => {
    const bucket = document.source === 'pmoc' ? 'pmoc-documents' : BUCKET;
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(document.storage_path, 60, { download: document.file_name });
    if (error || !data?.signedUrl) throw error ?? new Error('Não foi possível abrir o arquivo.');
    return data.signedUrl;
  };

  return { list, upload, setVisibility, remove, getSignedUrl };
}
