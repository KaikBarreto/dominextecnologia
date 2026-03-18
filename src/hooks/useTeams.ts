import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';

export interface Team {
  id: string;
  name: string;
  description: string | null;
  color: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  photo_url?: string | null;
  icon_name?: string | null;
}

export interface TeamMember {
  id: string;
  team_id: string;
  user_id: string;
  created_at: string;
}

export interface TeamWithMembers extends Team {
  members: TeamMember[];
}

export interface TeamInput {
  name: string;
  description?: string;
  color?: string;
  is_active?: boolean;
  member_ids?: string[];
  photo_url?: string;
  icon_name?: string;
}

export function useTeams() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const teamsQuery = useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as Team[];
    },
  });

  const membersQuery = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_members')
        .select('*');
      if (error) throw error;
      return data as TeamMember[];
    },
  });

  const teamsWithMembers: TeamWithMembers[] = (teamsQuery.data ?? []).map(team => ({
    ...team,
    members: (membersQuery.data ?? []).filter(m => m.team_id === team.id),
  }));

  const createTeam = useMutation({
    mutationFn: async (input: TeamInput) => {
      const { member_ids, ...rest } = input;
      const { data, error } = await supabase
        .from('teams')
        .insert({ ...rest, created_by: user?.id } as any)
        .select()
        .single();
      if (error) throw error;

      if (member_ids && member_ids.length > 0) {
        const rows = member_ids.map(uid => ({ team_id: (data as any).id, user_id: uid }));
        await supabase.from('team_members').insert(rows as any);
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Equipe criada com sucesso!' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao criar equipe', description: getErrorMessage(e) });
    },
  });

  const updateTeam = useMutation({
    mutationFn: async ({ id, member_ids, ...input }: TeamInput & { id: string }) => {
      const { error } = await supabase
        .from('teams')
        .update(input as any)
        .eq('id', id);
      if (error) throw error;

      // Sync members
      if (member_ids !== undefined) {
        await supabase.from('team_members').delete().eq('team_id', id);
        if (member_ids.length > 0) {
          const rows = member_ids.map(uid => ({ team_id: id, user_id: uid }));
          await supabase.from('team_members').insert(rows as any);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Equipe atualizada!' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar equipe', description: getErrorMessage(e) });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Equipe excluída!' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir equipe', description: e.message });
    },
  });

  return {
    teams: teamsQuery.data ?? [],
    teamsWithMembers,
    isLoading: teamsQuery.isLoading,
    createTeam,
    updateTeam,
    deleteTeam,
  };
}
