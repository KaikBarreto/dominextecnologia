import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { usePmocPlans, type PmocPlan, type PmocPlanInput } from '@/hooks/usePmocPlans';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { usePmocContracts } from '@/hooks/usePmocContracts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import { format, addDays, addMonths as addMonthsFn } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Check } from 'lucide-react';

interface PmocPlanFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  plan?: PmocPlan | null;
}

const FREQUENCY_TYPES = [
  { value: 'days', label: 'A cada X dias' },
  { value: 'months', label: 'A cada X meses' },
];

const QUICK_FREQUENCIES = [
  { label: 'Mensal', months: 1 },
  { label: 'Bimestral', months: 2 },
  { label: 'Trimestral', months: 3 },
  { label: 'Semestral', months: 6 },
  { label: 'Anual', months: 12 },
];

const STEPS = [
  { key: 'info', label: 'Informações' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'equipment', label: 'Equipamentos' },
  { key: 'review', label: 'Revisão' },
];

export function PmocPlanFormDialog({ open, onOpenChange, plan }: PmocPlanFormDialogProps) {
  const { createPlan, updatePlan } = usePmocPlans();
  const { customers } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { serviceTypes } = useServiceTypes();
  const { templates } = useFormTemplates();
  const { contracts } = usePmocContracts();
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = !!plan;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1: Info
  const [customerId, setCustomerId] = useState('');
  const [name, setName] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [contractId, setContractId] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('ativo');

  // Step 2: Frequency
  const [frequencyType, setFrequencyType] = useState<'days' | 'months'>('months');
  const [frequencyValue, setFrequencyValue] = useState(1);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [horizonMonths, setHorizonMonths] = useState(12);

  // Step 3: Equipment
  const [selectedEquipmentIds, setSelectedEquipmentIds] = useState<string[]>([]);

  const { equipment } = useEquipment(customerId || undefined);

  useEffect(() => {
    if (plan) {
      setCustomerId(plan.customer_id);
      setName(plan.name);
      setFrequencyType((plan as any).frequency_type || 'months');
      setFrequencyValue(plan.frequency_months);
      setStartDate(plan.next_generation_date);
      setHorizonMonths((plan as any).generation_horizon_months || 12);
      setStatus(plan.status);
      setTechnicianId(plan.technician_id || '');
      setServiceTypeId(plan.service_type_id || '');
      setFormTemplateId(plan.form_template_id || '');
      setContractId(plan.contract_id || '');
      setNotes(plan.notes || '');
      setSelectedEquipmentIds(plan.pmoc_items?.map(i => i.equipment_id) || []);
      setStep(0);
    } else {
      setCustomerId('');
      setName('');
      setFrequencyType('months');
      setFrequencyValue(1);
      setStartDate(format(new Date(), 'yyyy-MM-dd'));
      setHorizonMonths(12);
      setStatus('ativo');
      setTechnicianId('');
      setServiceTypeId('');
      setFormTemplateId('');
      setContractId('');
      setNotes('');
      setSelectedEquipmentIds([]);
      setStep(0);
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

  // Calculate preview dates for bulk generation
  const previewDates = useMemo(() => {
    const dates: Date[] = [];
    let current = new Date(startDate + 'T00:00:00');
    const end = addMonthsFn(new Date(startDate + 'T00:00:00'), horizonMonths);
    while (current <= end && dates.length < 60) {
      dates.push(new Date(current));
      if (frequencyType === 'days') {
        current = addDays(current, frequencyValue);
      } else {
        current = addMonthsFn(current, frequencyValue);
      }
    }
    return dates;
  }, [startDate, horizonMonths, frequencyType, frequencyValue]);

  const totalOsToGenerate = previewDates.length;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const frequencyMonths = frequencyType === 'months' ? frequencyValue : Math.max(1, Math.round(frequencyValue / 30));
      
      const input: PmocPlanInput = {
        customer_id: customerId,
        name,
        frequency_months: frequencyMonths,
        next_generation_date: startDate,
        status,
        technician_id: technicianId || null,
        service_type_id: serviceTypeId || null,
        form_template_id: formTemplateId || null,
        contract_id: contractId || null,
        notes: notes || null,
        equipment_ids: selectedEquipmentIds,
      };

      let planId: string;

      if (isEditing && plan) {
        await updatePlan.mutateAsync({ id: plan.id, ...input });
        planId = plan.id;
      } else {
        const result = await createPlan.mutateAsync(input);
        planId = (result as any)?.id;
      }

      // Bulk generate OSs if creating (not editing)
      if (!isEditing && planId && status === 'ativo') {
        for (const date of previewDates) {
          const equipNames = selectedEquipmentIds
            .map(id => equipment.find(e => e.id === id)?.name)
            .filter(Boolean);
          const description = `PMOC automático: ${name}${equipNames.length > 0 ? ` - ${equipNames.join(', ')}` : ''}`;

          const { data: os, error: osError } = await supabase
            .from('service_orders')
            .insert({
              customer_id: customerId,
              equipment_id: selectedEquipmentIds.length === 1 ? selectedEquipmentIds[0] : null,
              technician_id: technicianId || null,
              os_type: 'manutencao_preventiva' as const,
              service_type_id: serviceTypeId || null,
              form_template_id: formTemplateId || null,
              scheduled_date: format(date, 'yyyy-MM-dd'),
              description,
              require_tech_signature: true,
              status: 'pendente' as const,
            })
            .select('id')
            .single();

          if (osError) {
            console.error('Error creating OS:', osError);
            continue;
          }

          // Link all equipment via service_order_equipment junction table
          if (selectedEquipmentIds.length > 0) {
            const eqLinks = selectedEquipmentIds.map(eqId => ({
              service_order_id: os.id,
              equipment_id: eqId,
              form_template_id: formTemplateId || null,
            }));
            const { error: linkError } = await supabase
              .from('service_order_equipment')
              .insert(eqLinks);
            if (linkError) console.error('Error linking equipment:', linkError);
          }

          await supabase.from('pmoc_generated_os').insert({
            plan_id: planId,
            service_order_id: os.id,
            scheduled_for: format(date, 'yyyy-MM-dd'),
          });
        }

        queryClient.invalidateQueries({ queryKey: ['pmoc-plans'] });
        queryClient.invalidateQueries({ queryKey: ['service-orders'] });
        toast({ title: `${totalOsToGenerate} OSs geradas com sucesso!` });
      }

      onOpenChange(false);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const canNext = () => {
    if (step === 0) return !!customerId && !!name;
    if (step === 1) return frequencyValue > 0 && !!startDate;
    if (step === 2) return true;
    return true;
  };

  const activeEquipment = equipment.filter(eq => eq.status === 'active');
  const quickFreqLabel = frequencyType === 'months' 
    ? QUICK_FREQUENCIES.find(f => f.months === frequencyValue)?.label 
    : `A cada ${frequencyValue} dias`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Editar Plano PMOC' : 'Novo Plano PMOC'}</DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1 flex-1">
              <button
                onClick={() => i <= step && setStep(i)}
                className={cn(
                  'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                  i < step ? 'bg-primary text-primary-foreground' :
                  i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                  'bg-muted text-muted-foreground'
                )}
              >
                {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </button>
              <span className={cn('text-xs hidden sm:inline', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
            </div>
          ))}
        </div>

        {/* Step 1: Info */}
        {step === 0 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome do Plano *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: PMOC Mensal - Empresa X" required />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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

            <div className="flex items-center gap-3">
              <Switch checked={status === 'ativo'} onCheckedChange={checked => setStatus(checked ? 'ativo' : 'pausado')} />
              <Label>Plano Ativo</Label>
            </div>

            <div className="space-y-2">
              <Label>Observações</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Observações sobre o plano..." rows={2} />
            </div>
          </div>
        )}

        {/* Step 2: Frequency */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Tipo de Frequência</Label>
              <div className="flex gap-2">
                {FREQUENCY_TYPES.map(ft => (
                  <button
                    key={ft.value}
                    onClick={() => { setFrequencyType(ft.value as any); setFrequencyValue(ft.value === 'months' ? 1 : 7); }}
                    className={cn(
                      'flex-1 rounded-lg border-2 p-3 text-sm font-medium transition-colors',
                      frequencyType === ft.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'
                    )}
                  >
                    {ft.label}
                  </button>
                ))}
              </div>
            </div>

            {frequencyType === 'months' && (
              <div className="space-y-2">
                <Label>Atalhos rápidos</Label>
                <div className="flex flex-wrap gap-2">
                  {QUICK_FREQUENCIES.map(f => (
                    <button
                      key={f.months}
                      onClick={() => setFrequencyValue(f.months)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        frequencyValue === f.months ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'
                      )}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>{frequencyType === 'days' ? 'Intervalo em dias *' : 'Intervalo em meses *'}</Label>
                <Input
                  type="number"
                  min={1}
                  value={frequencyValue}
                  onChange={e => setFrequencyValue(Number(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Data de Início *</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Horizonte de Geração (meses)</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={horizonMonths}
                  onChange={e => setHorizonMonths(Number(e.target.value))}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  = {previewDates.length} ocorrências
                </span>
              </div>
            </div>

            {previewDates.length > 0 && (
              <div className="space-y-2">
                <Label>Prévia das datas ({previewDates.length})</Label>
                <div className="max-h-[120px] overflow-y-auto rounded-lg border p-2 space-y-1">
                  {previewDates.slice(0, 20).map((d, i) => (
                    <div key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{i + 1}</span>
                      {format(d, 'dd/MM/yyyy (EEEE)', { locale: ptBR })}
                    </div>
                  ))}
                  {previewDates.length > 20 && (
                    <p className="text-xs text-muted-foreground italic">... e mais {previewDates.length - 20} datas</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Equipment */}
        {step === 2 && (
          <div className="space-y-4">
            {!customerId ? (
              <p className="text-sm text-muted-foreground text-center py-8">Selecione um cliente na etapa 1 primeiro.</p>
            ) : activeEquipment.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-muted-foreground">Nenhum equipamento ativo cadastrado para este cliente.</p>
                <p className="text-xs text-muted-foreground mt-1">As OSs serão geradas sem equipamento vinculado.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <Label>Equipamentos do Plano</Label>
                  <Badge variant="secondary">{selectedEquipmentIds.length} selecionado(s)</Badge>
                </div>
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {activeEquipment.map(eq => (
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
              </>
            )}
          </div>
        )}

        {/* Step 4: Review */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Plano</p>
                  <p className="font-medium">{name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Cliente</p>
                  <p className="font-medium">{customers.find(c => c.id === customerId)?.name || '-'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Frequência</p>
                  <p className="font-medium">{quickFreqLabel || `${frequencyValue} ${frequencyType === 'days' ? 'dias' : 'meses'}`}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Início</p>
                  <p className="font-medium">{format(new Date(startDate), 'dd/MM/yyyy')}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Equipamentos</p>
                  <p className="font-medium">{selectedEquipmentIds.length || 'Nenhum'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p>
                  <Badge variant={status === 'ativo' ? 'success' : 'outline'}>{status === 'ativo' ? 'Ativo' : 'Pausado'}</Badge>
                </div>
              </div>
            </div>

            {!isEditing && status === 'ativo' && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <p className="text-sm font-medium text-primary">
                  🗓️ Serão geradas {totalOsToGenerate} OSs automaticamente
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {previewDates.length} datas × {selectedEquipmentIds.length || 1} equipamento(s) nos próximos {horizonMonths} meses
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="flex-row gap-2">
          {step > 0 && (
            <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || !canNext()}>
              {submitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : `Criar Plano e ${totalOsToGenerate} OSs`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
