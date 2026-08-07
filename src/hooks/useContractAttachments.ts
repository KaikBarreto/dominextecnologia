import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { sanitizeStorageFileName } from '@/utils/storagePath';
import { getErrorMessage } from '@/utils/errorMessages';

export interface ContractAttachment {
  id: string;
  company_id: string;
  contract_id: string;
  display_name: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
}

const BUCKET = 'contract-attachments';

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
 * Hook principal: lista, upload, rename e remove anexos de um contrato.
 * Segue o mesmo padrão de `useTransactionAttachments`.
 * Hook é a fronteira do Supabase — componente nunca chama supabase.from direto.
 */
export function useContractAttachments(contractId?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Query: lista por contract_id ──────────────────────────────────────────
  const list = useQuery({
    queryKey: ['contract-attachments', contractId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contract_attachments')
        .select('*')
        .eq('contract_id', contractId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ContractAttachment[];
    },
    enabled: !!contractId,
  });

  // ── Mutation: upload de arquivo ────────────────────────────────────────────
  const upload = useMutation({
    mutationFn: async ({
      file,
      displayName,
    }: {
      file: File;
      displayName: string;
    }) => {
      if (!user) throw new Error('Usuário não autenticado');
      if (!contractId) throw new Error('Contrato não informado');

      const companyId = await fetchUserCompanyId(user.id);
      if (!companyId) throw new Error('Empresa não encontrada para o usuário');

      const safeName = sanitizeStorageFileName(file.name);
      const storagePath = `${companyId}/${contractId}/${crypto.randomUUID()}_${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (uploadError) throw uploadError;

      // Trigger server-side preenche company_id e uploaded_by automaticamente.
      // Mas o tipo Insert ainda exige company_id — passamos explicitamente.
      const { data, error } = await supabase
        .from('contract_attachments')
        .insert({
          contract_id: contractId,
          display_name: displayName.trim() || file.name,
          storage_path: storagePath,
          mime_type: file.type || null,
          size_bytes: file.size ?? null,
          company_id: companyId,
        })
        .select()
        .single();

      if (error) {
        // Limpa arquivo órfão no storage se o insert falhou
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        throw error;
      }

      return data as ContractAttachment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-attachments', contractId] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao enviar anexo',
        description: getErrorMessage(error),
      });
    },
  });

  // ── Mutation: renomear (UPDATE display_name) ───────────────────────────────
  const rename = useMutation({
    mutationFn: async ({ id, displayName }: { id: string; displayName: string }) => {
      const { error } = await supabase
        .from('contract_attachments')
        .update({ display_name: displayName.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-attachments', contractId] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao renomear anexo',
        description: getErrorMessage(error),
      });
    },
  });

  // ── Mutation: remover row + arquivo no storage ─────────────────────────────
  const remove = useMutation({
    mutationFn: async ({
      id,
      storagePath,
    }: {
      id: string;
      storagePath: string;
    }) => {
      const { error } = await supabase
        .from('contract_attachments')
        .delete()
        .eq('id', id);
      if (error) throw error;

      // Bucket privado — remove o arquivo físico (best-effort)
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contract-attachments', contractId] });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Erro ao remover anexo',
        description: getErrorMessage(error),
      });
    },
  });

  return { list, upload, rename, remove };
}

/**
 * Gera URL assinada (60 s) pra download de um arquivo no bucket privado.
 */
export async function getContractAttachmentSignedUrl(
  storagePath: string,
  ttlSeconds = 60,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, ttlSeconds);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Formata tamanho em bytes em string legível (KB / MB).
 */
export function formatContractAttachmentSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
