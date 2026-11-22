import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useAuth } from '@/contexts/AuthContext';
import { canManageEmployeesFromAuth } from '@/hooks/useCanManageEmployees';
import { assertRowsAffected } from '@/lib/supabaseMutation';

export type PaymentFrequency = 'monthly' | 'biweekly' | 'weekly';
export type PaymentDayType = 'business' | 'calendar';

// ─────────────────────────────────────────────────────────────────────────────
// Leitura de RH (fase B, 21/11/2026)
// ─────────────────────────────────────────────────────────────────────────────
// Depois da migration 20261122090000 o banco só deixa `authenticated` ler as
// 17 colunas abaixo de `employees`. Qualquer `select('*')`, coluna sensível ou
// `.insert().select()`/`.update().select()` que devolva a linha inteira FALHA
// a consulta inteira (e um embed `employees(...)` derruba a tela que o usa).
// Os dados de RH (salário, CPF, PIX...) chegam só pela RPC `get_employees_hr`,
// e só para quem tem `can_manage_employees`.
//
// A lista é conferida por src/hooks/employeesColumnGrants.test.ts contra o
// GRANT da migration: coluna nova aqui sem GRANT lá quebra o teste.

/** Colunas que qualquer membro da empresa pode ler direto da tabela. */
export const EMPLOYEE_PUBLIC_COLUMNS = [
  'id', 'name', 'email', 'position', 'hire_date', 'photo_url', 'is_active',
  'created_at', 'updated_at', 'user_id', 'company_id',
  'ponto_slug', 'ponto_enabled', 'public_short_code',
  'employment_regime', 'cbo', 'matricula',
] as const;

/** Colunas que só chegam pela RPC de RH. Para quem não é RH ficam `null`. */
export const EMPLOYEE_SENSITIVE_COLUMNS = [
  'cpf', 'phone', 'salary', 'address', 'pix_key', 'monthly_cost', 'monthly_cost_breakdown',
  'payment_frequency', 'payment_day_type', 'payment_day', 'payment_day_2', 'payment_weekday',
  'dependents_count', 'vt_enabled', 'vt_monthly_value', 'pj_cnpj', 'pj_legal_name', 'pj_is_mei',
] as const;

export type EmployeeSensitiveColumn = typeof EMPLOYEE_SENSITIVE_COLUMNS[number];

/** String pronta para `.select(...)` de `employees` sem coluna sensível. */
export const EMPLOYEE_PUBLIC_SELECT = 'id, name, email, position, hire_date, photo_url, is_active, created_at, updated_at, user_id, company_id, ponto_slug, ponto_enabled, public_short_code, employment_regime, cbo, matricula';

export interface Employee {
  id: string;
  name: string;
  email: string | null;
  position: string | null;
  hire_date: string | null;
  photo_url: string | null;
  user_id: string | null;
  company_id?: string;
  ponto_enabled: boolean;
  ponto_slug: string | null;
  public_short_code: string | null;
  is_active: boolean;
  employment_regime: 'informal' | 'clt' | 'pj';
  cbo: string | null;
  matricula: string | null;
  created_at: string;
  updated_at: string;

  // ── Dados de RH: `null` para quem não tem permissão de RH ──────────────────
  // Nunca invente valor no lugar (ex.: `salary ?? 0` exibido como salário):
  // null significa "não autorizado a ver", não "zero".
  cpf: string | null;
  phone: string | null;
  salary: number | null;
  address: string | null;
  pix_key: string | null;
  monthly_cost: number | null;
  monthly_cost_breakdown: any;
  payment_frequency: PaymentFrequency | null;
  payment_day_type: PaymentDayType | null;
  payment_day: number | null;
  payment_day_2: number | null;
  payment_weekday: number | null;
  dependents_count: number | null;
  vt_enabled: boolean | null;
  vt_monthly_value: number | null;
  /** CNPJ do prestador PJ/MEI. Só preenchido quando employment_regime = 'pj'. */
  pj_cnpj: string | null;
  /** Razão social do prestador PJ/MEI (o nome fantasia/pessoal fica em `name`). */
  pj_legal_name: string | null;
  /** true = o prestador é MEI. false para PJ comum e para quem não é 'pj'. */
  pj_is_mei: boolean | null;
}

/** Linha pública (17 colunas) → Employee com os campos de RH em `null`. */
export function withHrFieldsHidden(row: Record<string, unknown>): Employee {
  const out: Record<string, unknown> = { ...row };
  for (const column of EMPLOYEE_SENSITIVE_COLUMNS) out[column] = null;
  return out as unknown as Employee;
}

/** Lê as linhas públicas (sem RH) de `employees`. `ids` limita a busca. */
async function fetchPublicEmployees(ids?: string[]): Promise<Employee[]> {
  let query = supabase.from('employees').select(EMPLOYEE_PUBLIC_SELECT);
  if (ids) query = query.in('id', ids);
  const { data, error } = await query.order('name');
  if (error) throw error;
  return ((data ?? []) as Record<string, unknown>[]).map(withHrFieldsHidden);
}

/**
 * Lê os funcionários com os dados de RH pela RPC `get_employees_hr`.
 * `ids` limita a busca (a RPC devolve ativos E arquivados, como o select antigo).
 */
