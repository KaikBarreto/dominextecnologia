import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { LabeledSwitch } from '@/components/ui/labeled-switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Progress } from '@/components/ui/progress';
import { AssigneeMultiSelect } from '@/components/schedule/AssigneeMultiSelect';
import { useContracts, useContractPlanActivities, generateOccurrences, getFrequencyLabel, type PlanActivityInput, type FreqCode, activityPeriodMonths, generateGroupedVisits, REGENERABLE_OS_STATUSES } from '@/hooks/useContracts';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { StepTransition } from '@/components/ui/step-transition';
import { DraftResumeDialog } from '@/components/ui/DraftResumeDialog';
import { useFormDraft } from '@/hooks/useFormDraft';
import { useCustomers, CustomerInput } from '@/hooks/useCustomers';
import { CustomerFormDialog } from '@/components/customers/CustomerFormDialog';
import { useEquipment } from '@/hooks/useEquipment';
import { useEquipmentCategories } from '@/hooks/useEquipmentCategories';
import { EquipmentFormDialog } from '@/components/customers/EquipmentFormDialog';
import { useTechnicians, useProfiles } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { useServiceTypes } from '@/hooks/useServiceTypes';
import { getErrorMessage } from '@/utils/errorMessages';
import { useFormTemplates } from '@/hooks/useFormTemplates';
import { useResponsibleTechnicians } from '@/hooks/useResponsibleTechnicians';
import { usePmocActivityCatalog, type PmocCatalogActivity, PMOC_DEFAULT_SECTION } from '@/hooks/usePmocActivityCatalog';
import {
  type PmocMachineScope,
  type PlanActivityRow,
  type MachineConfig,
  START_VISIT_OPTIONS,
  startVisitLabel,
  firstVisitContents,
  machineCatalogActivities,
  catalogToPlanRow,
  planRowToInput,
  planRowToFreqCode,
  buildDefaultMachineConfig as buildDefaultMachineConfigShared,
  reconstructMachineConfigs,
  buildPmocPlanFromMachines,
  buildPmocItemsWithScope,
} from '@/components/contracts/pmocMachineRoutine';
import { PmocChecklistPicker } from '@/components/contracts/PmocChecklistPicker';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { PmocQuickCreateRTDialog } from '@/components/pmoc/PmocQuickCreateRTDialog';
import { autoGeneratePmocDocsV1 } from '@/hooks/useGeneratePmocDocument';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, ChevronDown, Check, Search, Plus, CalendarCheck, AlertTriangle, ShieldCheck, ExternalLink, Info, Trash2, Wrench, Lock, HelpCircle, Loader2 } from 'lucide-react';
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

