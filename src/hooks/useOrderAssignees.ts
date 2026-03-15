import { useMemo } from 'react';
import type { Profile } from '@/types/database';
import type { TeamWithMembers } from '@/hooks/useTeams';

interface AssigneeInfo {
  id: string;
  name: string;
  avatar_url?: string | null;
}

/**
 * Build a lookup function that resolves assignees for a given order
 * based on technician_id and team_id.
 */
export function useOrderAssignees(
  profiles: Profile[] | undefined,
  teamsWithMembers: TeamWithMembers[]
) {
  return useMemo(() => {
    const profileMap = new Map<string, Profile>();
    (profiles ?? []).forEach(p => profileMap.set(p.user_id, p));

    return (order: { technician_id?: string | null; team_id?: string | null }): AssigneeInfo[] => {
      const result: AssigneeInfo[] = [];

      if (order.technician_id) {
        const p = profileMap.get(order.technician_id);
        if (p) {
          result.push({ id: p.user_id, name: p.full_name, avatar_url: p.avatar_url });
        }
      }

      if (order.team_id) {
        const team = teamsWithMembers.find(t => t.id === order.team_id);
        if (team) {
          team.members.forEach(m => {
            if (!result.some(r => r.id === m.user_id)) {
              const p = profileMap.get(m.user_id);
              if (p) {
                result.push({ id: p.user_id, name: p.full_name, avatar_url: p.avatar_url });
              }
            }
          });
        }
      }

      return result;
    };
  }, [profiles, teamsWithMembers]);
}