export async function fetchEmployeesHr(ids?: string[]): Promise<Employee[]> {
  const { data, error } = await supabase.rpc('get_employees_hr', ids ? { p_ids: ids } : {});
  if (error) throw error;
  return (data ?? []) as unknown as Employee[];
}

/**
 * RH → linha completa pela RPC. Não-RH → só as 17 colunas, RH em `null`.
 *
 * Se o front acha que o usuário é RH mas o banco recusa (42501: permissão
 * revogada com a sessão aberta, por exemplo), cai para a leitura pública em
 * vez de derrubar a tela: o banco é a fonte da verdade.
 */
export async function fetchEmployees(canManage: boolean, ids?: string[]): Promise<Employee[]> {
  if (canManage) {
    try {
      return await fetchEmployeesHr(ids);
    } catch (error) {
      if ((error as { code?: string } | null)?.code !== '42501') throw error;
    }
  }
  return fetchPublicEmployees(ids);
}

/**
 * Dados de RH de UM funcionário, só para quem é RH (null para os demais e
 * enquanto carrega). Usado onde a tela precisa do salário fora da lista de
 * funcionários (ex.: pagar folha pelo Financeiro).
 */
export function useEmployeeHrDetails(employeeId: string | null | undefined) {
  const auth = useAuth();
  const canManage = canManageEmployeesFromAuth(auth);
  const query = useQuery({
    queryKey: ['employees', 'hr-detail', employeeId],
    enabled: !!employeeId && canManage && !auth.profileLoading,
    queryFn: async () => {
      const rows = await fetchEmployeesHr([employeeId as string]);
      return rows[0] ?? null;
    },
  });
  return {
    canManage,
    employee: canManage ? (query.data ?? null) : null,
    isLoading: canManage && !!employeeId && query.isLoading,
  };
}

export function useEmployees() {
  const { toast } = useToast();
  const qc = useQueryClient();
  // PJ/MEI não é "funcionário" no vocabulário do dono — os toasts de
  // criar/editar têm variante própria (achado em QA: "Funcionário criado!"
  // depois de cadastrar um prestador pela aba PJ/MEI).
  const { locale } = useAppLocaleContext();
  const tToasts = MESSAGES[locale].app.employees.toasts;
  const auth = useAuth();
  const canManage = canManageEmployeesFromAuth(auth);

  // A chave carrega o modo: quem vira RH no meio da sessão (permissão
  // carregou depois) não reaproveita a lista sem RH do cache. `['employees']`
  // continua sendo prefixo, então todas as invalidações existentes valem.
  const employeesQuery = useQuery({
    queryKey: ['employees', canManage ? 'hr' : 'public'],
    // Espera o perfil/permissões: sem isto todo RH faria uma leitura pública
    // inútil antes da de RH.
    enabled: !auth.profileLoading,
    queryFn: () => fetchEmployees(canManage),
  });

  // Recarrega UM funcionário depois de gravar. Insert/update nunca usam
  // `.select()`: a linha devolvida pelo PostgREST incluiria colunas sem
  // permissão de leitura depois da fase B2.
  const reloadEmployee = async (id: string, fallback: Partial<Employee>): Promise<Employee> => {
    const rows = await fetchEmployees(canManage, [id]);
    return rows[0] ?? ({ ...fallback, id } as Employee);
  };

  const createEmployee = useMutation({
    mutationFn: async (input: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      // ID gerado no client: dispensa o RETURNING para saber o id criado.
      const id = crypto.randomUUID();
      const { error } = await supabase.from('employees').insert({ ...input, id, company_id } as any);
      if (error) throw error;
      return reloadEmployee(id, { ...input, company_id } as Partial<Employee>);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: variables?.employment_regime === 'pj' ? tToasts.providerCreated : tToasts.employeeCreated });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao criar funcionário', description: getErrorMessage(e) }),
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Employee> & { id: string }) => {
      // Sem `.select()` (ver reloadEmployee). `count: 'exact'` mantém a prova
      // de que a linha foi gravada: a RLS que barra UPDATE não devolve erro,
      // só zero linhas.
      assertRowsAffected(
        await supabase.from('employees').update(input as any, { count: 'exact' }).eq('id', id),
        'update',
      );
      return reloadEmployee(id, input);
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: variables?.employment_regime === 'pj' ? tToasts.providerUpdated : tToasts.employeeUpdated });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao atualizar funcionário', description: getErrorMessage(e) }),
  });

  const archiveEmployee = useMutation({
    mutationFn: async (id: string) => {
      // RPC transacional: preserva funcionario/historico e remove vinculos
      // operacionais sem deixar estado parcial entre requests do navegador.
      const { error } = await supabase.rpc('archive_employee', {
        p_employee_id: id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      qc.invalidateQueries({ queryKey: ['team-members'] });
      qc.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Funcionário arquivado!', description: 'O histórico foi preservado e o funcionário foi removido das equipes e ordens de serviço ativas.' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao arquivar funcionário', description: getErrorMessage(e) }),
  });

  return {
    employees: employeesQuery.data || [],
    // `isPending` cobre a espera do perfil (query desligada, ainda sem dado):
    // `isLoading` seria false ali e a tela piscaria "nenhum funcionário".
    isLoading: employeesQuery.isPending,
    isError: employeesQuery.isError,
    /** true = a lista veio com os dados de RH (salário, CPF...). */
    canManage,
    refetch: employeesQuery.refetch,
    createEmployee, updateEmployee, archiveEmployee,
  };
}
