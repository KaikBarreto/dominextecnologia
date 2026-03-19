import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Loader2, Monitor, Settings2 } from 'lucide-react';
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
  SCREEN_CATEGORIES,
  FUNCTION_PERMISSIONS,
  getScreensByCategory,
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

  const screenCategories = Object.keys(SCREEN_CATEGORIES);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Configurações de Cargos"
      description="Crie e edite perfis de acesso com permissões pré-definidas"
    >
      <div className="space-y-0">
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

            {/* Telas Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Monitor className="h-5 w-5 text-primary" />
                <Label className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85">Telas</Label>
              </div>
              <div className="grid grid-cols-1 gap-4">
                {screenCategories.map(catKey => {
                  const category = SCREEN_CATEGORIES[catKey];
                  const screens = getScreensByCategory(catKey);
                  if (screens.length === 0) return null;
                  const CategoryIcon = category.icon;

                  return (
                    <div key={catKey} className="border rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                        <CategoryIcon className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium text-sm">{category.label}</span>
                      </div>
                      <div className="space-y-2">
                        {screens.map(screen => (
                          <div key={screen.key} className="flex items-start space-x-2">
                            <Checkbox
                              checked={form.permissions.includes(screen.key)}
                              onCheckedChange={() => togglePermission(screen.key)}
                              className="mt-0.5"
                            />
                            <label className="text-sm leading-tight cursor-pointer" onClick={() => togglePermission(screen.key)}>
                              {screen.label}
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <Separator />

            {/* Funções Section */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-primary" />
                <Label className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85">Funções</Label>
              </div>
              <div className="border rounded-lg p-4 space-y-3">
                {FUNCTION_PERMISSIONS.map(action => (
                  <div key={action.key} className="flex items-start space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={form.permissions.includes(action.key)}
                      onCheckedChange={() => togglePermission(action.key)}
                      className="mt-0.5"
                    />
                    <div className="flex-1">
                      <label className="text-sm font-medium cursor-pointer block" onClick={() => togglePermission(action.key)}>
                        {action.label}
                      </label>
                      <p className="text-xs text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                ))}
              </div>
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
