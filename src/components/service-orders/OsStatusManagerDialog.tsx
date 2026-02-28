import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';

// For now statuses are hardcoded in the OS enum; this dialog lets users see them.
// Future: migrate to a DB table for full customization.

interface StatusItem {
  key: string;
  label: string;
  color: string;
  editable: boolean;
}

const defaultStatuses: StatusItem[] = [
  { key: 'pendente', label: 'Pendente', color: '#f59e0b', editable: true },
  { key: 'em_andamento', label: 'Em Andamento', color: '#3b82f6', editable: true },
  { key: 'concluida', label: 'Concluída', color: '#22c55e', editable: true },
  { key: 'cancelada', label: 'Cancelada', color: '#ef4444', editable: true },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OsStatusManagerDialog({ open, onOpenChange }: Props) {
  const { toast } = useToast();
  const [statuses] = useState<StatusItem[]>(defaultStatuses);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Status de Ordens de Serviço">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie os status disponíveis para ordens de serviço. Estes são os status padrão do sistema.
        </p>

        <div className="space-y-2">
          {statuses.map((status) => (
            <div key={status.key} className="flex items-center gap-3 rounded-lg border p-3">
              <div
                className="h-4 w-4 rounded-full shrink-0"
                style={{ backgroundColor: status.color }}
              />
              <span className="flex-1 text-sm font-medium">{status.label}</span>
              <span className="text-xs text-muted-foreground font-mono">{status.key}</span>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center pt-2">
          Os status são definidos pelo sistema e refletem o fluxo de trabalho das ordens de serviço.
          Para adicionar novos status, entre em contato com o suporte.
        </p>
      </div>
    </ResponsiveModal>
  );
}
