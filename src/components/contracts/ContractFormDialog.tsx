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
import { useContracts, useContractPlanActivities, generateOccurrences, getFrequencyLabel, type PlanActivityInput, type FreqCode, activityPeriodMonths, generateGroupedVisits, REGENERABLE_OS_STATUSES } from '@/hooks/useContracts';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { useCustomers, CustomerInput } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useEquipment } from '@/hooks/useEquipment';
import { useTechnicians, useProfiles } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { getErrorMessage } from '@/utils/errorMessages';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useResponsibleTechnicians } from '@/hooks/useResponsibleTechnicians';
import { usePmocActivityCatalog, type PmocCatalogActivity } from '@/hooks/usePmocActivityCatalog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { PmocQuickCreateRTDialog } from '@/components/pmoc/PmocQuickCreateRTDialog';
import { autoGeneratePmocDocsV1 } from '@/hooks/useGeneratePmocDocument';
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

// Frequências por serviço (notação da norma PMOC, vale pra qualquer contrato).
// 'E' (eventual) é registrado mas não entra no cronograma automático.
const ACTIVITY_FREQ_OPTIONS: { code: FreqCode; label: string }[] = [
  { code: 'M', label: 'Mensal' },
  { code: 'T', label: 'Trimestral' },
  { code: 'S', label: 'Semestral' },
  { code: 'A', label: 'Anual' },
  { code: 'E', label: 'Eventual' },
];

// Seções da norma cujas atividades são de LOCAL (não se repetem por aparelho):
// casa de máquinas, dutos, torres, bombas, etc. Tudo fora desse conjunto
// (condicionadores, medições, testes…) é por equipamento por default.
const LOCAL_SCOPE_SECTIONS = new Set<string>([
  'casa_maquinas',
  'dutos',
  'tomada_ar_exterior',
  'torres_resfriamento',
  'bombas_agua',
  'caixa_expansao',
  'tratamento_quimico',
  'quadros_eletricos',
  'qualidade_ar',
]);

// Escopo default de uma atividade do catálogo a partir da seção. Atividade sem
// seção (manual livre) é por equipamento por default.
function defaultScopeForSection(section: string | null | undefined): boolean {
  if (section && LOCAL_SCOPE_SECTIONS.has(section)) return false; // local
  return true; // por equipamento
}

// Linha do editor de plano (estado de UI). Vira PlanActivityInput no submit.
// Carrega os metadados do catálogo PMOC (section/component/medição) quando a
// linha vem do picker; linhas manuais livres só têm description + freq_code.
interface PlanActivityRow {
  description: string;
  freq_code: FreqCode;
  section?: string | null;
  component?: string | null;
  is_measurement?: boolean;
  unit?: string | null;
  expected_min?: number | null;
  expected_max?: number | null;
  catalog_activity_id?: string | null;
  // Escopo (Fase 3): true = por equipamento (default), false = geral/local.
  applies_per_equipment?: boolean;
}

// Linha do editor → PlanActivityInput (preserva os metadados do catálogo).
function planRowToInput(a: PlanActivityRow): PlanActivityInput {
  return {
    description: a.description,
    freq_code: a.freq_code,
    section: a.section ?? null,
    component: a.component ?? null,
    is_measurement: a.is_measurement ?? false,
    unit: a.unit ?? null,
    expected_min: a.expected_min ?? null,
    expected_max: a.expected_max ?? null,
    catalog_activity_id: a.catalog_activity_id ?? null,
    applies_per_equipment: a.applies_per_equipment ?? true,
  };
}

// Normaliza o default_freq_code do catálogo (string) pro FreqCode do editor.
function catalogFreqCode(code: string | null | undefined): FreqCode {
  if (code && ['M', 'T', 'S', 'A', 'E'].includes(code)) return code as FreqCode;
  return 'M';
}

// Atividade do catálogo PMOC → linha editável do plano (ponto de partida).
function catalogToPlanRow(a: PmocCatalogActivity): PlanActivityRow {
  return {
    description: a.description,
    freq_code: catalogFreqCode(a.default_freq_code),
    section: a.section,
    component: a.component,
    is_measurement: a.is_measurement,
    unit: a.unit,
    expected_min: a.expected_min,
    expected_max: a.expected_max,
    catalog_activity_id: a.id,
    // Escopo default vem da seção da norma (aparelho vs. local).
    applies_per_equipment: defaultScopeForSection(a.section),
  };
}

