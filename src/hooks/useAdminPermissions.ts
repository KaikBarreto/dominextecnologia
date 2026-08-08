import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const ADMIN_SCREEN_PERMISSIONS = [
  { key: 'admin_dashboard', label: 'Dashboard' },
  { key: 'admin_crm', label: 'CRM/Tarefas' },
  { key: 'admin_empresas', label: 'Empresas' },
  { key: 'admin_health_score', label: 'Health Score' },
  { key: 'admin_vendedores', label: 'Vendedores' },
  { key: 'admin_financeiro', label: 'Financeiro' },
  { key: 'admin_domiflix', label: 'Domiflix' },
  { key: 'admin_configuracoes', label: 'Configurações' },
  { key: 'admin_usuarios', label: 'Usuários Admin' },
] as const;

export const ADMIN_FUNCTION_PERMISSIONS = [
  { key: 'admin_financeiro_lancamentos', label: 'Criar lançamentos no financeiro' },
  { key: 'admin_financeiro_totais', label: 'Visualizar totais e DRE' },
  { key: 'admin_vendedores_ver_todos', label: 'Ver todos os vendedores' },
] as const;

export type AdminPermissionKey =
  | typeof ADMIN_SCREEN_PERMISSIONS[number]['key']
  | typeof ADMIN_FUNCTION_PERMISSIONS[number]['key'];

/**
 * Telas que um vendedor-only (vinculado a `salespeople.user_id`, sem acesso
 * master nem permissões amplas de admin) pode enxergar no painel Auctus.
 * Espelha o `SALESPERSON_ALLOWED_SCREENS` do EcoSistema, adaptado à Dominex:
 * vendedores (própria ficha) + empresas (leads do rodízio dele). As
 * notificações não são uma tela roteada aqui (vivem no sino do header, gateado
 * por RLS via `target_user_id`), então não entram nesta lista.
 */
const SALESPERSON_ALLOWED_SCREENS = ['admin_vendedores', 'admin_empresas'] as const;

interface AdminPermissionsResult {
  hasMasterAccess: boolean;
  hasFullAccess: boolean;
  hasScreenAccess: (key: string) => boolean;
  hasFunctionAccess: (key: string) => boolean;
  linkedSalespersonId: string | null;
  /**
   * Vendedor-only: tem ficha de vendedor vinculada, NÃO é master e NÃO tem a
   * função-permissão de ver todos os vendedores. Usado pelos guardrails de UI
   * (própria ficha, sem seletor de trocar vendedor, sem registrar vale/venda).
   * A segurança real é a RLS (Fase 1); isto é UX/runtime.
   */
  isSalespersonOnly: boolean;
  permissions: string[];
  isLoading: boolean;
}

export function useAdminPermissions(): AdminPermissionsResult {
  const { user, roles } = useAuth();
  const isMaster = roles?.includes('super_admin' as any) ?? false;

  const { data: permissions = [], isLoading: permsLoading } = useQuery({
    queryKey: ['admin-permissions', user?.id],
    enabled: !!user?.id && !isMaster,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_permissions')
        .select('permission')
        .eq('user_id', user!.id);
      if (error) throw error;
      return (data ?? []).map((r: any) => r.permission as string);
    },
  });

  const { data: linkedSalespersonId = null, isLoading: spLoading } = useQuery({
    queryKey: ['linked-salesperson-basic', user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id')
        .eq('user_id', user!.id as any)
        .maybeSingle();
      if (error) return null;
      return (data as any)?.id ?? null;
    },
  });

  const hasFunctionAccess = (key: string) => {
    if (isMaster) return true;
    return permissions.includes(key);
  };

  // Vendedor-only: tem ficha vinculada, não é master e não pode ver todos os
  // vendedores. (A ficha vinculada por si só não basta — um coordenador pode
  // ser vendedor E ter `admin_vendedores_ver_todos`; esse continua vendo tudo.)
  const canSeeAllSalespeople = hasFunctionAccess('admin_vendedores_ver_todos');
  const isSalespersonOnly = !!linkedSalespersonId && !isMaster && !canSeeAllSalespeople;

  const hasScreenAccess = (key: string) => {
    if (isMaster) return true;
    // Vendedor-only só enxerga as telas dele, mesmo que o pool de permissões
    // tenha vindo mais amplo — o rodízio isola o vendedor às próprias telas.
    if (isSalespersonOnly) {
      return (SALESPERSON_ALLOWED_SCREENS as readonly string[]).includes(key);
    }
    return permissions.includes(key);
  };

  return {
    hasMasterAccess: isMaster,
    hasFullAccess: isMaster,
    hasScreenAccess,
    hasFunctionAccess,
    linkedSalespersonId,
    isSalespersonOnly,
    permissions,
    isLoading: permsLoading || spLoading,
  };
}
