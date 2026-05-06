import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeStorageFileName } from '@/utils/storagePath';

export interface TransactionAttachment {
  id: string;
  transaction_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  uploaded_at: string;
}

const BUCKET = 'financial-receipts';

async function fetchUserCompanyId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .single();
  if (error) return null;
  return data?.company_id ?? null;
}

/**
 * Hook que lista os anexos de uma transação financeira.
 * RLS garante isolamento por company.
 */
export function useTransactionAttachments(transactionId?: string) {
  return useQuery({
    queryKey: ['transaction-attachments', transactionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_transaction_attachments')
        .select('*')
        .eq('transaction_id', transactionId!)
        .order('uploaded_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as TransactionAttachment[];
    },
    enabled: !!transactionId,
  });
}

/**
 * Mutation: sobe arquivo no bucket `financial-receipts` em
 * `<company_id>/<transaction_id>/<uuid>_<filename>` e cria a row em
 * `financial_transaction_attachments`.
 */
export function useUploadTransactionAttachment() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ transactionId, file }: { transactionId: string; file: File }) => {
      if (!user) throw new Error('Usuário não autenticado');
      const companyId = await fetchUserCompanyId(user.id);
      if (!companyId) throw new Error('Empresa não encontrada para o usuário');

      const safeName = sanitizeStorageFileName(file.name);
      const storagePath = `${companyId}/${transactionId}/${crypto.randomUUID()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      const { data, error } = await supabase
        .from('financial_transaction_attachments')
        .insert({
          transaction_id: transactionId,
          storage_path: storagePath,
          file_name: file.name,
          mime_type: file.type || null,
          size_bytes: file.size ?? null,
          uploaded_by: user.id,
        })
        .select()
        .single();

      if (error) {
        // Tenta limpar o arquivo órfão no storage se a insert falhou
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        throw error;
      }

      return data as TransactionAttachment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments', data.transaction_id] });
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments-counts'] });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao enviar anexo', description: error.message });
    },
  });
}

/**
 * Mutation: remove a row em `financial_transaction_attachments` e o arquivo no bucket.
 */
export function useRemoveTransactionAttachment() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (attachment: Pick<TransactionAttachment, 'id' | 'storage_path' | 'transaction_id'>) => {
      const { error } = await supabase
        .from('financial_transaction_attachments')
        .delete()
        .eq('id', attachment.id);
      if (error) throw error;

      // Limpa storage (best-effort — se falhar não bloqueia: a row já sumiu)
      await supabase.storage.from(BUCKET).remove([attachment.storage_path]).catch(() => {});
      return attachment;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments', data.transaction_id] });
      queryClient.invalidateQueries({ queryKey: ['transaction-attachments-counts'] });
      toast({ title: 'Anexo removido' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao remover anexo', description: error.message });
    },
  });
}

/**
 * Conta quantos anexos cada transação tem (na nova tabela).
 * Usado pra exibir o ícone de paperclip na lista.
 */
export function useTransactionAttachmentsCounts(transactionIds: string[]) {
  return useQuery({
    queryKey: ['transaction-attachments-counts', transactionIds.length, transactionIds.slice(0, 5).join(',')],
    queryFn: async () => {
      if (transactionIds.length === 0) return {} as Record<string, number>;
      const { data, error } = await supabase
        .from('financial_transaction_attachments')
        .select('transaction_id')
        .in('transaction_id', transactionIds);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row: { transaction_id: string }) => {
        counts[row.transaction_id] = (counts[row.transaction_id] ?? 0) + 1;
      });
      return counts;
    },
    enabled: transactionIds.length > 0,
    staleTime: 30_000,
  });
}

/**
 * Helper: gera signed URL on-demand para download de um anexo.
 */
export async function createAttachmentSignedUrl(storagePath: string, ttlSeconds = 3600): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Formata o tamanho em bytes em string legível (KB / MB).
 */
export function formatAttachmentSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
