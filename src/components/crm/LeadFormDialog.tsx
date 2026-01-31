import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLeads, type Lead, type LeadInsert, type LeadStatus, LEAD_SOURCES } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';

interface LeadFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead?: Lead | null;
}

const STATUSES: { value: LeadStatus; label: string }[] = [
  { value: 'lead', label: 'Lead' },
  { value: 'proposta', label: 'Proposta' },
  { value: 'negociacao', label: 'Negociação' },
  { value: 'fechado_ganho', label: 'Fechado (Ganho)' },
  { value: 'fechado_perdido', label: 'Fechado (Perdido)' },
];

export function LeadFormDialog({ open, onOpenChange, lead }: LeadFormDialogProps) {
  const { createLead, updateLead } = useLeads();
  const { customers } = useCustomers();
  const { users } = useUsers();
  const isEditing = !!lead;

  const [formData, setFormData] = useState<Partial<LeadInsert>>({
    title: '',
    customer_id: null,
    value: 0,
    probability: 50,
    source: '',
    status: 'lead',
    expected_close_date: null,
    assigned_to: null,
    notes: '',
  });

  useEffect(() => {
    if (lead) {
      setFormData({
        title: lead.title,
        customer_id: lead.customer_id,
        value: lead.value || 0,
        probability: lead.probability || 50,
        source: lead.source || '',
        status: lead.status,
        expected_close_date: lead.expected_close_date,
        assigned_to: lead.assigned_to,
        notes: lead.notes || '',
      });
    } else {
      setFormData({
        title: '',
        customer_id: null,
        value: 0,
        probability: 50,
        source: '',
        status: 'lead',
        expected_close_date: null,
        assigned_to: null,
        notes: '',
      });
    }
  }, [lead, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isEditing && lead) {
      await updateLead.mutateAsync({ id: lead.id, ...formData });
    } else {
      await createLead.mutateAsync(formData as LeadInsert);
    }
    
    onOpenChange(false);
  };

  const handleChange = (field: keyof LeadInsert, value: string | number | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {isEditing ? 'Editar Oportunidade' : 'Nova Oportunidade'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="title">Título da Oportunidade *</Label>
            <Input
              id="title"
              value={formData.title}
              onChange={(e) => handleChange('title', e.target.value)}
              placeholder="Ex: Instalação de 3 splits"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="customer_id">Cliente</Label>
              <Select
                value={formData.customer_id || 'none'}
                onValueChange={(value) => handleChange('customer_id', value === 'none' ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um cliente (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum cliente</SelectItem>
                  {customers.map(customer => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="assigned_to">Vendedor Responsável</Label>
              <Select
                value={formData.assigned_to || 'none'}
                onValueChange={(value) => handleChange('assigned_to', value === 'none' ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Atribuir a vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não atribuído</SelectItem>
                  {users.map(user => (
                    <SelectItem key={user.user_id} value={user.user_id}>
                      {user.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="source">Origem</Label>
              <Select
                value={formData.source || 'none'}
                onValueChange={(value) => handleChange('source', value === 'none' ? '' : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="De onde veio?" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Não informado</SelectItem>
                  {LEAD_SOURCES.map(src => (
                    <SelectItem key={src} value={src}>{src}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status || 'lead'}
                onValueChange={(value) => handleChange('status', value)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="value">Valor Estimado (R$)</Label>
              <Input
                id="value"
                type="number"
                min="0"
                step="0.01"
                value={formData.value || 0}
                onChange={(e) => handleChange('value', parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="probability">Probabilidade (%)</Label>
              <Input
                id="probability"
                type="number"
                min="0"
                max="100"
                value={formData.probability || 50}
                onChange={(e) => handleChange('probability', parseInt(e.target.value) || 50)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="expected_close_date">Previsão Fechamento</Label>
              <Input
                id="expected_close_date"
                type="date"
                value={formData.expected_close_date || ''}
                onChange={(e) => handleChange('expected_close_date', e.target.value || null)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={formData.notes || ''}
              onChange={(e) => handleChange('notes', e.target.value)}
              placeholder="Detalhes da oportunidade..."
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={createLead.isPending || updateLead.isPending}
            >
              {createLead.isPending || updateLead.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
