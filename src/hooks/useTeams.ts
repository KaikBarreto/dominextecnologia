import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getErrorMessage } from '@/utils/errorMessages';
import { allOrNothingDeleteError, assertRowsAffected } from '@/lib/supabaseMutation';
import { fetchAllPaginated } from '@/utils/supabasePagination';

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
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;
  const queryClient = useQueryClient();

  const teamsQuery = useQuery({
    queryKey: ['teams', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      return fetchAllPaginated<Team>(() => supabase
        .from('teams')
        .select('*')
        .order('name')
        .order('id'));
    },
  });

  const membersQuery = useQuery({
    queryKey: ['team-members', companyId],
    enabled: !!companyId,
    queryFn: async () => {
      return fetchAllPaginated<TeamMember>(() => supabase
        .from('team_members')
        .select('*')
        .order('id'));
    },
  });

  const teamsWithMembers = useMemo<TeamWithMembers[]>(() => {
    const membersByTeam = new Map<string, TeamMember[]>();
    for (const member of membersQuery.data ?? []) {
      const members = membersByTeam.get(member.team_id) ?? [];
      members.push(member);
      membersByTeam.set(member.team_id, members);
    }
    return (teamsQuery.data ?? []).map((team) => ({
      ...team,
      members: membersByTeam.get(team.id) ?? [],
    }));
  }, [membersQuery.data, teamsQuery.data]);

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
      assertRowsAffected(
        await supabase
          .from('teams')
          .update(input as any, { count: 'exact' })
          .eq('id', id),
        'update',
      );

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
      // Tudo ou nada no banco (delete_team_cascade): desvincula OS e contratos,
      // apaga os membros e a equipe numa transação só. Se algo for barrado,
      // nada muda.
      const { error } = await supabase.rpc('delete_team_cascade', { p_team_id: id });
      if (error) throw allOrNothingDeleteError(error);
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
