import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface EquipmentAttachment {
  id: string;
  equipment_id: string;
  file_url: string;
  file_name: string;
  file_type?: string;
  description?: string;
  uploaded_by?: string;
  created_at: string;
}

export function useEquipmentAttachments(equipmentId?: string) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const attachmentsQuery = useQuery({
    queryKey: ['equipment-attachments', equipmentId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('equipment_attachments')
        .select('*')
        .eq('equipment_id', equipmentId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EquipmentAttachment[];
    },
    enabled: !!equipmentId,
  });

  const uploadAttachment = useMutation({
    mutationFn: async ({ equipmentId, file, description }: { equipmentId: string; file: File; description?: string }) => {
      const filePath = `${equipmentId}/${Date.now()}_${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('equipment-files')
        .upload(filePath, file);
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
      toast({ title: 'Anexo enviado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao enviar anexo', description: error.message });
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
