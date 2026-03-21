import { useState } from 'react';
import { Search, Plus, Pencil, Trash2, UsersRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import { useTeams, type TeamWithMembers } from '@/hooks/useTeams';
import { useTechnicians } from '@/hooks/useProfiles';
import { TeamFormDialog } from '@/components/teams/TeamFormDialog';
import { useToast } from '@/hooks/use-toast';

export default function Teams() {
  const { teamsWithMembers, isLoading, createTeam, updateTeam, deleteTeam } = useTeams();
  const { data: profiles } = useTechnicians();
  const { toast } = useToast();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UsersRound className="h-6 w-6" />
            Equipes
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {teamsWithMembers.length} equipe{teamsWithMembers.length !== 1 ? 's' : ''} cadastrada{teamsWithMembers.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button size="sm" onClick={() => { setEditingTeam(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Equipe
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar equipe..."
          className="pl-10"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
        />
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
          {filtered.map(team => (
            <Card key={team.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: team.color + '20' }}>
                      <UsersRound className="h-5 w-5" style={{ color: team.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold">{team.name}</h3>
                      {team.description && <p className="text-xs text-muted-foreground line-clamp-1">{team.description}</p>}
                    </div>
                  </div>
                  <Badge variant={team.is_active ? 'default' : 'secondary'} className="text-xs">
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
          ))}
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
