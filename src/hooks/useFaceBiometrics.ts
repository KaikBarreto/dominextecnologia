import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FaceTemplateStatus {
  enrolled: boolean;
  template_count: number;
  model_version: string | null;
  created_at: string | null;
}

export interface FaceEnrollmentLink {
  token: string;
  expires_at: string;
}

export function buildPointActivationLink(token: string, origin = window.location.origin): string | null {
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  return `${origin}/ativar-ponto/${token}`;
}

export function useFaceTemplateStatus(employeeId: string | null | undefined) {
  return useQuery({
    queryKey: ['employee-face-template-status', employeeId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_employee_face_template_status', {
        p_employee_id: employeeId!,
      });
      if (error) throw error;
      return data as unknown as FaceTemplateStatus;
    },
    enabled: !!employeeId,
    staleTime: 0,
    retry: false,
  });
}

export function useCreateFaceEnrollmentLink() {
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { data, error } = await supabase.rpc('create_employee_face_enrollment_link', {
        p_employee_id: employeeId,
      });
      if (error) throw error;
      return data as unknown as FaceEnrollmentLink;
    },
  });
}

export function useDeleteFaceBiometrics() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await supabase.rpc('delete_employee_face_templates', {
        p_employee_id: employeeId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, employeeId) => {
      queryClient.invalidateQueries({ queryKey: ['employee-face-template-status', employeeId] });
    },
  });
}
