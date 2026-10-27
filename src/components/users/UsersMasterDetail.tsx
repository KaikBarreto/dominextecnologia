import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, Shield, ShieldCheck, Trash2, UserCheck, Users, UserX } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/mobile/EmptyState';
import { ListDetailLayout, type ListDetailItem } from '@/components/ui/ListDetailLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  FUNCTION_PERMISSIONS,
  SCREEN_PERMISSIONS,
  getAllPermissionKeys,
  type PermissionPreset,
  type UserPermission,
} from '@/hooks/usePermissions';
import { ROLE_LABELS, type UserWithRole } from '@/hooks/useUsers';

interface Props {
  users: UserWithRole[];
  isLoading: boolean;
  error: unknown;
  currentUserId?: string;
  canManageRoles: boolean;
  canAddUser: boolean;
  userPermissions: UserPermission[];
  presets: PermissionPreset[];
  onRetry: () => void;
  onCreate: () => void;
  onEdit: (user: UserWithRole) => void;
  onDeactivate: (user: UserWithRole) => void;
  onReactivate: (user: UserWithRole) => void;
  onDelete: (user: UserWithRole) => void;
  onPreviewPhoto: (src: string, alt: string) => void;
}

const initials = (name: string) =>
  name.split(' ').map((part) => part[0]).join('').toUpperCase().slice(0, 2);

