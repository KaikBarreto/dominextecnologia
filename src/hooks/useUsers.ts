import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Tables, Enums } from '@/integrations/supabase/types';

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
};

export const ROLE_COLORS: Record<AppRole, string> = {
  admin: 'bg-destructive/20 text-destructive',
  gestor: 'bg-primary/20 text-primary',
  tecnico: 'bg-info/20 text-info',
  comercial: 'bg-success/20 text-success',
  financeiro: 'bg-warning/20 text-warning',
};

export function useUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('full_name');
      
      if (profilesError) throw profilesError;

      // Get all roles
      const { data: roles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      
      if (rolesError) throw rolesError;

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
  });

  const updateUserRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // Check if user already has a role
      const { data: existingRole } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .single();

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
      toast({ title: 'Role atualizada com sucesso!' });
    },
    onError: (error) => {
      toast({ 
        title: 'Erro ao atualizar role', 
        description: error.message,
        variant: 'destructive' 
      });
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
    stats: {
      total: users.length,
      byRole: roleStats,
    },
  };
}
