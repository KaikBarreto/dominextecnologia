import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/utils/errorMessages';

export type ContractBillingType = 'monthly' | 'per_order' | 'hourly' | 'daily';
export type ContractStatus = 'active' | 'ended';

export interface EmployeeContract {
  id: string;
  company_id: string;
  employee_id: string;
  start_date: string;
  /** `null` = prazo indeterminado. */
  end_date: string | null;
  billing_type: ContractBillingType;
  amount: number;
  payment_day: number | null;
  readjustment_percent: number | null;
  status: ContractStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type EmployeeContractInput = Omit<
  EmployeeContract,
  'id' | 'company_id' | 'created_at' | 'updated_at' | 'status'
> & { status?: ContractStatus };

/**
 * CRUD de `employee_contracts` (contrato de prestação de serviço do
 * funcionário PJ/MEI, aba PJ do RH). Fronteira do Supabase para essa tabela —
 * nenhum componente chama `supabase.from('employee_contracts')` direto.
 *
 * Histórico nunca é apagado: "renovar" é ENCERRAR o contrato vigente
 * (status → 'ended') e CRIAR uma linha nova. "Encerrar" só muda status,
 * nunca DELETE.
 */
export function useEmployeeContracts(employeeId: string | null) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const queryKey = ['employee-contracts', employeeId];

  const contractsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      if (!employeeId) return [];
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('*')
        .eq('employee_id', employeeId)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data as EmployeeContract[];
    },
    enabled: !!employeeId,
  });

  const contracts = contractsQuery.data || [];
  // Defensivo: nunca deveria haver 2+ linhas `active` pro mesmo funcionário
  // (createContract/renewContract encerram a anterior antes de inserir),
  // mas se um estado antigo ou uma corrida deixar mais de uma, o MAIS
  // RECENTE (maior `start_date`) vence — nunca um `.find()` arbitrário
  // (achado em QA: "Novo contrato" repetido mostrava o mais ANTIGO).
  const activeContract = useMemo(() => {
    const actives = contracts.filter((c) => c.status === 'active');
    if (actives.length === 0) return null;
    return actives.reduce((latest, c) =>
      new Date(c.start_date).getTime() > new Date(latest.start_date).getTime() ? c : latest,
    );
  }, [contracts]);

  /**
   * "Novo contrato" PRECISA encerrar qualquer vigente antes de inserir —
   * mesma regra do "Renovar". Sem isso, criar um contrato novo com um já
   * ativo deixava 2+ linhas `active` ao mesmo tempo: a tela mostrava uma
   * arbitrária como vigente e as outras não apareciam em lugar nenhum (nem
   * vigente, nem histórico, que só lista `status !== 'active'`). Achado em
   * QA: 3 cliques em "Novo contrato" davam 3 linhas `active`.
   */
  const createContract = useMutation({
    mutationFn: async (input: EmployeeContractInput) => {
      const { error: endError } = await supabase
        .from('employee_contracts')
        .update({ status: 'ended' } as any)
        .eq('employee_id', input.employee_id)
        .eq('status', 'active');
      if (endError) throw endError;
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('employee_contracts')
        .insert({ ...input, company_id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeContract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['employee-contracts-active-map'] });
      toast({ title: 'Contrato salvo!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao salvar contrato', description: getErrorMessage(e) }),
  });

  const endContract = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('employee_contracts')
        .update({ status: 'ended' } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['employee-contracts-active-map'] });
      toast({ title: 'Contrato encerrado!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao encerrar contrato', description: getErrorMessage(e) }),
  });

  /**
   * Renovar = encerra o vigente (se houver) e cria o novo numa única chamada,
   * preservando a linha antiga como histórico.
   */
  const renewContract = useMutation({
    mutationFn: async (input: { previousId?: string | null; next: EmployeeContractInput }) => {
      if (input.previousId) {
        const { error: endError } = await supabase
          .from('employee_contracts')
          .update({ status: 'ended' } as any)
          .eq('id', input.previousId);
        if (endError) throw endError;
      }
      const { getCurrentUserCompanyId } = await import('@/hooks/useUserCompany');
      const company_id = await getCurrentUserCompanyId();
      const { data, error } = await supabase
        .from('employee_contracts')
        .insert({ ...input.next, company_id } as any)
        .select()
        .single();
      if (error) throw error;
      return data as EmployeeContract;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ['employee-contracts-active-map'] });
      toast({ title: 'Contrato renovado!' });
    },
    onError: (e: Error) => toast({ variant: 'destructive', title: 'Erro ao renovar contrato', description: getErrorMessage(e) }),
  });

  return {
    contracts,
    activeContract,
    isLoading: contractsQuery.isLoading,
    createContract,
    endContract,
    renewContract,
  };
}

/**
 * Mapa employee_id → contrato ATIVO, pra lista da aba PJ (coluna de contrato
 * vigente + vigência) sem N+1 query por funcionário.
 */
export function useActiveEmployeeContractsMap() {
  const query = useQuery({
    queryKey: ['employee-contracts-active-map'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_contracts')
        .select('*')
        .eq('status', 'active');
      if (error) throw error;
      return data as EmployeeContract[];
    },
  });

  const map = useMemo(() => {
    const m = new Map<string, EmployeeContract>();
    for (const c of query.data || []) {
      const existing = m.get(c.employee_id);
      if (!existing || new Date(c.start_date).getTime() > new Date(existing.start_date).getTime()) {
        m.set(c.employee_id, c);
      }
    }
    return m;
  }, [query.data]);

  return { activeContractsMap: map, isLoading: query.isLoading };
}
