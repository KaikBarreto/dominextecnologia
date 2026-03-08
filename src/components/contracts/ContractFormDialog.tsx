import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Progress } from '@/components/ui/progress';
import { useContracts, generateOccurrences, getFrequencyLabel } from '@/hooks/useContracts';
import { useCustomers } from '@/hooks/useCustomers';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Check, Search, Plus, CalendarCheck, AlertTriangle } from 'lucide-react';

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (contractId: string) => void;
}

const STEPS = [
  { key: 'info', label: 'Informações' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'items', label: 'Itens' },
  { key: 'review', label: 'Revisão' },
];

const QUICK_MONTHS = [
  { label: 'Mensal', value: 1 },
  { label: 'Bimestral', value: 2 },
  { label: 'Trimestral', value: 3 },
  { label: 'Semestral', value: 6 },
  { label: 'Anual', value: 12 },
];

const QUICK_DAYS = [
  { label: 'Semanal', value: 7 },
  { label: 'Quinzenal', value: 15 },
  { label: '30 dias', value: 30 },
  { label: '45 dias', value: 45 },
  { label: '60 dias', value: 60 },
  { label: '90 dias', value: 90 },
];

export function ContractFormDialog({ open, onOpenChange, onCreated }: ContractFormDialogProps) {
  const { createContract } = useContracts();
  const { customers } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { teams } = useTeams();
  const { serviceTypes } = useServiceTypes();
  const { templates } = useFormTemplates();
  const { toast } = useToast();

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [technicianId, setTechnicianId] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');
  const [formTemplateId, setFormTemplateId] = useState('');
  const [notes, setNotes] = useState('');
  const [isActive, setIsActive] = useState(true);

  // Step 2
  const [freqType, setFreqType] = useState<'months' | 'days'>('months');
  const [freqValue, setFreqValue] = useState(1);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [horizonMonths, setHorizonMonths] = useState(12);

  // Step 3
  const [selectedItems, setSelectedItems] = useState<{ equipment_id?: string; item_name: string; item_description?: string; form_template_id?: string }[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [showManualItem, setShowManualItem] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualDesc, setManualDesc] = useState('');

  const { equipment } = useEquipment(customerId || undefined);
  const activeEquipment = equipment.filter(eq => eq.status === 'active');

  useEffect(() => {
    if (!open) {
      setStep(0);
      setName(''); setCustomerId(''); setTechnicianId(''); setServiceTypeId('');
      setFormTemplateId(''); setNotes(''); setIsActive(true);
      setFreqType('months'); setFreqValue(1); setStartDate(format(new Date(), 'yyyy-MM-dd')); setHorizonMonths(12);
      setSelectedItems([]); setItemSearch(''); setShowManualItem(false); setManualName(''); setManualDesc('');
    }
  }, [open]);

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  const occurrences = useMemo(() =>
    generateOccurrences(new Date(startDate + 'T00:00:00'), freqType, freqValue, horizonMonths),
    [startDate, freqType, freqValue, horizonMonths]
  );

  const weekendDates = occurrences.filter(d => d.getDay() === 0 || d.getDay() === 6);

  const filteredEquipment = activeEquipment.filter(eq =>
    eq.name.toLowerCase().includes(itemSearch.toLowerCase()) ||
    eq.brand?.toLowerCase().includes(itemSearch.toLowerCase()) ||
    eq.model?.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const isEquipmentSelected = (eqId: string) => selectedItems.some(i => i.equipment_id === eqId);

  const toggleEquipment = (eq: typeof activeEquipment[0]) => {
    if (isEquipmentSelected(eq.id)) {
      setSelectedItems(prev => prev.filter(i => i.equipment_id !== eq.id));
    } else {
      setSelectedItems(prev => [...prev, {
        equipment_id: eq.id,
        item_name: eq.name,
        item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined,
      }]);
    }
  };

  const addManualItem = () => {
    if (!manualName.trim()) return;
    setSelectedItems(prev => [...prev, { item_name: manualName.trim(), item_description: manualDesc.trim() || undefined }]);
    setManualName('');
    setManualDesc('');
    setShowManualItem(false);
  };

  const canNext = () => {
    if (step === 0) return !!customerId && !!name;
    if (step === 1) return freqValue > 0 && !!startDate;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const result = await createContract.mutateAsync({
        name,
        customer_id: customerId,
        technician_id: technicianId || null,
        service_type_id: serviceTypeId || null,
        form_template_id: formTemplateId || null,
        status: isActive ? 'active' : 'paused',
        notes: notes || null,
        frequency_type: freqType,
        frequency_value: freqValue,
        start_date: startDate,
        horizon_months: horizonMonths,
        items: selectedItems.map(i => ({
          equipment_id: i.equipment_id || null,
          item_name: i.item_name,
          item_description: i.item_description || null,
          form_template_id: i.form_template_id || null,
        })),
      });

      toast({
        title: `✅ Contrato criado com ${occurrences.length} OSs geradas na agenda`,
      });
      onOpenChange(false);
      if (onCreated && result) onCreated((result as any).id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;
  const clientName = customers.find(c => c.id === customerId)?.name || '-';

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[700px] overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>Novo Contrato</SheetTitle>
        </SheetHeader>

        {/* Stepper */}
        <div className="space-y-3 mt-2">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="flex items-center gap-1">
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
                <span className={cn('text-xs hidden sm:inline truncate', i === step ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 mt-4 space-y-4">
          {/* STEP 1: Info */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Contrato *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Manutenção Preventiva Mensal — Empresa X" />
                <p className="text-xs text-muted-foreground">Dê um nome claro que identifique este contrato</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cliente *</Label>
                  <SearchableSelect
                    options={customerOptions}
                    value={customerId}
                    onValueChange={v => { setCustomerId(v); setSelectedItems([]); }}
                    placeholder="Selecione o cliente"
                    searchPlaceholder="Buscar cliente..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Técnico / Equipe Responsável</Label>
                  <Select value={technicianId || 'none'} onValueChange={v => setTechnicianId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Nenhum (define na OS)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {(technicians?.length ?? 0) > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Técnicos</div>
                          {technicians?.map(t => (
                            <SelectItem key={t.user_id} value={t.user_id}>{t.full_name}</SelectItem>
                          ))}
                        </>
                      )}
                      {teams.filter(t => t.is_active).length > 0 && (
                        <>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Equipes</div>
                          {teams.filter(t => t.is_active).map(t => (
                            <SelectItem key={`team-${t.id}`} value={`team:${t.id}`}>
                              <div className="flex items-center gap-2">
                                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                                {t.name}
                              </div>
                            </SelectItem>
                          ))}
                        </>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Tipo de Serviço</Label>
                  <Select value={serviceTypeId || 'none'} onValueChange={v => setServiceTypeId(v === 'none' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
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
                    <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Nenhum</SelectItem>
                      {templates.filter(t => t.is_active).map(t => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Pode ser sobrescrito por item</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Observações (opcional)</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Instruções gerais, condições do contrato..." rows={3} />
              </div>
              <div className="flex items-center gap-3 pt-1">
                <Switch checked={isActive} onCheckedChange={setIsActive} />
                <div>
                  <Label>Contrato Ativo</Label>
                  <p className="text-xs text-muted-foreground">OSs só serão geradas para contratos ativos</p>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Frequency */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Tipo de Frequência</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => { setFreqType('months'); setFreqValue(1); }}
                    className={cn(
                      'rounded-lg border-2 p-3 text-sm font-medium transition-colors',
                      freqType === 'months' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    A cada X meses
                  </button>
                  <button
                    onClick={() => { setFreqType('days'); setFreqValue(7); }}
                    className={cn(
                      'rounded-lg border-2 p-3 text-sm font-medium transition-colors',
                      freqType === 'days' ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                    )}
                  >
                    A cada X dias
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Atalhos rápidos</Label>
                <div className="flex gap-2 flex-wrap">
                  {(freqType === 'months' ? QUICK_MONTHS : QUICK_DAYS).map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setFreqValue(opt.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors',
                        freqValue === opt.value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:border-primary/50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <Label>{freqType === 'months' ? 'Intervalo (meses)' : 'Intervalo (dias)'} *</Label>
                  <Input type="number" min={1} value={freqValue} onChange={e => setFreqValue(Number(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Data de Início *</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Horizonte (meses)</Label>
                  <Input type="number" min={1} max={60} value={horizonMonths} onChange={e => setHorizonMonths(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">= {occurrences.length} ocorrências</p>
                </div>
              </div>

              {occurrences.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Prévia das datas ({occurrences.length})</Label>
                  <div className="rounded-md border max-h-44 overflow-y-auto">
                    {occurrences.slice(0, 30).map((date, i) => {
                      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                      return (
                        <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 text-sm">
                          <span className="text-muted-foreground w-5 text-right font-mono text-xs">{i + 1}</span>
                          <span className="text-foreground">{format(date, 'dd/MM/yyyy', { locale: ptBR })}</span>
                          <span className="text-muted-foreground text-xs">{format(date, 'EEEE', { locale: ptBR })}</span>
                          {isWeekend && <Badge variant="outline" className="text-warning border-warning/30 text-[10px] px-1.5 py-0">Fim de semana</Badge>}
                        </div>
                      );
                    })}
                    {occurrences.length > 30 && (
                      <p className="px-3 py-2 text-xs text-muted-foreground italic">... e mais {occurrences.length - 30} datas</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">OSs serão criadas automaticamente nessas datas</p>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Items */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">Itens do Contrato</Label>
                <Badge variant="secondary">{selectedItems.length} selecionado(s)</Badge>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Selecione os itens que serão atendidos em cada visita. Uma única OS será gerada por data, contendo todos os itens.
              </p>

              {customerId ? (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input placeholder="Buscar equipamentos..." className="pl-10" value={itemSearch} onChange={e => setItemSearch(e.target.value)} />
                  </div>

                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {filteredEquipment.length === 0 && !itemSearch ? (
                      <p className="text-sm text-muted-foreground text-center py-6">Nenhum equipamento ativo para este cliente.</p>
                    ) : filteredEquipment.map(eq => (
                      <div
                        key={eq.id}
                        onClick={() => toggleEquipment(eq)}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-all',
                          isEquipmentSelected(eq.id) ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30 hover:bg-muted/50'
                        )}
                      >
                        <div className={cn(
                          'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all',
                          isEquipmentSelected(eq.id) ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                        )}>
                          {isEquipmentSelected(eq.id) && <Check className="h-3 w-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{eq.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[eq.brand, eq.model].filter(Boolean).join(' - ') || 'Sem detalhes'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setShowManualItem(true)}
                    className="text-sm text-primary hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Adicionar item manualmente
                  </button>

                  {showManualItem && (
                    <div className="grid grid-cols-2 gap-3 p-3 bg-muted/50 rounded-md border">
                      <Input placeholder="Nome do item" value={manualName} onChange={e => setManualName(e.target.value)} />
                      <Input placeholder="Descrição (opcional)" value={manualDesc} onChange={e => setManualDesc(e.target.value)} />
                      <Button variant="outline" size="sm" onClick={addManualItem} className="col-span-2" disabled={!manualName.trim()}>
                        Adicionar
                      </Button>
                    </div>
                  )}

                  {/* Manual items list */}
                  {selectedItems.filter(i => !i.equipment_id).map((item, idx) => (
                    <div key={`manual-${idx}`} className="flex items-center justify-between p-3 rounded-md border border-primary/20 bg-primary/5">
                      <div>
                        <p className="text-sm font-medium">{item.item_name}</p>
                        {item.item_description && <p className="text-xs text-muted-foreground">{item.item_description}</p>}
                      </div>
                      <Button variant="ghost" size="sm" className="text-destructive h-7" onClick={() =>
                        setSelectedItems(prev => prev.filter((_, i) => i !== prev.findIndex(p => p.item_name === item.item_name && !p.equipment_id)))
                      }>×</Button>
                    </div>
                  ))}
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-8">Selecione um cliente na etapa 1 primeiro.</p>
              )}

              {selectedItems.length > 0 && (
                <div className="p-3 bg-primary/5 border border-primary/20 rounded-md">
                  <p className="text-sm font-medium text-primary">
                    {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'itens'} selecionado(s)
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Cada OS gerada conterá todos esses itens para atendimento
                  </p>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg border p-4">
                <div className="grid grid-cols-2 gap-x-8 gap-y-4">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">CONTRATO</p>
                    <p className="font-medium mt-0.5">{name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">CLIENTE</p>
                    <p className="font-medium mt-0.5">{clientName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">FREQUÊNCIA</p>
                    <p className="font-medium mt-0.5">{getFrequencyLabel(freqType, freqValue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">INÍCIO</p>
                    <p className="font-medium mt-0.5">{format(new Date(startDate), 'dd/MM/yyyy')}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">ITENS</p>
                    <p className="font-medium mt-0.5">{selectedItems.length === 0 ? 'Nenhum item vinculado' : `${selectedItems.length} item(ns)`}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase tracking-wider">STATUS</p>
                    <Badge variant={isActive ? 'success' : 'outline'} className="mt-0.5">
                      {isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>

              {isActive && (
                <div className="p-4 bg-primary/5 border border-primary/20 rounded-lg flex items-start gap-3">
                  <CalendarCheck className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-primary">
                      {occurrences.length} OS{occurrences.length !== 1 ? 's' : ''} serão geradas automaticamente
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {occurrences.length} datas nos próximos {horizonMonths} meses
                      {occurrences.length > 0 && ` • Primeira em ${format(occurrences[0], 'dd/MM/yyyy')}`}
                    </p>
                    {selectedItems.length > 0 && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Cada OS incluirá {selectedItems.length} item(ns) para atendimento
                      </p>
                    )}
                  </div>
                </div>
              )}

              {weekendDates.length > 0 && (
                <div className="p-3 bg-warning/5 border border-warning/20 rounded-md flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                  <p className="text-xs text-warning">
                    {weekendDates.length} data(s) caem em fim de semana. Confirme se os atendimentos são realizados nesses dias.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <SheetFooter className="flex-row gap-2 mt-4 pt-4 border-t">
          {step > 0 && (
            <Button type="button" variant="ghost" onClick={() => setStep(s => s - 1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
            </Button>
          )}
          <div className="flex-1" />
          {step < STEPS.length - 1 ? (
            <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext()}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Criando...' : `Criar Contrato e ${occurrences.length} OSs`}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
