import { useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOsStatuses } from '@/hooks/useOsStatuses';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function OsStatusManagerDialog({ open, onOpenChange }: Props) {
  const { statuses, isLoading, createStatus, updateStatus, deleteStatus } = useOsStatuses();
  const [newLabel, setNewLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const generateKey = (label: string) =>
    label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

  const handleCreate = () => {
    if (!newLabel.trim()) return;
    const key = newKey.trim() || generateKey(newLabel);
    createStatus.mutate({ key, label: newLabel, color: newColor });
    setNewLabel('');
    setNewKey('');
    setNewColor('#3b82f6');
  };

  const handleUpdate = () => {
    if (!editingId || !editLabel.trim()) return;
    updateStatus.mutate({ id: editingId, label: editLabel, color: editColor });
    setEditingId(null);
  };

  const handleDelete = () => {
    if (!deleteId) return;
    deleteStatus.mutate(deleteId);
    setDeleteId(null);
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Configurações de OS">
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Gerencie os status disponíveis para ordens de serviço.
        </p>

        {/* Add new */}
        <div className="rounded-lg border p-3 space-y-2">
          <p className="text-sm font-medium">Novo status</p>
          <div className="flex gap-2">
            <Input
              placeholder="Nome do status"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              className="flex-1"
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-9 w-9 rounded border cursor-pointer"
            />
            <Button size="sm" onClick={handleCreate} disabled={!newLabel.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Criar
            </Button>
          </div>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
        ) : (
          <div className="space-y-2">
            {statuses.map((status) => (
              <div key={status.id} className="flex items-center gap-3 rounded-lg border p-3">
                {editingId === status.id ? (
                  <>
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="h-8 w-8 rounded border cursor-pointer shrink-0"
                    />
                    <Input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      className="flex-1 h-8"
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate()}
                    />
                    <Button size="sm" variant="outline" onClick={handleUpdate}>Salvar</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancelar</Button>
                  </>
                ) : (
                  <>
                    <div
                      className="h-4 w-4 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    <span className="flex-1 text-sm font-medium">{status.label}</span>
                    <span className="text-xs text-muted-foreground font-mono">{status.key}</span>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setEditingId(status.id); setEditLabel(status.label); setEditColor(status.color); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                      onClick={() => setDeleteId(status.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir status</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este status? OS com este status podem ser afetadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ResponsiveModal>
  );
}
