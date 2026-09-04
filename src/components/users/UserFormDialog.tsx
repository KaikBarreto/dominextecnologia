import { useState, useEffect, useRef, useMemo } from 'react';
import { phoneMask } from '@/utils/masks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n';
import { Loader2, ShieldCheck, Camera, X, Wrench, Building2, Link2, Mail } from 'lucide-react';
import { PasswordInput } from '@/components/PasswordInput';
import { PasswordStrengthIndicator, isPasswordStrong } from '@/components/PasswordStrengthIndicator';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useEmployees } from '@/hooks/useEmployees';
import {
  getAllPermissionKeys,
  type PermissionPreset,
} from '@/hooks/usePermissions';
import { PermissionsEditor } from '@/components/users/PermissionsEditor';
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
  const { locale } = useAppLocaleContext();
  const tf = MESSAGES[locale].app.settings.users.form;
  const isEditing = !!editingUser;
  const [loading, setLoading] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { employees } = useEmployees();
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
      // "Acesso Total" = curinga '*' (dinâmico, pega perms futuras) OU tem TODAS as perms de hoje (snapshot legado)
      const isAll = editingUser.permissions.includes('*') || allKeys.every(k => editingUser.permissions.includes(k));
      const presetMatch = editingUser.preset_id || null;
      // Se for acesso total, exibe o conjunto completo atual com tudo marcado.
      // O SAVE grava '*' (não a lista expandida) enquanto o perfil seguir em 'all'.
      const initialPermissions = isAll ? allKeys : (editingUser.permissions || []);

      setForm({
        full_name: editingUser.full_name,
        email: editingUser.email || '',
        password: '',
        phone: editingUser.phone || '',
        role: editingUser.role || '',
        permissions: initialPermissions,
        preset_id: presetMatch,
        photo: null,
        removePhoto: false,
        employee_id: editingUser.employee_id || null,
      });
      setPhotoPreview(editingUser.avatar_url || null);
    } else {
      setForm({ full_name: '', email: '', password: '', phone: '', role: '', permissions: [], preset_id: null, photo: null, removePhoto: false, employee_id: null });
      setPhotoPreview(null);
    }
  }, [editingUser, open]);

  const allKeys = useMemo(() => getAllPermissionKeys(), []);

  // ── Perfil ativo é DERIVADO da seleção, nunca guardado em estado ──────────
  // É isso que faz o chip apagar sozinho quando o admin desliga uma permissão e
  // acender de novo quando ele religa. Estado paralelo aqui (useEffect ligando
  // seleção → chip) causa re-render/remonte do modal a cada clique.
  const isFullAccess = useMemo(() => {
    const set = new Set(form.permissions.includes('*') ? allKeys : form.permissions);
    return allKeys.length > 0 && allKeys.every(k => set.has(k));
  }, [form.permissions, allKeys]);

  const derivedPresetId = useMemo(() => {
    if (isFullAccess) return null;
    const set = new Set(form.permissions);
    const match = presets.find(
      p => p.permissions.length === form.permissions.length && p.permissions.every(k => set.has(k)),
    );
    return match?.id ?? null;
  }, [presets, form.permissions, isFullAccess]);

  const handlePermissionsChange = (permissions: string[]) => {
    setForm(f => ({ ...f, permissions }));
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
      // "Acesso Total" grava o curinga '*' (dinâmico): libera toda permissão, inclusive
      // as criadas no futuro. Os switches ficam todos ligados só pra exibição.
      // O cargo (`preset_id`) é o derivado — se a seleção deixou de bater com o
      // cargo, o vínculo cai junto (e volta sozinho se o admin religar tudo).
      const payload: UserFormData = {
        ...form,
        permissions: isFullAccess ? ['*'] : form.permissions,
        preset_id: derivedPresetId,
      };
      await onSubmit(payload);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) =>
    name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '??';

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? tf.titleEdit : tf.titleCreate}
      description={isEditing ? tf.descEdit : tf.descCreate}
      footer={
        <div className="flex flex-col-reverse sm:flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">{tf.cancel}</Button>
          <Button onClick={handleSubmit} disabled={loading || (!isEditing && (!form.full_name || !form.email || !form.password))} className="w-full sm:w-auto">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isEditing ? tf.save : tf.create}
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-4 pr-1">
          {/* Photo + Basic Info */}
          <div className="grid grid-cols-1 gap-4">
            {/* Photo Upload */}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">{tf.photoLabel}</Label>
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
                      {photoPreview ? tf.photoReplace : tf.photoSelect}
                    </Button>
                    {photoPreview && (
                      <Button type="button" variant="destructive-ghost" size="sm" onClick={handleRemovePhoto}>
                        <X className="h-4 w-4 mr-1" />
                        {tf.photoRemove}
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{tf.photoHint}</p>
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
              <Label className="text-[13px] font-normal uppercase tracking-wider">{tf.labelFullName}</Label>
              <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder={tf.placeholderFullName} />
            </div>
            {!isEditing && (
              <div>
                <Label className="text-[13px] font-normal uppercase tracking-wider">{tf.labelPassword}</Label>
                <PasswordInput value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={tf.placeholderPassword} />
                <PasswordStrengthIndicator password={form.password} />
              </div>
            )}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">{!isEditing ? tf.labelEmailRequired : tf.labelEmail}</Label>
              <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@exemplo.com" />
              {isEditing && <p className="text-xs text-muted-foreground mt-1">{tf.labelEmailHint}</p>}
            </div>
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider">{tf.labelPhone}</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: phoneMask(e.target.value) }))} placeholder="(00) 00000-0000" />
            </div>

            {/* Link to employee */}
            <div>
              <Label className="text-[13px] font-normal uppercase tracking-wider flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5" /> {tf.labelEmployee}
              </Label>
              <Select value={form.employee_id || '_none'} onValueChange={(v) => setForm(f => ({ ...f, employee_id: v === '_none' ? null : v }))}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={tf.placeholderEmployee} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{tf.employeeNone}</SelectItem>
                  {employees.map(emp => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.name} {emp.position ? `(${emp.position})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">{tf.employeeHint}</p>

              {/* Email conflict resolution */}
              {!isEditing && form.employee_id && (() => {
                const selectedEmp = employees.find(e => e.id === form.employee_id);
                const empEmail = selectedEmp?.email;
                const userEmail = form.email;
                if (empEmail && userEmail && empEmail.toLowerCase() !== userEmail.toLowerCase()) {
                  return (
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 p-3 space-y-2">
                      <p className="text-xs font-medium flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <Mail className="h-3.5 w-3.5" /> {tf.emailConflictTitle}
                      </p>
                      <RadioGroup
                        value={form.chosen_email || userEmail}
                        onValueChange={(v) => setForm(f => ({ ...f, chosen_email: v }))}
                        className="space-y-1"
                      >
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={userEmail} id="email-user" />
                          <Label htmlFor="email-user" className="text-xs cursor-pointer">
                            <span className="font-medium">{tf.emailConflictUser}</span> {userEmail}
                          </Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value={empEmail} id="email-emp" />
                          <Label htmlFor="email-emp" className="text-xs cursor-pointer">
                            <span className="font-medium">{tf.emailConflictEmployee}</span> {empEmail}
                          </Label>
                        </div>
                      </RadioGroup>
                      <p className="text-[11px] text-muted-foreground">{tf.emailConflictHint}</p>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          {/* Técnico / Interno Toggle */}
          <div className="space-y-2">
            <Label className="text-[13px] font-normal uppercase tracking-wider">{tf.labelUserType}</Label>
            <div className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30">
              <div className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${form.role !== 'tecnico' ? 'text-foreground' : 'text-muted-foreground'}`}>
                <Building2 className="h-4 w-4" />
                {tf.typeInternal}
              </div>
              <Switch
                checked={form.role === 'tecnico'}
                onCheckedChange={(checked) => setForm(f => ({ ...f, role: checked ? 'tecnico' : '' }))}
              />
              <div className={`flex items-center gap-1.5 text-sm font-medium transition-colors ${form.role === 'tecnico' ? 'text-foreground' : 'text-muted-foreground'}`}>
                <Wrench className="h-4 w-4" />
                {tf.typeTech}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.role === 'tecnico' ? tf.descTech : tf.descInternal}
            </p>
          </div>

          <Separator />

          {/* Permissões: perfis rápidos + telas com as ações de cada uma dentro */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <h3 className="text-[13px] font-semibold uppercase tracking-widest text-foreground/85">{tf.sectionPermissions}</h3>
            </div>
            <p className="text-xs text-muted-foreground">{tf.hintPermissions}</p>
            <PermissionsEditor
              value={form.permissions}
              onChange={handlePermissionsChange}
              presets={presets}
              allowFullAccess
            />
          </div>
      </div>
    </ResponsiveModal>
  );
}
