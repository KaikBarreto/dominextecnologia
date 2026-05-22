import { Pencil, Trash2, Copy, Shield, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  MobileListItem,
  type ItemAction,
} from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';
import type { PermissionPreset } from '@/hooks/usePermissions';

interface PresetListMobileProps {
  presets: PermissionPreset[];
  isLoading?: boolean;
  canManage: boolean;
  onEdit: (preset: PermissionPreset) => void;
  onDuplicate: (preset: PermissionPreset) => void;
  onDelete: (preset: PermissionPreset) => void;
}

export function PresetListMobile({
  presets,
  isLoading = false,
  canManage,
  onEdit,
  onDuplicate,
  onDelete,
}: PresetListMobileProps) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (presets.length === 0) {
    return (
      <EmptyState
        icon={<ShieldCheck className="h-12 w-12" />}
        title="Nenhum cargo cadastrado"
        description='Toque em "Novo Cargo" para criar um perfil de acesso'
      />
    );
  }

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {presets.map((preset) => {
        const actions: ItemAction[] = canManage
          ? [
              {
                key: 'edit',
                label: 'Editar',
                icon: <Pencil className="h-4 w-4" />,
                variant: 'edit',
                onClick: () => onEdit(preset),
              },
              {
                key: 'duplicate',
                label: 'Duplicar',
                icon: <Copy className="h-4 w-4" />,
                onClick: () => onDuplicate(preset),
              },
              {
                key: 'delete',
                label: 'Excluir',
                icon: <Trash2 className="h-4 w-4" />,
                variant: 'destructive',
                onClick: () => onDelete(preset),
              },
            ]
          : [];

        return (
          <MobileListItem
            key={preset.id}
            onClick={canManage ? () => onEdit(preset) : undefined}
            leading={
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                <Shield className="h-5 w-5" />
              </div>
            }
            title={preset.name}
            subtitle={preset.description || 'Sem descrição'}
            trailing={
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5">
                {preset.permissions.length}
              </Badge>
            }
            actions={actions}
          />
        );
      })}
    </div>
  );
}
