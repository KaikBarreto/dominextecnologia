import { useState, useEffect } from 'react';
import * as LucideIcons from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminLeads, useAdminCrmStages, type AdminLead } from '@/hooks/useAdminCrm';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useAuth } from '@/contexts/AuthContext';
import { phoneMask } from '@/utils/masks';

function OriginIcon({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-3.5 w-3.5'} />;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingLead?: AdminLead | null;
}

export function AdminLeadFormDialog({ open, onOpenChange, editingLead }: Props) {
  const { createLead, updateLead } = useAdminLeads();
  const { stages } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();
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

  const [emailError, setEmailError] = useState('');

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
    setEmailError('');
  }, [editingLead, open, stages]);

  const validateEmail = (email: string) => {
    if (!email) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  };

  const handleSubmit = () => {
    if (!form.title.trim()) return;
    if (form.email && !validateEmail(form.email)) {
      setEmailError('E-mail inválido');
      return;
    }
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

  const selectedOrigin = origins.find(o => o.name === form.source);

  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title={isEditing ? 'Editar Lead' : 'Novo Lead'}>
      <div className="space-y-5">
        {/* Seção Principal */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Informações Principais</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <Label>Título da Negociação *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Ex: Proposta Climatização Escritório" />
            </div>
            <div>
              <Label>Telefone</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: phoneMask(e.target.value) }))}
                placeholder="(00) 00000-0000"
              />
            </div>
            <div>
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={e => { setForm(f => ({ ...f, email: e.target.value })); setEmailError(''); }}
                placeholder="contato@empresa.com"
                className={emailError ? 'border-destructive' : ''}
              />
              {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
            </div>
            <div className="sm:col-span-2">
              <Label>Origem</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger
                  className={selectedOrigin ? 'text-white font-medium border-transparent' : ''}
                  style={selectedOrigin ? { backgroundColor: selectedOrigin.color || '#6B7280' } : undefined}
                >
                  {selectedOrigin ? (
                    <div className="flex items-center gap-2">
                      <OriginIcon name={selectedOrigin.icon || 'Globe'} className="h-3.5 w-3.5 text-white" />
                      <span>{selectedOrigin.name}</span>
                    </div>
                  ) : (
                    <SelectValue placeholder="Selecione a origem" />
                  )}
                </SelectTrigger>
                <SelectContent>
                  {origins.map(o => (
                    <SelectItem
                      key={o.id}
                      value={o.name}
                      className="cursor-pointer rounded-md my-0.5 transition-colors hover:!text-white [&[data-highlighted]]:!text-white"
                      style={{
                        ['--origin-color' as any]: o.color || '#6B7280',
                      }}
                    >
                      <div className="flex items-center gap-2 [div[data-highlighted]>&]:text-white">
                        <div className="h-4 w-4 rounded flex items-center justify-center shrink-0 transition-colors" style={{ backgroundColor: o.color || '#6B7280' }}>
                          <OriginIcon name={o.icon || 'Globe'} className="h-2.5 w-2.5 text-white" />
                        </div>
                        <span>{o.name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <Separator />

        {/* Seção Detalhes */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-3">Detalhes da Negociação</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Empresa</Label>
              <Input value={form.company_name} onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))} placeholder="Nome da empresa" />
            </div>
            <div>
              <Label>Contato</Label>
              <Input value={form.contact_name} onChange={e => setForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Nome do contato" />
            </div>
            <div>
              <Label>Valor (R$)</Label>
              <Input type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="0,00" />
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
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Anotações sobre a negociação..." />
            </div>
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
