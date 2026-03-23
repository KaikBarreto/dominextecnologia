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
        // Get old members before deleting
        const { data: oldMembers } = await supabase
          .from('team_members')
          .select('user_id')
          .eq('team_id', id);
        const oldMemberIds = (oldMembers || []).map(m => m.user_id);

        await supabase.from('team_members').delete().eq('team_id', id);
        if (member_ids.length > 0) {
          const rows = member_ids.map(uid => ({ team_id: id, user_id: uid }));
          await supabase.from('team_members').insert(rows as any);
        }

        // Sync assignees on all OSs that reference this team
        const { data: teamOrders } = await supabase
          .from('service_orders')
          .select('id')
          .eq('team_id', id);

        if (teamOrders && teamOrders.length > 0) {
          const orderIds = teamOrders.map(o => o.id);

          // Remove assignees that were old team members but are no longer in the team
          const removedMembers = oldMemberIds.filter(uid => !member_ids.includes(uid));
          if (removedMembers.length > 0) {
            for (const orderId of orderIds) {
              await supabase
                .from('service_order_assignees')
                .delete()
                .eq('service_order_id', orderId)
                .in('user_id', removedMembers);
            }
          }

          // Add assignees for new team members
          const addedMembers = member_ids.filter(uid => !oldMemberIds.includes(uid));
          if (addedMembers.length > 0) {
            const newAssignees: { service_order_id: string; user_id: string }[] = [];
            for (const orderId of orderIds) {
              for (const uid of addedMembers) {
                newAssignees.push({ service_order_id: orderId, user_id: uid });
              }
            }
            // Insert in batches to avoid payload limits
            const batchSize = 500;
            for (let i = 0; i < newAssignees.length; i += batchSize) {
              await supabase
                .from('service_order_assignees')
                .upsert(newAssignees.slice(i, i + batchSize), { onConflict: 'service_order_id,user_id', ignoreDuplicates: true });
            }
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['service-orders'] });
      toast({ title: 'Equipe atualizada!' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao atualizar equipe', description: getErrorMessage(e) });
    },
  });

  const deleteTeam = useMutation({
    mutationFn: async (id: string) => {
      // Remove team references from linked records before deleting
      await supabase.from('service_orders').update({ team_id: null } as any).eq('team_id', id);
      await supabase.from('contracts').update({ team_id: null } as any).eq('team_id', id);
      await supabase.from('team_members').delete().eq('team_id', id);
      const { error } = await supabase.from('teams').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      toast({ title: 'Equipe excluída!' });
    },
    onError: (e: Error) => {
      toast({ variant: 'destructive', title: 'Erro ao excluir equipe', description: getErrorMessage(e) });
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
