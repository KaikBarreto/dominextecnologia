import { useState, useMemo } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Check, ChevronsUpDown, Search, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TechnicianOption {
  user_id: string;
  full_name: string;
  avatar_url?: string | null;
}

interface TeamOption {
  id: string;
  name: string;
  color: string;
  is_active: boolean;
  members: { user_id: string }[];
}

interface AssigneeMultiSelectProps {
  technicians: TechnicianOption[];
  teams: TeamOption[];
  selectedUserIds: string[];
  selectedTeamIds: string[];
  onChangeUsers: (ids: string[]) => void;
  onChangeTeams: (ids: string[]) => void;
  label?: string;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

export function AssigneeMultiSelect({
  technicians,
  teams,
  selectedUserIds,
  selectedTeamIds,
  onChangeUsers,
  onChangeTeams,
  label = 'Responsáveis',
}: AssigneeMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const activeTeams = useMemo(() => teams.filter(t => t.is_active), [teams]);

  const filteredTechnicians = useMemo(() => {
    if (!search) return technicians;
    const q = search.toLowerCase();
    return technicians.filter(t => t.full_name.toLowerCase().includes(q));
  }, [technicians, search]);

  const filteredTeams = useMemo(() => {
    if (!search) return activeTeams;
    const q = search.toLowerCase();
    return activeTeams.filter(t => t.name.toLowerCase().includes(q));
  }, [activeTeams, search]);

  const toggleUser = (userId: string) => {
    if (selectedUserIds.includes(userId)) {
      onChangeUsers(selectedUserIds.filter(id => id !== userId));
    } else {
      onChangeUsers([...selectedUserIds, userId]);
    }
  };

  const toggleTeam = (teamId: string) => {
    const team = activeTeams.find(t => t.id === teamId);
    if (!team) return;
    
    if (selectedTeamIds.includes(teamId)) {
      // Remove team and its members
      onChangeTeams(selectedTeamIds.filter(id => id !== teamId));
      const memberIds = team.members.map(m => m.user_id);
      onChangeUsers(selectedUserIds.filter(id => !memberIds.includes(id)));
    } else {
      // Add team and its members
      onChangeTeams([...selectedTeamIds, teamId]);
      const memberIds = team.members.map(m => m.user_id);
      const newUserIds = [...new Set([...selectedUserIds, ...memberIds])];
      onChangeUsers(newUserIds);
    }
  };

  const selectAll = () => {
    onChangeUsers(technicians.map(t => t.user_id));
    onChangeTeams(activeTeams.map(t => t.id));
  };

  const deselectAll = () => {
    onChangeUsers([]);
    onChangeTeams([]);
  };

  const totalSelected = selectedUserIds.length + selectedTeamIds.length;

  const summaryText = useMemo(() => {
    if (totalSelected === 0) return 'Selecione...';
    const parts: string[] = [];
    selectedTeamIds.forEach(tid => {
      const team = activeTeams.find(t => t.id === tid);
      if (team) parts.push(team.name);
    });
    selectedUserIds.forEach(uid => {
      // Only show if not already covered by a selected team
      const isCoveredByTeam = selectedTeamIds.some(tid => {
        const team = activeTeams.find(t => t.id === tid);
        return team?.members.some(m => m.user_id === uid);
      });
      if (!isCoveredByTeam) {
        const tech = technicians.find(t => t.user_id === uid);
        if (tech) parts.push(tech.full_name);
      }
    });
    if (parts.length <= 2) return parts.join(', ');
    return `${parts.slice(0, 2).join(', ')} +${parts.length - 2}`;
  }, [totalSelected, selectedUserIds, selectedTeamIds, technicians, activeTeams]);

  return (
    <div className="space-y-1.5">
      {label && <Label>{label}</Label>}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className={cn("w-full justify-between font-normal", totalSelected === 0 && "text-muted-foreground")}
          >
            <span className="truncate">{summaryText}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[320px] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-9"
              />
            </div>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 border-b">
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={selectAll}>
              Marcar todos
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={deselectAll}>
              Desmarcar todos
            </Button>
          </div>
          <ScrollArea className="max-h-[40vh]">
            <div className="p-1">
              {/* Teams */}
              {filteredTeams.length > 0 && (
                <div className="mb-1">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 py-1">Equipes</p>
                  {filteredTeams.map(team => (
                    <label
                      key={`team-${team.id}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedTeamIds.includes(team.id)}
                        onCheckedChange={() => toggleTeam(team.id)}
                      />
                      <span
                        className="h-5 w-5 rounded-full shrink-0 flex items-center justify-center text-[10px] text-white font-bold"
                        style={{ backgroundColor: team.color || 'hsl(var(--primary))' }}
                      >
                        {team.name.slice(0, 1)}
                      </span>
                      <span className="text-sm">{team.name}</span>
                      <Badge variant="secondary" className="ml-auto text-[10px] h-5">
                        {team.members.length}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
              {/* Technicians */}
              {filteredTechnicians.length > 0 && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase px-2 py-1">Técnicos</p>
                  {filteredTechnicians.map(tech => (
                    <label
                      key={`user-${tech.user_id}`}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selectedUserIds.includes(tech.user_id)}
                        onCheckedChange={() => toggleUser(tech.user_id)}
                      />
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={tech.avatar_url || undefined} />
                        <AvatarFallback className="text-[8px]">{getInitials(tech.full_name)}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{tech.full_name}</span>
                    </label>
                  ))}
                </div>
              )}
              {filteredTeams.length === 0 && filteredTechnicians.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Nenhum resultado</p>
              )}
            </div>
          </ScrollArea>
        </PopoverContent>
      </Popover>
    </div>
  );
}
