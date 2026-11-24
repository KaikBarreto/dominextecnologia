import { FINANCE_PDV_RECONCILIATION_ROOT } from '@/lib/financePdvReconciliation';
import { useMemo } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';

export const PDV_REPORTS_QUERY_ROOT = ['pdv', 'reports-v2'] as const;
export const MATERIAL_PURCHASE_REPORT_QUERY_KEY = ['material-purchase-report'] as const;
export const INVENTORY_ABC_REPORT_QUERY_KEY = ['inventory', 'abc-report'] as const;

/**
 * Escopo que impede uma projeção sensível do usuário/empresa/permissão anterior
 * de ser reaproveitada pelo React Query. O servidor continua sendo a fonte de
 * autorização; isto fecha o vazamento visual durante troca de conta ou
 * revogação de permissão sem transformar o cache em mecanismo de segurança.
 */
export function pdvAuthorizedQueryScope(input: {
  companyId?: string | null;
  userId?: string | null;
  permissions?: readonly string[];
  roles?: readonly string[];
  hasPermissionRecord?: boolean;
}) {
  const permissions = [...(input.permissions ?? [])].sort();
  const roles = [...(input.roles ?? [])].sort();
  return [
    'scope',
    input.companyId ?? null,
    input.userId ?? null,
    input.hasPermissionRecord === true ? 'explicit' : 'legacy',
    permissions.join('|'),
    roles.join('|'),
  ] as const;
}

export function usePdvAuthorizedQueryScope() {
  const { user, profile, permissions, roles, hasPermissionRecord, profileLoading, loading } = useAuth();
  const profileConfirmed = profile?.user_id === user?.id && profile?.is_active === true;
  const companyId = profileConfirmed ? profile?.company_id ?? null : null;
  const ready = Boolean(user?.id && companyId && !profileLoading && !loading);
  const key = useMemo(() => [...pdvAuthorizedQueryScope({
    companyId,
    userId: user?.id,
    permissions,
    roles,
    hasPermissionRecord,
  }), ready ? 'ready' : 'pending'] as const, [companyId, hasPermissionRecord, permissions, ready, roles, user?.id]);
  return {
    key,
    ready,
  };
}

/**
 * Invalidação canônica das leituras comerciais e monetárias que compartilham
 * os mesmos fatos de venda, devolução, caixa e estoque.
 *
 * A invalidação continua pura e sem acesso direto ao Supabase; o hook acima
 * existe apenas para compor a chave de autorização das leituras sensíveis.
 */
export async function invalidatePdvReportCaches(queryClient: QueryClient) {
  // invalidateQueries reaproveita a primeira leitura em voo quando ainda não
  // existe dado no cache. Interrompê-la garante uma consulta posterior ao fato.
  // O cancelamento é síncrono; marcar o cache não precisa esperar a rede.
  void queryClient.cancelQueries({ queryKey: PDV_REPORTS_QUERY_ROOT });
  await Promise.all([
    ...['financial-summary', 'account-balances', 'financial-accounts', 'pdv-cofre-balance', 'pdv-cash-session-detail'].map(root => queryClient.invalidateQueries({ queryKey: [root] })),
    queryClient.invalidateQueries({ queryKey: ['pdv-customer-credit'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-customer-payment-options'] }),
    queryClient.invalidateQueries({ queryKey: ['pdv-supplier-credit'] }),
    queryClient.invalidateQueries({ queryKey: FINANCE_PDV_RECONCILIATION_ROOT }),
    queryClient.invalidateQueries({ queryKey: PDV_REPORTS_QUERY_ROOT }),
    queryClient.invalidateQueries({ queryKey: MATERIAL_PURCHASE_REPORT_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: INVENTORY_ABC_REPORT_QUERY_KEY }),
  ]);
}
