import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { buildStorageFilePath } from '@/utils/storagePath';
import { getErrorMessage } from '@/utils/errorMessages';
import { tenantFileOptions } from '@/utils/tenantStorage';

export interface EquipmentAttachment {
  id: string;
  equipment_id: string;
  file_url: string;
  file_name: string;
  file_type?: string;
  description?: string;
  uploaded_by?: string;
  created_at: string;
  source: 'manual' | 'pmoc';
  pmoc_document_id?: string;
  service_order_id?: string;
}

interface LinkedEquipmentPmocDocument {
  id: string;
  doc_type: string;
  file_name: string;
  pdf_storage_path: string;
  generated_at: string;
  service_order_id: string;
}

interface EquipmentPmocLink {
  id: string;
  equipment_id: string;
  created_at: string;
  service_order_pmoc_documents: LinkedEquipmentPmocDocument | LinkedEquipmentPmocDocument[] | null;
}

function firstRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? value[0] ?? null : value;
}

export function useEquipmentAttachments(equipmentId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const attachmentsQuery = useQuery({
    queryKey: ['equipment-attachments', equipmentId],
    queryFn: async () => {
      const [manualResult, pmocResult] = await Promise.all([
        supabase
          .from('equipment_attachments')
          .select('*')
          .eq('equipment_id', equipmentId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('service_order_pmoc_document_links')
          .select(`
            id, equipment_id, created_at,
            service_order_pmoc_documents!inner(
              id, doc_type, file_name, pdf_storage_path, generated_at,
              service_order_id
            )
          `)
          .eq('equipment_id', equipmentId!)
          .order('created_at', { ascending: false }),
      ]);
      if (manualResult.error) throw manualResult.error;
      if (pmocResult.error) throw pmocResult.error;

      const manual = (manualResult.data ?? []).map((attachment) => ({
        ...attachment,
        source: 'manual' as const,
      })) as EquipmentAttachment[];
      const links = (pmocResult.data ?? []) as unknown as EquipmentPmocLink[];
      const pmoc = (await Promise.all(links.map(async (link): Promise<EquipmentAttachment | null> => {
        const document = firstRelation(link.service_order_pmoc_documents);
        if (!document) return null;
        const { data: signed, error: signedError } = await supabase.storage
          .from('pmoc-documents')
          .createSignedUrl(document.pdf_storage_path, 3600, { download: document.file_name });
        if (signedError || !signed?.signedUrl) throw signedError ?? new Error('Não foi possível abrir o documento PMOC.');
        return {
          id: link.id,
          equipment_id: link.equipment_id,
          file_url: signed.signedUrl,
          file_name: document.file_name,
          file_type: 'application/pdf',
          description: document.doc_type === 'certificado_conformidade'
            ? 'Certificado de conformidade gerado pela OS'
            : 'Relatório de serviço PMOC gerado pela OS',
          created_at: document.generated_at ?? link.created_at,
          source: 'pmoc',
          pmoc_document_id: document.id,
          service_order_id: document.service_order_id,
        };
      }))).filter((attachment): attachment is EquipmentAttachment => attachment !== null);
      return [...manual, ...pmoc].sort((a, b) => b.created_at.localeCompare(a.created_at));
    },
    enabled: !!equipmentId,
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ equipmentId, file, description }: { equipmentId: string; file: File; description?: string }) => {
      const filePath = buildStorageFilePath({
        folder: equipmentId,
        fileName: file.name,
        prefix: String(Date.now()),
      });

      const { error: uploadError } = await supabase.storage
        .from('equipment-files')
        .upload(filePath, file, await tenantFileOptions());
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('equipment-files').getPublicUrl(filePath);

      const { data, error } = await supabase.from('equipment_attachments').insert({
        equipment_id: equipmentId,
        file_url: publicUrl,
        file_name: file.name,
        file_type: file.type,
        description,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-attachments', equipmentId] });
    },
    onError: (error) => {
      toast({ variant: 'destructive', title: 'Erro ao enviar anexo', description: getErrorMessage(error) });
    },
  });

  const deleteAttachment = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('equipment_attachments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['equipment-attachments', equipmentId] });
      toast({ title: 'Anexo excluído!' });
    },
  });

  return {
    attachments: attachmentsQuery.data ?? [],
    isLoading: attachmentsQuery.isLoading,
    uploadAttachment,
    deleteAttachment,
  };
}
