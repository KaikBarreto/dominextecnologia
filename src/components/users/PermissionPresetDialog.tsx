import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  PERMISSION_GROUPS,
  getPermissionsByGroup,
  type PermissionPreset,
} from '@/hooks/usePermissions';

interface PermissionPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PermissionPreset[];
  onCreate: (data: { name: string; description?: string; permissions: string[] }) => Promise<void>;
  onUpdate: (data: { id: string; name?: string; description?: string; permissions?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PermissionPresetDialog({ open, onOpenChange, presets, onCreate, onUpdate, onDelete }: PermissionPresetDialogProps) {
  const [editing, setEditing] = useState<PermissionPreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', permissions: [] as string[] });

  useEffect(() => {
    if (editing) {
      setForm({ name: editing.name, description: editing.description || '', permissions: [...editing.permissions] });
      setIsCreating(false);
    } else if (isCreating) {
      setForm({ name: '', description: '', permissions: [] });
    }
  }, [editing, isCreating]);

  const togglePermission = (key: string) => {
    setForm(f => ({
      ...f,
      permissions: f.permissions.includes(key) ? f.permissions.filter(p => p !== key) : [...f.permissions, key],
    }));
  };

  const toggleGroup = (group: string) => {
    const groupPerms = getPermissionsByGroup(group).map(p => p.key);
    const allSelected = groupPerms.every(k => form.permissions.includes(k));
    setForm(f => ({
      ...f,
      permissions: allSelected ? f.permissions.filter(p => !groupPerms.includes(p)) : [...new Set([...f.permissions, ...groupPerms])],
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      if (editing) {
        await onUpdate({ id: editing.id, name: form.name, description: form.description, permissions: form.permissions });
      } else {
        await onCreate({ name: form.name, description: form.description, permissions: form.permissions });
      }
      setEditing(null);
      setIsCreating(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    setLoading(true);
    try {
      await onDelete(id);
      if (editing?.id === id) {
        setEditing(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const showForm = isCreating || editing;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Gerenciar Cargos"
      description="Crie e edite perfis de acesso com permissões pré-definidas"
    >
      <ScrollArea className="max-h-[70vh] pr-4">
        {!showForm ? (
          <div className="space-y-3 pb-4">
            <Button onClick={() => setIsCreating(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" /> Novo Cargo
            </Button>
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">Nenhum cargo cadastrado</p>
            ) : (
              presets.map(preset => (
                <div key={preset.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{preset.name}</p>
                    {preset.description && <p className="text-xs text-muted-foreground">{preset.description}</p>}
                    <Badge variant="secondary" className="mt-1 text-xs">{preset.permissions.length} permissões</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(preset)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(preset.id)} disabled={loading}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4 pb-4">
            <Button variant="ghost" size="sm" onClick={() => { setEditing(null); setIsCreating(false); }}>
              ← Voltar
            </Button>
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Ex: Técnico de Campo" />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Descrição opcional" rows={2} />
            </div>

            <Separator />

            <div className="space-y-3">
              <Label className="text-base font-semibold">Permissões</Label>
              {PERMISSION_GROUPS.map(group => {
                const groupPerms = getPermissionsByGroup(group);
                const allSelected = groupPerms.every(p => form.permissions.includes(p.key));
                const someSelected = groupPerms.some(p => form.permissions.includes(p.key));

                return (
                  <div key={group} className="rounded-lg border p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={() => toggleGroup(group)}
                        className={someSelected && !allSelected ? 'opacity-50' : ''}
                      />
                      <span className="text-sm font-semibold">{group}</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                      {groupPerms.map(perm => (
                        <label key={perm.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                          <Checkbox checked={form.permissions.includes(perm.key)} onCheckedChange={() => togglePermission(perm.key)} />
                          <span className="text-muted-foreground">{perm.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => { setEditing(null); setIsCreating(false); }}>Cancelar</Button>
              <Button onClick={handleSave} disabled={loading || !form.name}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Salvar' : 'Criar Cargo'}
              </Button>
            </div>
          </div>
        )}
      </ScrollArea>
    </ResponsiveModal>
  );
}