export function UsersMasterDetail(props: Props) {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = props.users.find((profile) => profile.user_id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && !props.users.some((profile) => profile.user_id === selectedId)) setSelectedId(null);
  }, [props.users, selectedId]);

  const items = useMemo<ListDetailItem[]>(() => props.users.map((profile) => {
    const permission = props.userPermissions.find((item) => item.user_id === profile.user_id);
    const preset = permission?.preset_id ? props.presets.find((item) => item.id === permission.preset_id) : null;
    const full = permission?.permissions.includes('*')
      || getAllPermissionKeys().every((key) => permission?.permissions.includes(key));
    return {
      id: profile.user_id,
      title: profile.full_name,
      subtitle: preset?.name || (full ? 'Acesso total' : `${permission?.permissions.length ?? 0} permissões`),
      searchText: [profile.email, profile.phone, profile.role ? ROLE_LABELS[profile.role] : ''].filter(Boolean).join(' '),
      leading: (
        <Avatar className="h-10 w-10 border border-border">
          <AvatarImage src={profile.avatar_url || undefined} alt={profile.full_name} />
          <AvatarFallback className="text-xs">{initials(profile.full_name)}</AvatarFallback>
        </Avatar>
      ),
      trailing: (
        <Badge className={profile.is_active !== false ? 'bg-success text-white' : 'bg-slate-600 text-white'}>
          {profile.is_active !== false ? 'Ativo' : 'Inativo'}
        </Badge>
      ),
    };
  }), [props.presets, props.userPermissions, props.users]);

  if (props.isLoading) return (
    <div className="grid gap-5 lg:grid-cols-[minmax(20rem,24rem)_minmax(0,1fr)]" aria-label="Carregando usuários">
      <div className="space-y-3"><Skeleton className="h-9 w-full" />{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-16 w-full" />)}</div>
      <Skeleton className="hidden h-[520px] w-full lg:block" />
    </div>
  );

  if (props.error) return (
    <Alert variant="destructive">
      <Users className="h-4 w-4" />
      <AlertTitle>Não foi possível carregar os usuários</AlertTitle>
      <AlertDescription className="mt-2 flex items-center justify-between gap-3">
        <span>Verifique sua conexão e tente novamente.</span>
        <Button type="button" variant="outline" size="sm" onClick={props.onRetry}>Tentar novamente</Button>
      </AlertDescription>
    </Alert>
  );

  const permission = selected
    ? props.userPermissions.find((item) => item.user_id === selected.user_id)
    : null;
  const keys = permission?.permissions.includes('*') ? getAllPermissionKeys() : permission?.permissions ?? [];
  const screens = SCREEN_PERMISSIONS.filter((item) => keys.includes(item.key));
  const functions = FUNCTION_PERMISSIONS.filter((item) => keys.includes(item.key));
  const preset = permission?.preset_id ? props.presets.find((item) => item.id === permission.preset_id) : null;
  const full = permission?.permissions.includes('*') || getAllPermissionKeys().every((key) => keys.includes(key));

  const detail = selected ? (
    <div className="min-w-0">
      <div className="border-b border-border pb-5">
        {isMobile ? (
          <Button type="button" variant="ghost" size="sm" className="-ml-2 mb-4" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para a lista
          </Button>
        ) : null}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <button
              type="button"
              className="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => selected.avatar_url && props.onPreviewPhoto(selected.avatar_url, selected.full_name)}
              aria-label={`Ampliar foto de ${selected.full_name}`}
            >
              <Avatar className="h-14 w-14 border border-border">
                <AvatarImage src={selected.avatar_url || undefined} alt={selected.full_name} />
                <AvatarFallback>{initials(selected.full_name)}</AvatarFallback>
              </Avatar>
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">{selected.full_name}</h2>
                {selected.user_id === props.currentUserId ? <Badge variant="outline">Você</Badge> : null}
                <Badge className={selected.is_active !== false ? 'bg-success text-white' : 'bg-slate-600 text-white'}>
                  {selected.is_active !== false ? 'Ativo' : 'Inativo'}
                </Badge>
              </div>
              <p className="mt-1 truncate text-sm text-muted-foreground">{selected.email || 'E-mail não informado'}</p>
            </div>
          </div>
          {props.canManageRoles ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => props.onEdit(selected)}><Pencil className="mr-2 h-4 w-4" />Editar</Button>
              {selected.user_id !== props.currentUserId && selected.is_active !== false ? (
                <Button type="button" variant="outline" size="sm" onClick={() => props.onDeactivate(selected)}><UserX className="mr-2 h-4 w-4" />Desativar</Button>
              ) : null}
              {selected.user_id !== props.currentUserId && selected.is_active === false ? (
                <Button type="button" variant="outline" size="sm" disabled={!props.canAddUser} onClick={() => props.onReactivate(selected)}><UserCheck className="mr-2 h-4 w-4" />Reativar</Button>
              ) : null}
              {selected.user_id !== props.currentUserId ? (
                <Button type="button" variant="destructive-ghost" size="sm" onClick={() => props.onDelete(selected)}><Trash2 className="mr-2 h-4 w-4" />Excluir</Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="divide-y divide-border">
        <section className="grid gap-6 py-5 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Perfil de acesso</p>
            <p className="mt-2 font-medium">{preset?.name || (full ? 'Acesso total' : 'Personalizado')}</p>
            <p className="mt-1 text-sm text-muted-foreground">{preset?.description || `${screens.length + functions.length} permissões configuradas.`}</p>
          </div>
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Dados do usuário</p>
            <p className="mt-2 font-medium">{selected.role ? ROLE_LABELS[selected.role] : 'Usuário interno'}</p>
            <p className="mt-1 text-sm text-muted-foreground">{selected.phone || 'Telefone não informado'}</p>
          </div>
        </section>

        <section className="py-5">
          <div className="mb-4 flex items-center gap-2"><Shield className="h-4 w-4 text-primary" /><h3 className="font-semibold">Permissões concedidas</h3></div>
          {full ? (
            <p className="text-sm leading-relaxed text-muted-foreground">Este usuário pode acessar todas as telas e ações disponíveis nos módulos contratados.</p>
          ) : screens.length + functions.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma permissão foi concedida.</p>
          ) : (
            <div className="grid gap-8 md:grid-cols-2">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Telas ({screens.length})</p>
                <ul className="divide-y divide-border">{screens.map((item) => { const Icon = item.icon; return <li key={item.key} className="flex gap-3 py-3"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-sm font-medium">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p></div></li>; })}</ul>
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Ações ({functions.length})</p>
                <ul className="divide-y divide-border">{functions.map((item) => <li key={item.key} className="flex gap-3 py-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /><div><p className="text-sm font-medium">{item.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p></div></li>)}</ul>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  ) : (
    <div className="flex min-h-[420px] items-center justify-center px-4 py-10">
      <EmptyState icon={<Users className="h-10 w-10" />} title="Selecione um usuário" description="Escolha alguém na lista para consultar dados e permissões." action={props.canManageRoles ? { label: 'Criar usuário', onClick: props.onCreate } : undefined} />
    </div>
  );

  return (
    <ListDetailLayout
      items={items}
      selectedId={selectedId ?? undefined}
      listTitle="Usuários"
      listDescription={`${props.users.length} ${props.users.length === 1 ? 'usuário cadastrado' : 'usuários cadastrados'}`}
      pageSize={10}
      storageKey="users-list-detail"
      searchPlaceholder="Buscar por nome, e-mail, telefone ou perfil"
      emptyLabel="Nenhum usuário encontrado"
      onSelect={setSelectedId}
      mobileDetailOpen={isMobile ? Boolean(selected) : undefined}
      detailClassName="min-w-0"
    >
      {detail}
    </ListDetailLayout>
  );
}
