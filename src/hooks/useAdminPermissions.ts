import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export const ADMIN_SCREEN_PERMISSIONS = [
  { key: 'admin_dashboard', label: 'Dashboard' },
  { key: 'admin_crm', label: 'CRM' },
  { key: 'admin_empresas', label: 'Empresas' },
  { key: 'admin_vendedores', label: 'Vendedores' },
  { key: 'admin_assinaturas', label: 'Assinaturas' },
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

interface AdminPermissionsResult {
  hasMasterAccess: boolean;
  hasFullAccess: boolean;
  hasScreenAccess: (key: string) => boolean;
  hasFunctionAccess: (key: string) => boolean;
  linkedSalespersonId: string | null;
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

  const hasScreenAccess = (key: string) => {
    if (isMaster) return true;
    return permissions.includes(key);
  };

  const hasFunctionAccess = (key: string) => {
    if (isMaster) return true;
    return permissions.includes(key);
  };

  return {
    hasMasterAccess: isMaster,
    hasFullAccess: isMaster,
    hasScreenAccess,
    hasFunctionAccess,
    linkedSalespersonId,
    permissions,
    isLoading: permsLoading || spLoading,
  };
}
