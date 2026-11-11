type FinancialAccountError = { message: string };

type FinancialAccountRow = {
  company_id: string;
  name: string;
  type: string;
  color: string;
  icon: string;
  initial_balance: number;
  is_active: boolean;
  is_cash_account: boolean;
  sort_order: number;
};

type FinancialAccountsClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => PromiseLike<{
        data: Array<{ type?: unknown }> | null;
        error: FinancialAccountError | null;
      }>;
    };
    insert: (
      rows: FinancialAccountRow[],
    ) => PromiseLike<{ error: FinancialAccountError | null }>;
  };
};

const DEFAULT_FINANCIAL_ACCOUNTS = [
  {
    name: 'Caixa',
    type: 'caixa',
    color: '#10b981',
    icon: 'Wallet',
    initial_balance: 0,
    is_active: true,
    is_cash_account: true,
    sort_order: 0,
  },
  {
    name: 'Conta Principal',
    type: 'banco',
    color: '#3b82f6',
    icon: 'Landmark',
    initial_balance: 0,
    is_active: true,
    is_cash_account: true,
    sort_order: 1,
  },
] as const;

/**
 * Mantém o fallback das Edge Functions compatível com o trigger do banco.
 *
 * A consulta por tipo evita duplicar as contas quando a migration universal já
 * as criou no INSERT de `companies`, mas ainda cobre ambientes em que a Edge
 * Function seja publicada antes da migration.
 */
export async function ensureDefaultFinancialAccounts(
  supabaseClient: unknown,
  companyId: string,
): Promise<{ inserted: number; error: FinancialAccountError | null }> {
  // As duas Edge Functions ainda usam versões diferentes do supabase-js. O
  // contrato estrutural local evita acoplar o helper a uma dessas versões.
  const supabase = supabaseClient as FinancialAccountsClient;
  const { data: existingAccounts, error: lookupError } = await supabase
    .from('financial_accounts')
    .select('type')
    .eq('company_id', companyId);

  if (lookupError) return { inserted: 0, error: lookupError };

  const existingTypes = new Set(
    (existingAccounts ?? [])
      .map((account: { type?: unknown }) => account.type)
      .filter((type: unknown): type is string => typeof type === 'string'),
  );
  const missingAccounts = DEFAULT_FINANCIAL_ACCOUNTS
    .filter((account) => !existingTypes.has(account.type))
    .map((account) => ({ ...account, company_id: companyId }));

  if (missingAccounts.length === 0) return { inserted: 0, error: null };

  const { error: insertError } = await supabase
    .from('financial_accounts')
    .insert(missingAccounts);

  return {
    inserted: insertError ? 0 : missingAccounts.length,
    error: insertError ?? null,
  };
}
