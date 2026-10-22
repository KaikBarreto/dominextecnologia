import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

export type AdminDashboardCompany = Tables<'companies'>;
export type AdminDashboardPayment = Tables<'company_payments'>;
export type AdminDashboardTransaction = Tables<'admin_financial_transactions'>;
export type AdminDashboardOrigin = Pick<Tables<'company_origins'>, 'name' | 'color'>;

const PAGE_SIZE = 1000;
const MAX_PAGES = 50;

async function fetchAllPaged<T>(
  buildQuery: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

/** Dados administrativos globais autorizados pela RLS/role do Supabase. */
export function useAdminDashboardData() {
  const companiesQuery = useQuery({
    // Sufixo evita colidir com a lista de empresas, que enriquece as mesmas
    // linhas com `has_payment_history`. Invalidações pelo prefixo continuam.
    queryKey: ['admin-companies', 'dashboard'],
    queryFn: () =>
      fetchAllPaged<AdminDashboardCompany>((from, to) =>
        supabase
          .from('companies')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, to),
      ),
  });

  const paymentsQuery = useQuery({
    queryKey: ['admin-payments', 'dashboard'],
    queryFn: () =>
      fetchAllPaged<AdminDashboardPayment>((from, to) =>
        supabase
          .from('company_payments')
          .select('*')
          .order('payment_date', { ascending: false })
          .range(from, to),
      ),
  });

  const transactionsQuery = useQuery({
    queryKey: ['admin-financial-transactions', 'dashboard'],
    queryFn: () =>
      fetchAllPaged<AdminDashboardTransaction>((from, to) =>
        supabase
          .from('admin_financial_transactions')
          .select('*')
          .order('transaction_date', { ascending: false })
          .range(from, to),
      ),
  });

  const originsQuery = useQuery({
    queryKey: ['admin-company-origins-colors'],
    queryFn: async (): Promise<AdminDashboardOrigin[]> => {
      const { data, error } = await supabase
        .from('company_origins')
        .select('name, color')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  return {
    companies: companiesQuery.data ?? [],
    payments: paymentsQuery.data ?? [],
    transactions: transactionsQuery.data ?? [],
    companyOrigins: originsQuery.data ?? [],
    isLoading:
      companiesQuery.isLoading ||
      paymentsQuery.isLoading ||
      transactionsQuery.isLoading ||
      originsQuery.isLoading,
    isError:
      companiesQuery.isError ||
      paymentsQuery.isError ||
      transactionsQuery.isError ||
      originsQuery.isError,
    refetch: async () => {
      await Promise.all([
        companiesQuery.refetch(),
        paymentsQuery.refetch(),
        transactionsQuery.refetch(),
        originsQuery.refetch(),
      ]);
    },
  };
}
