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
  const { user, profile, permissions, roles, hasPermissionRecord, profileLoading } = useAuth();
  const companyId = profile?.company_id ?? null;
  const key = useMemo(() => pdvAuthorizedQueryScope({
    companyId,
    userId: user?.id,
    permissions,
    roles,
    hasPermissionRecord,
  }), [companyId, hasPermissionRecord, permissions, roles, user?.id]);
  return {
    key,
    ready: Boolean(user?.id && companyId && !profileLoading),
  };
}

/**
 * Invalidação canônica das três leituras comerciais que compartilham os
 * mesmos fatos de venda, devolução, caixa e estoque.
 *
 * A invalidação continua pura e sem acesso direto ao Supabase; o hook acima
 * existe apenas para compor a chave de autorização das leituras sensíveis.
 */
export async function invalidatePdvReportCaches(queryClient: QueryClient) {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: PDV_REPORTS_QUERY_ROOT }),
    queryClient.invalidateQueries({ queryKey: MATERIAL_PURCHASE_REPORT_QUERY_KEY }),
    queryClient.invalidateQueries({ queryKey: INVENTORY_ABC_REPORT_QUERY_KEY }),
  ]);
}