// A etapa `items` é contextual: contrato PMOC organiza por AMBIENTES; contrato
// comum mantém a lista FLAT de equipamentos/itens. Ela vem ANTES da frequência
// (escolher os equipamentos antes de cadenciar). A etapa `team` (Equipe &
// Cobrança) reúne técnicos, cobrança, tipo de serviço, checklist, observações e
// status — desafogando a Identificação.
const STEPS_COMMON = [
  { key: 'info', label: 'Identificação' },
  { key: 'items', label: 'Equipamentos' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'team', label: 'Equipe & Cobrança' },
  { key: 'review', label: 'Revisão' },
];
const STEPS_PMOC = [
  { key: 'info', label: 'Identificação' },
  { key: 'unit', label: 'Unidade & RT' },
  { key: 'items', label: 'Ambientes' },
  { key: 'frequency', label: 'Frequência' },
  { key: 'team', label: 'Equipe & Cobrança' },
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

// Rotina POR MÁQUINA (escopo/fase/checklists do catálogo) e helpers do plano
// vivem em @/components/contracts/pmocMachineRoutine (fonte ÚNICA compartilhada
// com a aba Ambientes). Tipos PmocMachineScope/MachineConfig/PlanActivityRow,
// constantes (LOCAL_SCOPE_SECTIONS, AC_EQUIPMENT_SECTIONS, START_VISIT_OPTIONS) e
// funções (machineCatalogActivities, catalogToPlanRow, planRowToInput,
// reconstructMachineConfigs, buildPmocPlanFromMachines, buildPmocItemsWithScope…)
// são importados acima.

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

// Número persistido → string BR pra input (null → vazio; ponto → vírgula).
function numToStrBR(v: number | null | undefined): string {
  return v === null || v === undefined ? '' : String(v).replace('.', ',');
}

// Ambiente climatizado no estado da UI (etapa 3, PMOC). Strings cruas nos campos
// numéricos; `equipment_ids` aponta pros equipamentos do cliente. `id` presente
// só quando o ambiente já está persistido (edição). `key` é estável pra React.
interface EnvRow {
  id?: string;
  key: string;
  identificacao: string;
  tipo_atividade: string;
  area_climatizada_m2: string;
  ocupantes_fixos: string;
  ocupantes_flutuantes: string;
  carga_termica_tr: string;
  equipment_ids: string[];
}

let envKeySeq = 0;
function newEnvRow(): EnvRow {
  envKeySeq += 1;
  return {
    key: `env-${Date.now()}-${envKeySeq}`,
    identificacao: '',
    tipo_atividade: '',
    area_climatizada_m2: '',
    ocupantes_fixos: '',
    ocupantes_flutuantes: '',
    carga_termica_tr: '',
    equipment_ids: [],
  };
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
  const { activities: catalogActivities, groups: catalogGroups, defaultSectionActivities, isLoading: catalogLoading } = usePmocActivityCatalog();
  const { toast } = useToast();

  const isEditing = !!editContract;

  const [step, setStep] = useState(0);
  // Etapa mais avançada já visitada — libera o clique direto no cabeçalho do
  // wizard pra navegar livremente (ida e volta) entre etapas já alcançadas, sem
  // pular uma etapa obrigatória ainda não preenchida (item 5 do lote PMOC).
  const [maxStepReached, setMaxStepReached] = useState(0);
  // PMOC organiza a etapa 3 por ambientes; comum mantém a lista flat. (isPmoc é
  // declarado mais abaixo; STEPS é derivado num useMemo após isPmoc existir.)
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
  // Seleção dos checklists PERSONALIZADOS (form_templates) no modal aberto, por
  // máquina. Gerenciada à parte da seleção do catálogo da norma.
  const [pickerTemplateSelection, setPickerTemplateSelection] = useState<Set<string>>(new Set());
  // Guarda contra re-empurrar o plano padrão PMOC mais de uma vez por abertura.
  const [pmocDefaultSeeded, setPmocDefaultSeeded] = useState(false);
  // Controle EXPLÍCITO do padrão PMOC da norma (substitui a auto-carga silenciosa).
  //  - pmocStandardOn: o plano recebe as atividades do catálogo (default ON num PMOC novo).
  //  - pmocStandardScope: 'ac' = só condicionadores (~41) | 'all' = toda a norma (~149).
  const [pmocStandardOn, setPmocStandardOn] = useState(true);
  const [pmocStandardScope, setPmocStandardScope] = useState<'ac' | 'all'>('ac');
  // "Opções avançadas — serviços com frequência própria": recolhido por padrão
  // pra não competir com o caminho principal (cadência mensal pelo plano).
  const [showAdvancedFrequency, setShowAdvancedFrequency] = useState(false);

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
  // Identificação da UNIDADE (Seção 1 da Planilha PMOC). 1 contrato = 1 loja/site;
  // a unidade pode ter endereço PRÓPRIO (≠ do cliente/proprietário). Pré-preenche
  // do cliente quando vazio; rede com várias lojas edita. Só em contrato PMOC.
  const [unidadeNome, setUnidadeNome] = useState('');
  const [unidadeEndereco, setUnidadeEndereco] = useState('');
  const [unidadeNumero, setUnidadeNumero] = useState('');
  const [unidadeComplemento, setUnidadeComplemento] = useState('');
  const [unidadeBairro, setUnidadeBairro] = useState('');
  const [unidadeCidade, setUnidadeCidade] = useState('');
  const [unidadeUf, setUnidadeUf] = useState('');
  const [unidadeCep, setUnidadeCep] = useState('');
  const [showPmocOffConfirm, setShowPmocOffConfirm] = useState(false);
  // Quick-create RT (Onda UI-1.2): botão "+" abre dialog nested.
  const [showQuickCreateRT, setShowQuickCreateRT] = useState(false);
  // Ambientes climatizados (multi-ambiente PMOC). Cada ambiente carrega os 6
  // campos da Seção 4 (strings cruas, parseadas no submit) + a lista de
  // equipamentos do cliente que pertencem a ele. Um equipamento pertence a UM
  // ambiente (exclusivo entre ambientes). Só aparece quando o contrato é PMOC.
  const [environments, setEnvironments] = useState<EnvRow[]>([]);
  // Accordion dos AMBIENTES: só um aberto por vez (item 2). Guarda a key do
  // ambiente expandido; null = todos fechados.
  const [openEnvKey, setOpenEnvKey] = useState<string | null>(null);
  // Accordion da CONFIG por equipamento dentro do ambiente aberto: só um painel
  // de máquina expandido por vez (item 2). Guarda o equipment_id aberto.
  const [openMachineEqId, setOpenMachineEqId] = useState<string | null>(null);
  // Busca por equipamento dentro de cada ambiente (item 2). Chave = env.key.
  const [envEquipSearch, setEnvEquipSearch] = useState<Record<string, string>>({});
  // Rotina POR MÁQUINA (Fase 3). Chave = equipment_id. Cada máquina selecionada
  // num ambiente tem escopo da norma + posição inicial no ciclo de 12 visitas +
  // sua listagem própria de atividades (checklists). Defaults bons: 'ac' /
  // começa na 12 (anual) / segue a norma do escopo. Só usado em PMOC.
  const [machineConfigs, setMachineConfigs] = useState<Record<string, MachineConfig>>({});
  // Em edição, marca que as configs por máquina já foram reconstruídas do banco
  // (evita o auto-sync sobrescrever com defaults antes de carregar o salvo).
  const [machineConfigsLoaded, setMachineConfigsLoaded] = useState(false);
  // Em edição, marca que os AMBIENTES já foram reconstruídos do banco. Sem isso,
  // o `refetchOnWindowFocus`/`refetchOnMount` do contrato troca a referência de
  // `editContract` e o efeito reconstruiria os ambientes a cada foco — apagando
  // o que o gestor digitou (carga térmica, ocupantes…) e/ou voltando ao salvo.
  // Reconstrói só na 1ª vez que o contrato chega com os dados.
  const [environmentsLoaded, setEnvironmentsLoaded] = useState(false);
  // Picker do catálogo POR MÁQUINA: quando aberto a partir de um equipamento,
  // guarda o equipment_id alvo; ao confirmar, a seleção vira a listagem daquela
  // máquina. `null` = picker do modo personalizado por contrato (legado).
  const [pickerMachineEqId, setPickerMachineEqId] = useState<string | null>(null);
  // Escopo da máquina cujo picker está aberto — filtra as seções exibidas (item 1).
  const [pickerMachineScope, setPickerMachineScope] = useState<PmocMachineScope | null>(null);
  // Em modo edição, guarda a chamada que ficou esperando confirmação do "desligar PMOC".
  const initialIsPmocRef = useState<{ value: boolean }>({ value: false })[0];

  const { equipment, createEquipment } = useEquipment(customerId || undefined);
  const { categories: equipmentCategories } = useEquipmentCategories();
  const activeEquipment = equipment.filter(eq => eq.status === 'active');

  // Quick-create de equipamento dentro de um ambiente (PMOC). Guarda a KEY do
  // ambiente que disparou o cadastro pra, no sucesso, marcar o novo equipamento
  // exatamente naquele ambiente.
  const [showQuickEquip, setShowQuickEquip] = useState(false);
  const [quickEquipEnvKey, setQuickEquipEnvKey] = useState<string | null>(null);

  // Abre o EquipmentFormDialog travado no cliente do contrato, lembrando o ambiente.
  const openQuickEquip = (envKey: string) => {
    setQuickEquipEnvKey(envKey);
    setShowQuickEquip(true);
  };

  // Cliente do contrato como lista de 1 — trava a seleção no EquipmentFormDialog.
  const contractCustomerAsList = useMemo(
    () => customers.filter(c => c.id === customerId),
    [customers, customerId],
  );

  // Wizard dinâmico: PMOC tem 6 etapas (info → unit → items → frequency → team →
  // review); comum tem 5 (info → items → frequency → team → review). O conteúdo é
  // renderizado pela KEY do step atual (nunca por índice numérico) pra não dar
  // drift quando o PMOC liga/desliga.
  const STEPS = isPmoc ? STEPS_PMOC : STEPS_COMMON;
  const currentStepKey = STEPS[step]?.key ?? 'info';

  // Ligar/desligar PMOC muda a contagem de etapas (5 ↔ 6). Se o índice atual
  // estourar o novo array, recua pra última etapa válida (evita tela em branco).
  useEffect(() => {
    if (step > STEPS.length - 1) setStep(STEPS.length - 1);
  }, [STEPS.length, step]);

  // Mantém o "mais avançado já visitado" sempre ≥ etapa atual.
  useEffect(() => {
    setMaxStepReached(prev => (step > prev ? step : prev));
  }, [step]);

  // Em edição, todas as etapas já estão preenchidas (o contrato existe) → libera
  // navegação livre por todas elas desde o início.
  useEffect(() => {
    if (open && isEditing) setMaxStepReached(STEPS.length - 1);
  }, [open, isEditing, STEPS.length]);

  // Ao chegar na etapa Ambientes sem nenhum ambiente aberto, expande o primeiro
  // (accordion single-open) pra o gestor já ver os dados/equipamentos.
  useEffect(() => {
    if (open && currentStepKey === 'items' && isPmoc && environments.length > 0 && openEnvKey === null) {
      setOpenEnvKey(environments[0].key);
    }
  }, [open, currentStepKey, isPmoc, environments, openEnvKey]);

  // Navega para a etapa `target` clicando no cabeçalho. Permite ir a qualquer
  // etapa já visitada (≤ maxStepReached). Avançar para uma etapa nova só é
  // liberado quando a etapa atual está válida (canNext) — não pula obrigatória.
  const goToStep = (target: number) => {
    if (target === step) return;
    if (target <= maxStepReached) { setStep(target); return; }
    if (target === step + 1 && canNext()) setStep(target);
  };

  // Rascunho (só em CRIAÇÃO). Persiste TODO o estado de preenchimento das etapas
  // em sessionStorage e, ao reabrir com rascunho salvo, oferece o DraftResumeDialog.
  // Espelha o padrão do QuoteFormDialog (useFormDraft + DraftResumeDialog). Agora
  // o rascunho cobre também a Unidade & RT, os Ambientes (com equipamentos), os
  // itens do contrato comum e a config POR MÁQUINA (Fase 3 — escopo/começa-na-
  // visita/checklists), pra não perder o trabalho ao fechar/recarregar o modal.
  type ContractDraft = {
    name: string; customerId: string; serviceTypeId: string; formTemplateId: string;
    notes: string; isActive: boolean; isPmoc: boolean; responsibleTechnicianId: string;
    freqType: 'months' | 'days'; freqValue: number; startDate: string; horizonMonths: number;
    // Etapa atual (restaura onde parou).
    step: number;
    // Unidade & RT (Seção 1, só PMOC).
    unidadeNome: string; unidadeEndereco: string; unidadeNumero: string;
    unidadeComplemento: string; unidadeBairro: string; unidadeCidade: string;
    unidadeUf: string; unidadeCep: string;
    // Ambientes (PMOC) — strings cruas + equipamentos por ambiente.
    environments: EnvRow[];
    // Itens do contrato comum (não-PMOC).
    selectedItems: { equipment_id?: string; item_name: string; item_description?: string; form_template_id?: string }[];
    // Config por máquina (Fase 3). Guarda a config inteira: escopo, fase, flag
    // de personalização e a listagem de atividades reidratável.
    machineConfigs: Record<string, MachineConfig>;
  };
  const draft = useFormDraft<ContractDraft>({
    key: 'contract-form',
    isOpen: open,
    isEditing,
    // Campos com default não-vazio (que não representam preenchimento real do
    // usuário) são ignorados na detecção de "tem rascunho" — evita falso prompt
    // num form recém-aberto. step/arrays vazios também não contam.
    ignoreKeys: [
      'isActive', 'freqType', 'freqValue', 'startDate', 'horizonMonths', 'step',
      'unidadeNome', 'unidadeEndereco', 'unidadeNumero', 'unidadeComplemento',
      'unidadeBairro', 'unidadeCidade', 'unidadeUf', 'unidadeCep',
    ],
  });

  // Persiste a cada mudança (só criação, e não enquanto o prompt de retomar está aberto).
  useEffect(() => {
    if (open && !isEditing && !draft.showResumePrompt) {
      draft.saveDraft({
        name, customerId, serviceTypeId, formTemplateId, notes, isActive, isPmoc,
        responsibleTechnicianId, freqType, freqValue, startDate, horizonMonths, step,
        unidadeNome, unidadeEndereco, unidadeNumero, unidadeComplemento,
        unidadeBairro, unidadeCidade, unidadeUf, unidadeCep,
        environments, selectedItems, machineConfigs,
      });
    }
  }, [name, customerId, serviceTypeId, formTemplateId, notes, isActive, isPmoc, responsibleTechnicianId, freqType, freqValue, startDate, horizonMonths, step, unidadeNome, unidadeEndereco, unidadeNumero, unidadeComplemento, unidadeBairro, unidadeCidade, unidadeUf, unidadeCep, environments, selectedItems, machineConfigs, open, isEditing, draft.showResumePrompt]);

  const applyContractDraft = (d: ContractDraft) => {
    setName(d.name || '');
    setCustomerId(d.customerId || '');
    setServiceTypeId(d.serviceTypeId || '');
    setFormTemplateId(d.formTemplateId || '');
    setNotes(d.notes || '');
    setIsActive(d.isActive !== false);
    setIsPmoc(!!d.isPmoc);
    setResponsibleTechnicianId(d.responsibleTechnicianId || '');
    setFreqType(d.freqType || 'months');
    setFreqValue(d.freqValue || 1);
    setStartDate(d.startDate || format(new Date(), 'yyyy-MM-dd'));
    setHorizonMonths(d.horizonMonths || 12);
    // Unidade & RT.
    setUnidadeNome(d.unidadeNome || '');
    setUnidadeEndereco(d.unidadeEndereco || '');
    setUnidadeNumero(d.unidadeNumero || '');
    setUnidadeComplemento(d.unidadeComplemento || '');
    setUnidadeBairro(d.unidadeBairro || '');
    setUnidadeCidade(d.unidadeCidade || '');
    setUnidadeUf(d.unidadeUf || '');
    setUnidadeCep(d.unidadeCep || '');
    // Ambientes — regenera a `key` (estável p/ React, mas não precisa sobreviver)
    // preservando o resto. Sem `id` (rascunho é sempre contrato novo).
    const restoredEnvs: EnvRow[] = (d.environments || []).map((e) => {
      envKeySeq += 1;
      return {
        key: `env-${Date.now()}-${envKeySeq}`,
        identificacao: e.identificacao || '',
        tipo_atividade: e.tipo_atividade || '',
        area_climatizada_m2: e.area_climatizada_m2 || '',
        ocupantes_fixos: e.ocupantes_fixos || '',
        ocupantes_flutuantes: e.ocupantes_flutuantes || '',
        carga_termica_tr: e.carga_termica_tr || '',
        equipment_ids: Array.isArray(e.equipment_ids) ? e.equipment_ids : [],
      };
    });
    setEnvironments(restoredEnvs);
    // Itens do contrato comum.
    setSelectedItems(Array.isArray(d.selectedItems) ? d.selectedItems : []);
    // Config por máquina (Fase 3) — restaura ANTES do auto-sync poder rodar e
    // marca o guard pra que o efeito de auto-sync (que cria defaults) NÃO
    // sobrescreva os configs restaurados; ele só ADICIONA default p/ equipamento
    // novo sem config.
    const restoredConfigs = (d.machineConfigs && typeof d.machineConfigs === 'object')
      ? d.machineConfigs
      : {};
    setMachineConfigs(restoredConfigs);
    setMachineConfigsLoaded(true);
    // Restaura a etapa onde parou (clampa pro range válido — depende de isPmoc).
    const stepsLen = (d.isPmoc ? STEPS_PMOC : STEPS_COMMON).length;
    setStep(Math.min(Math.max(d.step ?? 0, 0), stepsLen - 1));
  };

  useEffect(() => {
    if (!open) {
      setStep(0);
      setMaxStepReached(0);
      setItemSearch(''); setShowManualItem(false); setManualName(''); setManualDesc('');
      setShowCatalogPicker(false); setPickerSelection(new Set()); setPickerTemplateSelection(new Set()); setPmocDefaultSeeded(false);
      setPmocStandardOn(true); setPmocStandardScope('ac'); setShowAdvancedFrequency(false);
      setMachineConfigs({}); setMachineConfigsLoaded(false); setPickerMachineEqId(null);
      setOpenEnvKey(null); setOpenMachineEqId(null); setEnvEquipSearch({});
      setEnvironmentsLoaded(false);
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
          (team.members ?? []).forEach(m => {
            if (m?.user_id && !editUserIds.includes(m.user_id)) editUserIds.push(m.user_id);
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
      // Identificação da unidade (Seção 1) — carrega os valores salvos.
      setUnidadeNome(editContract.unidade_nome || '');
      setUnidadeEndereco(editContract.unidade_endereco || '');
      setUnidadeNumero(editContract.unidade_numero || '');
      setUnidadeComplemento(editContract.unidade_complemento || '');
      setUnidadeBairro(editContract.unidade_bairro || '');
      setUnidadeCidade(editContract.unidade_cidade || '');
      setUnidadeUf(editContract.unidade_uf || '');
      setUnidadeCep(editContract.unidade_cep || '');
      initialIsPmocRef.value = editIsPmoc;
      // Ambientes climatizados (multi-ambiente). Reconstrói os cards a partir de
      // contract_environments + agrupa os equipamentos por environment_id (lido
      // dos contract_items), incluindo TODOS os campos da Seção 4 (carga térmica,
      // ocupantes fixos/flutuantes, área). Ambiente sem nenhum equipamento volta
      // vazio.
      //
      // Bug fix (item 7): a reconstrução acontece UMA vez por abertura (guard
      // environmentsLoaded). Antes, o contrato é refeito a cada foco da janela
      // (refetchOnWindowFocus/refetchOnMount no useContractDetail), trocando a
      // referência de `editContract` e re-disparando este efeito — o que
      // reescrevia os ambientes (apagando o que o gestor estava digitando, ou
      // voltando ao valor salvo). Com o guard, os campos vêm preenchidos do banco
      // na abertura e ficam estáveis durante a edição.
      if (!environmentsLoaded) {
        const envRows: EnvRow[] = ((editContract.contract_environments || []) as any[])
          .slice()
          .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
          .map((e) => {
            envKeySeq += 1;
            const eqIds = ((editContract.contract_items || []) as any[])
              .filter((it) => it.environment_id === e.id && it.equipment_id)
              .map((it) => it.equipment_id as string);
            return {
              id: e.id,
              key: `env-${e.id}`,
              identificacao: e.identificacao || '',
              tipo_atividade: e.tipo_atividade || '',
              area_climatizada_m2: numToStrBR(e.area_climatizada_m2),
              ocupantes_fixos: numToStrBR(e.ocupantes_fixos),
              ocupantes_flutuantes: numToStrBR(e.ocupantes_flutuantes),
              carga_termica_tr: numToStrBR(e.carga_termica_tr),
              equipment_ids: eqIds,
            };
          });
        // Só marca como carregado quando o contrato já trouxe os ambientes (a
        // 1ª passagem pode chegar antes da relação resolver). Ambiente PMOC sem
        // nenhum ambiente persistido também conclui (array vazio é resposta final).
        setEnvironments(envRows);
        if ((editContract.contract_environments || []).length > 0 || editContract.id) {
          setEnvironmentsLoaded(true);
        }
      }
    } else {
      setName(''); setCustomerId(defaultCustomerId || ''); setSelectedUserIds([]); setSelectedTeamIds([]);
      setBillingUserIds([]); setBillingTeamIds([]); setServiceTypeId('');
      setFormTemplateId(''); setNotes(''); setIsActive(true);
      setFreqType('months'); setFreqValue(1); setStartDate(format(new Date(), 'yyyy-MM-dd')); setHorizonMonths(12);
      setPlanActivities([]); setInitialPlanSig(''); setNewActivityDesc(''); setNewActivityFreq('M');
      // Contrato novo: padrão da norma LIGADO, escopo só ar-condicionado (default).
      setPmocStandardOn(true); setPmocStandardScope('ac');
      setSelectedItems([]);
      setEnvironments([]);
      // Default: contrato comum.
      setIsPmoc(false);
      setResponsibleTechnicianId('');
      // Identificação da unidade — vazia (pré-preenche do cliente via efeito).
      setUnidadeNome(''); setUnidadeEndereco(''); setUnidadeNumero('');
      setUnidadeComplemento(''); setUnidadeBairro(''); setUnidadeCidade('');
      setUnidadeUf(''); setUnidadeCep('');
      initialIsPmocRef.value = false;
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
      guidance: r.guidance ?? null,
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
    // Reflete (sem re-empurrar) o estado do controle de padrão a partir do que
    // já está salvo: se há linhas do catálogo, o toggle aparece LIGADO; o escopo
    // é inferido (alguma seção fora de condicionadores → "Tudo da norma").
    const catalogRows = rows.filter(r => !!r.catalog_activity_id);
    setPmocStandardOn(catalogRows.length > 0);
    const hasNonCondicionadores = catalogRows.some(r => r.section && r.section !== PMOC_DEFAULT_SECTION);
    setPmocStandardScope(hasNonCondicionadores ? 'all' : 'ac');
  }, [open, editContract, existingPlan]);

  // Reconstrói as configs POR MÁQUINA (Fase 3) ao abrir um PMOC existente:
  //  - escopo/fase de cada máquina vêm de contract_items (pmoc_scope/pmoc_start_visit);
  //  - a listagem própria vem das contract_plan_activities agrupadas por
  //    contract_item_id (→ equipment_id);
  //  - LEGADO (plano sem contract_item_id): cada máquina recebe a config default
  //    da norma (escopo inferido pelas seções; start 12 = tudo na 1ª visita) →
  //    ao salvar migra pro formato por máquina SEM regredir as visitas.
  useEffect(() => {
    if (!open || !editContract || !isPmoc) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    if (existingPlan === undefined) return; // espera a query do plano resolver
    if (machineConfigsLoaded) return;

    // Reconstrução via fonte ÚNICA compartilhada (mesma lógica usada pela aba).
    const configs = reconstructMachineConfigs({
      items: (editContract.contract_items || []) as any[],
      plan: (existingPlan ?? []) as any[],
      catalogActivities,
    });
    setMachineConfigs(configs);
    setMachineConfigsLoaded(true);
  }, [open, editContract, isPmoc, existingPlan, catalogLoading, catalogActivities.length, machineConfigsLoaded]);

  const customerOptions = useMemo(() =>
    customers.map(c => ({ value: c.id, label: c.name, sublabel: c.document || c.email || undefined })),
    [customers]
  );

  const occurrences = useMemo(() =>
    generateOccurrences(new Date(startDate + 'T00:00:00'), freqType, freqValue, horizonMonths),
    [startDate, freqType, freqValue, horizonMonths]
  );


  const weekendDates = occurrences.filter(d => d.getDay() === 0 || d.getDay() === 6);

  const addPlanActivity = () => {
    const desc = newActivityDesc.trim();
    if (!desc) return;
    setPlanActivities(prev => [...prev, { description: desc, freq_code: newActivityFreq }]);
    setNewActivityDesc('');
    setNewActivityFreq('M');
  };

  // Atividades do catálogo correspondentes a cada escopo do padrão PMOC:
  //  - 'ac'  → só a seção condicionadores (split/AC), ~41 atividades.
  //  - 'all' → toda a norma (todas as seções), ~149 atividades.
  const standardScopeActivities = (scope: 'ac' | 'all'): PmocCatalogActivity[] =>
    scope === 'all' ? catalogActivities : defaultSectionActivities;

  // Aplica o padrão da norma (escopo dado) ao plano, SUBSTITUINDO apenas as
  // linhas vindas do catálogo e PRESERVANDO as linhas manuais (sem
  // catalog_activity_id). Dedup por catalog_activity_id evita duplicar.
  const applyStandardPlan = (scope: 'ac' | 'all') => {
    setPlanActivities(prev => {
      const manual = prev.filter(a => !a.catalog_activity_id);
      const seen = new Set<string>();
      const catalogRows: PlanActivityRow[] = [];
      for (const act of standardScopeActivities(scope)) {
        if (seen.has(act.id)) continue;
        seen.add(act.id);
        catalogRows.push(catalogToPlanRow(act));
      }
      return [...catalogRows, ...manual];
    });
  };

  // Remove do plano as linhas vindas do catálogo, mantendo as manuais.
  const removeStandardPlan = () => {
    setPlanActivities(prev => prev.filter(a => !a.catalog_activity_id));
  };

  // Liga/desliga o padrão da norma (Switch explícito). Desligar remove as linhas
  // do catálogo; religar recarrega o escopo selecionado.
  const handleStandardToggle = (on: boolean) => {
    setPmocStandardOn(on);
    if (on) applyStandardPlan(pmocStandardScope);
    else removeStandardPlan();
  };

  // Troca o escopo (LabeledSwitch). Substitui as linhas do catálogo pelas do
  // novo escopo; manuais ficam.
  const handleStandardScope = (scope: 'ac' | 'all') => {
    setPmocStandardScope(scope);
    if (pmocStandardOn) applyStandardPlan(scope);
  };

  // Seed inicial do padrão da norma num contrato PMOC NOVO. Substitui a antiga
  // auto-carga silenciosa: agora o estado inicial vem do Switch (default ON) +
  // escopo (default 'ac'). Guards:
  //  - só em contrato novo (edição reflete o plano salvo, nunca re-empurra);
  //  - só PMOC, com o padrão ligado, catálogo carregado;
  //  - `pmocDefaultSeeded` impede re-empurrar na mesma abertura (ex: gestor que
  //    apagou tudo de propósito não vê reaparecer).
  // Fase 3: o plano PMOC agora é POR MÁQUINA (montado em machineConfigs na etapa
  // Ambientes), então NÃO seedamos mais o planActivities por contrato em PMOC. O
  // seed só vale pra eventual uso futuro do modo manual em contrato comum — aqui
  // fica desativado pra PMOC pra não criar plano-fantasma a nível de contrato.
  useEffect(() => {
    if (!open || isEditing) return; // só em contrato novo; edição não re-empurra
    if (isPmoc) return; // PMOC usa plano por máquina (Fase 3)
    if (!pmocStandardOn || pmocDefaultSeeded) return;
    if (catalogLoading || defaultSectionActivities.length === 0) return;
    applyStandardPlan(pmocStandardScope);
    setPmocDefaultSeeded(true);
  }, [open, isEditing, isPmoc, pmocStandardOn, pmocStandardScope, pmocDefaultSeeded, catalogLoading, defaultSectionActivities.length, catalogActivities.length]);

  // Pré-preenche a Identificação da Unidade (Seção 1) a partir do CLIENTE
  // selecionado quando os campos ainda estão vazios. Caso "1 cliente = 1 loja"
  // funciona sem digitar nada; o usuário pode sobrescrever (rede com várias
  // lojas). Só auto-preenche o campo que está vazio — nunca apaga edição manual.
  // Só em PMOC (a Seção 1 só existe nesse caso).
  useEffect(() => {
    if (!open || !isPmoc || !customerId) return;
    const cust = customers.find(c => c.id === customerId) as any;
    if (!cust) return;
    setUnidadeNome(prev => prev.trim() ? prev : (cust.name || name || ''));
    setUnidadeEndereco(prev => prev.trim() ? prev : (cust.address || ''));
    setUnidadeNumero(prev => prev.trim() ? prev : (cust.address_number || ''));
    setUnidadeComplemento(prev => prev.trim() ? prev : (cust.complement || ''));
    setUnidadeBairro(prev => prev.trim() ? prev : (cust.neighborhood || ''));
    setUnidadeCidade(prev => prev.trim() ? prev : (cust.city || ''));
    setUnidadeUf(prev => prev.trim() ? prev : (cust.state || ''));
    setUnidadeCep(prev => prev.trim() ? prev : (cust.zip_code || ''));
  }, [open, isPmoc, customerId, customers, name]);

  // Abre o picker do catálogo já com as linhas vindas do catálogo pré-marcadas
  // (evita duplicar uma atividade que o gestor já adicionou).
  const openCatalogPicker = () => {
    setPickerMachineEqId(null);
    setPickerMachineScope(null);
    const existingCatalogIds = new Set(
      planActivities.map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    setPickerSelection(existingCatalogIds);
    setShowCatalogPicker(true);
  };

  // Picker POR MÁQUINA (Fase 3): abre o catálogo já marcado com a listagem atual
  // daquela máquina. Ao confirmar, a seleção SUBSTITUI a listagem da máquina
  // (permite remover/customizar — não seguir 100% da norma).
  const openMachinePicker = (eqId: string) => {
    setPickerMachineEqId(eqId);
    const cfg = machineConfigs[eqId];
    setPickerMachineScope(cfg?.scope ?? 'ac');
    const current = new Set(
      (cfg?.activities ?? []).map(a => a.catalog_activity_id).filter(Boolean) as string[],
    );
    setPickerSelection(current);
    setPickerTemplateSelection(new Set(cfg?.customTemplateIds ?? []));
    setShowCatalogPicker(true);
  };

  // Confirma o picker. Dois modos:
  //  - POR MÁQUINA (pickerMachineEqId definido): a seleção SUBSTITUI a listagem
  //    daquela máquina (add+remove), marcando-a como personalizada.
  //  - por contrato (legado): só ADICIONA as novas ao planActivities.
  const confirmCatalogPicker = () => {
    if (pickerMachineEqId) {
      const eqId = pickerMachineEqId;
      const selected: PlanActivityRow[] = [];
      for (const group of catalogGroups) {
        for (const act of group.activities) {
          if (pickerSelection.has(act.id)) {
            selected.push({
              ...catalogToPlanRow(act),
              applies_per_equipment: true,
              equipment_ref: eqId,
            });
          }
        }
      }
      const templateIds = [...pickerTemplateSelection];
      setMachineConfigs(prev => {
        const cur = prev[eqId];
        if (!cur) return prev;
        return { ...prev, [eqId]: { ...cur, activities: selected, customized: true, customTemplateIds: templateIds } };
      });
      const total = selected.length + templateIds.length;
      toast({ title: `Checklists da máquina atualizados (${total} item(ns))` });
      setShowCatalogPicker(false);
      setPickerMachineEqId(null);
      return;
    }
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

  // ---- Ambientes climatizados (multi-ambiente PMOC) -------------------------
  // Mapa equipment_id → key do ambiente que o reivindica (exclusividade: um
  // equipamento pertence a UM ambiente). Usado pra desabilitar/realocar no UI.
  const equipmentOwnerEnvKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const env of environments) {
      for (const eqId of env.equipment_ids) map.set(eqId, env.key);
    }
    return map;
  }, [environments]);

  const addEnvironment = () => {
    const row = newEnvRow();
    setEnvironments(prev => [...prev, row]);
    // Abre o ambiente recém-criado (accordion single-open).
    setOpenEnvKey(row.key);
    setOpenMachineEqId(null);
  };

  const removeEnvironment = (key: string) => {
    setEnvironments(prev => prev.filter(e => e.key !== key));
    setOpenEnvKey(prev => (prev === key ? null : prev));
  };

  // Accordion dos ambientes — abre o clicado e fecha os demais (single-open).
  const toggleEnv = (key: string) => {
    setOpenEnvKey(prev => (prev === key ? null : key));
    setOpenMachineEqId(null);
  };

  // Accordion da config por máquina — abre a clicada e fecha as demais.
  const toggleMachine = (eqId: string) => {
    setOpenMachineEqId(prev => (prev === eqId ? null : eqId));
  };

  const updateEnvironmentField = (key: string, field: keyof EnvRow, value: string) => {
    setEnvironments(prev => prev.map(e => e.key === key ? { ...e, [field]: value } : e));
  };

  // Alterna um equipamento dentro de um ambiente. Exclusivo: ao marcar num
  // ambiente, é retirado de qualquer outro que o tivesse (sem duplicar).
  const toggleEnvEquipment = (envKey: string, eqId: string) => {
    setEnvironments(prev => prev.map(e => {
      if (e.key === envKey) {
        const has = e.equipment_ids.includes(eqId);
        return {
          ...e,
          equipment_ids: has
            ? e.equipment_ids.filter(id => id !== eqId)
            : [...e.equipment_ids, eqId],
        };
      }
      // Remove o equipamento de outros ambientes quando está sendo adicionado aqui.
      const ownerKey = equipmentOwnerEnvKey.get(eqId);
      if (ownerKey && ownerKey !== envKey && !prev.find(x => x.key === envKey)?.equipment_ids.includes(eqId)) {
        return { ...e, equipment_ids: e.equipment_ids.filter(id => id !== eqId) };
      }
      return e;
    }));
  };

  // Itens (contract_items) derivados pra um contrato PMOC: 1 item por equipamento
  // atribuído a algum ambiente. Equipamento não atribuído a nenhum ambiente fica
  // de fora (não entra no contrato). Espelha o shape de selectedItems.
  const pmocDerivedItems = useMemo(() => {
    const seen = new Set<string>();
    const out: { equipment_id: string; item_name: string; item_description?: string }[] = [];
    for (const env of environments) {
      for (const eqId of env.equipment_ids) {
        if (seen.has(eqId)) continue;
        seen.add(eqId);
        const eq = activeEquipment.find(e => e.id === eqId) || equipment.find(e => e.id === eqId);
        if (!eq) continue;
        out.push({
          equipment_id: eq.id,
          item_name: eq.name,
          item_description: [eq.brand, eq.model].filter(Boolean).join(' - ') || undefined,
        });
      }
    }
    return out;
  }, [environments, activeEquipment, equipment]);

  // Conjunto de itens/equipamentos efetivo do contrato (vai pro payload `items`).
  // PMOC = derivado dos ambientes; comum = a lista flat de selectedItems.
  const effectiveItems = isPmoc ? pmocDerivedItems : selectedItems;

  // ---- Rotina POR MÁQUINA (Fase 3) ------------------------------------------
  // Config default de uma máquina: delega à fonte ÚNICA compartilhada (escopo
  // dado, começa na 12, listagem = norma do escopo). `equipment_ref` amarra cada
  // atividade ao seu equipamento.
  const buildDefaultMachineConfig = (eqId: string, scope: PmocMachineScope): MachineConfig =>
    buildDefaultMachineConfigShared(catalogActivities, eqId, scope);

  // Mantém os machineConfigs sincronizados com os equipamentos selecionados nos
  // ambientes: cria config default pra máquina nova; remove a da máquina que saiu.
  // Não toca em config existente (preserva escopo/fase/listagem do gestor).
  useEffect(() => {
    if (!open || !isPmoc) return;
    if (catalogLoading || catalogActivities.length === 0) return;
    // Em edição, espera a reconstrução das configs do banco antes de auto-sincar
    // (senão substituiria escopo/fase salvos por defaults).
    if (isEditing && !machineConfigsLoaded) return;
    // Conjunto autoritativo de máquinas = equipamentos atribuídos a algum
    // ambiente. Usamos os equipment_ids dos ambientes (e não pmocDerivedItems)
    // porque a derivação depende dos dados de equipamento já terem carregado;
    // ao retomar um rascunho, os ambientes voltam na hora mas o useEquipment
    // ainda está buscando — basear no equipment_ids evita podar configs
    // restauradas durante essa janela de carga.
    const selectedIds = new Set<string>();
    for (const env of environments) for (const id of env.equipment_ids) selectedIds.add(id);
    setMachineConfigs(prev => {
      let changed = false;
      const next: Record<string, MachineConfig> = {};
      for (const id of selectedIds) {
        if (prev[id]) { next[id] = prev[id]; }
        else { next[id] = buildDefaultMachineConfig(id, 'ac'); changed = true; }
      }
      // Detecta remoção (chave que sumiu).
      for (const id of Object.keys(prev)) if (!selectedIds.has(id)) changed = true;
      return changed ? next : prev;
    });
  }, [open, isPmoc, environments, catalogLoading, catalogActivities.length, isEditing, machineConfigsLoaded]);

  // Troca o escopo de uma máquina: recarrega a listagem da norma do novo escopo
  // (a menos que o gestor já tenha personalizado — aí preserva e só filtra o que
  // ainda cabe no escopo, mantendo a personalização). Para simplicidade e
  // previsibilidade, ao trocar o escopo RECARREGAMOS a norma do escopo novo.
  const setMachineScope = (eqId: string, scope: PmocMachineScope) => {
    setMachineConfigs(prev => {
      const cur = prev[eqId];
      if (!cur) return prev;
      const acts = machineCatalogActivities(catalogActivities, scope).map(a => ({
        ...catalogToPlanRow(a),
        applies_per_equipment: true,
        equipment_ref: eqId,
      }));
      return { ...prev, [eqId]: { ...cur, scope, activities: acts, customized: false } };
    });
  };

  const setMachineStartVisit = (eqId: string, startVisit: number) => {
    setMachineConfigs(prev => {
      const cur = prev[eqId];
      if (!cur) return prev;
      return { ...prev, [eqId]: { ...cur, startVisit } };
    });
  };

  // Há ao menos uma máquina de grande porte ('full')? Gate do bucket local.
  const hasFullMachine = useMemo(
    () => Object.values(machineConfigs).some(c => c.scope === 'full'),
    [machineConfigs],
  );

  // Checklists personalizados do tenant (form_templates ativos, não-pmoc-default)
  // pro picker e pro plano. `templateNameById` rotula a linha de plano custom.
  const customTemplateOptions = useMemo(
    () =>
      (templates ?? [])
        .filter((t: any) => t.is_active && !t.is_pmoc_default)
        .map((t: any) => ({ id: t.id, name: t.name, questionCount: (t.questions ?? []).length })),
    [templates],
  );
  const templateNameById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const t of customTemplateOptions) map[t.id] = t.name;
    return map;
  }, [customTemplateOptions]);

  // Plano completo (por máquina + local) que vai pro hook em PMOC, montado pela
  // fonte ÚNICA compartilhada (mesma usada pela aba Ambientes). Cada atividade de
  // máquina carrega `equipment_ref`; as locais ficam sem máquina + per_equip false.
  // Templates personalizados viram 1 linha por máquina (form_template_id).
  const pmocPlanFromMachines = useMemo<PlanActivityRow[]>(
    () => buildPmocPlanFromMachines({ items: pmocDerivedItems, machineConfigs, catalogActivities, templateNameById }),
    [pmocDerivedItems, machineConfigs, catalogActivities, templateNameById],
  );

  // Plano efetivo enviado ao hook: PMOC = derivado das máquinas (por máquina +
  // local); comum/legado = o planActivities da etapa de frequência.
  const effectivePlanRows = isPmoc ? pmocPlanFromMachines : planActivities;

  // Itens com escopo/fase por máquina (Fase 3). PMOC anexa pmoc_scope +
  // pmoc_start_visit de cada máquina (via builder compartilhado); comum manda só
  // o básico.
  const effectiveItemsWithScope = useMemo(() => {
    if (!isPmoc) {
      return selectedItems.map((i: any) => ({
        equipment_id: i.equipment_id || null,
        item_name: i.item_name,
        item_description: i.item_description || null,
        form_template_id: i.form_template_id || null,
      }));
    }
    return buildPmocItemsWithScope({ items: pmocDerivedItems, machineConfigs });
  }, [isPmoc, selectedItems, pmocDerivedItems, machineConfigs]);

  // Atividades do plano efetivo com frequência válida pra cronograma (exclui
  // eventuais). PMOC usa o plano POR MÁQUINA; comum usa o planActivities.
  const schedulablePlan = useMemo(
    () => effectivePlanRows.filter(a => activityPeriodMonths(a as PlanActivityInput) > 0),
    [effectivePlanRows],
  );
  const usePlanEngine = schedulablePlan.length > 0;

  // Quando há plano, a prévia/contagem de OS vem do motor de visitas agrupadas
  // (1 OS/mês = união do que vence), não da cadência única. Para PMOC, cada
  // máquina pode estar em fase diferente, mas o nº de visitas/mês continua 1.
  const groupedVisits = useMemo(
    () => usePlanEngine
      ? generateGroupedVisits(new Date(startDate + 'T00:00:00'), horizonMonths, schedulablePlan as PlanActivityInput[])
      : [],
    [usePlanEngine, startDate, horizonMonths, schedulablePlan],
  );

  // Nº de OS que será gerado (prévia do botão/Revisão).
  const visitCount = usePlanEngine ? groupedVisits.length : occurrences.length;


  // Ambientes no formato de entrada do hook (parse dos números, equip vazio ok).
  const buildEnvironmentsInput = () => environments.map(e => ({
    id: e.id,
    identificacao: e.identificacao.trim() || null,
    tipo_atividade: e.tipo_atividade.trim() || null,
    area_climatizada_m2: parseDecimalBR(e.area_climatizada_m2),
    ocupantes_fixos: parseIntOrNull(e.ocupantes_fixos),
    ocupantes_flutuantes: parseIntOrNull(e.ocupantes_flutuantes),
    carga_termica_tr: parseDecimalBR(e.carga_termica_tr),
    equipment_ids: e.equipment_ids,
  }));

  const canNext = () => {
    switch (currentStepKey) {
      case 'info':
        // Bloqueio só pra nome + cliente. PMOC sem RT é permitido (warning no submit).
        return !!customerId && !!name;
      case 'unit':
        // Unidade & RT são opcionais (RT pode vir depois; unidade pré-preenche do cliente).
        return true;
      case 'frequency':
        return freqValue > 0 && !!startDate;
      case 'team':
        // Exige ao menos 1 responsável pela execução (técnico OU equipe).
        return (selectedUserIds?.length ?? 0) > 0 || (selectedTeamIds?.length ?? 0) > 0;
      case 'items':
      case 'review':
      default:
        return true;
    }
  };

  // Há ao menos 1 técnico OU equipe executora? (gate da etapa Equipe + submit).
  const hasExecutor = (selectedUserIds?.length ?? 0) > 0 || (selectedTeamIds?.length ?? 0) > 0;

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
      // Com plano de serviços, o checklist vem das atividades por equipamento —
      // não duplicar com um checklist padrão de contrato.
      form_template_id: usePlanEngine ? null : (formTemplateId || null),
      status: isActive ? 'active' : 'paused',
      notes: notes || null,
      frequency_type: freqType,
      frequency_value: freqValue,
      start_date: startDate,
      horizon_months: horizonMonths,
      billing_responsible_ids: billingUserIds,
      // Plano de serviços com frequência (Fase 1/2/3). PMOC = plano POR MÁQUINA
      // (cada atividade com equipment_ref + as locais); comum = planActivities.
      // O hook resolve contract_item_id pelo equipment_ref.
      plan_activities: effectivePlanRows.map(planRowToInput),
      // Equipamentos/itens (Fase 3). Sempre enviado em edição → o hook aplica
      // diff (insere novos, apaga removidos) e RE-APLICA escopo/fase por máquina;
      // mudança re-expande as visitas. PMOC = derivado dos ambientes c/ escopo+fase.
      items: effectiveItemsWithScope,
      // Ambientes climatizados (multi-ambiente PMOC). PMOC envia os cards;
      // contrato comum envia [] (limpa qualquer ambiente legado e zera
      // environment_id dos itens).
      environments: isPmoc ? buildEnvironmentsInput() : [],
      // PMOC (Onda A)
      is_pmoc: isPmoc,
      responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
      // Identificação da unidade (Seção 1 da Planilha). Só grava em PMOC.
      unidade_nome: isPmoc ? (unidadeNome.trim() || null) : null,
      unidade_endereco: isPmoc ? (unidadeEndereco.trim() || null) : null,
      unidade_numero: isPmoc ? (unidadeNumero.trim() || null) : null,
      unidade_complemento: isPmoc ? (unidadeComplemento.trim() || null) : null,
      unidade_bairro: isPmoc ? (unidadeBairro.trim() || null) : null,
      unidade_cidade: isPmoc ? (unidadeCidade.trim() || null) : null,
      unidade_uf: isPmoc ? (unidadeUf.trim() || null) : null,
      unidade_cep: isPmoc ? (unidadeCep.trim() || null) : null,
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
    // Defesa em profundidade: nunca salvar sem responsável pela execução.
    if (!hasExecutor) {
      toast({
        variant: 'destructive',
        title: 'Sem responsável pela execução',
        description: 'Selecione ao menos 1 técnico ou equipe para executar o contrato.',
      });
      setStep(STEPS.findIndex(s => s.key === 'team'));
      return;
    }
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
        const currentItemsSig = effectiveItems.map((it: any) => itemKey(it)).sort().join('§');
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
          // Com plano de serviços, o checklist vem das atividades por equipamento.
          form_template_id: usePlanEngine ? null : (formTemplateId || null),
          status: isActive ? 'active' : 'paused',
          notes: notes || null,
          frequency_type: freqType,
          frequency_value: freqValue,
          start_date: startDate,
          horizon_months: horizonMonths,
          // PMOC (Onda A). RT vai vazio quando o usuário ainda não escolheu.
          is_pmoc: isPmoc,
          responsible_technician_id: isPmoc ? (responsibleTechnicianId || null) : null,
          // Identificação da unidade (Seção 1 da Planilha). Só faz sentido em PMOC.
          unidade_nome: isPmoc ? (unidadeNome.trim() || null) : null,
          unidade_endereco: isPmoc ? (unidadeEndereco.trim() || null) : null,
          unidade_numero: isPmoc ? (unidadeNumero.trim() || null) : null,
          unidade_complemento: isPmoc ? (unidadeComplemento.trim() || null) : null,
          unidade_bairro: isPmoc ? (unidadeBairro.trim() || null) : null,
          unidade_cidade: isPmoc ? (unidadeCidade.trim() || null) : null,
          unidade_uf: isPmoc ? (unidadeUf.trim() || null) : null,
          unidade_cep: isPmoc ? (unidadeCep.trim() || null) : null,
          // Itens do contrato: PMOC = derivados dos ambientes com escopo+fase por
          // máquina (Fase 3); comum = lista flat.
          items: effectiveItemsWithScope,
          // Ambientes climatizados (multi-ambiente PMOC). Cada ambiente vira uma
          // linha em contract_environments e amarra seus equipamentos.
          environments: isPmoc ? buildEnvironmentsInput() : undefined,
          // Plano de serviços com frequência (Fase 1/2/3). PMOC = plano POR MÁQUINA
          // (cada atividade com equipment_ref; o hook resolve contract_item_id após
          // inserir os itens). Comum = planActivities. Vazio = frequência única.
          plan_activities: effectivePlanRows.map(planRowToInput),
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
        // Criou com sucesso → descarta o rascunho persistido.
        draft.clearDraft();
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

  // Toggle PMOC — fica no TOPO da etapa Informações (logo após o Cliente). É onde
  // se decide se o contrato é PMOC. Os detalhes (RT, unidade, badge legal) migraram
  // pra etapa dedicada "Unidade & RT".
  const pmocToggleSection = (
    <div className="rounded-lg border p-3">
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
            if (!v) {
              setResponsibleTechnicianId('');
              // Tipo de Serviço não se aplica a PMOC; ao desligar, mantém o que houver.
            } else {
              // Ligar PMOC: o Tipo de Serviço some (quem manda é o plano/catálogo da
              // norma). Limpa pra não enviar valor obsoleto no submit.
              setServiceTypeId('');
            }
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
    </div>
  );

  // Bloco da etapa "Unidade & RT" (só PMOC): Responsável Técnico, Identificação da
  // Unidade (Seção 1) e o badge/alerta legal. Migrado da etapa Informações pra
  // desafogá-la.
  const pmocUnitSection = (
    <div className="space-y-4">
        <div className="space-y-3">
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

          {/* Identificação da Unidade (Seção 1 da Planilha PMOC). 1 contrato =
              1 unidade (loja/site), que pode ter endereço próprio — diferente do
              cliente/proprietário. Pré-preenchido do cliente; rede com várias
              lojas edita aqui. */}
          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <div>
              <Label className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-info shrink-0" />
                Identificação da Unidade
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Endereço do ambiente climatizado deste contrato (a loja/site). Pode
                ser diferente do endereço do cliente. Pré-preenchido a partir do
                cliente — ajuste se a unidade tiver endereço próprio.
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Nome da unidade / local</Label>
              <Input
                value={unidadeNome}
                onChange={e => setUnidadeNome(e.target.value)}
                placeholder="Ex: Loja Centro, Galpão 2…"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
              <div className="space-y-2">
                <Label className="text-xs">Endereço (logradouro)</Label>
                <Input
                  value={unidadeEndereco}
                  onChange={e => setUnidadeEndereco(e.target.value)}
                  placeholder="Rua / Avenida"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Número</Label>
                <Input
                  value={unidadeNumero}
                  onChange={e => setUnidadeNumero(e.target.value)}
                  placeholder="Nº"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Complemento</Label>
              <Input
                value={unidadeComplemento}
                onChange={e => setUnidadeComplemento(e.target.value)}
                placeholder="Sala, andar, bloco…"
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs">Bairro</Label>
                <Input
                  value={unidadeBairro}
                  onChange={e => setUnidadeBairro(e.target.value)}
                  placeholder="Bairro"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">CEP</Label>
                <Input
                  value={unidadeCep}
                  onChange={e => setUnidadeCep(e.target.value)}
                  placeholder="00000-000"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-[1fr_100px]">
              <div className="space-y-2">
                <Label className="text-xs">Cidade</Label>
                <Input
                  value={unidadeCidade}
                  onChange={e => setUnidadeCidade(e.target.value)}
                  placeholder="Cidade"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">UF</Label>
                <Input
                  value={unidadeUf}
                  onChange={e => setUnidadeUf(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="UF"
                  maxLength={2}
                />
              </div>
            </div>
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

          {/* A caracterização do ambiente climatizado (Seção 4) migrou para a
              etapa "Ambientes", onde cada ambiente tem seus próprios dados e
              equipamentos. */}
        </div>
    </div>
  );

  // Conteúdo do wizard (stepper + etapas). Renderizado dentro do ResponsiveModal,
  // cujo footer recebe a navegação Voltar/Próximo/Criar separadamente.
  const wizardContent = (
    <div className="flex flex-col">
        {/* Stepper */}
        <div className="space-y-3">
          <Progress value={progressPercent} className="h-1.5" />
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => {
              // Clicável quando já visitada (≤ maxStepReached) ou é a próxima e a
              // atual está válida. As demais ficam travadas (não pula obrigatória).
              const clickable = i <= maxStepReached || (i === step + 1 && canNext());
              return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  aria-current={i === step ? 'step' : undefined}
                  className={cn(
                    'flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold transition-colors shrink-0',
                    i < step ? 'bg-primary text-primary-foreground' :
                    i === step ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' :
                    'bg-muted text-muted-foreground',
                    clickable ? 'cursor-pointer hover:opacity-90' : 'cursor-not-allowed opacity-70',
                  )}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  disabled={!clickable}
                  className={cn(
                    'text-xs hidden sm:inline truncate text-left',
                    i === step ? 'font-medium text-foreground' : 'text-muted-foreground',
                    clickable ? 'cursor-pointer hover:text-foreground' : 'cursor-not-allowed',
                  )}
                >
                  {s.label}
                </button>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border mx-1" />}
              </div>
              );
            })}
          </div>
        </div>

        {/* Content — animação direcional de troca de etapa (slide + fade).
            O scroll fica no container do ResponsiveModal; o StepTransition não
            força overflow/height. */}
        <div className="flex-1 mt-4">
          <StepTransition stepKey={currentStepKey} index={step} className="space-y-4">
          {/* STEP: Informações */}
          {currentStepKey === 'info' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome do Contrato *</Label>
                <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Manutenção Preventiva Mensal — Empresa X" />
                <p className="text-xs text-muted-foreground">Dê um nome claro que identifique este contrato</p>
              </div>
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

              {/* PMOC (Onda A v1.9.0) — toggle no TOPO da etapa, logo após o Cliente.
                  Os detalhes (RT, unidade, badge legal) ficam na etapa "Unidade & RT".
                  Equipe, cobrança, tipo de serviço, checklist, observações e status
                  migraram pra etapa "Equipe & Cobrança". A Identificação fica enxuta. */}
              {pmocToggleSection}
            </div>
          )}

          {/* STEP: Unidade & RT (só PMOC) — RT, Identificação da Unidade e badge legal. */}
          {currentStepKey === 'unit' && pmocUnitSection}

          {/* STEP: Frequência */}
          {currentStepKey === 'frequency' && (
            <div className="space-y-4">
              {/* Com plano de serviços, o motor SEMPRE gera 1 visita/mês agrupando
                  o que vence — a cadência única (tipo/atalhos/intervalo) fica
                  irrelevante e é recolhida. Data de Início e Horizonte continuam. */}
              {usePlanEngine ? (
                <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
                  <CalendarCheck className="h-4 w-4 text-info" />
                  <AlertTitle className="text-sm">Como serão as visitas</AlertTitle>
                  <AlertDescription className="text-xs">
                    1 visita por mês, agrupando tudo que vence no plano. É só escolher a
                    data de início e por quantos meses o contrato vai rodar — o sistema
                    monta o cronograma sozinho.
                  </AlertDescription>
                </Alert>
              ) : (
                <>
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
                </>
              )}

              <div className={cn('grid gap-4', usePlanEngine ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
                {!usePlanEngine && (
                  <div className="space-y-2">
                    <Label>{freqType === 'months' ? 'Intervalo (meses)' : 'Intervalo (dias)'} *</Label>
                    <Input type="number" min={1} value={freqValue} onChange={e => setFreqValue(Number(e.target.value))} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Data de Início *</Label>
                  {/* Datepicker próprio do projeto (Calendar + Popover). O input
                      nativo de data tinha ícone escuro/invisível no dark mode;
                      aqui o CalendarIcon usa text-foreground (branco no dark). */}
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('w-full justify-start text-left font-normal', !startDate && 'text-muted-foreground')}
                      >
                        <CalendarCheck className="mr-2 h-4 w-4 text-foreground shrink-0" />
                        {startDate
                          ? format(new Date(startDate + 'T00:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                          : 'Selecione a data'}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={startDate ? new Date(startDate + 'T00:00:00') : undefined}
                        onSelect={(d) => { if (d) setStartDate(format(d, 'yyyy-MM-dd')); }}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-2">
                  <Label>Horizonte (meses)</Label>
                  <Input type="number" min={1} max={60} value={horizonMonths} onChange={e => setHorizonMonths(Number(e.target.value))} />
                  <p className="text-xs text-muted-foreground">
                    = {visitCount} {usePlanEngine ? 'visita(s)' : 'ocorrências'}
                  </p>
                </div>
              </div>

              {/* Prévia das datas. Com plano, reflete as VISITAS AGRUPADAS
                  (datas + quantas atividades vencem em cada mês). Sem plano,
                  a cadência única. */}
              {usePlanEngine ? (
                groupedVisits.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Prévia das visitas ({groupedVisits.length})</Label>
                    <div className="rounded-md border max-h-44 overflow-y-auto">
                      {groupedVisits.slice(0, 30).map((visit, i) => {
                        const isWeekend = visit.date.getDay() === 0 || visit.date.getDay() === 6;
                        return (
                          <div key={i} className="flex items-center gap-3 px-3 py-2 border-b last:border-0 text-sm">
                            <span className="text-muted-foreground w-5 text-right font-mono text-xs">{i + 1}</span>
                            <span className="text-foreground">{format(visit.date, 'dd/MM/yyyy', { locale: ptBR })}</span>
                            <Badge variant="info" className="text-[10px] px-1.5 py-0 shrink-0">
                              {visit.activityIndexes.length} atividade{visit.activityIndexes.length === 1 ? '' : 's'}
                            </Badge>
                            {isWeekend && <Badge variant="outline" className="text-warning border-warning/30 text-[10px] px-1.5 py-0">Fim de semana</Badge>}
                          </div>
                        );
                      })}
                      {groupedVisits.length > 30 && (
                        <div className="text-center py-2 text-xs text-muted-foreground">
                          +{groupedVisits.length - 30} visitas adicionais
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : (
                occurrences.length > 0 && (
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
                )
              )}

              {/* PMOC — a rotina da norma (escopo + checklists) agora é POR MÁQUINA
                  e fica na etapa Ambientes (cada equipamento tem seu escopo, sua
                  fase e sua listagem). Aqui só lembramos o gestor. O escopo POR
                  CONTRATO foi removido (Fase 3). */}
              {isPmoc && (
                <Alert variant="default" className="border-info/40 bg-info/5 text-foreground">
                  <ShieldCheck className="h-4 w-4 text-info" />
                  <AlertTitle className="text-sm">Rotina por equipamento</AlertTitle>
                  <AlertDescription className="text-xs">
                    Cada equipamento tem sua própria rotina da norma (escopo, em que visita começa e
                    seus checklists), configurada na etapa <strong>Ambientes</strong>. Por padrão:
                    só ar-condicionado, começando pela revisão anual e seguindo a norma — quem não
                    quiser ajustar é só avançar.
                  </AlertDescription>
                </Alert>
              )}

              {/* Opções avançadas — serviços com frequência própria. SÓ em contrato
                  COMUM (não-PMOC): o PMOC monta o plano por máquina na etapa
                  Ambientes. Aqui ficam o picker do catálogo, a adição manual e a
                  lista editável de atividades. */}
              {!isPmoc && (
              <Collapsible open={showAdvancedFrequency} onOpenChange={setShowAdvancedFrequency}>
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left min-h-11 text-sm font-medium active:scale-[0.995] transition-transform"
                  >
                    <span className="flex items-center gap-2">
                      <CalendarCheck className="h-4 w-4 text-primary shrink-0" />
                      Opções avançadas — serviços com frequência própria
                    </span>
                    <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', showAdvancedFrequency && 'rotate-180')} />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="rounded-lg border border-t-0 rounded-t-none p-3 space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Adicione serviços com frequências diferentes (ex: filtro mensal, serpentina trimestral).
                      Quando houver serviços aqui, o sistema gera <strong>1 visita por mês</strong> agrupando tudo que vence.
                    </p>

                    {/* Picker do catálogo PMOC (Fase 2). Disponível em qualquer
                        contrato; em PMOC com padrão LIGADO fica desabilitado
                        (personalize desligando o padrão). */}
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full"
                      onClick={openCatalogPicker}
                      disabled={catalogLoading || (isPmoc && pmocStandardOn)}
                      title={isPmoc && pmocStandardOn ? 'Desligue o padrão PMOC para personalizar as atividades' : undefined}
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
                          // Task 5: linha do PADRÃO (vinda do catálogo) fica TRAVADA
                          // quando o padrão PMOC está ligado. Linha manual (sem
                          // catalog_activity_id) continua editável/removível.
                          const isFromCatalog = !!a.catalog_activity_id;
                          const locked = isPmoc && pmocStandardOn && isFromCatalog;
                          return (
                            <div key={i} className={cn(
                              'flex flex-col gap-2 rounded border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between',
                              locked && 'bg-muted/40',
                            )}>
                              <div className="min-w-0 flex items-center gap-2">
                                {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-label="Travado pelo padrão da norma" />}
                                <span className="font-medium truncate">{a.description}</span>
                                <Badge variant={a.freq_code === 'E' ? 'outline' : 'info'} className="shrink-0 text-[10px]">{freqLabel}</Badge>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* Escopo da atividade (Fase 3): por equipamento ou geral (local). */}
                                <button
                                  type="button"
                                  disabled={locked}
                                  onClick={() => setPlanActivities(prev => prev.map((x, idx) => idx === i ? { ...x, applies_per_equipment: !perEquip } : x))}
                                  className={cn(
                                    'px-2 py-1 rounded-full text-[10px] font-medium border transition-colors whitespace-nowrap',
                                    perEquip
                                      ? 'bg-info/10 text-info border-info/30'
                                      : 'bg-muted text-muted-foreground border-border',
                                    locked && 'opacity-60 cursor-not-allowed',
                                  )}
                                  title={locked ? 'Travado pelo padrão da norma — desligue o padrão para editar' : 'Alterna entre repetir a atividade por equipamento ou tratá-la como geral (local)'}
                                >
                                  {perEquip ? 'Por equipamento' : 'Geral (local)'}
                                </button>
                                {!locked && (
                                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setPlanActivities(prev => prev.filter((_, idx) => idx !== i))}>
                                    ×
                                  </Button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        {isPmoc && pmocStandardOn && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                            <Lock className="h-3.5 w-3.5 shrink-0" />
                            Atividades do padrão travadas pela norma. Desligue o padrão PMOC para personalizar.
                          </div>
                        )}
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
                </CollapsibleContent>
              </Collapsible>
              )}
            </div>
          )}

          {/* STEP: Ambientes (PMOC) ou Itens (comum) */}
          {currentStepKey === 'items' && isPmoc && (
            <div className="space-y-4">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-muted-foreground">
                  Cadastre os ambientes climatizados deste contrato (ex: cada unidade ou sala).
                  Cada ambiente tem seus dados da Planilha PMOC e seus próprios equipamentos.
                </p>
                {!customerId && (
                  <p className="text-xs text-warning">Selecione o cliente na etapa 1 para escolher equipamentos.</p>
                )}
              </div>

              {environments.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-8 text-center">
                  <ShieldCheck className="h-7 w-7 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Nenhum ambiente cadastrado ainda.</p>
                  <Button type="button" variant="outline" onClick={addEnvironment}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar ambiente
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {environments.map((env, idx) => {
                    const envEquipmentCount = env.equipment_ids.length;
                    const envOpen = openEnvKey === env.key;
                    const search = (envEquipSearch[env.key] ?? '').toLowerCase().trim();
                    // Equipamentos visíveis neste ambiente: oculta os já atribuídos
                    // a OUTRO ambiente (item 2 — somem da lista, não esmaecem) e
                    // aplica a busca por nome/marca/modelo. Os marcados aqui ficam
                    // sempre visíveis (mesmo fora da busca, pra não "perder" config).
                    const visibleEquipment = activeEquipment.filter(eq => {
                      const checked = env.equipment_ids.includes(eq.id);
                      const ownerKey = equipmentOwnerEnvKey.get(eq.id);
                      const ownedByOther = !checked && ownerKey && ownerKey !== env.key;
                      if (ownedByOther) return false;
                      if (!search) return true;
                      if (checked) return true;
                      return (
                        eq.name.toLowerCase().includes(search) ||
                        (eq.brand?.toLowerCase().includes(search) ?? false) ||
                        (eq.model?.toLowerCase().includes(search) ?? false)
                      );
                    });
                    return (
                      <div key={env.key} className="rounded-lg border">
                        {/* Cabeçalho do ambiente — clicável (accordion single-open). */}
                        <div className="flex items-center justify-between gap-2 p-3">
                          <button
                            type="button"
                            onClick={() => toggleEnv(env.key)}
                            className="flex flex-1 items-center gap-2 min-w-0 text-left"
                            aria-expanded={envOpen}
                          >
                            <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', envOpen && 'rotate-180')} />
                            <Badge variant="info" className="shrink-0">Ambiente {idx + 1}</Badge>
                            <span className="text-sm font-medium truncate">
                              {env.identificacao.trim() || 'Sem identificação'}
                            </span>
                            {envEquipmentCount > 0 && (
                              <Badge variant="outline" className="shrink-0 text-[10px]">{envEquipmentCount} equip.</Badge>
                            )}
                          </button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0 text-destructive"
                            onClick={() => removeEnvironment(env.key)}
                            aria-label="Remover ambiente"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        {envOpen && (
                        <div className="p-3 pt-0 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">Identificação do ambiente</Label>
                            <Input
                              value={env.identificacao}
                              onChange={e => updateEnvironmentField(env.key, 'identificacao', e.target.value)}
                              placeholder="Ex: 2º andar — Sala 201"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Tipo de atividade</Label>
                            <Input
                              value={env.tipo_atividade}
                              onChange={e => updateEnvironmentField(env.key, 'tipo_atividade', e.target.value)}
                              placeholder="Ex: Escritório administrativo"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Área climatizada (m²)</Label>
                            <Input
                              inputMode="decimal"
                              value={env.area_climatizada_m2}
                              onChange={e => updateEnvironmentField(env.key, 'area_climatizada_m2', e.target.value)}
                              placeholder="Ex: 120,5"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Carga térmica (TR)</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que é TR?">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">TR (Tonelada de Refrigeração) é a unidade de capacidade de refrigeração. 1 TR = 12.000 BTU/h.</TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              inputMode="decimal"
                              value={env.carga_termica_tr}
                              onChange={e => updateEnvironmentField(env.key, 'carga_termica_tr', e.target.value)}
                              placeholder="Ex: 5,0"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Nº de ocupantes fixos</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que são ocupantes fixos?">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">Pessoas que ocupam o ambiente de forma permanente/regular (ex.: funcionários que trabalham no local).</TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              inputMode="numeric"
                              value={env.ocupantes_fixos}
                              onChange={e => updateEnvironmentField(env.key, 'ocupantes_fixos', e.target.value)}
                              placeholder="Ex: 12"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-1">
                              <Label className="text-xs">Nº de ocupantes flutuantes</Label>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="O que são ocupantes flutuantes?">
                                    <HelpCircle className="h-3.5 w-3.5" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs">Pessoas que circulam pelo ambiente de forma temporária e variável (ex.: clientes, visitantes).</TooltipContent>
                              </Tooltip>
                            </div>
                            <Input
                              inputMode="numeric"
                              value={env.ocupantes_flutuantes}
                              onChange={e => updateEnvironmentField(env.key, 'ocupantes_flutuantes', e.target.value)}
                              placeholder="Ex: 30"
                            />
                          </div>
                        </div>

                        {/* Equipamentos deste ambiente (exclusivos entre ambientes). */}
                        <div className="space-y-1.5">
                          <Label className="text-xs flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                            Equipamentos deste ambiente ({envEquipmentCount})
                          </Label>
                          {!customerId ? (
                            <p className="text-xs text-muted-foreground">Selecione o cliente na etapa 1 primeiro.</p>
                          ) : activeEquipment.length === 0 ? (
                            <p className="text-xs text-muted-foreground">O cliente não tem equipamentos ativos cadastrados.</p>
                          ) : (
                            <>
                            {/* Busca por equipamento (item 2). */}
                            <div className="relative">
                              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                              <Input
                                placeholder="Buscar equipamento..."
                                value={envEquipSearch[env.key] ?? ''}
                                onChange={e => setEnvEquipSearch(prev => ({ ...prev, [env.key]: e.target.value }))}
                                className="pl-8 h-9"
                              />
                            </div>
                            {/* Lista com altura máxima + scroll (item 2). */}
                            <div className="rounded-md border divide-y max-h-72 overflow-y-auto">
                              {visibleEquipment.length === 0 ? (
                                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                                  Nenhum equipamento encontrado.
                                </p>
                              ) : visibleEquipment.map(eq => {
                                const checked = env.equipment_ids.includes(eq.id);
                                const cfg = machineConfigs[eq.id];
                                const cfgOpen = checked && openMachineEqId === eq.id;
                                return (
                                  <div key={eq.id}>
                                    <div className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50">
                                      <input
                                        type="checkbox"
                                        className="rounded border-border cursor-pointer"
                                        checked={checked}
                                        onChange={() => {
                                          const wasChecked = checked;
                                          toggleEnvEquipment(env.key, eq.id);
                                          // Ao marcar, abre a config dele (single-open); ao desmarcar, fecha.
                                          setOpenMachineEqId(wasChecked ? null : eq.id);
                                        }}
                                      />
                                      <button
                                        type="button"
                                        className="flex flex-1 items-center gap-2 min-w-0 text-left"
                                        onClick={() => {
                                          if (checked) {
                                            toggleMachine(eq.id);
                                          } else {
                                            toggleEnvEquipment(env.key, eq.id);
                                            setOpenMachineEqId(eq.id);
                                          }
                                        }}
                                      >
                                        <div className="flex-1 min-w-0">
                                          <p className="text-sm font-medium truncate">{eq.name}</p>
                                          <p className="text-xs text-muted-foreground truncate">
                                            {[eq.brand, eq.model].filter(Boolean).join(' - ')}
                                          </p>
                                        </div>
                                        {checked && (
                                          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', cfgOpen && 'rotate-180')} />
                                        )}
                                      </button>
                                    </div>

                                    {/* Rotina POR MÁQUINA (Fase 3) — accordion single-open:
                                        só aparece pro equipamento marcado E aberto. Compacto:
                                        escopo + começa-na-visita + checklists próprios. */}
                                    {cfgOpen && (
                                      <div className="px-3 pb-3 pt-1 space-y-2.5 bg-muted/20">
                                        {/* 1) Escopo da norma */}
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-medium text-muted-foreground">Escopo da norma</span>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Sobre o escopo">
                                                  <HelpCircle className="h-3.5 w-3.5" />
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent className="max-w-xs text-xs">
                                                "Só ar-condicionado" cobre split/ACJ comum. "Toda a norma" inclui as seções de grande porte (VRF, Chiller, Torre, casa de máquinas…).
                                              </TooltipContent>
                                            </Tooltip>
                                          </div>
                                          <LabeledSwitch
                                            value={cfg?.scope ?? 'ac'}
                                            onChange={(v) => setMachineScope(eq.id, v as PmocMachineScope)}
                                            off={{ value: 'ac', label: 'Só ar-condicionado' }}
                                            on={{ value: 'full', label: 'Grande Porte (VRF/Chiller…)' }}
                                            size="default"
                                            className="[&_button]:text-xs"
                                            aria-label="Escopo da norma da máquina"
                                          />
                                        </div>

                                        {/* 2) Começa na visita */}
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-1">
                                            <span className="text-[11px] font-medium text-muted-foreground">Começa na visita</span>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <button type="button" className="text-muted-foreground hover:text-foreground" aria-label="Sobre começa na visita">
                                                  <HelpCircle className="h-3.5 w-3.5" />
                                                </button>
                                              </TooltipTrigger>
                                              <TooltipContent className="max-w-xs text-xs">
                                                Define a 1ª visita desta máquina no ciclo de 12. Acumulativo: Visita 12 (Anual) já faz a revisão completa; Visita 1 começa só pelo mensal.
                                              </TooltipContent>
                                            </Tooltip>
                                          </div>
                                          <Select
                                            value={String(cfg?.startVisit ?? 12)}
                                            onValueChange={(v) => setMachineStartVisit(eq.id, Number(v))}
                                          >
                                            <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              {START_VISIT_OPTIONS.map(o => (
                                                <SelectItem key={o.value} value={String(o.value)} className="text-xs">{o.label}</SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                        </div>

                                        {/* 3) Checklists da máquina */}
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] text-muted-foreground">
                                            {cfg ? `${cfg.activities.length} checklist(s)` : '—'}
                                            {cfg?.customized && <span className="ml-1 text-info">· personalizado</span>}
                                          </span>
                                          <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="h-8 text-xs"
                                            disabled={catalogLoading}
                                            onClick={() => openMachinePicker(eq.id)}
                                          >
                                            <ShieldCheck className="h-3.5 w-3.5 mr-1.5 text-info" />
                                            Checklists do catálogo PMOC
                                          </Button>
                                        </div>

                                        {/* Preview: em que visita começa e o que inclui */}
                                        {cfg && (
                                          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                                            <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-info mt-px" />
                                            <span>
                                              Começa na <strong>{startVisitLabel(cfg.startVisit)}</strong> — 1ª visita faz: {firstVisitContents(cfg.startVisit)}.
                                            </span>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                            </>
                          )}
                          {/* Quick-create de equipamento: sempre disponível (inclusive sem
                              equipamentos). Abre o EquipmentFormDialog travado no cliente;
                              no sucesso, o novo equipamento entra marcado neste ambiente. */}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="w-full"
                            disabled={!customerId}
                            onClick={() => openQuickEquip(env.key)}
                          >
                            <Plus className="h-3.5 w-3.5 mr-1.5" /> Cadastrar equipamento
                          </Button>
                        </div>
                        </div>
                        )}
                      </div>
                    );
                  })}

                  <Button type="button" variant="outline" className="w-full" onClick={addEnvironment}>
                    <Plus className="h-4 w-4 mr-2" /> Adicionar outro ambiente
                  </Button>

                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Info className="h-3.5 w-3.5 shrink-0" />
                    {pmocDerivedItems.length} equipamento(s) no total entram neste contrato.
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStepKey === 'items' && !isPmoc && (
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

          {/* STEP: Equipe & Cobrança — técnicos executores, responsáveis pela
              cobrança, tipo de serviço (só comum), checklist padrão (sem plano),
              observações e status. Migrado da antiga etapa Identificação. */}
          {currentStepKey === 'team' && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <AssigneeMultiSelect
                    technicians={(technicians ?? []).map(t => ({ user_id: t.user_id, full_name: t.full_name, avatar_url: t.avatar_url }))}
                    teams={teamsWithMembers}
                    selectedUserIds={selectedUserIds}
                    selectedTeamIds={selectedTeamIds}
                    onChangeUsers={setSelectedUserIds}
                    onChangeTeams={setSelectedTeamIds}
                    label="Técnicos Executores *"
                  />
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Técnicos ou equipes que vão a campo executar as ordens de serviço deste contrato.
                    {' '}Diferente do Responsável Técnico (RT) regulatório do PMOC.
                  </p>
                  {!hasExecutor && (
                    <p className="flex items-center gap-1.5 text-xs text-destructive mt-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      Selecione ao menos 1 técnico ou equipe para executar.
                    </p>
                  )}
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
                {/* Tipo de Serviço não se aplica a PMOC — quem manda nas atividades
                    é o plano/catálogo da norma. Some quando o contrato é PMOC. */}
                {!isPmoc && (
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
                )}
                {/* Checklist Padrão só faz sentido em contrato SEM plano de
                    serviços. Com plano, o checklist vem das atividades por
                    equipamento — exibir o select duplicaria o checklist na OS.
                    (usePlanEngine = há atividades agendáveis no plano.) */}
                {!usePlanEngine && (
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
                )}
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

          {/* STEP: Revisão */}
          {currentStepKey === 'review' && (
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
                {isPmoc ? (
                  <div className="flex justify-between"><span className="text-muted-foreground">Ambientes</span><span className="font-medium">{environments.length} ({pmocDerivedItems.length} equip.)</span></div>
                ) : (
                  <div className="flex justify-between"><span className="text-muted-foreground">Itens</span><span className="font-medium">{selectedItems.length}</span></div>
                )}
                {/* Preview da rotina POR MÁQUINA (Fase 3): em que visita começa
                    cada equipamento e o que a 1ª visita inclui. */}
                {isPmoc && pmocDerivedItems.length > 0 && (
                  <div className="rounded-md border bg-muted/20 divide-y">
                    {pmocDerivedItems.map((it) => {
                      const cfg = machineConfigs[it.equipment_id];
                      if (!cfg) return null;
                      return (
                        <div key={it.equipment_id} className="flex items-start justify-between gap-2 px-3 py-2 text-xs">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{it.item_name}</p>
                            <p className="text-muted-foreground">
                              {cfg.scope === 'full' ? 'Toda a norma' : 'Só ar-condicionado'} · {cfg.activities.length} checklist(s)
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-medium">{startVisitLabel(cfg.startVisit)}</p>
                            <p className="text-muted-foreground">1ª: {firstVisitContents(cfg.startVisit)}</p>
                          </div>
                        </div>
                      );
                    })}
                    {hasFullMachine && (
                      <div className="px-3 py-2 text-xs text-muted-foreground flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 shrink-0" />
                        Inclui as atividades de local da norma (torres, bombas, casa de máquinas…).
                      </div>
                    )}
                  </div>
                )}
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
          </StepTransition>
        </div>
    </div>
  );

  // Navegação do wizard — vai pro footer do ResponsiveModal (fixo abaixo do
  // conteúdo rolável, no desktop e no mobile).
  const wizardFooter = (
    <div className="flex flex-row justify-between gap-2">
      <Button variant="outline" onClick={() => step === 0 ? onOpenChange(false) : setStep(step - 1)} disabled={submitting}>
        {step === 0 ? 'Cancelar' : <><ChevronLeft className="h-4 w-4 mr-1" /> Voltar</>}
      </Button>
      {step < STEPS.length - 1 ? (
        <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
          Próximo <ChevronRight className="h-4 w-4 ml-1" />
        </Button>
      ) : (
        <Button onClick={handleSubmit} disabled={submitting || !canNext()} className="bg-primary text-primary-foreground hover:bg-primary/90">
          {submitting ? (
            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
          ) : isEditing ? 'Salvar Alterações' : `Criar Contrato (${visitCount} OSs)`}
        </Button>
      )}
    </div>
  );

  return (
    <>
    {/* Container do wizard: modal central no desktop, drawer de baixo no mobile. */}
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={isEditing ? 'Editar Contrato' : 'Novo Contrato'}
      className="sm:max-w-[920px]"
      footer={wizardFooter}
    >
      {wizardContent}
    </ResponsiveModal>

    {/* Rascunho (só criação): oferece retomar o preenchimento interrompido. */}
    {!isEditing && (
      <DraftResumeDialog
        open={draft.showResumePrompt}
        onResume={() => {
          if (draft.draftData) applyContractDraft(draft.draftData);
          draft.acceptDraft();
        }}
        onDiscard={() => {
          draft.discardDraft();
        }}
      />
    )}

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

    {/* Quick-create de equipamento dentro de um ambiente (PMOC). Reaproveita o
        EquipmentFormDialog (mesma fiação do EquipmentPanel), mas trava o cliente
        no cliente do contrato. No sucesso, marca o novo equipamento no ambiente
        que disparou o cadastro. */}
    <EquipmentFormDialog
      open={showQuickEquip}
      onOpenChange={(v) => { setShowQuickEquip(v); if (!v) setQuickEquipEnvKey(null); }}
      customers={contractCustomerAsList}
      categories={equipmentCategories}
      isLoading={createEquipment.isPending}
      equipmentCount={equipment.length}
      onSubmit={async (data) => {
        const created = await createEquipment.mutateAsync({ ...data, customer_id: customerId } as any);
        const newId = (created as any)?.id as string | undefined;
        if (newId && quickEquipEnvKey) {
          // Marca o novo equipamento no ambiente que abriu o cadastro. A lista do
          // cliente recarrega sozinha via react-query (invalidate no hook).
          setEnvironments(prev => prev.map(e =>
            e.key === quickEquipEnvKey && !e.equipment_ids.includes(newId)
              ? { ...e, equipment_ids: [...e.equipment_ids, newId] }
              : e,
          ));
        }
        setShowQuickEquip(false);
        setQuickEquipEnvKey(null);
      }}
    />

    {/* Picker do catálogo PMOC (Fase 2). Drawer no mobile, dialog no desktop.
        Navegação por seção (accordion); cada item é um checkbox com o selo de
        frequência default da norma. Multi-seleção; ao confirmar vira linha do
        plano (editável depois). */}
    <ResponsiveModal
      open={showCatalogPicker}
      onOpenChange={(v) => { setShowCatalogPicker(v); if (!v) { setPickerMachineEqId(null); setPickerMachineScope(null); } }}
      title={pickerMachineEqId ? 'Checklists da máquina (catálogo PMOC)' : 'Catálogo de atividades PMOC'}
      footer={
        <div className="flex flex-row items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pickerSelection.size + (pickerMachineEqId ? pickerTemplateSelection.size : 0)} selecionada(s)
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setShowCatalogPicker(false); setPickerMachineEqId(null); setPickerMachineScope(null); }}>Cancelar</Button>
            <Button onClick={confirmCatalogPicker}>{pickerMachineEqId ? 'Aplicar à máquina' : 'Adicionar ao plano'}</Button>
          </div>
        </div>
      }
    >
      <PmocChecklistPicker
        catalogGroups={catalogGroups}
        catalogLoading={catalogLoading}
        scope={pickerMachineScope}
        selection={pickerSelection}
        onChange={setPickerSelection}
        customTemplates={pickerMachineEqId ? customTemplateOptions : []}
        selectedTemplateIds={pickerTemplateSelection}
        onChangeTemplates={pickerMachineEqId ? setPickerTemplateSelection : undefined}
      />
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
            {submitting ? (
              <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando…</>
            ) : 'Recalcular visitas'}
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