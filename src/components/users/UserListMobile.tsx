import { Pencil, Trash2, UserX, UserCheck, Shield, User as UserIcon } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MobileListItem,
  type ItemAction,
} from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { UserWithRole } from '@/hooks/useUsers';
import type { UserPermission, PermissionPreset } from '@/hooks/usePermissions';
import { getAllPermissionKeys } from '@/hooks/usePermissions';

interface UserListMobileProps {
  users: UserWithRole[];
  isLoading: boolean;
  searchQuery: string;
  currentUserId?: string;
  canManageRoles: boolean;
  /** Há slot livre no plano? Reativar só é oferecido quando true. */
  canAddUser: boolean;
  userPermissions: UserPermission[];
  presets: PermissionPreset[];
  onEdit: (user: UserWithRole) => void;
  onDeactivate: (user: UserWithRole) => void;
  onReactivate: (user: UserWithRole) => void;
  onDelete: (user: UserWithRole) => void;
  onPreviewPhoto: (src: string, alt: string) => void;
}

const getInitials = (name: string) =>
  name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export function UserListMobile({
  users,
  isLoading,
  searchQuery,
  currentUserId,
  canManageRoles,
  canAddUser,
  userPermissions,
  presets,
  onEdit,
  onDeactivate,
  onReactivate,
  onDelete,
  onPreviewPhoto,
}: UserListMobileProps) {
  const getUserPermission = (userId: string) =>
    userPermissions.find((p) => p.user_id === userId);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <EmptyState
        icon={<UserIcon className="h-12 w-12" />}
        title={searchQuery ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
        description={
          searchQuery
            ? 'Tente uma busca diferente'
            : 'Toque em "Novo Usuário" para começar'
        }
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {users.map((userProfile) => {
        const perm = getUserPermission(userProfile.user_id);
        // Status da CONTA (slot/login): profiles.is_active. undefined = ativo.
        const isActive = userProfile.is_active !== false;
        const permCount = perm?.permissions?.length || 0;
        const preset = perm?.preset_id
          ? presets.find((p) => p.id === perm.preset_id)
          : null;
        const isAllPerms = permCount >= getAllPermissionKeys().length;
        const isSelf = userProfile.user_id === currentUserId;

        const roleLabel = preset
          ? preset.name
          : isAllPerms
            ? 'Acesso Total'
            : `${permCount} permissões`;

        const actions: ItemAction[] = canManageRoles
          ? [
              {
                key: 'edit',
                label: 'Editar',
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => onEdit(userProfile),
              },
              ...(!isSelf
                ? [
                    isActive
                      ? ({
                          key: 'deactivate',
                          label: 'Desativar',
                          icon: <UserX className="h-4 w-4" />,
                          // 'edit' pinta laranja/warning (cor semântica de desativar).
                          variant: 'edit',
                          onClick: () => onDeactivate(userProfile),
                        } as ItemAction)
                      : ({
                          key: 'reactivate',
                          label: canAddUser ? 'Reativar' : 'Reativar (sem slot)',
                          icon: <UserCheck className="h-4 w-4" />,
                          variant: 'success',
                          onClick: () => onReactivate(userProfile),
                        } as ItemAction),
                    {
                      key: 'delete',
                      label: 'Excluir',
                      icon: <Trash2 className="h-4 w-4" />,
                      variant: 'destructive' as const,
                      onClick: () => onDelete(userProfile),
                    } as ItemAction,
                  ]
                : []),
            ]
          : [];

        return (
          <MobileListItem
            key={userProfile.id}
            className={!isActive ? 'opacity-60' : undefined}
            leading={
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (userProfile.avatar_url) {
                    onPreviewPhoto(userProfile.avatar_url, userProfile.full_name);
                  }
                }}
                className="shrink-0"
                aria-label="Ver foto"
              >
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarImage
                    src={userProfile.avatar_url || undefined}
                    alt={userProfile.full_name}
                  />
                  <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                    {getInitials(userProfile.full_name)}
                  </AvatarFallback>
                </Avatar>
              </button>
            }
            title={
              <span className="flex items-center gap-1.5">
                <span className="truncate">{userProfile.full_name}</span>
                {isSelf && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0">
                    Você
                  </Badge>
                )}
              </span>
            }
            subtitle={
              <span className="flex items-center gap-1.5">
                <Shield className="h-3 w-3 shrink-0" />
                <span className="truncate">{roleLabel}</span>
                {userProfile.phone && (
                  <>
                    <span className="opacity-60">•</span>
                    <span className="truncate">{userProfile.phone}</span>
                  </>
                )}
              </span>
            }
            trailing={
              isActive ? (
                <Badge className="bg-primary/15 text-primary border-0 text-[10px] px-2 py-0.5">
                  Ativo
                </Badge>
              ) : (
                <Badge className="bg-destructive/15 text-destructive border-0 text-[10px] px-2 py-0.5">
                  Inativo
                </Badge>
              )
            }
            actions={actions}
          />
        );
      })}
    </div>
  );
}
