import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { isLiveChargeStatus } from '@/lib/contract-installment-charge';

// ─────────────────────────────────────────────────────────────────────────────
// useContractInstallmentCharges — cobranças online (Asaas BYO) já geradas a
// partir das PARCELAS de um contrato (`tenant_charges.source_type =
// 'contract_installment'`, `source_id` = id da parcela em
// financial_transactions).
//
// Serve pra tela de contrato saber, parcela a parcela, se a ação é "cobrar
// online" ou "ver a cobrança que já existe". Sem isto o usuário clicaria em
// cobrar de novo: a edge faz dedupe e devolve a mesma cobrança, mas o usuário
// não entenderia por que "gerou" a mesma coisa.
//
// A queryKey começa com ['tenant-charges', companyId] de propósito: o
// `useTenantCharges.create` invalida esse prefixo ao gerar a cobrança, então
// esta lista se atualiza sozinha, sem reload.
// ─────────────────────────────────────────────────────────────────────────────

export interface ContractInstallmentCharge {
  id: string;
  /** Id da parcela (financial_transactions) que originou a cobrança. */
  installmentId: string;
  status: string;
  value: number;
  dueDate: string | null;
  publicShortCode: string | null;
  invoiceUrl: string | null;
}

export function useContractInstallmentCharges(
  contractId: string | undefined,
  installmentIds: string[],
) {
  const { companyId } = useUserCompany();

  // Ordenado pra a chave não mudar por causa da ordem da listagem (paginação,
  // reordenação) e disparar refetch à toa.
  const idsKey = useMemo(() => [...installmentIds].sort().join(','), [installmentIds]);

  const query = useQuery({
    queryKey: ['tenant-charges', companyId, 'contract-installments', contractId, idsKey],
    enabled: !!companyId && !!contractId && installmentIds.length > 0,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ContractInstallmentCharge[]> => {
      if (!companyId || installmentIds.length === 0) return [];
      const { data, error } = await supabase
        .from('tenant_charges')
        .select('id, source_id, status, value, due_date, public_short_code, invoice_url, created_at')
        .eq('company_id', companyId)
        .eq('source_type', 'contract_installment')
        .in('source_id', installmentIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? [])
        .filter((row) => !!row.source_id)
        .map((row) => ({
          id: row.id as string,
          installmentId: row.source_id as string,
          status: (row.status as string) ?? '',
          value: Number(row.value ?? 0),
          dueDate: (row.due_date as string | null) ?? null,
          publicShortCode: (row.public_short_code as string | null) ?? null,
          invoiceUrl: (row.invoice_url as string | null) ?? null,
        }));
    },
  });

  /**
   * Parcela → cobrança VIVA (a mais recente). Cobrança cancelada/estornada
   * fica de fora: a edge deixa cobrar de novo nesse caso, e a tela tem que
   * deixar também. Espelha `DEDUPE_DEAD_STATUSES` da edge via
   * `isLiveChargeStatus`.
   */
  const liveChargeByInstallment = useMemo(() => {
    const map = new Map<string, ContractInstallmentCharge>();
    for (const charge of query.data ?? []) {
      if (!isLiveChargeStatus(charge.status)) continue;
      // A consulta vem ordenada por created_at desc: a primeira é a mais nova.
      if (!map.has(charge.installmentId)) map.set(charge.installmentId, charge);
    }
    return map;
  }, [query.data]);

  return {
    liveChargeByInstallment,
    isLoading: query.isLoading,
  };
}
