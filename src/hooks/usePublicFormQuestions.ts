import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { parsePublicFormQuestions, type PublicFormQuestion, type PublicFormQuestionType } from '@/lib/publicFormQuestions';

/**
 * Fronteira Supabase das PERGUNTAS personalizadas do formulário público
 * (`public_form_questions`). Componente NUNCA chama `supabase.from` direto.
 *
 * - `company_id` é carimbado no insert (RLS escopa por company; o trigger do
 *   servidor ainda aborta se divergir do `company_id` do formulário).
 * - A leitura PÚBLICA das perguntas sai das RPCs (`get_lead_capture_form`), não
 *   daqui: este hook é só da área logada.
 * - O shape de saída é o mesmo `PublicFormQuestion` que a página pública usa,
 *   pra o construtor e o formulário real dizerem a mesma coisa.
 */

export interface PublicFormQuestionInput {
  form_id: string;
  question: string;
  description?: string | null;
  question_type: PublicFormQuestionType;
  options?: string[];
  is_required?: boolean;
  position?: number;
}

export interface PublicFormQuestionUpdate {
  id: string;
  question?: string;
  description?: string | null;
  question_type?: PublicFormQuestionType;
  options?: string[];
  is_required?: boolean;
}

/** Pergunta em edição no construtor. `id` é gerado no client (uuid), então vale para nova e existente. */
export interface PublicFormQuestionDraft {
  id: string;
  question: string;
  description: string | null;
  question_type: PublicFormQuestionType;
  options: string[];
  is_required: boolean;
}

export const PUBLIC_FORM_QUESTIONS_KEY = 'public-form-questions';
export const PUBLIC_FORM_QUESTION_COUNTS_KEY = 'public-form-question-counts';

export function toQuestionDraft(question: PublicFormQuestion): PublicFormQuestionDraft {
  return {
    id: question.id,
    question: question.question,
    description: question.description,
    question_type: question.question_type,
    options: question.options,
    is_required: question.is_required,
  };
}

export function usePublicFormQuestions(formId: string | null | undefined) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, loading } = useAuth();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [PUBLIC_FORM_QUESTIONS_KEY] });
    queryClient.invalidateQueries({ queryKey: [PUBLIC_FORM_QUESTION_COUNTS_KEY] });
  };

  const questionsQuery = useQuery({
    queryKey: [PUBLIC_FORM_QUESTIONS_KEY, formId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_form_questions')
        .select('*')
        .eq('form_id', formId as string)
        .order('position', { ascending: true });
      if (error) throw error;
      return parsePublicFormQuestions(data ?? []);
    },
    enabled: !loading && !!user && !!formId,
    retry: 2,
  });

  const createQuestion = useMutation({
    mutationFn: async (input: PublicFormQuestionInput) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('public_form_questions')
        .insert({ ...input, options: input.options ?? [], company_id } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pergunta adicionada!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao adicionar pergunta', description: getErrorMessage(error) });
    },
  });

  const updateQuestion = useMutation({
    mutationFn: async ({ id, ...updates }: PublicFormQuestionUpdate) => {
      const { data, error } = await supabase
        .from('public_form_questions')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar pergunta', description: getErrorMessage(error) });
    },
  });

  const deleteQuestion = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('public_form_questions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast({ title: 'Pergunta removida!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao remover pergunta', description: getErrorMessage(error) });
    },
  });

  /** Grava a nova ordem: `position` = índice do id na lista recebida. */
  const reorderQuestions = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('public_form_questions').update({ position: index } as any).eq('id', id),
        ),
      );
      const failed = results.find((result) => result.error);
      if (failed?.error) throw failed.error;
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao reordenar perguntas', description: getErrorMessage(error) });
    },
  });

  /**
   * Salva o conjunto inteiro de perguntas do construtor de uma vez: apaga as que
   * saíram, grava (upsert por id) as que ficaram com `position` = índice. Os ids
   * vêm do client, então reenviar o mesmo lote é seguro (idempotente). Sem toast
   * de sucesso: quem chama já avisa "Formulário salvo".
   */
  const saveQuestions = useMutation({
    mutationFn: async ({ formId: targetFormId, questions }: { formId: string; questions: PublicFormQuestionDraft[] }) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();

      const { data: existing, error: existingError } = await supabase
        .from('public_form_questions')
        .select('id')
        .eq('form_id', targetFormId);
      if (existingError) throw existingError;

      const keepIds = new Set(questions.map((question) => question.id));
      const removedIds = (existing ?? []).map((row) => row.id).filter((id) => !keepIds.has(id));

      if (removedIds.length > 0) {
        const { error } = await supabase.from('public_form_questions').delete().in('id', removedIds);
        if (error) throw error;
      }

      if (questions.length > 0) {
        const rows = questions.map((question, index) => ({
          id: question.id,
          company_id,
          form_id: targetFormId,
          question: question.question.trim(),
          description: question.description?.trim() || null,
          question_type: question.question_type,
          options: question.options,
          is_required: question.is_required,
          position: index,
        }));
        const { error } = await supabase
          .from('public_form_questions')
          .upsert(rows as any, { onConflict: 'id' });
        if (error) throw error;
      }
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao salvar as perguntas', description: getErrorMessage(error) });
    },
  });

  return {
    questions: questionsQuery.data ?? [],
    isLoading: questionsQuery.isLoading,
    isFetching: questionsQuery.isFetching,
    isError: questionsQuery.isError,
    isSuccess: questionsQuery.isSuccess,
    refetch: questionsQuery.refetch,
    createQuestion,
    updateQuestion,
    deleteQuestion,
    reorderQuestions,
    saveQuestions,
  };
}

/**
 * Contagem de perguntas por formulário (`form_id` -> total), pra lista de
 * formulários. Uma query só pra empresa inteira: a RLS já escopa por company.
 */
export function usePublicFormQuestionCounts() {
  const { user, loading } = useAuth();
  const query = useQuery({
    queryKey: [PUBLIC_FORM_QUESTION_COUNTS_KEY, user?.id ?? 'anon'],
    queryFn: async () => {
      const { data, error } = await supabase.from('public_form_questions').select('form_id');
      if (error) throw error;
      const counts: Record<string, number> = {};
      for (const row of data ?? []) counts[row.form_id] = (counts[row.form_id] ?? 0) + 1;
      return counts;
    },
    enabled: !loading && !!user,
  });
  return { counts: query.data ?? {}, isLoading: query.isLoading };
}
