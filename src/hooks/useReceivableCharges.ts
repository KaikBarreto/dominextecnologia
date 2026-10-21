import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserCompany } from '@/hooks/useUserCompany';
import { isLiveReceivableChargeStatus } from '@/lib/receivable-balance-charge';

// ─────────────────────────────────────────────────────────────────────────────
// useReceivableCharges — a cobrança online (Asaas BYO) LIGADA a cada conta a
// receber da lista.
//
// Serve pra duas coisas na tela de Contas:
//   1. mostrar o STATUS da cobrança na conta (em aberto / vencida / paga /
//      encerrada). Antes só aparecia o rótulo "Cobrança online", o que fez um
//      boleto já excluído parecer vivo;
//   2. decidir a ação: "Cobrar o saldo" (sem cobrança viva) ou "Substituir a
//      cobrança" (com cobrança viva, cancelando a atual antes).
//
// O elo entre conta e cobrança pode estar em QUALQUER UMA das duas pontas, e
// por isso são duas consultas (a mesma régua de `validate_receivable_charge_target`):
//   (a) `tenant_charges.source_type = 'receivable'` apontando pra conta — é a
//       cobrança do SALDO, criada a partir de uma conta que já existia;
//   (b) `financial_transactions.tenant_charge_id` apontando pra cobrança — é o
//       caminho das cobranças que nasceram avulsas/orçamento/OS e geraram a
//       conta como espelho.
// Com as duas pontas, ordenamos preferindo (b), igual ao servidor.
//
// A queryKey começa com ['tenant-charges', companyId] de propósito: criar,
// editar ou excluir cobrança (useTenantCharges) invalida esse prefixo, então
// esta lista se atualiza sozinha, sem reload.
// ─────────────────────────────────────────────────────────────────────────────

export interface ReceivableCharge {
  id: string;
  /** Conta a receber (financial_transactions) a que esta cobrança está ligada. */
  receivableId: string;
  status: string;
  value: number;
  dueDate: string | null;
  paymentDate: string | null;
  billingType: string | null;
  description: string | null;
  publicShortCode: string | null;
  invoiceUrl: string | null;
  /** True quando o elo veio de `financial_transactions.tenant_charge_id`. */
  linkedByReceivable: boolean;
}

/** Recorte da conta a receber que o hook precisa pra achar a cobrança. */
export interface ReceivableChargeSubject {
  id: string;
  tenant_charge_id?: string | null;
}

const CHARGE_COLUMNS =
  'id, source_type, source_id, status, value, due_date, payment_date, billing_type, description, public_short_code, invoice_url, created_at';

type ChargeRow = {
  id: string;
  source_type: string | null;
  source_id: string | null;
  status: string | null;
  value: number | string | null;
  due_date: string | null;
  payment_date: string | null;
  billing_type: string | null;
  description: string | null;
  public_short_code: string | null;
  invoice_url: string | null;
  created_at: string | null;
};

function mapRow(row: ChargeRow, receivableId: string, linkedByReceivable: boolean): ReceivableCharge {
  return {
    id: row.id,
    receivableId,
    status: row.status ?? '',
    value: Number(row.value ?? 0),
    dueDate: row.due_date ?? null,
    paymentDate: row.payment_date ?? null,
    billingType: row.billing_type ?? null,
    description: row.description ?? null,
    publicShortCode: row.public_short_code ?? null,
    invoiceUrl: row.invoice_url ?? null,
    linkedByReceivable,
  };
}

