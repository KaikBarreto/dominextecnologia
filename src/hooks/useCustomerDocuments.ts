import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';
import { useUserCompany } from '@/hooks/useUserCompany';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { tenantFileOptions } from '@/utils/tenantStorage';

export type CustomerDocument = Tables<'customer_documents'>;
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
      const { data, error } = await supabase
        .from('customer_documents')
        .select('*')
        .eq('customer_id', customerId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
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
    mutationFn: async (document: Pick<CustomerDocument, 'id' | 'storage_path'>) => {
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

  const getSignedUrl = async (document: Pick<CustomerDocument, 'storage_path' | 'file_name'>) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(document.storage_path, 60, { download: document.file_name });
    if (error || !data?.signedUrl) throw error ?? new Error('Não foi possível abrir o arquivo.');
    return data.signedUrl;
  };

  return { list, upload, setVisibility, remove, getSignedUrl };
}
