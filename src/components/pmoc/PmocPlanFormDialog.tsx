import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { usePmocPlans, type PmocPlan, type PmocPlanInput } from '@/hooks/usePmocPlans';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { usePmocContracts } from '@/hooks/usePmocContracts';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface PmocPlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: PmocPlan | null;
}

const FREQUENCIES = [
  { value: 1, label: 'Mensal' },
  { value: 2, label: 'Bimestral' },
  { value: 3, label: 'Trimestral' },
  { value: 6, label: 'Semestral' },
  { value: 12, label: 'Anual' },
];

export function PmocPlanFormDialog({ open, onOpenChange, plan }: PmocPlanFormDialogProps) {
  const { createPlan, updatePlan } = usePmocPlans();
  const { customers } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { serviceTypes } = useServiceTypes();
  const { templates } = useFormTemplates();
  const { contracts } = usePmocContracts();
  const isEditing = !!plan;

  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [frequencyMonths, setFrequencyMonths] = useState(1);
  const [nextDate, setNextDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [status, setStatus] = useState('ativo');
  const [technicianId, setTechnicianId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [contractId, setContractId] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);

  const { equipment } = useEquipment(customerId || undefined);

  useEffect(() => {
    if (plan) {
      setCustomerId(plan.customer_id);
      setName(plan.name);
      setFrequencyMonths(plan.frequency_months);
      setNextDate(plan.next_generation_date);
      setStatus(plan.status);
      setTechnicianId(plan.technician_id || '');
      setServiceTypeId(plan.service_type_id || '');
      setFormTemplateId(plan.form_template_id || '');
      setContractId(plan.contract_id || '');
      setNotes(plan.notes || '');
      setSelectedEquipmentIds(plan.pmoc_items?.map(i => i.equipment_id) || []);
    } else {
      setCustomerId('');
      setName('');
      setFrequencyMonths(1);
      setNextDate(format(new Date(), 'yyyy-MM-dd'));
      setStatus('ativo');
      setTechnicianId('');
      setServiceTypeId('');
      setFormTemplateId('');
      setContractId('');
      setNotes('');
      setSelectedEquipmentIds([]);
    }
  }, [plan, open]);

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  const customerContracts = useMemo(() =>
    contracts.filter(c => c.customer_id === customerId),
    [contracts, customerId]
  );

  const toggleEquipment = (eqId: string) => {
    setSelectedEquipmentIds(prev =>
      prev.includes(eqId) ? prev.filter(id => id !== eqId) : [...prev, eqId]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: PmocPlanInput = {
      customer_id: customerId,
      name,
      frequency_months: frequencyMonths,
      next_generation_date: nextDate,
      status,
      technician_id: technicianId || null,
      service_type_id: serviceTypeId || null,
      form_template_id: formTemplateId || null,
      contract_id: contractId || null,
      notes: notes || null,
      equipment_ids: selectedEquipmentIds,
    };

    if (isEditing && plan) {
      await updatePlan.mutateAsync({ id: plan.id, ...input });
    } else {
      await createPlan.mutateAsync(input);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Plano PMOC' : 'Novo Plano PMOC'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Nome do Plano *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: PMOC Mensal - Empresa X" required />
            </div>

            <div className="space-y-2">
              <Label>Cliente *</Label>
              <SearchableSelect
                options={customerOptions}
                value={customerId}
                onValueChange={(v) => { setCustomerId(v); setSelectedEquipmentIds([]); setContractId(''); }}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
              />
            </div>

            <div className="space-y-2">
              <Label>Frequência *</Label>
              <Select value={String(frequencyMonths)} onValueChange={v => setFrequencyMonths(Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FREQUENCIES.map(f => (
                    <SelectItem key={f.value} value={String(f.value)}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Próxima Geração *</Label>
              <Input type="date" value={nextDate} onChange={e => setNextDate(e.target.value)} required />
            </div>

            <div className="space-y-2">
              <Label>Técnico Padrão</Label>
              <Select value={technicianId || 'none'} onValueChange={v => setTechnicianId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {technicians?.map(t => (
                    <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Tipo de Serviço</Label>
              <Select value={serviceTypeId || 'none'} onValueChange={v => setServiceTypeId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {serviceTypes.filter(t => t.is_active).map(st => (
                    <SelectItem key={st.id} value={st.id}>{st.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Questionário Padrão</Label>
              <Select value={formTemplateId || 'none'} onValueChange={v => setFormTemplateId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {templates.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {customerContracts.length > 0 && (
              <div className="space-y-2">
                <Label>Contrato Vinculado</Label>
                <Select value={contractId || 'none'} onValueChange={v => setContractId(v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {customerContracts.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.contract_number || `Contrato ${c.id.slice(0, 8)}`}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Equipment selection */}
          {customerId && (
            <div className="space-y-2">
              <Label>Equipamentos do Plano</Label>
              {equipment.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum equipamento cadastrado para este cliente.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto">
                  {equipment.filter(eq => eq.status === 'active').map(eq => (
                    <label
                      key={eq.id}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors hover:bg-muted/50",
                        selectedEquipmentIds.includes(eq.id) && "border-primary bg-primary/5"
                      )}
                    >
                      <Checkbox
                        checked={selectedEquipmentIds.includes(eq.id)}
                        onCheckedChange={() => toggleEquipment(eq.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{eq.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {[eq.brand, eq.model].filter(Boolean).join(' - ') || 'Sem detalhes'}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <Switch
              checked={status === 'ativo'}
              onCheckedChange={checked => setStatus(checked ? 'ativo' : 'pausado')}
            />
            <Label>Plano Ativo</Label>
          </div>

          <div className="space-y-2">
            <Label>Observações</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre o plano..." rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={createPlan.isPending || updatePlan.isPending || !customerId || !name}>
              {createPlan.isPending || updatePlan.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
