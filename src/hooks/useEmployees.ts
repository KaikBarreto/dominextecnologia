import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export type PaymentFrequency = 'monthly' | 'biweekly' | 'weekly';
export type PaymentDayType = 'business' | 'calendar';

export interface Employee {
  id: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  email: string | null;
  position: string | null;
  salary: number;
  hire_date: string | null;
  address: string | null;
  pix_key: string | null;
  photo_url: string | null;
  user_id: string | null;
  ponto_enabled: boolean;
  ponto_slug: string | null;
  public_short_code: string | null;
  is_active: boolean;
  monthly_cost: number | null;
  monthly_cost_breakdown: any;
  payment_frequency: PaymentFrequency;
  payment_day_type: PaymentDayType;
  payment_day: number | null;
  payment_day_2: number | null;
  payment_weekday: number | null;
  employment_regime: 'informal' | 'clt' | 'pj';
  dependents_count: number;
  vt_enabled: boolean;
  vt_monthly_value: number;
  cbo: string | null;
  matricula: string | null;
  /** CNPJ do prestador PJ/MEI. Só preenchido quando employment_regime = 'pj'. */
  pj_cnpj: string | null;
  /** Razão social do prestador PJ/MEI (o nome fantasia/pessoal fica em `name`). */
  pj_legal_name: string | null;
  /** true = o prestador é MEI. false para PJ comum e para quem não é 'pj'. */
  pj_is_mei: boolean;
  created_at: string;
  updated_at: string;
}

export function useEmployees() {
  const { toast } = useToast();
  const qc = useQueryClient();
  // PJ/MEI não é "funcionário" no vocabulário do dono — os toasts de
  // criar/editar têm variante própria (achado em QA: "Funcionário criado!"
  // depois de cadastrar um prestador pela aba PJ/MEI).
  const { locale } = useAppLocaleContext();
  const tToasts = MESSAGES[locale].app.employees.toasts;

  const employeesQuery = useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Employee[];
    },
  });

  const createEmployee = useMutation({
    mutationFn: async (input: Partial<Omit<Employee, 'id' | 'created_at' | 'updated_at'>>) => {
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase.from('employees').insert({ ...input, company_id } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast({ title: variables?.employment_regime === 'pj' ? tToasts.providerCreated : tToasts.employeeCreated });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao criar funcionário', description: getErrorMessage(e) }),
  });

  const updateEmployee = useMutation({
    mutationFn: async ({ id, ...input }: Partial<Employee> & { id: string }) => {
      const { data, error } = await supabase.from('employees').update(input as any).eq('id', id).select().single();
      if (error) throw error;
      return data;
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
    isLoading: employeesQuery.isLoading,
    createEmployee, updateEmployee, archiveEmployee,
  };
}
