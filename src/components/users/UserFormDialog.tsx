import { useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  SCREEN_PERMISSIONS,
  FUNCTION_PERMISSIONS,
  PERMISSION_GROUPS,
  getPermissionsByGroup,
  getAllPermissionKeys,
  type PermissionPreset,
} from '@/hooks/usePermissions';
import { ROLE_LABELS, type AppRole } from '@/hooks/useUsers';

const ROLES: AppRole[] = ['admin', 'gestor', 'tecnico', 'comercial', 'financeiro'];

interface UserFormData {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  role: AppRole | '';
  permissions: string[];
  preset_id: string | null;
}

interface UserFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: UserFormData) => Promise<void>;
  presets: PermissionPreset[];
  editingUser?: {
    user_id: string;
    full_name: string;
    phone?: string | null;
    role?: AppRole;
    permissions: string[];
    preset_id?: string | null;
  } | null;
}

export function UserFormDialog({ open, onOpenChange, onSubmit, presets, editingUser }: UserFormDialogProps) {
  const isEditing = !!editingUser;
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<UserFormData>({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: '',
    permissions: [],
    preset_id: null,
  });

  useEffect(() => {
    if (editingUser) {
      setForm({
        full_name: editingUser.full_name,
        email: '',
        password: '',
        phone: editingUser.phone || '',
        role: editingUser.role || '',
        permissions: editingUser.permissions || [],
        preset_id: editingUser.preset_id || null,
      });
    } else {
      setForm({ full_name: '', email: '', password: '', phone: '', role: '', permissions: [], preset_id: null });
    }
  }, [editingUser, open]);

  const handlePresetChange = (presetId: string) => {
    if (presetId === 'custom') {
      setForm(f => ({ ...f, preset_id: null }));
      return;
    }
    if (presetId === 'all') {
      setForm(f => ({ ...f, preset_id: null, permissions: getAllPermissionKeys() }));
      return;
    }
    const preset = presets.find(p => p.id === presetId);
    if (preset) {
      setForm(f => ({ ...f, preset_id: preset.id, permissions: [...preset.permissions] }));
    }
  };

  const togglePermission = (key: string) => {
    setForm(f => ({
      ...f,
      preset_id: null, // custom when manually toggling
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  };

  const toggleGroup = (group: string) => {
    const groupPerms = getPermissionsByGroup(group).map(p => p.key);
    const allSelected = groupPerms.every(k => form.permissions.includes(k));
    setForm(f => ({
      ...f,
      preset_id: null,
      permissions: allSelected
        ? f.permissions.filter(p => !groupPerms.includes(p))
        : [...new Set([...f.permissions, ...groupPerms])],
    }));
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await onSubmit(form);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Usuário' : 'Criar Usuário'}
      description={isEditing ? 'Atualize os dados e permissões do usuário' : 'Preencha os dados do novo usuário'}
    >
      <ScrollArea className="max-h-[70vh] pr-4">
        <div className="space-y-6 pb-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <div>
              <Label>Nome Completo *</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome do usuário" />
            </div>
            {!isEditing && (
              <>
                <div>
                  <Label>Email *</Label>
                  <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
                </div>
                <div>
                  <Label>Senha *</Label>
                  <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                </div>
              </>
            )}
            <div>
              <Label>Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="(00) 00000-0000" />
            </div>
            <div>
              <Label>Papel (Role)</Label>
              <Select value={form.role || 'none'} onValueChange={v => setForm(f => ({ ...f, role: v === 'none' ? '' : v as AppRole }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar papel" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem papel</SelectItem>
                  {ROLES.map(r => (
                    <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Preset Selection */}
          <div>
            <Label>Perfil de Acesso</Label>
            <Select value={form.preset_id || 'custom'} onValueChange={handlePresetChange}>
              <SelectTrigger><SelectValue placeholder="Selecionar perfil" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Acesso Total</SelectItem>
                {presets.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Permissions by Group */}
          <div className="space-y-4">
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
                      ref={undefined}
                      onCheckedChange={() => toggleGroup(group)}
                      className={someSelected && !allSelected ? 'opacity-50' : ''}
                    />
                    <span className="text-sm font-semibold text-foreground">{group}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pl-6">
                    {groupPerms.map(perm => (
                      <label key={perm.key} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                        <Checkbox
                          checked={form.permissions.includes(perm.key)}
                          onCheckedChange={() => togglePermission(perm.key)}
                        />
                        <span className="text-muted-foreground">{perm.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ScrollArea>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <Button onClick={handleSubmit} disabled={loading || (!isEditing && (!form.full_name || !form.email || !form.password))}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEditing ? 'Salvar' : 'Criar Usuário'}
        </Button>
      </div>
    </ResponsiveModal>
  );
}
