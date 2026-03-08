import { useState, useEffect, useRef, useMemo } from 'react';
import { phoneMask } from '@/utils/masks';
import { Loader2, Monitor, Settings2, Camera, X, Wrench, Building2, Link2, Mail, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useEmployees } from '@/hooks/useEmployees';
import {
  SCREEN_PERMISSIONS,
  FUNCTION_PERMISSIONS,
  SCREEN_CATEGORIES,
  getScreensByCategory,
  getFunctionsByCategory,
  getAllPermissionKeys,
  type PermissionPreset,
} from '@/hooks/usePermissions';
import { type AppRole } from '@/hooks/useUsers';
import { processImageFile } from '@/utils/imageConvert';

export interface UserFormData {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  role: AppRole | '';
  permissions: string[];
  preset_id: string | null;
  photo?: File | null;
  removePhoto?: boolean;
  employee_id?: string | null;
  chosen_email?: string | null;
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
    avatar_url?: string | null;
    employee_id?: string | null;
    email?: string | null;
  } | null;
}

export function UserFormDialog({ open, onOpenChange, onSubmit, presets, editingUser }: UserFormDialogProps) {
  const isEditing = !!editingUser;
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { employees } = useEmployees();
  const [accessProfile, setAccessProfile] = useState<string>('custom');
  const [showPwd, setShowPwd] = useState(false);
  const [form, setForm] = useState<UserFormData>({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: '',
    permissions: [],
    preset_id: null,
    photo: null,
    removePhoto: false,
    employee_id: null,
  });

  useEffect(() => {
    if (editingUser) {
      const allKeys = getAllPermissionKeys();
      const isAll = editingUser.permissions.length >= allKeys.length;
      const presetMatch = editingUser.preset_id || null;
      
      setForm({
        full_name: editingUser.full_name,
        email: editingUser.email || '',
        password: '',
        phone: editingUser.phone || '',
        role: editingUser.role || '',
        permissions: editingUser.permissions || [],
        preset_id: presetMatch,
        photo: null,
        removePhoto: false,
        employee_id: editingUser.employee_id || null,
      });
      setPhotoPreview(editingUser.avatar_url || null);
      setAccessProfile(isAll ? 'all' : presetMatch ? presetMatch : 'custom');
    } else {
      setForm({ full_name: '', email: '', password: '', phone: '', role: '', permissions: [], preset_id: null, photo: null, removePhoto: false, employee_id: null });
      setPhotoPreview(null);
      setAccessProfile('custom');
    }
  }, [editingUser, open]);

  const handlePresetChange = (presetId: string) => {
    setAccessProfile(presetId);
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
    setAccessProfile('custom');
    setForm(f => ({
      ...f,
      preset_id: null,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter(p => p !== key)
        : [...f.permissions, key],
    }));
  };

  const handlePhotoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    let file = e.target.files?.[0];
    if (file) {
      file = await processImageFile(file);
      setForm(f => ({ ...f, photo: file, removePhoto: false }));
      const url = URL.createObjectURL(file);
      setPhotoPreview(url);
    }
  };

  const handleRemovePhoto = () => {
    setForm(f => ({ ...f, photo: null, removePhoto: true }));
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
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

  const getInitials = (name: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

  const screenCategories = Object.keys(SCREEN_CATEGORIES);

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Usuário' : 'Criar Usuário'}
      description={isEditing ? 'Atualize os dados e permissões do usuário' : 'Preencha os dados do novo usuário'}
      footer={
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
          <Button onClick={handleSubmit} disabled={loading || (!isEditing && (!form.full_name || !form.email || !form.password))} className="w-full sm:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? 'Atualizar' : 'Criar Usuário'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4 pr-1">
          {/* Photo + Basic Info */}
          <div className="grid grid-cols-1 gap-4">
            {/* Photo Upload */}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">Foto do Usuário</Label>
              <div className="flex items-center gap-4 mt-2">
                <div className="relative group shrink-0">
                  <Avatar className="h-16 w-16 border-2 border-border">
                    {photoPreview ? (
                      <AvatarImage src={photoPreview} alt="Preview" />
                    ) : null}
                    <AvatarFallback className="bg-muted text-muted-foreground text-lg">
                      <Camera className="h-6 w-6" />
                    </AvatarFallback>
                  </Avatar>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute inset-0 flex items-center justify-center bg-black/50 rounded-full opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  >
                    <Camera className="h-4 w-4 text-white" />
                  </button>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      {photoPreview ? 'Substituir' : 'Selecionar foto'}
                    </Button>
                    {photoPreview && (
                      <Button type="button" variant="ghost" size="sm" onClick={handleRemovePhoto} className="text-destructive hover:text-destructive">
                        <X className="h-4 w-4 mr-1" />
                        Remover
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Foto opcional do usuário</p>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePhotoSelect}
                />
              </div>
            </div>

            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">Nome Completo *</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Nome do usuário" />
            </div>
            {!isEditing && (
              <div>
                <Label className="text-[13px] font-normal uppercase tracking-wider">Senha *</Label>
                <div className="relative">
                  <Input type={showPwd ? 'text' : 'password'} value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="Mínimo 6 caracteres" />
                  <button type="button" onClick={() => setShowPwd(!showPwd)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">Email {!isEditing ? '*' : ''}</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
              {isEditing && <p className="text-xs text-muted-foreground mt-1">Alterar o email mudará o login de acesso do usuário</p>}
            </div>
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">Telefone</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: phoneMask(e.target.value) }))} placeholder="(00) 00000-0000" />
            </div>

            {/* Link to employee */}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> Vincular a Funcionário
              </Label>
              <Select value={form.employee_id || '_none'} onValueChange={(v) => setForm(f => ({ ...f, employee_id: v === '_none' ? null : v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Nenhum funcionário vinculado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} {emp.position ? `(${emp.position})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Vincula este usuário a um funcionário cadastrado</p>

              {/* Email conflict resolution */}
              {!isEditing && form.employee_id && (() => {
                const selectedEmp = employees.find(e => e.id === form.employee_id);
                const empEmail = selectedEmp?.email;
                const userEmail = form.email;
                if (empEmail && userEmail && empEmail.toLowerCase() !== userEmail.toLowerCase()) {
                  return (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <Mail className="h-3.5 w-3.5" /> Os emails são diferentes. Qual deve prevalecer?
                      </p>
                      <RadioGroup
                        value={form.chosen_email || userEmail}
                        onValueChange={(v) => setForm(f => ({ ...f, chosen_email: v }))}
                        className="space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={userEmail} id="email-user" />
                          <Label htmlFor="email-user" className="text-xs cursor-pointer">
                            <span className="font-medium">Usuário:</span> {userEmail}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={empEmail} id="email-emp" />
                          <Label htmlFor="email-emp" className="text-xs cursor-pointer">
                            <span className="font-medium">Funcionário:</span> {empEmail}
                          </Label>
                        </div>
                      </RadioGroup>
                      <p className="text-[11px] text-muted-foreground">O email escolhido será aplicado em ambos os cadastros</p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Técnico / Interno Toggle */}
          <div className="space-y-2">
            <Label className="text-[13px] font-normal uppercase tracking-wider">Tipo de Usuário</Label>
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
              <div className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${form.role !== 'tecnico' ? 'text-foreground' : 'text-muted-foreground'}`}>
                <Building2 className="h-4 w-4" />
                Interno
              </div>
              <Switch
                checked={form.role === 'tecnico'}
                onCheckedChange={(checked) => setForm(f => ({ ...f, role: checked ? 'tecnico' : '' }))}
              />
              <div className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${form.role === 'tecnico' ? 'text-foreground' : 'text-muted-foreground'}`}>
                <Wrench className="h-4 w-4" />
                Técnico
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.role === 'tecnico'
                ? 'Aparece na listagem de técnicos da OS e pode ser adicionado a equipes'
                : 'Usuário interno do sistema, não aparece como técnico nas OS'}
            </p>
          </div>

          <Separator />

          {/* Preset Selection */}
          <div>
            <Label className="text-[13px] font-normal uppercase tracking-wider">Perfil de Acesso</Label>
            <Select value={accessProfile} onValueChange={handlePresetChange}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Selecione um perfil" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Personalizado</SelectItem>
                <SelectItem value="all">Acesso Total</SelectItem>
                {presets.map(p => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}{p.description ? ` - ${p.description}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Telas Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Monitor className="h-5 w-5 text-primary" />
              <h3 className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85">Telas</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione quais telas este usuário pode acessar
            </p>
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
                            id={screen.key}
                            checked={form.permissions.includes(screen.key)}
                            onCheckedChange={() => togglePermission(screen.key)}
                            className="mt-0.5"
                          />
                          <label htmlFor={screen.key} className="text-sm leading-tight cursor-pointer">
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

          {/* Funções Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              <h3 className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85">Funções</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Selecione quais ações este usuário pode realizar
            </p>
            <div className="border rounded-lg p-4 space-y-3">
              {FUNCTION_PERMISSIONS.map(action => (
                <div key={action.key} className="flex items-start space-x-2 p-2 rounded hover:bg-muted/50 transition-colors">
                  <Checkbox
                    id={action.key}
                    checked={form.permissions.includes(action.key)}
                    onCheckedChange={() => togglePermission(action.key)}
                    className="mt-0.5"
                  />
                  <div className="flex-1">
                    <label htmlFor={action.key} className="text-sm font-medium cursor-pointer block">
                      {action.label}
                    </label>
                    <p className="text-xs text-muted-foreground">{action.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
      </div>
    </ResponsiveModal>
  );
}
