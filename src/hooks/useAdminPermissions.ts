import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const ADMIN_SCREEN_PERMISSIONS = [
  { key: 'admin_dashboard', label: 'Dashboard' },
  { key: 'admin_crm', label: 'CRM/Tarefas' },
  { key: 'admin_empresas', label: 'Empresas' },
  { key: 'admin_health_score', label: 'Health Score' },
  { key: 'admin_vendedores', label: 'Vendedores' },
  { key: 'admin_afiliados', label: 'Afiliados' },
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

/**
 * Telas que um afiliado-only pode enxergar no painel. É o perfil MAIS restrito
 * que existe aqui: UMA tela.
 *
 * O afiliado é parceiro EXTERNO e NUNCA é admin — ele não tem linha em
 * `admin_permissions` (no SQL `is_admin_user()` é `is_super_admin OR tem
 * QUALQUER linha em admin_permissions`, então uma linha lá abriria todas as
 * policies amplas do painel pra ele). O acesso vem do VÍNCULO
 * `affiliates.user_id = auth.uid()` e os dados são isolados pelas policies de
 * self-scope (`current_affiliate_id()`). Isto aqui é UX/runtime; a segurança
 * real é a RLS.
 */
const AFFILIATE_ALLOWED_SCREENS = ['admin_afiliados'] as const;

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
  /** Vínculo em `affiliates.user_id`. Vem do AuthContext (uma consulta só). */
  linkedAffiliateId: string | null;
  /**
   * Afiliado-only: tem ficha de afiliado vinculada e nenhum acesso de admin.
   * Vê SÓ `AFFILIATE_ALLOWED_SCREENS`.
   */
  isAffiliateOnly: boolean;
  permissions: string[];
  isLoading: boolean;
}

export function useAdminPermissions(): AdminPermissionsResult {
  const { user, roles, linkedAffiliateId, affiliateLoading } = useAuth();
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

  // Afiliado-only: vínculo de afiliado e nenhum acesso de admin. `hasFullAccess`
  // hoje é o próprio `isMaster`, mas a condição fica explícita pra sobreviver a
  // uma mudança futura na semântica de "acesso total".
  const hasFullAccess = isMaster;
  const isAffiliateOnly = !!linkedAffiliateId && !isMaster && !hasFullAccess;

  const hasScreenAccess = (key: string) => {
    if (isMaster) return true;
    // Afiliado-only: UMA tela, e nada mais. Checado ANTES do vendedor e do
    // pool de permissões porque é o perfil mais restrito do painel.
    if (isAffiliateOnly) {
      return (AFFILIATE_ALLOWED_SCREENS as readonly string[]).includes(key);
    }
    // Vendedor-only só enxerga as telas dele, mesmo que o pool de permissões
    // tenha vindo mais amplo — o rodízio isola o vendedor às próprias telas.
    if (isSalespersonOnly) {
      return (SALESPERSON_ALLOWED_SCREENS as readonly string[]).includes(key);
    }
    return permissions.includes(key);
  };

  return {
    hasMasterAccess: isMaster,
    hasFullAccess,
    hasScreenAccess,
    hasFunctionAccess,
    linkedSalespersonId,
    isSalespersonOnly,
    linkedAffiliateId,
    isAffiliateOnly,
    permissions,
    isLoading: permsLoading || spLoading || affiliateLoading,
  };
}
