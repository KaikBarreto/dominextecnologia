import { useEffect, useState } from 'react';
import { z } from 'zod';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useSaveSalesperson, type Salesperson } from '@/hooks/useSalespersonData';
import { toast } from 'sonner';

const schema = z.object({
  name: z.string().trim().min(2, 'Nome obrigatório').max(120),
  email: z.string().trim().email('Email inválido').max(200).optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional().or(z.literal('')),
  salary: z.number().min(0).default(0),
  monthly_goal: z.number().int().min(0).default(30),
  is_active: z.boolean().default(true),
  no_commission: z.boolean().default(false),
  notes: z.string().max(1000).optional().or(z.literal('')),
});

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  salesperson?: Salesperson | null;
}

export function SalespersonFormDialog({ open, onOpenChange, salesperson }: Props) {
  const save = useSaveSalesperson();
  const [form, setForm] = useState({
    name: '', email: '', phone: '', salary: 0, monthly_goal: 30,
    is_active: true, no_commission: false, notes: '',
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: salesperson?.name || '',
        email: salesperson?.email || '',
        phone: salesperson?.phone || '',
        salary: Number(salesperson?.salary || 0),
        monthly_goal: Number(salesperson?.monthly_goal || 30),
        is_active: salesperson?.is_active ?? true,
        no_commission: salesperson?.no_commission ?? false,
        notes: salesperson?.notes || '',
      });
    }
  }, [open, salesperson]);

  const handleSubmit = async () => {
    const parsed = schema.safeParse(form);
    if (!parsed.success) { toast.error(parsed.error.errors[0].message); return; }
    await save.mutateAsync({
      id: salesperson?.id,
      ...parsed.data,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      notes: parsed.data.notes || null,
    } as any);
    onOpenChange(false);
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={salesperson ? 'Editar vendedor' : 'Novo vendedor'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={save.isPending}>{save.isPending ? 'Salvando...' : 'Salvar'}</Button>
        </div>
      }
    >
      <div className="space-y-4 py-2">
        <div>
          <Label>Nome *</Label>
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Salário (R$)</Label>
            <Input type="number" step="0.01" value={form.salary} onChange={(e) => setForm({ ...form, salary: Number(e.target.value) })} />
          </div>
          <div>
            <Label>Meta mensal (vendas)</Label>
            <Input type="number" value={form.monthly_goal} onChange={(e) => setForm({ ...form, monthly_goal: Number(e.target.value) })} />
          </div>
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Ativo</p>
            <p className="text-xs text-muted-foreground">Vendedor pode receber novas vendas</p>
          </div>
          <Switch checked={form.is_active} onCheckedChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <p className="text-sm font-medium">Sem comissão</p>
            <p className="text-xs text-muted-foreground">Não calcular comissão automaticamente</p>
          </div>
          <Switch checked={form.no_commission} onCheckedChange={(v) => setForm({ ...form, no_commission: v })} />
        </div>
        <div>
          <Label>Observações</Label>
          <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {salesperson?.referral_code && (
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            <span className="text-muted-foreground">Código de afiliado: </span>
            <span className="font-mono font-semibold text-primary">{salesperson.referral_code}</span>
          </div>
        )}
      </div>
    </ResponsiveModal>
  );
}
