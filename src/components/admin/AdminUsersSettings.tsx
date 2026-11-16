import { useEffect, useMemo, useState } from 'react';
import { Plus, UserCog, Trash2, KeyRound, ShieldCheck, Edit, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { AdminPermissionsEditor } from '@/components/admin/AdminPermissionsEditor';

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  is_master: boolean;
  permissions: string[];
  salesperson: { id: string; name: string } | null;
}

export function AdminUsersSettings() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetUser, setResetUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['admin-users-list'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', {
        body: { action: 'list' },
      });
      if (error) throw error;
      return (data?.users ?? []) as AdminUser[];
    },
  });

  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-for-admin-link'],
    queryFn: async () => {
      const { data, error } = await supabase.from('salespeople_basic').select('id, name, user_id');
      if (error) throw error;
      return data as { id: string; name: string; user_id: string | null }[];
    },
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['admin-users-list'] });

  return (
    <Card className="p-4 lg:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <UserCog className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Usuários Admin</h2>
            <p className="text-xs text-muted-foreground">Gerencie acessos e permissões do painel administrativo</p>
          </div>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Novo usuário
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-3">
          {users.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum usuário admin encontrado</p>
          )}
          {users.map((u) => (
            <div key={u.id} className="rounded-lg border p-3 lg:p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-sm">{u.full_name || u.email}</p>
                    {u.is_master && <Badge className="bg-amber-500 hover:bg-amber-600 gap-1"><ShieldCheck className="h-3 w-3" />Master</Badge>}
                    {u.salesperson && <Badge variant="outline">Vendedor: {u.salesperson.name}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{u.email}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!u.is_master && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(u)} className="gap-1">
                      <Edit className="h-3.5 w-3.5" /> Permissões
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => setResetUser(u)} className="gap-1">
                    <KeyRound className="h-3.5 w-3.5" /> Senha
                  </Button>
                  {!u.is_master && (
                    <Button size="sm" variant="destructive-ghost" onClick={() => setDeleteUser(u)} className="gap-1">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              {!u.is_master && u.permissions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {u.permissions.map((p) => (
                    <Badge key={p} variant="secondary" className="text-[10px]">{p}</Badge>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <CreateUserModal
        open={createOpen}
        onOpenChange={setCreateOpen}
        salespeople={salespeople.filter((s) => !s.user_id)}
        onCreated={refresh}
      />

      <EditPermissionsModal
        user={editing}
        onClose={() => setEditing(null)}
        salespeople={salespeople}
        onSaved={refresh}
      />

      <ResetPasswordModal user={resetUser} onClose={() => setResetUser(null)} />

      <AlertDialog open={!!deleteUser} onOpenChange={(o) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir usuário admin?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação removerá o acesso de <strong>{deleteUser?.email}</strong> permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteUser) return;
                const { error } = await supabase.functions.invoke('manage-admin-users', {
                  body: { action: 'delete', user_id: deleteUser.id },
                });
                if (error) toast.error('Erro ao excluir');
                else { toast.success('Usuário excluído'); refresh(); }
                setDeleteUser(null);
              }}
            >Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ============== Create modal ==============
function CreateUserModal({
  open, onOpenChange, salespeople, onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  salespeople: { id: string; name: string }[];
  onCreated: () => void;
}) {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [linkSalesperson, setLinkSalesperson] = useState<string>('none');
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setEmail(''); setFullName(''); setPassword(''); setSelected([]); setLinkSalesperson('none');
    }
  }, [open]);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPassword(s);
  };

  const handleSalespersonLink = (value: string) => {
    setLinkSalesperson(value);
    if (value !== 'none') {
      setSelected((current) => current.includes('admin_empresas_acesso')
        ? current
        : [...current, 'admin_empresas_acesso']);
    }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!email || !password) throw new Error('Email e senha são obrigatórios');
      const { data, error } = await supabase.functions.invoke('manage-admin-users', {
        body: {
          action: 'create',
          email, full_name: fullName, password,
          permissions: selected,
          link_salesperson_id: linkSalesperson === 'none' ? null : linkSalesperson,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => { toast.success('Usuário criado'); onOpenChange(false); onCreated(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao criar'),
  });

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">Cancelar</Button>
      <Button onClick={() => create.mutate()} disabled={create.isPending} className="w-full sm:w-auto">
        {create.isPending ? 'Criando...' : 'Criar usuário'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Novo usuário admin" description="Crie um acesso ao painel administrativo" footer={footer} className="sm:max-w-5xl" drawerClassName="max-h-[92dvh]">
      <div className="grid min-h-0 gap-0 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)] lg:divide-x lg:divide-border">
        <div className="space-y-5 py-2 lg:sticky lg:top-0 lg:self-start lg:pr-6">
          <h3 className="text-sm font-semibold">Dados do usuário</h3>
        <div className="grid grid-cols-1 gap-5">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Email*</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>Senha*</Label>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="" />
            <Button type="button" variant="outline" onClick={generatePassword}>Gerar</Button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Vincular a vendedor (opcional)</Label>
          <Select value={linkSalesperson} onValueChange={handleSalespersonLink}>
            <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Nenhum —</SelectItem>
              {salespeople.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        </div>
        <div className="mt-5 min-w-0 space-y-4 border-t pt-5 lg:mt-0 lg:border-t-0 lg:py-2 lg:pl-6">
          <h3 className="text-sm font-semibold">Permissões de acesso</h3>
          <PermissionsPicker selected={selected} onChange={setSelected} />
        </div>
      </div>
    </ResponsiveModal>
  );
}

// ============== Edit permissions modal ==============
function EditPermissionsModal({
  user, onClose, salespeople, onSaved,
}: {
  user: AdminUser | null;
  onClose: () => void;
  salespeople: { id: string; name: string; user_id: string | null }[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [linkSalesperson, setLinkSalesperson] = useState<string>('none');

  useEffect(() => {
    if (user) {
      setSelected(user.permissions ?? []);
      setLinkSalesperson(user.salesperson?.id ?? 'none');
    }
  }, [user]);

  const availableSps = useMemo(
    () => salespeople.filter((s) => !s.user_id || s.user_id === user?.id),
    [salespeople, user?.id]
  );

  const handleSalespersonLink = (value: string) => {
    setLinkSalesperson(value);
    if (value !== 'none') {
      setSelected((current) => current.includes('admin_empresas_acesso')
        ? current
        : [...current, 'admin_empresas_acesso']);
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { error } = await supabase.functions.invoke('manage-admin-users', {
        body: {
          action: 'update_permissions',
          user_id: user.id,
          permissions: selected,
          link_salesperson_id: linkSalesperson === 'none' ? null : linkSalesperson,
        },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Permissões atualizadas'); onClose(); onSaved(); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const footer = (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancelar</Button>
      <Button onClick={() => save.mutate()} disabled={save.isPending} className="w-full sm:w-auto">
        {save.isPending ? 'Salvando...' : 'Salvar permissões'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={!!user} onOpenChange={(o) => !o && onClose()} title="Editar permissões" description="Organize as telas e ações disponíveis para este usuário." footer={footer} className="sm:max-w-5xl" drawerClassName="max-h-[92dvh]">
      <div className="grid min-h-0 gap-0 lg:grid-cols-[minmax(16rem,19rem)_minmax(0,1fr)] lg:divide-x lg:divide-border">
        <div className="space-y-5 py-2 lg:sticky lg:top-0 lg:self-start lg:pr-6">
          <h3 className="text-sm font-semibold">Dados do usuário</h3>
          <dl className="space-y-4 text-sm">
            <div><dt className="text-muted-foreground">Nome</dt><dd className="mt-1 break-words font-medium">{user?.full_name || "Não informado"}</dd></div>
            <div><dt className="text-muted-foreground">Email</dt><dd className="mt-1 break-all font-medium">{user?.email}</dd></div>
          </dl>
        <div className="space-y-1.5">
          <Label>Vincular a vendedor</Label>
          <Select value={linkSalesperson} onValueChange={handleSalespersonLink}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Nenhum —</SelectItem>
              {availableSps.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        </div>
        <div className="mt-5 min-w-0 space-y-4 border-t pt-5 lg:mt-0 lg:border-t-0 lg:py-2 lg:pl-6">
          <h3 className="text-sm font-semibold">Permissões de acesso</h3>
          <PermissionsPicker selected={selected} onChange={setSelected} />
        </div>
      </div>
    </ResponsiveModal>
  );
}

// ============== Reset password modal ==============
function ResetPasswordModal({ user, onClose }: { user: AdminUser | null; onClose: () => void }) {
  const [password, setPassword] = useState('');
  useEffect(() => { if (user) setPassword(''); }, [user]);

  const generatePassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$';
    let s = '';
    for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPassword(s);
  };

  const reset = useMutation({
    mutationFn: async () => {
      if (!user || !password) throw new Error('Senha obrigatória');
      const { error } = await supabase.functions.invoke('manage-admin-users', {
        body: { action: 'reset_password', user_id: user.id, password },
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Senha alterada'); onClose(); },
    onError: (e: any) => toast.error(e?.message || 'Erro'),
  });

  const footer = (
    <div className="flex gap-2">
      <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancelar</Button>
      <Button onClick={() => reset.mutate()} disabled={reset.isPending} className="flex-1">
        {reset.isPending ? 'Salvando...' : 'Salvar'}
      </Button>
    </div>
  );

  return (
    <ResponsiveModal open={!!user} onOpenChange={(o) => !o && onClose()} title="Resetar senha" description={user?.email ?? ''} footer={footer}>
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Nova senha</Label>
          <div className="flex gap-2">
            <Input value={password} onChange={(e) => setPassword(e.target.value)} />
            <Button type="button" variant="outline" onClick={generatePassword}>Gerar</Button>
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

// ============== Permission picker ==============
function PermissionsPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  return <AdminPermissionsEditor value={selected} onChange={onChange} />;
}