export function useReceivableCharges(receivables: ReceivableChargeSubject[], enabled = true) {
  const { companyId } = useUserCompany();

  // Ordenado pra a chave não mudar por causa da ordem da listagem (paginação,
  // reordenação) e disparar refetch à toa.
  const receivableIds = useMemo(
    () => [...new Set(receivables.map((r) => r.id).filter(Boolean))].sort(),
    [receivables],
  );
  // `tenant_charge_id` da conta: a OUTRA ponta do elo.
  const linkedChargeIds = useMemo(
    () => [...new Set(receivables.map((r) => r.tenant_charge_id).filter((id): id is string => !!id))].sort(),
    [receivables],
  );
  // Cobrança → conta, pra remontar o elo da ponta (b) sem segunda varredura.
  const receivableByChargeId = useMemo(() => {
    const map = new Map<string, string>();
    for (const r of receivables) {
      if (r.tenant_charge_id) map.set(r.tenant_charge_id, r.id);
    }
    return map;
  }, [receivables]);

  const idsKey = receivableIds.join(',');
  const linkedKey = linkedChargeIds.join(',');

  const query = useQuery({
    queryKey: ['tenant-charges', companyId, 'receivables', idsKey, linkedKey],
    enabled: enabled && !!companyId && (receivableIds.length > 0 || linkedChargeIds.length > 0),
    staleTime: 30 * 1000,
    queryFn: async (): Promise<ReceivableCharge[]> => {
      if (!companyId) return [];
      const found: ReceivableCharge[] = [];

      // (a) cobrança do SALDO, criada a partir desta conta.
      if (receivableIds.length > 0) {
        const { data, error } = await supabase
          .from('tenant_charges')
          .select(CHARGE_COLUMNS)
          .eq('company_id', companyId)
          .eq('source_type', 'receivable')
          .in('source_id', receivableIds)
          .order('created_at', { ascending: false });
        if (error) throw error;
        for (const row of (data ?? []) as ChargeRow[]) {
          if (!row.source_id) continue;
          found.push(mapRow(row, row.source_id, false));
        }
      }

      // (b) cobrança que a própria conta aponta (`tenant_charge_id`).
      if (linkedChargeIds.length > 0) {
        const { data, error } = await supabase
          .from('tenant_charges')
          .select(CHARGE_COLUMNS)
          .eq('company_id', companyId)
          .in('id', linkedChargeIds)
          .order('created_at', { ascending: false });
        if (error) throw error;
        for (const row of (data ?? []) as ChargeRow[]) {
          const receivableId = receivableByChargeId.get(row.id);
          if (!receivableId) continue;
          found.push(mapRow(row, receivableId, true));
        }
      }

      return found;
    },
  });

  /**
   * Conta → cobrança ligada a ela (viva ou já encerrada). É o que alimenta o
   * SELO de status: cobrança cancelada tem que aparecer como cancelada, não
   * desaparecer (foi assim que um boleto excluído passou por vivo).
   *
   * Preferência, igual à do servidor: o elo da ponta (b) ganha; empate resolve
   * por cobrança viva e depois pela mais recente (a consulta já vem ordenada
   * por `created_at` desc).
   */
  const chargeByReceivable = useMemo(() => {
    const map = new Map<string, ReceivableCharge>();
    for (const charge of query.data ?? []) {
      const current = map.get(charge.receivableId);
      if (!current) {
        map.set(charge.receivableId, charge);
        continue;
      }
      if (current.linkedByReceivable) continue;
      if (charge.linkedByReceivable) {
        map.set(charge.receivableId, charge);
        continue;
      }
      if (!isLiveReceivableChargeStatus(current.status) && isLiveReceivableChargeStatus(charge.status)) {
        map.set(charge.receivableId, charge);
      }
    }
    return map;
  }, [query.data]);

  /**
   * Conta → cobrança VIVA. Cancelada/estornada/apagada no gateway fica de
   * fora: nesses casos a conta volta a aceitar "Cobrar o saldo" direto, sem
   * pedir substituição de uma cobrança que não existe mais.
   */
  const liveChargeByReceivable = useMemo(() => {
    const map = new Map<string, ReceivableCharge>();
    for (const [receivableId, charge] of chargeByReceivable) {
      if (isLiveReceivableChargeStatus(charge.status)) map.set(receivableId, charge);
    }
    return map;
  }, [chargeByReceivable]);

  return {
    chargeByReceivable,
    liveChargeByReceivable,
    isLoading: query.isLoading,
  };
}
