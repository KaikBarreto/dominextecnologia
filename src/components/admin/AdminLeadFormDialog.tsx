import { useState, useEffect } from 'react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminLeads, useAdminCrmStages, ADMIN_LEAD_SOURCES, type AdminLead } from '@/hooks/useAdminCrm';
import { useAuth } from '@/contexts/AuthContext';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLead?: AdminLead | null;
}

export function AdminLeadFormDialog({ open, onOpenChange, editingLead }: Props) {
  const { createLead, updateLead } = useAdminLeads();
  const { stages } = useAdminCrmStages();
  const { user } = useAuth();
  const isEditing = !!editingLead;

  const [form, setForm] = useState({
    title: '',
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    value: '',
    source: '',
    stage_id: '',
    expected_close_date: '',
    notes: '',
  });

  useEffect(() => {
    if (editingLead) {
      setForm({
        title: editingLead.title || '',
        company_name: editingLead.company_name || '',
        contact_name: editingLead.contact_name || '',
        email: editingLead.email || '',
        phone: editingLead.phone || '',
        value: editingLead.value ? String(editingLead.value) : '',
        source: editingLead.source || '',
        stage_id: editingLead.stage_id || '',
        expected_close_date: editingLead.expected_close_date || '',
        notes: editingLead.notes || '',
      });
    } else {
      const firstStage = stages.find(s => !s.is_won && !s.is_lost);
      setForm({
        title: '', company_name: '', contact_name: '', email: '', phone: '',
        value: '', source: '', stage_id: firstStage?.id || '', expected_close_date: '', notes: '',
      });
    }
  }, [editingLead, open, stages]);

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    const payload: any = {
      title: form.title.trim(),
      company_name: form.company_name || null,
      contact_name: form.contact_name || null,
      email: form.email || null,
      phone: form.phone || null,
      value: form.value ? Number(form.value) : 0,
      source: form.source || null,
      stage_id: form.stage_id || null,
      expected_close_date: form.expected_close_date || null,
      notes: form.notes || null,
    };
    if (isEditing) {
      updateLead.mutate({ id: editingLead!.id, ...payload });
    } else {
      payload.created_by = user?.id;
      createLead.mutate(payload);
    }
    onOpenChange(false);
  };

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={isEditing ? 'Editar Lead' : 'Novo Lead'}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Título *</Label>
            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Nome da negociação" />
          </div>
          <div>
            <Label>Empresa</Label>
            <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div>
            <Label>Contato</Label>
            <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} />
          </div>
          <div>
            <Label>E-mail</Label>
            <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Telefone</Label>
            <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Valor (R$)</Label>
            <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} />
          </div>
          <div>
            <Label>Origem</Label>
            <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {ADMIN_LEAD_SOURCES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Etapa</Label>
            <Select value={form.stage_id} onValueChange={v => setForm(f => ({ ...f, stage_id: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                      {s.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Previsão de Fechamento</Label>
            <Input type="date" value={form.expected_close_date} onChange={e => setForm(f => ({ ...f, expected_close_date: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!form.title.trim()}>{isEditing ? 'Salvar' : 'Criar Lead'}</Button>
        </div>
      </div>
    </ResponsiveModal>
  );
}
