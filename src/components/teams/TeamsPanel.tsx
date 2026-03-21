import { useState } from 'react';
import { fuzzyIncludes } from '@/lib/utils';
import { Search, Plus, Pencil, Trash2, UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings, HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeams, type TeamWithMembers } from '@/hooks/useTeams';
import { useTechnicians } from '@/hooks/useProfiles';
import { TeamFormDialog } from '@/components/teams/TeamFormDialog';

const ICON_MAP: Record<string, any> = {
  UsersRound, Wrench, Zap, Shield, Truck, Hammer, HardHat, Settings,
  HeartPulse, Flame, Droplets, Wind, Thermometer, Cable, Plug, Lightbulb, Gauge,
};

export function TeamsPanel() {
  const { teamsWithMembers, isLoading, createTeam, updateTeam, deleteTeam } = useTeams();
  const { data: profiles } = useTechnicians();
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);

  const filtered = teamsWithMembers.filter(t =>
    fuzzyIncludes(t.name, searchQuery)
  );

  const getInitials = (n: string) => n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

  const getMemberName = (userId: string) => {
    const p = profiles?.find(pr => pr.user_id === userId);
    return p?.full_name ?? 'Usuário';
  };

  const getMemberAvatar = (userId: string) => {
    const p = profiles?.find(pr => pr.user_id === userId);
    return p?.avatar_url || undefined;
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta equipe?')) return;
    await deleteTeam.mutateAsync(id);
  };

  const getTeamIcon = (team: TeamWithMembers) => {
    const iconName = (team as any).icon_name;
    return ICON_MAP[iconName] || UsersRound;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar equipe..."
            className="pl-10"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <Button size="sm" onClick={() => { setEditingTeam(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Equipe
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-4"><Skeleton className="h-24 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <p className="text-center text-muted-foreground">
              {searchQuery ? 'Nenhuma equipe encontrada' : 'Nenhuma equipe cadastrada'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(team => {
            const TeamIcon = getTeamIcon(team);
            const teamPhotoUrl = (team as any).photo_url;

            return (
              <Card key={team.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="h-10 w-10 rounded-lg flex items-center justify-center overflow-hidden shrink-0"
                        style={{ backgroundColor: teamPhotoUrl ? undefined : team.color }}
                      >
                        {teamPhotoUrl ? (
                          <img src={teamPhotoUrl} alt={team.name} className="h-full w-full object-cover" />
                        ) : (
                          <TeamIcon className="h-5 w-5 text-white" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{team.name}</h3>
                        {team.description && <p className="text-xs text-muted-foreground line-clamp-1">{team.description}</p>}
                      </div>
                    </div>
                    <Badge variant={team.is_active ? 'default' : 'secondary'} className="text-xs shrink-0">
                      {team.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-1">
                    {team.members.slice(0, 5).map(m => (
                      <Avatar key={m.id} className="h-7 w-7 border-2 border-background">
                        <AvatarImage src={getMemberAvatar(m.user_id)} />
                        <AvatarFallback className="text-[10px]">{getInitials(getMemberName(m.user_id))}</AvatarFallback>
                      </Avatar>
                    ))}
                    {team.members.length > 5 && (
                      <span className="text-xs text-muted-foreground ml-1">+{team.members.length - 5}</span>
                    )}
                    {team.members.length === 0 && (
                      <span className="text-xs text-muted-foreground">Sem membros</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => { setEditingTeam(team); setFormOpen(true); }}>
                      <Pencil className="h-3 w-3 mr-1" /> Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => handleDelete(team.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <TeamFormDialog
        open={formOpen}
        onOpenChange={(o) => { setFormOpen(o); if (!o) setEditingTeam(null); }}
        team={editingTeam}
        onSubmit={async (data) => {
          if (data.id) {
            await updateTeam.mutateAsync(data as any);
          } else {
            await createTeam.mutateAsync(data);
          }
        }}
        isLoading={createTeam.isPending || updateTeam.isPending}
        profiles={profiles ?? []}
      />
    </div>
  );
}
