import { useState, useEffect, useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Progress } from '@/components/ui/progress';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { useContracts, generateOccurrences, getFrequencyLabel } from '@/hooks/useContracts';
import { useCustomers, CustomerInput } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians, useProfiles } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { getErrorMessage } from '@/utils/errorMessages';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useResponsibleTechnicians } from '@/hooks/useResponsibleTechnicians';
import { PmocQuickCreateRTDialog } from '@/components/pmoc/PmocQuickCreateRTDialog';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Check, Search, Plus, CalendarCheck, AlertTriangle, ShieldCheck, ExternalLink, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ContractFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (contractId: string) => void;
  editContract?: any;
  defaultCustomerId?: string;
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

export function ContractFormDialog({ open, onOpenChange, onCreated, editContract, defaultCustomerId }: ContractFormDialogProps) {
  const { createContract, updateContract } = useContracts();
  const { customers, createCustomer } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { data: allProfiles } = useProfiles();
  const { teams, teamsWithMembers } = useTeams();
  const { serviceTypes } = useServiceTypes();
  const { templates } = useFormTemplates();
  // Lista de RTs ativos do tenant — usada quando o contrato é marcado como PMOC.
  const { technicians: responsibleTechnicians, isLoading: rtLoading } = useResponsibleTechnicians({ activeOnly: true });
  const { toast } = useToast();

  const isEditing = !!editContract;

  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [showQuickCustomer, setShowQuickCustomer] = useState(false);

  // Step 1
  const [name, setName] = useState('');
  const [customerId, setCustomerId] = useState(defaultCustomerId || '');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [billingUserIds, setBillingUserIds] = useState<string[]>([]);
  const [billingTeamIds, setBillingTeamIds] = useState<string[]>([]);
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

  // PMOC (Onda A v1.9.0). Toggle inline na seção Informações; quando true,
  // exige seleção de Responsável Técnico (RT). Desligar pede confirmação se já tinha RT.
  const [isPmoc, setIsPmoc] = useState(false);
  const [responsibleTechnicianId, setResponsibleTechnicianId] = useState<string>('');
  const [showPmocOffConfirm, setShowPmocOffConfirm] = useState(false);
  // Quick-create RT (Onda UI-1.2): botão "+" abre dialog nested.
  const [showQuickCreateRT, setShowQuickCreateRT] = useState(false);
  // Em modo edição, guarda a chamada que ficou esperando confirmação do "desligar PMOC".
  const initialIsPmocRef = useState<{ value: boolean }>({ value: false })[0];

  const { equipment } = useEquipment(customerId || undefined);
  const activeEquipment = equipment.filter(eq => eq.status === 'active');

  useEffect(() => {
    if (!open) {
      setStep(0);
      setItemSearch(''); setShowManualItem(false); setManualName(''); setManualDesc('');
      return;
    }

    if (editContract) {
      setName(editContract.name || '');
      setCustomerId(editContract.customer_id || '');
      // Handle technician or team for multi-select
      const editUserIds: string[] = [];
      const editTeamIds: string[] = [];
      if (editContract.team_id) {
        editTeamIds.push(editContract.team_id);
        // Add team members as selected users
        const team = teamsWithMembers.find(t => t.id === editContract.team_id);
        if (team) {
          team.members.forEach(m => {
            if (!editUserIds.includes(m.user_id)) editUserIds.push(m.user_id);
          });
        }
      }
      if (editContract.technician_id && !editUserIds.includes(editContract.technician_id)) {
        editUserIds.push(editContract.technician_id);
      }
      setSelectedUserIds(editUserIds);
      setSelectedTeamIds(editTeamIds);
      setBillingUserIds(editContract.billing_responsible_ids || []);
      setBillingTeamIds([]);
      setServiceTypeId(editContract.service_type_id || '');
      setFormTemplateId(editContract.form_template_id || '');
      setNotes(editContract.notes || '');
      setIsActive(editContract.status === 'active');
      setFreqType(editContract.frequency_type || 'months');
      setFreqValue(editContract.frequency_value || 1);
      setStartDate(editContract.start_date || format(new Date(), 'yyyy-MM-dd'));
      setHorizonMonths(editContract.horizon_months || 12);
      setSelectedItems(
        (editContract.contract_items || []).map((i: any) => ({
          equipment_id: i.equipment_id || undefined,
          item_name: i.item_name,
          item_description: i.item_description || undefined,
          form_template_id: i.form_template_id || undefined,
        }))
      );
      // PMOC — preserva estado existente quando entra em edição.
      const editIsPmoc = !!editContract.is_pmoc;
      setIsPmoc(editIsPmoc);
      setResponsibleTechnicianId(editContract.responsible_technician_id || '');
      initialIsPmocRef.value = editIsPmoc;
    } else {
      setName(''); setCustomerId(defaultCustomerId || ''); setSelectedUserIds([]); setSelectedTeamIds([]);
      setBillingUserIds([]); setBillingTeamIds([]); setServiceTypeId('');
      setFormTemplateId(''); setNotes(''); setIsActive(true);
      setFreqType('months'); setFreqValue(1); setStartDate(format(new Date(), 'yyyy-MM-dd')); setHorizonMonths(12);
      setSelectedItems([]);
      // Default: contrato comum.
      setIsPmoc(false);
      setResponsibleTechnicianId('');
      initialIsPmocRef.value = false;
    }
  }, [open, editContract]);

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
    if (step === 0) {
      // PMOC sem RT é permitido (warning toast no submit). Bloqueio só pra nome + cliente.
      return !!customerId && !!name;
    }
    if (step === 1) return freqValue > 0 && !!startDate;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const actualTeamId = selectedTeamIds.length > 0 ? selectedTeamIds[0] : null;
      // Only set technician_id when NO team is selected and there are individual users
      const actualTechnicianId = !actualTeamId && selectedUserIds.length > 0 ? selectedUserIds[0] : null;

      // PMOC com RT vazio: permitimos salvar mas avisamos o usuário.
      // RT pode ser definido depois — o que NÃO pode é ficar sem o flag ligado e
      // sem ninguém ciente disso. Toast variant `default` (sistema só tem default
      // e destructive); emoji ⚠️ comunica o tom de warning sem inventar variant nova.
      if (isPmoc && !responsibleTechnicianId) {
        toast({
          title: '⚠️ Sem Responsável Técnico (RT) definido',
          description: 'Recomendamos definir um RT antes de ativar PMOC. Você pode atribuir depois.',
        });
      }

      if (isEditing) {
        await updateContract.mutateAsync({
          id: editContract.id,
          name,
          customer_id: customerId,
          technician_id: actualTechnicianId,
          team_id: actualTeamId,
          service_type_id: serviceTypeId || null,
          form_template_id: formTemplateId || null,
          status: isActive ? 'active' : 'paused',
          notes: notes || null,
          frequency_type: freqType,
          frequency_value: freqValue,
          start_date: startDate,
          horizon_months: horizonMonths,
          billing_responsible_ids: billingUserIds,
          // PMOC (Onda A)
          is_pmoc: isPmoc,
          responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
        });
        onOpenChange(false);
        if (onCreated) onCreated(editContract.id);
      } else {
        const result = await createContract.mutateAsync({
          name,
          customer_id: customerId,
          technician_id: actualTechnicianId,
          team_id: actualTeamId,
          assignee_user_ids: selectedUserIds,
          billing_responsible_ids: billingUserIds,
          service_type_id: serviceTypeId || null,
          form_template_id: formTemplateId || null,
          status: isActive ? 'active' : 'paused',
          notes: notes || null,
          frequency_type: freqType,
          frequency_value: freqValue,
          start_date: startDate,
          horizon_months: horizonMonths,
          // PMOC (Onda A). RT vai vazio quando o usuário ainda não escolheu.
          is_pmoc: isPmoc,
          responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
          items: selectedItems.map(i => ({
            equipment_id: i.equipment_id || null,
            item_name: i.item_name,
            item_description: i.item_description || null,
            form_template_id: i.form_template_id || null,
          })),
        });

        const generatedOsCount = (result as any)?.generatedOsCount ?? 0;
        const expectedOsCount = (result as any)?.expectedOsCount ?? occurrences.length;

        // PMOC e contrato comum agora seguem o mesmo fluxo: geração imediata
        // das N OSs no momento da criação. Toast unificado.
        toast({
          title: isActive
            ? generatedOsCount === expectedOsCount
              ? `✅ Contrato${isPmoc ? ' PMOC' : ''} criado com ${generatedOsCount} OSs geradas na agenda`
              : `⚠️ Contrato${isPmoc ? ' PMOC' : ''} criado com ${generatedOsCount} de ${expectedOsCount} OSs geradas na agenda`
            : `✅ Contrato${isPmoc ? ' PMOC' : ''} criado com sucesso!`,
        });
        onOpenChange(false);
        if (onCreated && result) onCreated((result as any).id);
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
  };

  const progressPercent = ((step + 1) / STEPS.length) * 100;
  const clientName = customers.find(c => c.id === customerId)?.name || '-';

  return (
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-[700px] overflow-y-auto flex flex-col">
        <SheetHeader>
          <SheetTitle>{isEditing ? 'Editar Contrato' : 'Novo Contrato'}</SheetTitle>
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
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <SearchableSelect
                        options={customerOptions}
                        value={customerId}
                        onValueChange={v => { setCustomerId(v); if (!isEditing) setSelectedItems([]); }}
                        placeholder="Selecione o cliente"
                        searchPlaceholder="Buscar cliente..."
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0 h-10 w-10"
                      onClick={() => setShowQuickCustomer(true)}
                      title="Cadastrar novo cliente"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <AssigneeMultiSelect
                    technicians={(technicians ?? []).map(t => ({ user_id: t.user_id, full_name: t.full_name, avatar_url: t.avatar_url }))}
                    teams={teamsWithMembers}
                    selectedUserIds={selectedUserIds}
                    selectedTeamIds={selectedTeamIds}
                    onChangeUsers={setSelectedUserIds}
                    onChangeTeams={setSelectedTeamIds}
                    label="Técnicos Executores"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Técnicos ou equipes que vão a campo executar as ordens de serviço deste contrato.
                    {' '}Diferente do Responsável Técnico (RT) regulatório do PMOC.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <AssigneeMultiSelect
                    technicians={(allProfiles ?? []).map(t => ({ user_id: t.user_id, full_name: t.full_name, avatar_url: t.avatar_url }))}
                    teams={teamsWithMembers}
                    selectedUserIds={billingUserIds}
                    selectedTeamIds={billingTeamIds}
                    onChangeUsers={setBillingUserIds}
                    onChangeTeams={setBillingTeamIds}
                    label="Responsáveis Financeiros (Cobrança)"
                    usersLabel="Usuários"
                  />
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

              {/* PMOC (Onda A v1.9.0). Toggle + seção condicional com RT, badge legal e alerta. */}
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-start gap-3">
                  <Switch
                    checked={isPmoc}
                    onCheckedChange={(v) => {
                      // Quando desligar e tinha RT, pede confirmação (em edição).
                      if (!v && isEditing && initialIsPmocRef.value && responsibleTechnicianId) {
                        setShowPmocOffConfirm(true);
                        return;
                      }
                      setIsPmoc(v);
                      if (!v) setResponsibleTechnicianId('');
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <Label className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-info shrink-0" />
                      É um contrato PMOC?
                    </Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Plano de Manutenção, Operação e Controle. Ative para vincular um Responsável Técnico
                      e gerar OSs com selo de conformidade legal.
                    </p>
                  </div>
                </div>

                {isPmoc && (
                  <div className="space-y-3 pt-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Label className="m-0">Responsável Técnico (RT)</Label>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              className="text-muted-foreground hover:text-foreground transition-colors"
                              aria-label="O que é Responsável Técnico?"
                            >
                              <Info className="h-3.5 w-3.5" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs text-xs">
                            Engenheiro ou Técnico em Refrigeração com CFT/CREA que assina o
                            Termo de Responsabilidade Técnica conforme Lei Federal 13.589/2018.
                            Diferente do Técnico Executor (quem executa as OSs no campo).
                          </TooltipContent>
                        </Tooltip>
                      </div>
                      <p className="text-xs text-muted-foreground -mt-1">
                        CFT/CREA — supervisão regulatória do PMOC.
                      </p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Select
                            value={responsibleTechnicianId || 'none'}
                            onValueChange={(v) => setResponsibleTechnicianId(v === 'none' ? '' : v)}
                            disabled={rtLoading}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={rtLoading ? 'Carregando...' : 'Selecione o RT...'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">— Sem RT atribuído —</SelectItem>
                              {responsibleTechnicians.map((rt) => {
                                const modality = rt.modality ?? 'Modalidade não informada';
                                const registry = rt.cft_crea ?? 'sem registro';
                                return (
                                  <SelectItem key={rt.id} value={rt.id}>
                                    {rt.full_name} — {modality} ({registry})
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 h-10 w-10"
                          onClick={() => setShowQuickCreateRT(true)}
                          aria-label="Cadastrar novo Responsável Técnico"
                          title="Cadastrar novo Responsável Técnico"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Engenheiro ou Técnico com CFT/CREA que supervisiona o PMOC. Pode ser definido depois.
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="info" className="gap-1.5">
                        <ShieldCheck className="h-3 w-3" />
                        Conforme Lei Federal 13.589/2018
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        OSs sairão com selo de conformidade.
                      </span>
                    </div>

                    <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
                      <ShieldCheck className="h-4 w-4 text-info" />
                      <AlertTitle className="text-sm">O que o PMOC desbloqueia</AlertTitle>
                      <AlertDescription className="text-xs">
                        Contratos PMOC têm acesso ao Termo de Responsabilidade Técnica,
                        Dossiê PMOC, Cronograma anual em PDF, portal público com QR Code
                        e selo "Conforme Lei Federal 13.589/2018" nas OSs. O contrato gera
                        as OSs imediatamente, igual a um contrato comum.
                      </AlertDescription>
                    </Alert>
                  </div>
                )}
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
                      <div className="text-center py-2 text-xs text-muted-foreground">
                        +{occurrences.length - 30} datas adicionais
                      </div>
                    )}
                  </div>
                  {weekendDates.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-warning">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      {weekendDates.length} ocorrência(s) caem em fim de semana
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Items */}
          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Selecione os equipamentos do cliente e/ou adicione itens manuais que farão parte deste contrato.
              </p>

              {customerId && activeEquipment.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Buscar equipamento..."
                        value={itemSearch}
                        onChange={e => setItemSearch(e.target.value)}
                        className="pl-8"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const allSelected = filteredEquipment.every(eq => isEquipmentSelected(eq.id));
                        if (allSelected) {
                          setSelectedItems(prev => prev.filter(i => !filteredEquipment.some(eq => eq.id === i.equipment_id)));
                        } else {
                          const newItems = filteredEquipment
                            .filter(eq => !isEquipmentSelected(eq.id))
                            .map(eq => ({
                              equipment_id: eq.id,
                              item_name: eq.name,
                              item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined,
                            }));
                          setSelectedItems(prev => [...prev, ...newItems]);
                        }
                      }}
                    >
                      <Check className="h-3.5 w-3.5 mr-1" />
                      {filteredEquipment.every(eq => isEquipmentSelected(eq.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
                    </Button>
                  </div>
                  <div className="rounded-md border max-h-52 overflow-y-auto divide-y">
                    {filteredEquipment.map(eq => (
                      <label key={eq.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/50 transition-colors">
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={isEquipmentSelected(eq.id)}
                          onChange={() => toggleEquipment(eq)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{eq.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Manual items */}
              {!showManualItem ? (
                <Button variant="outline" className="w-full" onClick={() => setShowManualItem(true)}>
                  <Plus className="h-4 w-4 mr-2" /> Adicionar item manual
                </Button>
              ) : (
                <div className="rounded-lg border p-3 space-y-3">
                  <div className="space-y-2">
                    <Label>Nome do item</Label>
                    <Input value={manualName} onChange={e => setManualName(e.target.value)} placeholder="Ex: Limpeza de dutos" />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição (opcional)</Label>
                    <Input value={manualDesc} onChange={e => setManualDesc(e.target.value)} placeholder="Detalhes adicionais" />
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowManualItem(false)}>Cancelar</Button>
                    <Button size="sm" onClick={addManualItem} disabled={!manualName.trim()}>Adicionar</Button>
                  </div>
                </div>
              )}

              {/* Selected summary */}
              {selectedItems.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Itens selecionados ({selectedItems.length})</Label>
                  {selectedItems.map((item, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{item.item_name}</p>
                        {item.item_description && <p className="text-xs text-muted-foreground truncate">{item.item_description}</p>}
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedItems(prev => prev.filter((_, idx) => idx !== i))}>
                        ×
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Review */}
          {step === 3 && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="font-semibold flex items-center gap-2">
                <CalendarCheck className="h-5 w-5 text-primary" />
                Revisão do Contrato
              </h3>
              <div className="grid gap-3 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span className="font-medium text-right">{name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Cliente</span><span className="font-medium">{clientName}</span></div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Técnicos Executores</span>
                  <span className="font-medium text-right">
                    {(() => {
                      if (selectedUserIds.length === 0 && selectedTeamIds.length === 0) return '—';
                      const parts: string[] = [];
                      if (selectedUserIds.length === 1) {
                        const name = (technicians ?? []).find(t => t.user_id === selectedUserIds[0])?.full_name;
                        parts.push(name || '1 técnico');
                      } else if (selectedUserIds.length > 1) {
                        parts.push(`${selectedUserIds.length} técnicos`);
                      }
                      if (selectedTeamIds.length > 0) {
                        parts.push(`${selectedTeamIds.length} equipe(s)`);
                      }
                      return parts.join(' + ');
                    })()}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Frequência</span><span className="font-medium">{getFrequencyLabel(freqType, freqValue)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Início</span><span className="font-medium">{format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horizonte</span><span className="font-medium">{horizonMonths} meses</span></div>
                {!isEditing && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Ocorrências</span><span className="font-medium">{occurrences.length} datas</span></div>
                )}
                <div className="flex justify-between"><span className="text-muted-foreground">Itens</span><span className="font-medium">{selectedItems.length}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={isActive ? 'success' : 'outline'}>{isActive ? 'Ativo' : 'Pausado'}</Badge></div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Tipo</span>
                  {isPmoc ? (
                    <Badge variant="info" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> PMOC
                    </Badge>
                  ) : (
                    <span className="font-medium">Comum</span>
                  )}
                </div>
                {isPmoc && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground shrink-0">Responsável Técnico (RT)</span>
                    <div className="text-right min-w-0">
                      {(() => {
                        const rt = responsibleTechnicians.find((r) => r.id === responsibleTechnicianId);
                        if (!rt) return <span className="font-medium">A definir</span>;
                        return (
                          <>
                            <div className="font-medium truncate">{rt.full_name}</div>
                            <div className="text-xs text-muted-foreground">
                              CFT/CREA: {rt.cft_crea ?? '—'}
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer navigation */}
        <SheetFooter className="mt-4 flex flex-row justify-between gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)} disabled={submitting}>
            {step === 0 ? 'Cancelar' : <><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</>}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Próximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={submitting || !canNext()} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {submitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : `Criar Contrato (${occurrences.length} OSs)`}
            </Button>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>

    <CustomerFormDialog
      open={showQuickCustomer}
      onOpenChange={setShowQuickCustomer}
      onSubmit={async (data) => {
        const result = await createCustomer.mutateAsync(data as CustomerInput);
        if (result?.id) {
          setCustomerId(result.id);
          setSelectedItems([]);
        }
        setShowQuickCustomer(false);
      }}
      isLoading={createCustomer.isPending}
    />

    {/* Quick-create RT (Onda UI-1.2). Cadastro rápido sem sair do modal de contrato.
        O `onCreated` seleciona o novo RT — a invalidate da query no hook cuida
        de fazer ele aparecer no select da lista de RTs ativos. */}
    <PmocQuickCreateRTDialog
      open={showQuickCreateRT}
      onOpenChange={setShowQuickCreateRT}
      onCreated={(rt) => {
        setResponsibleTechnicianId(rt.id);
        setShowQuickCreateRT(false);
      }}
    />

    {/* Confirmação ao desligar PMOC quando já havia RT atribuído. */}
    <AlertDialog open={showPmocOffConfirm} onOpenChange={setShowPmocOffConfirm}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desligar PMOC deste contrato?</AlertDialogTitle>
          <AlertDialogDescription>
            O Responsável Técnico será desvinculado e as próximas OSs deixarão de exibir o selo
            "Conforme Lei Federal 13.589/2018". OSs já geradas não são afetadas. Você pode reativar
            depois.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setIsPmoc(false);
              setResponsibleTechnicianId('');
              setShowPmocOffConfirm(false);
            }}
          >
            Desligar PMOC
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}