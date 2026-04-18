import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useSaveSalesperson, type Salesperson } from '@/hooks/useSalespersonData';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSalesperson?: Salesperson | null;
}

export function SalespersonFormDialog({ open, onOpenChange, editingSalesperson }: Props) {
  const saveMutation = useSaveSalesperson();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    salary: 0,
    monthly_goal: 30,
    is_active: true,
    no_commission: false,
    notes: '',
    user_id: 'none' as string,
  });

  // Buscar usuários admin disponíveis (super_admin ou com admin_permissions) que não estão vinculados a outro vendedor
  const { data: availableUsers = [] } = useQuery({
    queryKey: ['admin-users-for-link', editingSalesperson?.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('manage-admin-users', { body: { action: 'list' } });
      if (error) return [];
      const users = (data?.users ?? []) as { id: string; email: string; full_name: string | null; salesperson: { id: string } | null }[];
      return users.filter((u) => !u.salesperson || u.salesperson.id === editingSalesperson?.id);
    },
  });

  useEffect(() => {
    if (editingSalesperson) {
      setFormData({
        name: editingSalesperson.name,
        email: editingSalesperson.email || '',
        phone: editingSalesperson.phone || '',
        salary: Number(editingSalesperson.salary) || 0,
        monthly_goal: editingSalesperson.monthly_goal || 30,
        is_active: editingSalesperson.is_active ?? true,
        no_commission: editingSalesperson.no_commission ?? false,
        notes: editingSalesperson.notes || '',
        user_id: (editingSalesperson as any).user_id || 'none',
      });
    } else {
      setFormData({ name: '', email: '', phone: '', salary: 0, monthly_goal: 30, is_active: true, no_commission: false, notes: '', user_id: 'none' });
    }
  }, [editingSalesperson, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    try {
      await saveMutation.mutateAsync({
        id: editingSalesperson?.id,
        name: formData.name.trim(),
        email: formData.email.trim() || null,
        phone: formData.phone.trim() || null,
        salary: formData.salary,
        monthly_goal: formData.monthly_goal,
        is_active: formData.is_active,
        no_commission: formData.no_commission,
        notes: formData.notes.trim() || null,
        user_id: formData.user_id === 'none' ? null : formData.user_id,
      } as any);
      onOpenChange(false);
    } catch (e: any) {
      if (e?.code === '23505') toast.error('Já existe um vendedor com este email ou usuário vinculado');
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={editingSalesperson ? 'Editar Vendedor' : 'Novo Vendedor'}
      description="Preencha as informações do vendedor"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="sp-name">Nome*</Label>
            <Input id="sp-name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-email">Email</Label>
            <Input id="sp-email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-phone">Telefone</Label>
            <Input id="sp-phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-salary">Salário Fixo (R$)</Label>
            <Input id="sp-salary" type="number" step="0.01" min="0" value={formData.salary} onChange={(e) => setFormData({ ...formData, salary: parseFloat(e.target.value) || 0 })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sp-goal">Meta Mensal (vendas)</Label>
            <Input id="sp-goal" type="number" min="0" value={formData.monthly_goal} onChange={(e) => setFormData({ ...formData, monthly_goal: parseInt(e.target.value) || 0 })} />
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label>Vincular a usuário admin (opcional)</Label>
            <Select value={formData.user_id} onValueChange={(v) => setFormData({ ...formData, user_id: v })}>
              <SelectTrigger><SelectValue placeholder="— Nenhum —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Nenhum —</SelectItem>
                {availableUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.full_name || u.email}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Vendedor vinculado vê apenas os próprios dados (a menos que tenha "ver todos os vendedores").</p>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label htmlFor="sp-notes">Observações</Label>
            <Textarea id="sp-notes" rows={3} value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <Label htmlFor="sp-active" className="cursor-pointer">Vendedor Ativo</Label>
            <Switch id="sp-active" checked={formData.is_active} onCheckedChange={(c) => setFormData({ ...formData, is_active: c })} />
          </div>
          <div className="sm:col-span-2 flex items-center justify-between rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="sp-noc" className="cursor-pointer">Sem Comissão</Label>
              <p className="text-xs text-muted-foreground">Vendas atribuídas a este vendedor não geram comissão</p>
            </div>
            <Switch id="sp-noc" checked={formData.no_commission} onCheckedChange={(c) => setFormData({ ...formData, no_commission: c })} />
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} className="flex-1">Cancelar</Button>
          <Button type="submit" disabled={saveMutation.isPending} className="flex-1">
            {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </form>
    </ResponsiveModal>
  );
}
