import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, Enums } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';

export type Profile = Tables<'profiles'>;
export type UserRole = Tables<'user_roles'>;
export type AppRole = Enums<'app_role'>;

export type UserWithRole = Profile & {
  role?: AppRole;
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  tecnico: 'Técnico',
  comercial: 'Comercial',
  financeiro: 'Financeiro',
  super_admin: 'Super Admin',
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive text-white',
  gestor: 'bg-primary text-white',
  tecnico: 'bg-info text-white',
  comercial: 'bg-success text-white',
  financeiro: 'bg-warning text-white',
  super_admin: 'bg-purple-600 text-white',
};

export function useUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      // Get current user's company_id
      const { data: myProfile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .single();

      // Get profiles filtered by company
      let query = supabase.from('profiles').select('*').order('full_name');
      if (myProfile?.company_id) {
        query = query.eq('company_id', myProfile.company_id);
      }
      const { data: profiles, error: profilesError } = await query;
      if (profilesError) throw profilesError;

      // Get all roles (may fail if user doesn't have permission)
      const { data: roles } = await supabase
        .from('user_roles')
        .select('*');

      // Merge profiles with their roles
      const usersWithRoles: UserWithRole[] = (profiles || []).map(profile => {
        const userRole = roles?.find(r => r.user_id === profile.user_id);
        return {
          ...profile,
          role: userRole?.role,
        };
      });

      return usersWithRoles;
    },
    enabled: !!user?.id,
  });

  // Check if current user has admin/gestor role
  const { data: currentUserRole } = useQuery({
    queryKey: ['currentUserRole', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      return data?.role || null;
    },
    enabled: !!user?.id,
  });

  // Check if any admin exists
  const { data: hasAdmin } = useQuery({
    queryKey: ['hasAdmin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('id')
        .eq('role', 'admin')
        .limit(1);
      
      if (error) return false;
      return data && data.length > 0;
    },
  });

  // Check user permissions for fn:manage_users or all permissions
  const { data: userPerms } = useQuery({
    queryKey: ['currentUserPerms', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_permissions')
        .select('permissions')
        .eq('user_id', user.id)
        .maybeSingle();
      return (data?.permissions as string[]) || [];
    },
    enabled: !!user?.id,
  });

  const hasManageUsersPermission = userPerms?.includes('fn:manage_users') || (userPerms?.length || 0) >= 27;
  const canManageRoles = currentUserRole === 'admin' || currentUserRole === 'gestor' || hasManageUsersPermission || !hasAdmin;

  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Check if user already has a role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);
        
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['currentUserRole'] });
      queryClient.invalidateQueries({ queryKey: ['hasAdmin'] });
      toast({ title: 'Role atualizada com sucesso!' });
    },
    onError: (error) => {
      toast({ title: 'Erro ao atualizar role', description: getErrorMessage(error), variant: 'destructive' });
    },
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Profile> & { id: string }) => {
      const { data, error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Perfil atualizado com sucesso!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao atualizar perfil', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Statistics
  const roleStats = users.reduce((acc, user) => {
    const role = user.role || 'sem_role';
    acc[role] = (acc[role] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return {
    users,
    isLoading,
    error,
    updateUserRole,
    updateProfile,
    currentUserRole,
    canManageRoles,
    hasAdmin,
    stats: {
      total: users.length,
      byRole: roleStats,
    },
  };
}
