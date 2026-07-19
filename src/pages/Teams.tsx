import { useState } from 'react';
import { fuzzyIncludes, cn } from '@/lib/utils';
import { Search, Plus, Pencil, Trash2, UsersRound, UserCog } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useTeams, type TeamWithMembers, type TeamInput } from '@/hooks/useTeams';
import { useTechnicians } from '@/hooks/useProfiles';
import { TeamFormDialog } from '@/components/teams/TeamFormDialog';
import { getTeamIcon } from '@/components/teams/teamIcons';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';

export default function Teams() {
  const isMobile = useIsMobile();
  const { locale } = useAppLocaleContext();
  const tTeams = MESSAGES[locale].app.os.teams;
  const { teamsWithMembers, isLoading, createTeam, updateTeam, deleteTeam } = useTeams();
  const { data: profiles } = useTechnicians();
  const [searchQuery, setSearchQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamWithMembers | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [teamToDelete, setTeamToDelete] = useState<TeamWithMembers | null>(null);

  const filtered = teamsWithMembers.filter((t) => fuzzyIncludes(t.name, searchQuery));

  const getInitials = (n: string) =>
    n
      .split(' ')
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

  const getMemberName = (userId: string) => {
    const p = profiles?.find((pr) => pr.user_id === userId);
    return p?.full_name ?? tTeams.userFallback;
  };

  const getMemberAvatar = (userId: string) => {
    const p = profiles?.find((pr) => pr.user_id === userId);
    return p?.avatar_url || undefined;
  };

  const openNewTeam = () => {
    setEditingTeam(null);
    setFormOpen(true);
  };

  const openEditTeam = (team: TeamWithMembers) => {
    setEditingTeam(team);
    setFormOpen(true);
  };

  const handleDeleteClick = (team: TeamWithMembers) => {
    setTeamToDelete(team);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!teamToDelete) return;
    await deleteTeam.mutateAsync(teamToDelete.id);
    setTeamToDelete(null);
    setDeleteDialogOpen(false);
  };

  return (
    <div className={cn('space-y-6 min-w-0 w-full max-w-full overflow-x-hidden', isMobile && 'pb-24')}>
      <MobilePageHeader
        title={tTeams.pageTitle}
        subtitle={
          teamsWithMembers.length === 1
            ? tTeams.pageSubtitleSingular
            : tTeams.pageSubtitlePlural.replace('{n}', String(teamsWithMembers.length))
        }
        icon={UsersRound}
        actions={
          isMobile ? undefined : (
            <Button size="sm" onClick={openNewTeam}>
              <Plus className="h-4 w-4 mr-2" />
              {tTeams.btnNew}
            </Button>
          )
        }
      />

      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={isMobile ? tTeams.searchPlaceholderMobile : tTeams.searchPlaceholderDesktop}
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {isMobile ? (
        // -----------------------------------------------------------------
        // Mobile: lista nativa em rounded-xl, sem grid de cards.
        // -----------------------------------------------------------------
        <>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-12 w-12" />}
              title={searchQuery ? tTeams.emptySearchTitle : tTeams.emptyTitle}
              description={searchQuery ? tTeams.emptySearchDesc : tTeams.emptyDesc}
            />
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden">
              {filtered.map((team) => {
                const Icon = getTeamIcon(team.icon_name);
                const memberCount = team.members.length;

                const actions: ItemAction[] = [
                  {
                    key: 'members',
                    label: tTeams.actionManageMembers,
                    icon: <UserCog className="h-4 w-4" />,
                    onClick: () => openEditTeam(team),
                  },
                  {
                    key: 'edit',
                    label: tTeams.actionEdit,
                    icon: <Pencil className="h-4 w-4" />,
                    variant: 'edit',
                    onClick: () => openEditTeam(team),
                  },
                  {
                    key: 'delete',
                    label: tTeams.actionDelete,
                    icon: <Trash2 className="h-4 w-4" />,
                    variant: 'destructive',
                    onClick: () => handleDeleteClick(team),
                  },
                ];

                // Leading: foto da equipe se houver, senão badge colorido com ícone.
                const leading = team.photo_url ? (
                  <img
                    src={team.photo_url}
                    alt={team.name}
                    className="h-10 w-10 rounded-lg object-cover"
                  />
                ) : (
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: team.color + '20' }}
                  >
                    <Icon className="h-5 w-5" style={{ color: team.color }} />
                  </div>
                );

                // Subtitle combina descrição (se houver) + contagem de membros.
                const memberLabel =
                  memberCount === 0
                    ? tTeams.memberCount0
                    : memberCount === 1
                      ? tTeams.memberCountSingular
                      : tTeams.memberCountPlural.replace('{n}', String(memberCount));
                const subtitle = team.description
                  ? `${team.description} · ${memberLabel}`
                  : memberLabel;

                // Trailing: avatares sobrepostos (até 3) + badge Ativa/Inativa.
                const visibleMembers = team.members.slice(0, 3);
                const extraMembers = memberCount - visibleMembers.length;

                const trailing = (
                  <div className="flex flex-col items-end gap-1.5">
                    {memberCount > 0 && (
                      <div className="flex -space-x-2">
                        {visibleMembers.map((m) => (
                          <Avatar
                            key={m.id}
                            className="h-6 w-6 border-2 border-card"
                          >
                            <AvatarImage src={getMemberAvatar(m.user_id)} />
                            <AvatarFallback className="text-[9px]">
                              {getInitials(getMemberName(m.user_id))}
                            </AvatarFallback>
                          </Avatar>
                        ))}
                        {extraMembers > 0 && (
                          <div className="h-6 w-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] font-semibold text-muted-foreground">
                            +{extraMembers}
                          </div>
                        )}
                      </div>
                    )}
                    {!team.is_active && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {tTeams.badgeInactive}
                      </Badge>
                    )}
                  </div>
                );

                return (
                  <MobileListItem
                    key={team.id}
                    leading={leading}
                    title={team.name}
                    subtitle={subtitle}
                    trailing={trailing}
                    actions={actions}
                    onClick={() => openEditTeam(team)}
                  />
                );
              })}
            </div>
          )}
        </>
      ) : (
        // -----------------------------------------------------------------
        // Desktop: grid de cards 100% preservado.
        // -----------------------------------------------------------------
        <>
          {isLoading ? (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card>
              <CardContent className="py-12">
                <p className="text-center text-muted-foreground">
                  {searchQuery ? tTeams.emptySearchTitle : tTeams.emptyTitle}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((team) => (
                <Card key={team.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center"
                          style={{ backgroundColor: team.color + '20' }}
                        >
                          <UsersRound className="h-5 w-5" style={{ color: team.color }} />
                        </div>
                        <div>
                          <h3 className="font-semibold">{team.name}</h3>
                          {team.description && (
                            <p className="text-xs text-muted-foreground line-clamp-1">
                              {team.description}
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={team.is_active ? 'default' : 'secondary'}
                        className="text-xs"
                      >
                        {team.is_active ? tTeams.badgeActive : tTeams.badgeInactive}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-1">
                      {team.members.slice(0, 5).map((m) => (
                        <Avatar key={m.id} className="h-7 w-7 border-2 border-background">
                          <AvatarImage src={getMemberAvatar(m.user_id)} />
                          <AvatarFallback className="text-[10px]">
                            {getInitials(getMemberName(m.user_id))}
                          </AvatarFallback>
                        </Avatar>
                      ))}
                      {team.members.length > 5 && (
                        <span className="text-xs text-muted-foreground ml-1">
                          +{team.members.length - 5}
                        </span>
                      )}
                      {team.members.length === 0 && (
                        <span className="text-xs text-muted-foreground">{tTeams.memberCount0}</span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => openEditTeam(team)}
                      >
                        <Pencil className="h-3 w-3 mr-1" /> {tTeams.actionEdit}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteClick(team)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}

      {/* FAB mobile-only — desktop usa botão inline no header. */}
      {isMobile && (
        <FABButton
          icon={<Plus className="h-5 w-5" />}
          label={tTeams.fabLabel}
          onClick={openNewTeam}
        />
      )}

      <TeamFormDialog
        open={formOpen}
        onOpenChange={(o) => {
          setFormOpen(o);
          if (!o) setEditingTeam(null);
        }}
        team={editingTeam}
        onSubmit={async (data) => {
          if (data.id) {
            await updateTeam.mutateAsync(data as TeamInput & { id: string });
          } else {
            await createTeam.mutateAsync(data);
          }
        }}
        isLoading={createTeam.isPending || updateTeam.isPending}
        profiles={profiles ?? []}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tTeams.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {teamToDelete
                ? tTeams.deleteDescription.replace('{name}', teamToDelete.name)
                : tTeams.deleteDescription.replace(' "{name}"', '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tTeams.btnCancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {tTeams.btnDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
