import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
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

export interface PublicFormSubmissionFeedItem extends PublicFormSubmission {
  form_id: string;
  form_title: string;
}

export const PUBLIC_FORM_SUBMISSIONS_PAGE_SIZE = 20;

interface RawSubmissionRow {
  id: string;
  form_id?: string;
  customer_id: string | null;
  source: string;
  answers: unknown;
  fields: unknown;
  submitted_at: string;
  customer?: { name?: string | null } | Array<{ name?: string | null }> | null;
  form?: { title?: string | null } | Array<{ title?: string | null }> | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function relationValue(
  relation: RawSubmissionRow['customer'] | RawSubmissionRow['form'],
  key: 'name' | 'title',
): string | null {
  const value = Array.isArray(relation) ? relation[0] : relation;
  const field = value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : null;
  return typeof field === 'string' && field.trim() ? field : null;
}

function mapSubmission(row: RawSubmissionRow): PublicFormSubmission {
  return {
    id: row.id,
    customer_id: row.customer_id ?? null,
    customer_name: relationValue(row.customer, 'name'),
    source: row.source === 'customer_portal' ? 'customer_portal' : 'public_link',
    answers: asRecord(row.answers),
    fields: asRecord(row.fields),
    submitted_at: row.submitted_at,
  };
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

      const rows = ((data ?? []) as unknown as RawSubmissionRow[]).map(mapSubmission);
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

/**
 * Feed agregado de respostas da empresa. O RLS de `public_form_submissions`
 * continua sendo a fronteira multi-tenant; o filtro por formulário é apenas
 * uma conveniência de consulta da UI.
 */
export function useAllPublicFormSubmissions(
  formId?: string | null,
  pageSize = PUBLIC_FORM_SUBMISSIONS_PAGE_SIZE,
) {
  const { user, loading } = useAuth();

  const query = useInfiniteQuery({
    queryKey: ['public-form-submissions', 'feed', formId ?? 'all', pageSize],
    initialPageParam: 0,
    queryFn: async ({ pageParam }) => {
      const from = pageParam * pageSize;
      let request = supabase
        .from('public_form_submissions')
        .select(
          'id, form_id, customer_id, source, answers, fields, submitted_at, form:lead_capture_forms(title), customer:customers(name)',
          { count: 'exact' },
        )
        .order('submitted_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (formId) request = request.eq('form_id', formId);
      const { data, error, count } = await request;
      if (error) throw error;

      const rows = ((data ?? []) as unknown as RawSubmissionRow[]).map((row): PublicFormSubmissionFeedItem => ({
        ...mapSubmission(row),
        form_id: row.form_id as string,
        form_title: relationValue(row.form, 'title') ?? 'Formulário removido',
      }));
      return { rows, total: count ?? rows.length, page: pageParam as number };
    },
    getNextPageParam: (lastPage) =>
      (lastPage.page + 1) * pageSize < lastPage.total ? lastPage.page + 1 : undefined,
    enabled: !loading && !!user,
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

/** Busca pontual usada por notificações, inclusive quando a resposta não está na primeira página do feed. */
export function usePublicFormSubmission(submissionId?: string | null) {
  const { user, loading } = useAuth();
  return useQuery({
    queryKey: ['public-form-submissions', 'detail', submissionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('public_form_submissions')
        .select('id, form_id, customer_id, source, answers, fields, submitted_at, form:lead_capture_forms(title), customer:customers(name)')
        .eq('id', submissionId as string)
        .single();
      if (error) throw error;
      const row = data as unknown as RawSubmissionRow;
      return {
        ...mapSubmission(row),
        form_id: row.form_id as string,
        form_title: relationValue(row.form, 'title') ?? 'Formulário removido',
      } satisfies PublicFormSubmissionFeedItem;
    },
    enabled: !loading && !!user && !!submissionId,
    retry: 2,
  });
}
