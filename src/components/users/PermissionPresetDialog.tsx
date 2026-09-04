import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2 } from 'lucide-react';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { type PermissionPreset } from '@/hooks/usePermissions';
import { PermissionsEditor } from '@/components/users/PermissionsEditor';

interface PermissionPresetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presets: PermissionPreset[];
  onCreate: (data: { name: string; description?: string; permissions: string[] }) => Promise<void>;
  onUpdate: (data: { id: string; name?: string; description?: string; permissions?: string[] }) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function PermissionPresetDialog({ open, onOpenChange, presets, onCreate, onUpdate, onDelete }: PermissionPresetDialogProps) {
  const { locale } = useAppLocaleContext();
  const tp = MESSAGES[locale].app.settings.users.presets;
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

  const handlePermissionsChange = (permissions: string[]) => {
    setForm(f => ({ ...f, permissions }));
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

  const footer = showForm ? (
    <div className="flex justify-end gap-3">
      <Button variant="outline" onClick={() => { setEditing(null); setIsCreating(false); }}>{tp.btnCancel}</Button>
      <Button onClick={handleSave} disabled={loading || !form.name}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {editing ? tp.btnSave : tp.btnSaveNew}
      </Button>
    </div>
  ) : undefined;

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={tp.dialogTitle}
      description={tp.dialogDesc}
      footer={footer}
    >
      <div className="space-y-0">
        {!showForm ? (
          <div className="space-y-3 pb-4">
            <Button onClick={() => setIsCreating(true)} className="w-full gap-2">
              <Plus className="h-4 w-4" /> {tp.btnCreate}
            </Button>
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">{tp.empty}</p>
            ) : (
              presets.map(preset => (
                <div key={preset.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div>
                    <p className="font-medium text-sm">{preset.name}</p>
                    {preset.description && <p className="text-xs text-muted-foreground">{preset.description}</p>}
                    <Badge variant="secondary" className="mt-1 text-xs">{tp.permCount.replace('{count}', String(preset.permissions.length))}</Badge>
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
              {tp.btnBack}
            </Button>
            <div>
              <Label>{tp.labelName}</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={tp.placeholderName} />
            </div>
            <div>
              <Label>{tp.labelDesc}</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder={tp.placeholderDesc} rows={2} />
            </div>

            <Separator />

            {/* Permissões do cargo: telas com as ações de cada uma dentro.
                Sem chips de cargo aqui (você está EDITANDO um cargo, não escolhendo
                um) e sem "Acesso Total" — preserva exatamente o que a tela já fazia. */}
            <PermissionsEditor
              value={form.permissions}
              onChange={handlePermissionsChange}
            />

          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
