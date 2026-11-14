import { useInfiniteQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Fronteira Supabase das RESPOSTAS de um formulário público
 * (`public_form_submissions`). SÓ LEITURA: quem grava são as RPCs de envio
 * (INSERT é revogado de `authenticated`).
 */

export type PublicFormSubmissionSource = 'public_link' | 'customer_portal';

export interface PublicFormSubmission {
  id: string;
  customer_id: string | null;
  customer_name: string | null;
  source: PublicFormSubmissionSource;
  /** `question.id` -> valor bruto. */
  answers: Record<string, unknown>;
  /** Dados do cliente (os campos fixos), quando o formulário os coleta. */
  fields: Record<string, unknown>;
  submitted_at: string;
}

export const PUBLIC_FORM_SUBMISSIONS_PAGE_SIZE = 20;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function usePublicFormSubmissions(formId: string | null | undefined, pageSize = PUBLIC_FORM_SUBMISSIONS_PAGE_SIZE) {
  const { user, loading } = useAuth();

  const query = useInfiniteQuery({
    queryKey: ['public-form-submissions', formId, pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * pageSize;
      const { data, error, count } = await supabase
        .from('public_form_submissions')
        .select('id, customer_id, source, answers, fields, submitted_at, customer:customers(name)', { count: 'exact' })
        .eq('form_id', formId as string)
        .order('submitted_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      const rows = ((data ?? []) as any[]).map((row): PublicFormSubmission => ({
        id: row.id,
        customer_id: row.customer_id ?? null,
        customer_name: row.customer?.name ?? null,
        source: row.source === 'customer_portal' ? 'customer_portal' : 'public_link',
        answers: asRecord(row.answers),
        fields: asRecord(row.fields),
        submitted_at: row.submitted_at,
      }));
      return { rows, total: count ?? rows.length, page: pageParam as number };
    },
    getNextPageParam: (lastPage) =>
      (lastPage.page + 1) * pageSize < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: !loading && !!user && !!formId,
    retry: 2,
  });

  return {
    submissions: query.data?.pages.flatMap((page) => page.rows) ?? [],
    total: query.data?.pages[0]?.total ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    hasNextPage: !!query.hasNextPage,
    fetchNextPage: query.fetchNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
  };
}
