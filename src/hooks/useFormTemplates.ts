import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { FormTemplate, FormQuestion } from '@/types/database';

export interface FormTemplateInsert {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface FormQuestionInsert {
  template_id: string;
  question: string;
  question_type: 'boolean' | 'text' | 'number' | 'photo' | 'select';
  options?: string[];
  is_required?: boolean;
  position?: number;
  description?: string;
}

export const QUESTION_TYPES = [
  { value: 'boolean', label: 'Verdadeiro/Falso', icon: '✓' },
  { value: 'text', label: 'Texto', icon: '📝' },
  { value: 'number', label: 'Número', icon: '🔢' },
  { value: 'photo', label: 'Foto', icon: '📷' },
  { value: 'select', label: 'Seleção', icon: '📋' },
] as const;

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
      const { data, error } = await supabase
        .from('form_templates')
        .insert({ ...template, created_by: userData.user?.id })
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
      toast({ 
        title: 'Erro ao criar template', 
        description: error.message,
        variant: 'destructive' 
      });
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
      toast({ 
        title: 'Erro ao atualizar template', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('form_templates')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['form-templates'] });
      toast({ title: 'Template removido!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao remover template', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Question mutations
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
      toast({ 
        title: 'Erro ao adicionar pergunta', 
        description: error.message,
        variant: 'destructive' 
      });
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
      toast({ 
        title: 'Erro ao atualizar pergunta', 
        description: error.message,
        variant: 'destructive' 
      });
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
      toast({ 
        title: 'Erro ao remover pergunta', 
        description: error.message,
        variant: 'destructive' 
      });
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

  return {
    templates,
    isLoading,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
  };
}
