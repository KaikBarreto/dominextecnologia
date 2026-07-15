import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { FormTemplate, FormQuestion } from '@/types/database';
import { CheckSquare, Type, Hash, Camera, Video, ListChecks, ShieldCheck, LucideIcon } from 'lucide-react';
import { getErrorMessage } from '@/utils/errorMessages';

export interface FormTemplateInsert {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface FormQuestionInsert {
  template_id: string;
  question: string;
  question_type: 'boolean' | 'text' | 'number' | 'photo' | 'video' | 'select' | 'signature' | 'conformidade';
  options?: string[];
  is_required?: boolean;
  position?: number;
  description?: string;
  require_camera?: boolean;
  answer_types?: string[] | null;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  // Frequência por pergunta (módulo Contratos). NULL = toda visita.
  freq_kind?: 'time' | 'visits' | null;
  freq_months?: number | null;
  freq_days?: number | null;
  freq_visits?: number | null;
  start_kind?: 'contract_start' | 'due_now' | 'visit_n' | null;
  start_visit?: number | null;
}

export const QUESTION_TYPES: { value: string; label: string; icon: LucideIcon }[] = [
  { value: 'boolean', label: 'Verdadeiro/Falso', icon: CheckSquare },
  { value: 'conformidade', label: 'Conformidade', icon: ShieldCheck },
  { value: 'text', label: 'Texto', icon: Type },
  { value: 'number', label: 'Número', icon: Hash },
  { value: 'photo', label: 'Foto', icon: Camera },
  { value: 'video', label: 'Vídeo', icon: Video },
  { value: 'select', label: 'Seleção', icon: ListChecks },
  { value: 'signature', label: 'Assinatura', icon: Type },
];

export function useFormTemplates() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['form-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('form_templates')
        .select(`
          *,
          questions:form_questions(*),
          service_type_links:form_template_service_types(service_type_id)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data as any[]).map((template) => {
        const serviceTypeIds = (template.service_type_links ?? []).map((link: any) => link.service_type_id);
        return {
          ...template,
          service_type_ids: serviceTypeIds,
          applies_to_all_services: serviceTypeIds.length === 0,
        } as FormTemplate & { questions: FormQuestion[] };
      });
    },
  });

  const createTemplate = useMutation({
    mutationFn: async (template: FormTemplateInsert) => {
      const { data: userData } = await supabase.auth.getUser();
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('form_templates')
        .insert({ ...template, created_by: userData.user?.id, company_id } as any)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Template criado com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao criar template', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateTemplate = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormTemplate> & { id: string }) => {
      const { data, error } = await supabase
        .from('form_templates')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Template atualizado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar template', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase
        .from('form_templates')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Checklist desativado!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao desativar checklist', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const createQuestion = useMutation({
    mutationFn: async (question: FormQuestionInsert) => {
      const { data, error } = await supabase
        .from('form_questions')
        .insert(question)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Pergunta adicionada!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao adicionar pergunta', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const createQuestionsBatch = useMutation({
    mutationFn: async (questions: FormQuestionInsert[]) => {
      if (questions.length === 0) return [];
      const { data, error } = await supabase
        .from('form_questions')
        .insert(questions)
        .select();

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      const count = Array.isArray(data) ? data.length : 0;
      toast({ title: count === 1 ? 'Pergunta importada!' : `${count} perguntas importadas!` });
    },
    onError: (error) => {
      toast({ title: 'Erro ao importar perguntas', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<FormQuestion> & { id: string }) => {
      const { data, error } = await supabase
        .from('form_questions')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar pergunta', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('form_questions')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Pergunta removida!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao remover pergunta', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const reorderQuestions = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const updates = orderedIds.map((id, index) =>
        supabase.from('form_questions').update({ position: index }).eq('id', id)
      );
      await Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
    },
  });

  const setTemplateServices = useMutation({
    mutationFn: async ({ templateId, serviceTypeIds }: { templateId: string; serviceTypeIds: string[] }) => {
      const { error: deleteError } = await supabase
        .from('form_template_service_types')
        .delete()
        .eq('template_id', templateId);

      if (deleteError) throw deleteError;

      if (serviceTypeIds.length > 0) {
        const payload = serviceTypeIds.map((serviceTypeId) => ({ template_id: templateId, service_type_id: serviceTypeId }));
        const { error: insertError } = await supabase
          .from('form_template_service_types')
          .insert(payload as any);

        if (insertError) throw insertError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Serviços vinculados ao checklist!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao vincular serviços', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createQuestion,
    createQuestionsBatch,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    setTemplateServices,
  };
}