// Mapeia uma linha persistida (freq_code OU freq_months) pro código que o editor
// suporta (M/T/S/A/E). freq_code ganha; senão deriva de freq_months; default M.
function planRowToFreqCode(row: { freq_code: string | null; freq_months: number | null }): FreqCode {
  if (row.freq_code && ['M', 'T', 'S', 'A', 'E'].includes(row.freq_code)) return row.freq_code as FreqCode;
  switch (row.freq_months) {
    case 1: return 'M';
    case 3: return 'T';
    case 6: return 'S';
    case 12: return 'A';
    default: return 'M';
  }
}

// Parse de input numérico no padrão BR (vírgula decimal) → number | null.
// String vazia/só espaço → null. Valor inválido → null (não trava o submit).
function parseDecimalBR(raw: string): number | null {
  const t = (raw ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

// Parse de inteiro (ocupantes). Vazio → null; inválido → null.
function parseIntOrNull(raw: string): number | null {
  const t = (raw ?? '').trim();
  if (!t) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

export function ContractFormDialog({ open, onOpenChange, onCreated, editContract, defaultCustomerId }: ContractFormDialogProps) {
  const { createContract, updateContract } = useContracts();
  // Plano de serviços já persistido (só carrega em edição). Hook é a fronteira
  // do Supabase — o componente nunca lê contract_plan_activities direto.
  const { data: existingPlan } = useContractPlanActivities(editContract?.id);
  const { customers, createCustomer } = useCustomers();
  const { data: technicians } = useTechnicians();
  const { data: allProfiles } = useProfiles();
  const { teams, teamsWithMembers } = useTeams();
  const { serviceTypes } = useServiceTypes();
  const { templates } = useFormTemplates();
  // Lista de RTs ativos do tenant — usada quando o contrato é marcado como PMOC.
  const { technicians: responsibleTechnicians, isLoading: rtLoading } = useResponsibleTechnicians({ activeOnly: true });
  // Catálogo PMOC (149 atividades da norma) — alimenta o picker por seção e a
  // pré-carga automática do plano padrão (seção condicionadores) num PMOC novo.
  const { groups: catalogGroups, defaultSectionActivities, isLoading: catalogLoading } = usePmocActivityCatalog();
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

  // Step 2 — Plano de serviços com frequência por linha (Fase 1). Quando há ao
  // menos um serviço, o motor de visitas agrupadas (1 OS/mês = união do que
  // vence) assume; vazio = frequência única (legado). Captura mínima funcional;
  // o redesign visual é outra tarefa.
  const [planActivities, setPlanActivities] = useState<PlanActivityRow[]>([]);
  const [newActivityDesc, setNewActivityDesc] = useState('');
  const [newActivityFreq, setNewActivityFreq] = useState<FreqCode>('M');
  // Snapshot do plano carregado do banco (modo edição) — base pra detectar se o
  // plano mudou e o cronograma precisa ser recalculado.
  const [initialPlanSig, setInitialPlanSig] = useState('');
  // Confirmação antes de recalcular visitas futuras numa edição de cronograma.
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const [regenCount, setRegenCount] = useState(0);

  // Picker do catálogo PMOC (Fase 2). Abre por seção; seleção multi vira linhas
  // do plano. `pickerSelection` = ids do catálogo marcados no modal aberto.
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);
  const [pickerSelection, setPickerSelection] = useState<Set<string>>(new Set());
  // Guarda contra re-empurrar o plano padrão PMOC mais de uma vez por abertura.
  const [pmocDefaultSeeded, setPmocDefaultSeeded] = useState(false);

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
  // Seção 4 da Planilha PMOC — caracterização do ambiente climatizado (modelo do
  // cliente). Strings cruas; números enviados parseados no submit. Só aparecem
  // quando o contrato é PMOC.
  const [pmocTipoAtividade, setPmocTipoAtividade] = useState('');
  const [pmocIdentificacaoAmbiente, setPmocIdentificacaoAmbiente] = useState('');
  const [pmocAreaClimatizada, setPmocAreaClimatizada] = useState('');
  const [pmocOcupantesFixos, setPmocOcupantesFixos] = useState('');
  const [pmocOcupantesFlutuantes, setPmocOcupantesFlutuantes] = useState('');
  const [pmocCargaTermicaTr, setPmocCargaTermicaTr] = useState('');
  // Em modo edição, guarda a chamada que ficou esperando confirmação do "desligar PMOC".
  const initialIsPmocRef = useState<{ value: boolean }>({ value: false })[0];

  const { equipment } = useEquipment(customerId || undefined);
  const activeEquipment = equipment.filter(eq => eq.status === 'active');

  useEffect(() => {
    if (!open) {
      setStep(0);
      setItemSearch(''); setShowManualItem(false); setManualName(''); setManualDesc('');
      setShowCatalogPicker(false); setPickerSelection(new Set()); setPmocDefaultSeeded(false);
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
      // Plano de atividades é repopulado por um efeito dedicado quando a query
      // useContractPlanActivities resolve (carrega async). Aqui só limpamos o
      // editor de "nova atividade".
      setNewActivityDesc(''); setNewActivityFreq('M');
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
      // Caracterização do ambiente climatizado (Seção 4). Número nulo → string vazia.
      const numToStr = (v: any) => (v === null || v === undefined ? '' : String(v).replace('.', ','));
      setPmocTipoAtividade(editContract.pmoc_tipo_atividade || '');
      setPmocIdentificacaoAmbiente(editContract.pmoc_identificacao_ambiente || '');
      setPmocAreaClimatizada(numToStr(editContract.pmoc_area_climatizada_m2));
      setPmocOcupantesFixos(numToStr(editContract.pmoc_ocupantes_fixos));
      setPmocOcupantesFlutuantes(numToStr(editContract.pmoc_ocupantes_flutuantes));
      setPmocCargaTermicaTr(numToStr(editContract.pmoc_carga_termica_tr));
    } else {
      setName(''); setCustomerId(defaultCustomerId || ''); setSelectedUserIds([]); setSelectedTeamIds([]);
      setBillingUserIds([]); setBillingTeamIds([]); setServiceTypeId('');
      setFormTemplateId(''); setNotes(''); setIsActive(true);
      setFreqType('months'); setFreqValue(1); setStartDate(format(new Date(), 'yyyy-MM-dd')); setHorizonMonths(12);
      setPlanActivities([]); setInitialPlanSig(''); setNewActivityDesc(''); setNewActivityFreq('M');
      setSelectedItems([]);
      // Default: contrato comum.
      setIsPmoc(false);
      setResponsibleTechnicianId('');
      initialIsPmocRef.value = false;
      setPmocTipoAtividade(''); setPmocIdentificacaoAmbiente(''); setPmocAreaClimatizada('');
      setPmocOcupantesFixos(''); setPmocOcupantesFlutuantes(''); setPmocCargaTermicaTr('');
    }
  }, [open, editContract]);

  // Repopula o editor "Serviços com frequência própria" com o plano persistido
  // (modo edição). Roda quando a query resolve. Guarda a assinatura inicial pra
  // detectar mudança de plano no submit.
  const planSigOf = (rows: { description: string; freq_code: FreqCode; applies_per_equipment?: boolean }[]) =>
    rows.map(a => `${a.description.trim()}|${a.freq_code}|${a.applies_per_equipment === false ? '0' : '1'}`).join('§');

  useEffect(() => {
    if (!open || !editContract) return;
    const rows: PlanActivityRow[] = (existingPlan ?? []).map(r => ({
      description: r.description,
      freq_code: planRowToFreqCode(r),
      section: r.section,
      component: r.component,
      is_measurement: r.is_measurement,
      unit: r.unit,
      expected_min: r.expected_min,
      expected_max: r.expected_max,
      catalog_activity_id: r.catalog_activity_id,
      applies_per_equipment: r.applies_per_equipment,
    }));
    setPlanActivities(rows);
    setInitialPlanSig(planSigOf(rows));
  }, [open, editContract, existingPlan]);

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  const occurrences = useMemo(() =>
    generateOccurrences(new Date(startDate + 'T00:00:00'), freqType, freqValue, horizonMonths),
    [startDate, freqType, freqValue, horizonMonths]
  );

  // Atividades do plano com frequência válida pra cronograma (exclui eventuais).
  const schedulablePlan = useMemo(
    () => planActivities.filter(a => activityPeriodMonths(a as PlanActivityInput) > 0),
    [planActivities],
  );
  const usePlanEngine = schedulablePlan.length > 0;

  // Quando há plano, a prévia/contagem de OS vem do motor de visitas agrupadas
  // (1 OS/mês = união do que vence), não da cadência única.
  const groupedVisits = useMemo(
    () => usePlanEngine
      ? generateGroupedVisits(new Date(startDate + 'T00:00:00'), horizonMonths, schedulablePlan as PlanActivityInput[])
      : [],
    [usePlanEngine, startDate, horizonMonths, schedulablePlan],
  );

  // Nº de OS que será gerado (prévia do botão/Revisão).
  const visitCount = usePlanEngine ? groupedVisits.length : occurrences.length;

  const weekendDates = occurrences.filter(d => d.getDay() === 0 || d.getDay() === 6);

  const addPlanActivity = () => {
    const desc = newActivityDesc.trim();
    if (!desc) return;
    setPlanActivities(prev => [...prev, { description: desc, freq_code: newActivityFreq }]);
    setNewActivityDesc('');
    setNewActivityFreq('M');
  };

  // PMOC nasce com o plano padrão da norma (Fase 2). Quando o contrato é marcado
  // PMOC E o plano está vazio, pré-carrega as atividades da seção universal
  // (condicionadores — split/AC) com as frequências default. Ponto de partida
  // editável. Guards:
  //  - só PMOC, só plano vazio, catálogo já carregado;
  //  - `pmocDefaultSeeded` impede re-empurrar na mesma abertura (ex: o gestor
  //    apagar tudo de propósito não deve fazer reaparecer);
  //  - em edição de PMOC que já tem plano, o plano não está vazio → não duplica.
  useEffect(() => {
    if (!open || isEditing) return; // só em contrato novo; edição não re-empurra
    if (!isPmoc || pmocDefaultSeeded) return;
    if (catalogLoading || defaultSectionActivities.length === 0) return;
    if (planActivities.length > 0) return;
    setPlanActivities(defaultSectionActivities.map(catalogToPlanRow));
    setPmocDefaultSeeded(true);
  }, [open, isEditing, isPmoc, pmocDefaultSeeded, catalogLoading, defaultSectionActivities, planActivities.length]);

  // Abre o picker do catálogo já com as linhas vindas do catálogo pré-marcadas
  // (evita duplicar uma atividade que o gestor já adicionou).
  const openCatalogPicker = () => {
    const existingCatalogIds = new Set(
      planActivities.map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    setPickerSelection(existingCatalogIds);
    setShowCatalogPicker(true);
  };

  const togglePickerActivity = (id: string) => {
    setPickerSelection(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Confirma o picker: adiciona as atividades novas (que ainda não estão no
  // plano) como linhas editáveis. Não remove o que o gestor desmarcou aqui —
  // remoção é pelo botão × da linha (o picker só ADICIONA).
  const confirmCatalogPicker = () => {
    const existingCatalogIds = new Set(
      planActivities.map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    const toAdd: PlanActivityRow[] = [];
    for (const group of catalogGroups) {
      for (const act of group.activities) {
        if (pickerSelection.has(act.id) && !existingCatalogIds.has(act.id)) {
          toAdd.push(catalogToPlanRow(act));
        }
      }
    }
    if (toAdd.length > 0) {
      setPlanActivities(prev => [...prev, ...toAdd]);
      toast({ title: `${toAdd.length} serviço(s) adicionado(s) do catálogo PMOC` });
    }
    setShowCatalogPicker(false);
  };

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

  // Aplica de fato a edição (chamado direto ou após confirmar o recálculo).
  // Passa plan_activities (o updateContract substitui o plano e regenera as
  // visitas futuras quando o cronograma muda) e assignee_user_ids.
  const doUpdate = async ({ actualTechnicianId, actualTeamId }: { actualTechnicianId: string | null; actualTeamId: string | null }) => {
    await updateContract.mutateAsync({
      id: editContract.id,
      name,
      customer_id: customerId,
      technician_id: actualTechnicianId,
      team_id: actualTeamId,
      assignee_user_ids: selectedUserIds,
      service_type_id: serviceTypeId || null,
      form_template_id: formTemplateId || null,
      status: isActive ? 'active' : 'paused',
      notes: notes || null,
      frequency_type: freqType,
      frequency_value: freqValue,
      start_date: startDate,
      horizon_months: horizonMonths,
      billing_responsible_ids: billingUserIds,
      // Plano de serviços com frequência (Fase 1/2). Sempre enviado em edição →
      // substitui o plano persistido (add/remover/mudar frequência reflete).
      // Preserva metadados do catálogo PMOC quando a linha veio do picker.
      plan_activities: planActivities.map(planRowToInput),
      // Equipamentos/itens (Fase 3). Sempre enviado em edição → o hook aplica
      // diff (insere novos, apaga removidos); mudança re-expande as visitas.
      items: selectedItems.map(i => ({
        equipment_id: i.equipment_id || null,
        item_name: i.item_name,
        item_description: i.item_description || null,
        form_template_id: i.form_template_id || null,
      })),
      // PMOC (Onda A)
      is_pmoc: isPmoc,
      responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
      // Seção 4 da Planilha PMOC — caracterização do ambiente climatizado.
      pmoc_tipo_atividade: isPmoc ? (pmocTipoAtividade.trim() || null) : null,
      pmoc_identificacao_ambiente: isPmoc ? (pmocIdentificacaoAmbiente.trim() || null) : null,
      pmoc_area_climatizada_m2: isPmoc ? parseDecimalBR(pmocAreaClimatizada) : null,
      pmoc_ocupantes_fixos: isPmoc ? parseIntOrNull(pmocOcupantesFixos) : null,
      pmoc_ocupantes_flutuantes: isPmoc ? parseIntOrNull(pmocOcupantesFlutuantes) : null,
      pmoc_carga_termica_tr: isPmoc ? parseDecimalBR(pmocCargaTermicaTr) : null,
    });
  };

  // Confirma o recálculo das visitas futuras e aplica a edição.
  const confirmRegenAndUpdate = async () => {
    setShowRegenConfirm(false);
    setSubmitting(true);
    try {
      const actualTeamId = selectedTeamIds.length > 0 ? selectedTeamIds[0] : null;
      const actualTechnicianId = !actualTeamId && selectedUserIds.length > 0 ? selectedUserIds[0] : null;
      await doUpdate({ actualTechnicianId, actualTeamId });
      onOpenChange(false);
      if (onCreated) onCreated(editContract.id);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: getErrorMessage(err) });
    } finally {
      setSubmitting(false);
    }
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
        // Mudou algo que afeta o cronograma? (campos de frequência OU o plano)
        const scheduleFieldsChanged =
          startDate !== (editContract.start_date || '') ||
          freqType !== (editContract.frequency_type || 'months') ||
          freqValue !== (editContract.frequency_value || 1) ||
          horizonMonths !== (editContract.horizon_months || 12);
        const currentPlanSig = planSigOf(planActivities);
        const planChanged = currentPlanSig !== initialPlanSig;
        // Mudança no conjunto de equipamentos também re-expande as visitas
        // (mesma chave estável usada no hook: equipment_id ou nome do manual).
        const itemKey = (it: { equipment_id?: string | null; item_name: string }) =>
          it.equipment_id ? `eq:${it.equipment_id}` : `manual:${(it.item_name || '').trim().toLowerCase()}`;
        const initialItemsSig = ((editContract.contract_items || []) as any[])
          .map((it) => itemKey(it)).sort().join('§');
        const currentItemsSig = selectedItems.map((it) => itemKey(it)).sort().join('§');
        const itemsChanged = initialItemsSig !== currentItemsSig;
        const scheduleChanged = scheduleFieldsChanged || planChanged || itemsChanged;

        // Quantas OSs futuras não-realizadas seriam refeitas (preview do diálogo).
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const futureRegenerable = ((editContract.service_orders || []) as any[]).filter(
          (os) =>
            REGENERABLE_OS_STATUSES.has(os.status ?? '') &&
            (os.scheduled_date ?? '') >= todayStr,
        ).length;

        // Cronograma muda E há visitas futuras a refazer → confirma antes.
        if (isActive && scheduleChanged && futureRegenerable > 0) {
          setRegenCount(futureRegenerable);
          setShowRegenConfirm(true);
          setSubmitting(false);
          return;
        }

        await doUpdate({ actualTechnicianId, actualTeamId });
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
          // Seção 4 da Planilha PMOC — caracterização do ambiente climatizado.
          pmoc_tipo_atividade: isPmoc ? (pmocTipoAtividade.trim() || null) : null,
          pmoc_identificacao_ambiente: isPmoc ? (pmocIdentificacaoAmbiente.trim() || null) : null,
          pmoc_area_climatizada_m2: isPmoc ? parseDecimalBR(pmocAreaClimatizada) : null,
          pmoc_ocupantes_fixos: isPmoc ? parseIntOrNull(pmocOcupantesFixos) : null,
          pmoc_ocupantes_flutuantes: isPmoc ? parseIntOrNull(pmocOcupantesFlutuantes) : null,
          pmoc_carga_termica_tr: isPmoc ? parseDecimalBR(pmocCargaTermicaTr) : null,
          items: selectedItems.map(i => ({
            equipment_id: i.equipment_id || null,
            item_name: i.item_name,
            item_description: i.item_description || null,
            form_template_id: i.form_template_id || null,
          })),
          // Plano de serviços com frequência (Fase 1/2). Vazio = frequência única.
          // Preserva metadados do catálogo PMOC quando a linha veio do picker.
          plan_activities: planActivities.map(planRowToInput),
        });

        const generatedOsCount = (result as any)?.generatedOsCount ?? 0;
        const expectedOsCount = (result as any)?.expectedOsCount ?? visitCount;
        const newContractId = (result as any)?.id as string | undefined;

        // Auto-gera a V1 dos documentos PMOC (TRT, Certificado, Cronograma,
        // Dossiê) em segundo plano. SÓ pra contratos PMOC — contrato comum não
        // tem documentos e a chamada nem dispara. Best-effort: não bloqueia o
        // navigate nem trava a UI; erros individuais são ignorados (o gestor
        // gera manual depois se faltar CNPJ/RT).
        if (isPmoc && newContractId) {
          void autoGeneratePmocDocsV1(newContractId);
          toast({
            title: 'Gerando documentos do contrato…',
            description: 'TRT, Certificado, Cronograma e Dossiê estão sendo criados em segundo plano.',
          });
        }

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
                  <Label>Checklist Padrão</Label>
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

                    {/* Seção 4 da Planilha PMOC — caracterização do ambiente
                        climatizado (modelo do cliente). Só aparece em PMOC. */}
                    <div className="rounded-lg border p-3 space-y-3">
                      <div>
                        <Label className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-info shrink-0" />
                          Ambiente climatizado (Planilha PMOC)
                        </Label>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Caracterização do ambiente para a Seção 4 da Planilha PMOC. Opcional —
                          campos em branco aparecem como "—" no documento.
                        </p>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-xs">Tipo de atividade</Label>
                          <Input
                            value={pmocTipoAtividade}
                            onChange={e => setPmocTipoAtividade(e.target.value)}
                            placeholder="Ex: Escritório administrativo"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Identificação do ambiente</Label>
                          <Input
                            value={pmocIdentificacaoAmbiente}
                            onChange={e => setPmocIdentificacaoAmbiente(e.target.value)}
                            placeholder="Ex: 2º andar — Sala 201"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Área climatizada (m²)</Label>
                          <Input
                            inputMode="decimal"
                            value={pmocAreaClimatizada}
                            onChange={e => setPmocAreaClimatizada(e.target.value)}
                            placeholder="Ex: 120,5"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Carga térmica (TR)</Label>
                          <Input
                            inputMode="decimal"
                            value={pmocCargaTermicaTr}
                            onChange={e => setPmocCargaTermicaTr(e.target.value)}
                            placeholder="Ex: 5,0"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            Pode ser calculada na ferramenta de Carga Térmica do técnico. Aqui é só registro.
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nº de ocupantes fixos</Label>
                          <Input
                            inputMode="numeric"
                            value={pmocOcupantesFixos}
                            onChange={e => setPmocOcupantesFixos(e.target.value)}
                            placeholder="Ex: 12"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs">Nº de ocupantes flutuantes</Label>
                          <Input
                            inputMode="numeric"
                            value={pmocOcupantesFlutuantes}
                            onChange={e => setPmocOcupantesFlutuantes(e.target.value)}
                            placeholder="Ex: 30"
                          />
                        </div>
                      </div>
                    </div>
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

              {/* Plano de serviços com frequência (Fase 1). Cada serviço pode ter
                  uma frequência própria; quando há ao menos um serviço com
                  frequência de cronograma, o sistema gera 1 visita/mês agrupando
                  tudo que vence — em vez da frequência única acima. */}
              <div className="rounded-lg border p-3 space-y-3">
                <div>
                  <Label className="flex items-center gap-2">
                    <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                    Serviços com frequência própria (opcional)
                  </Label>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Adicione serviços com frequências diferentes (ex: filtro mensal, serpentina trimestral).
                    Quando houver serviços aqui, o sistema gera <strong>1 visita por mês</strong> agrupando tudo que vence,
                    ignorando a frequência única acima.
                  </p>
                  {isPmoc && (
                    <p className="text-xs text-info mt-1 flex items-start gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>
                        Pré-carregamos as atividades de Condicionadores de Ar conforme a norma (Lei 13.589/2018).
                        É um <strong>ponto de partida editável</strong> — ajuste a frequência, remova ou adicione mais do catálogo.
                      </span>
                    </p>
                  )}
                </div>

                {/* Picker do catálogo PMOC (Fase 2). Disponível em qualquer
                    contrato; a auto-carga só acontece no PMOC. */}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={openCatalogPicker}
                  disabled={catalogLoading}
                >
                  <ShieldCheck className="h-4 w-4 mr-2 text-info" />
                  {catalogLoading ? 'Carregando catálogo...' : 'Adicionar do catálogo PMOC'}
                </Button>

                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    placeholder="Ex: Limpeza de filtros"
                    value={newActivityDesc}
                    onChange={e => setNewActivityDesc(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addPlanActivity(); } }}
                  />
                  <Select value={newActivityFreq} onValueChange={v => setNewActivityFreq(v as FreqCode)}>
                    <SelectTrigger className="w-[130px] shrink-0"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ACTIVITY_FREQ_OPTIONS.map(o => (
                        <SelectItem key={o.code} value={o.code}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" size="icon" className="shrink-0 h-10 w-10" onClick={addPlanActivity} disabled={!newActivityDesc.trim()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {planActivities.length > 0 && (
                  <div className="space-y-1.5">
                    {planActivities.map((a, i) => {
                      const freqLabel = ACTIVITY_FREQ_OPTIONS.find(o => o.code === a.freq_code)?.label ?? a.freq_code;
                      const perEquip = a.applies_per_equipment !== false;
                      return (
                        <div key={i} className="flex flex-col gap-2 rounded border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0 flex items-center gap-2">
                            <span className="font-medium truncate">{a.description}</span>
                            <Badge variant={a.freq_code === 'E' ? 'outline' : 'info'} className="shrink-0 text-[10px]">{freqLabel}</Badge>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {/* Escopo da atividade (Fase 3): por equipamento ou geral (local). */}
                            <button
                              type="button"
                              onClick={() => setPlanActivities(prev => prev.map((x, idx) => idx === i ? { ...x, applies_per_equipment: !perEquip } : x))}
                              className={cn(
                                'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap',
                                perEquip
                                  ? 'bg-info/10 text-info border-info/30'
                                  : 'bg-muted text-muted-foreground border-border',
                              )}
                              title="Alterna entre repetir a atividade por equipamento ou tratá-la como geral (local)"
                            >
                              {perEquip ? 'Por equipamento' : 'Geral (local)'}
                            </button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setPlanActivities(prev => prev.filter((_, idx) => idx !== i))}>
                              ×
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                    {usePlanEngine ? (
                      <div className="flex items-center gap-2 text-xs text-info pt-1">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        {groupedVisits.length} visita(s) serão geradas (1 por mês com serviços a vencer).
                        Eventuais não entram no cronograma automático.
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-warning pt-1">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                        Só há serviços eventuais — nenhuma visita será agendada automaticamente.
                      </div>
                    )}
                  </div>
                )}
              </div>
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Frequência</span>
                  <span className="font-medium text-right">
                    {usePlanEngine ? `Por serviço (${schedulablePlan.length}) — visita mensal agrupada` : getFrequencyLabel(freqType, freqValue)}
                  </span>
                </div>
                <div className="flex justify-between"><span className="text-muted-foreground">Início</span><span className="font-medium">{format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy')}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Horizonte</span><span className="font-medium">{horizonMonths} meses</span></div>
                {!isEditing && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{usePlanEngine ? 'Visitas' : 'Ocorrências'}</span><span className="font-medium">{visitCount} {usePlanEngine ? 'visitas' : 'datas'}</span></div>
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
              {submitting ? 'Salvando...' : isEditing ? 'Salvar Alterações' : `Criar Contrato (${visitCount} OSs)`}
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

    {/* Picker do catálogo PMOC (Fase 2). Drawer no mobile, dialog no desktop.
        Navegação por seção (accordion); cada item é um checkbox com o selo de
        frequência default da norma. Multi-seleção; ao confirmar vira linha do
        plano (editável depois). */}
    <ResponsiveModal
      open={showCatalogPicker}
      onOpenChange={setShowCatalogPicker}
      title="Catálogo de atividades PMOC"
      footer={
        <div className="flex flex-row items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pickerSelection.size} selecionada(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowCatalogPicker(false)}>Cancelar</Button>
            <Button onClick={confirmCatalogPicker}>Adicionar ao plano</Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Atividades de manutenção conforme a norma (Lei 13.589/2018). Marque as que se aplicam ao contrato.
          A frequência vem da norma como ponto de partida e fica editável no plano.
        </p>
        {catalogGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {catalogLoading ? 'Carregando catálogo...' : 'Nenhuma atividade no catálogo.'}
          </p>
        ) : (
          <Accordion type="multiple" defaultValue={[catalogGroups[0]?.section]} className="w-full">
            {catalogGroups.map(group => {
              const selectedInGroup = group.activities.filter(a => pickerSelection.has(a.id)).length;
              return (
                <AccordionItem key={group.section} value={group.section}>
                  <AccordionTrigger className="text-sm">
                    <span className="flex items-center gap-2 text-left">
                      {group.label}
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {group.activities.length}
                      </Badge>
                      {selectedInGroup > 0 && (
                        <Badge variant="info" className="text-[10px] shrink-0">{selectedInGroup} ✓</Badge>
                      )}
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-1">
                      {group.activities.map(act => {
                        const checked = pickerSelection.has(act.id);
                        const freqLabel = ACTIVITY_FREQ_OPTIONS.find(o => o.code === catalogFreqCode(act.default_freq_code))?.label
                          ?? act.default_freq_code;
                        return (
                          <label
                            key={act.id}
                            className="flex items-start gap-3 rounded-md px-2 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-border shrink-0"
                              checked={checked}
                              onChange={() => togglePickerActivity(act.id)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-foreground">{act.description}</p>
                              {act.component && (
                                <p className="text-xs text-muted-foreground truncate">{act.component}</p>
                              )}
                            </div>
                            <Badge
                              variant={catalogFreqCode(act.default_freq_code) === 'E' ? 'outline' : 'info'}
                              className="shrink-0 text-[10px]"
                            >
                              {freqLabel}
                            </Badge>
                          </label>
                        );
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}
      </div>
    </ResponsiveModal>

    {/* Confirmação antes de recalcular as visitas futuras (edição de cronograma).
        ResponsiveModal = drawer de baixo no mobile, dialog no desktop. */}
    <ResponsiveModal
      open={showRegenConfirm}
      onOpenChange={(v) => { if (!v) { setShowRegenConfirm(false); setSubmitting(false); } }}
      title="Recalcular visitas futuras?"
      footer={
        <div className="flex flex-row justify-end gap-2">
          <Button variant="outline" onClick={() => { setShowRegenConfirm(false); setSubmitting(false); }}>
            Cancelar
          </Button>
          <Button
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={confirmRegenAndUpdate}
            disabled={submitting}
          >
            {submitting ? 'Salvando...' : 'Recalcular visitas'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-muted-foreground">
        <p>
          Alterar datas, frequência ou os serviços do plano vai recalcular as visitas futuras deste contrato.
        </p>
        <p className="text-foreground font-medium">
          {regenCount} visita(s) futura(s) não realizada(s) serão refeitas.
        </p>
        <p>
          Visitas já realizadas, em andamento ou a caminho são preservadas. Cobranças (financeiro) não são afetadas.
        </p>
      </div>
    </ResponsiveModal>

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