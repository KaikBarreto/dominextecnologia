import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Columns3, Loader2, Plus, ShieldCheck, Trash2, Workflow, Zap } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  CrmDiscardChangesDialog,
  CrmSettingsDetailEmpty,
  CrmSettingsListDetail,
  CrmSettingsListRow,
} from '@/components/crm/CrmSettingsListDetail';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useCrmStages, type CrmStage } from '@/hooks/useCrmStages';
import { useCrmStageAutomations } from '@/hooks/useCrmStageAutomations';
import {
  CRM_AUTOMATION_ACTION_LABELS,
  CRM_BUSINESS_EVENT_LABELS,
  CRM_AUTOMATION_TRIGGER_LABELS,
  countCrmStageRequirements,
  createDefaultCrmAction,
  splitRequirementNames,
  validateCrmAutomationRule,
} from '@/lib/crmAutomation';
import type {
  CrmAutomationAction,
  CrmAutomationActionType,
  CrmAutomationRule,
  CrmAutomationRuleInput,
  CrmAutomationTriggerType,
  CrmStageRequirements,
} from '@/types/crmAutomation';

export type CrmStageConfigTab = 'column' | 'rules' | 'automations';
type StageTab = CrmStageConfigTab;
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stage: CrmStage | null;
  /** Aba que abre primeiro. Padrão: dados da etapa. */
  initialTab?: CrmStageConfigTab;
}

const ACTION_TYPES = Object.keys(CRM_AUTOMATION_ACTION_LABELS) as CrmAutomationActionType[];
const TRIGGER_TYPES = Object.keys(CRM_AUTOMATION_TRIGGER_LABELS) as CrmAutomationTriggerType[];
const requirementOptions: Array<{ key: keyof CrmStageRequirements; label: string; hint: string }> = [
  { key: 'tasks', label: 'Tarefas', hint: 'Todas as tarefas do cartão precisam estar encerradas.' },
  { key: 'checklists', label: 'Checklists', hint: 'Todos os itens aplicados precisam estar marcados.' },
  { key: 'assignee', label: 'Responsável', hint: 'O cartão precisa ter uma pessoa responsável.' },
  { key: 'dueDate', label: 'Prazo', hint: 'Exige previsão de fechamento.' },
  { key: 'customer', label: 'Cliente', hint: 'Exige cliente vinculado ao cartão.' },
  { key: 'description', label: 'Observações', hint: 'Exige observações preenchidas.' },
];

const emptyRule = (stage: CrmStage): CrmAutomationRuleInput => ({
  pipeline_id: stage.pipeline_id, trigger_stage_id: stage.id, name: '', trigger_type: 'stage_enter',
  trigger_config: {}, actions: [createDefaultCrmAction('create_task')], enabled: false,
});
const editRule = (rule: CrmAutomationRule): CrmAutomationRuleInput => ({
  ...rule,
  trigger_config: { ...rule.trigger_config },
  actions: rule.actions.map((item) => ({
    id: item.id ?? createDefaultCrmAction(item.action).id,
    action: item.action,
    config: { ...item.config },
  })),
});

/** Pontos de partida pra quem abre a etapa sem nenhuma automação. */
const RULE_PRESETS: Array<{ label: string; build: (stage: CrmStage) => CrmAutomationRuleInput }> = [
  {
    label: 'Follow-up após orçamento',
    build: (stage) => {
      const task = createDefaultCrmAction('create_task');
      return {
        ...emptyRule(stage),
        name: 'Follow-up após orçamento',
        trigger_type: 'business_event',
        trigger_config: { event: 'quote.created' },
        actions: [{ ...task, config: { ...task.config, title: 'Fazer follow-up do orçamento com {CLIENTE}', dueDays: 2 } }],
      };
    },
  },
  {
    label: 'Tarefa ao entrar na etapa',
    build: (stage) => ({ ...emptyRule(stage), name: 'Tarefa ao entrar na etapa' }),
  },
];

const value = (action: CrmAutomationAction, key: string) => typeof action.config[key] === 'string' ? action.config[key] as string : '';
/** Forma comparável das regras de saída, pra saber se há alteração pendente. */
const serializeRequirements = (requirements: CrmStageRequirements, taskNames: string, checklistNames: string) => JSON.stringify({
  flags: requirementOptions.map((item) => Boolean(requirements[item.key])),
  taskNames: splitRequirementNames(taskNames),
  checklistNames: splitRequirementNames(checklistNames),
});
const describeRule = (rule: Pick<CrmAutomationRule, 'trigger_type' | 'trigger_config' | 'actions'>) => {
  const event = rule.trigger_type === 'business_event'
    ? CRM_BUSINESS_EVENT_LABELS[String(rule.trigger_config.event ?? '') as keyof typeof CRM_BUSINESS_EVENT_LABELS]
    : undefined;
  return `${event ?? CRM_AUTOMATION_TRIGGER_LABELS[rule.trigger_type]} · ${rule.actions.length} ${rule.actions.length === 1 ? 'ação' : 'ações'}`;
};

/**
 * Prazo em dias: o valor salvo é sempre número, mas o campo precisa poder ficar
 * vazio enquanto a pessoa digita (sem o "0" travado à esquerda).
 */
function DaysInput({ id, days, onChange }: { id: string; days: unknown; onChange: (next: number) => void }) {
  const [text, setText] = useState(() => String(Number(days ?? 1)));
  return <NumericInput
    id={id}
    value={text}
    onValueChange={(next) => { setText(next); onChange(next === '' ? 0 : Number(next)); }}
    onBlur={() => { if (text === '') setText('0'); }}
  />;
}

function DayModeSelect({ id, mode, onChange }: { id: string; mode: string; onChange: (next: string) => void }) {
  return <Select value={mode || 'calendar'} onValueChange={onChange}>
    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
    <SelectContent><SelectItem value="calendar">Dias corridos</SelectItem><SelectItem value="business">Dias úteis</SelectItem></SelectContent>
  </Select>;
}

function ActionEditor({ action, index, count, resources, change, move, remove }: {
  action: CrmAutomationAction; index: number; count: number;
  resources: ReturnType<typeof useCrmStageAutomations>['resources'];
  change: (next: CrmAutomationAction) => void; move: (offset: -1 | 1) => void; remove: () => void;
}) {
  const set = (key: string, next: unknown) => change({ ...action, config: { ...action.config, [key]: next } });
  const destinationStages = resources.stages.filter((stage) => stage.pipeline_id === value(action, 'workflowId') && !stage.is_lost);
  const fieldId = (name: string) => `crm-action-${action.id ?? index}-${name}`;
  return <div className="space-y-3 px-3 py-3">
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{index + 1}</span>
      <Select value={action.action} onValueChange={(next) => change(createDefaultCrmAction(next as CrmAutomationActionType))}>
        <SelectTrigger className="min-w-[190px] flex-1" aria-label={`Tipo da ação ${index + 1}`}><SelectValue /></SelectTrigger>
        <SelectContent>{ACTION_TYPES.map((type) => <SelectItem key={type} value={type}>{CRM_AUTOMATION_ACTION_LABELS[type]}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="ghost" size="icon" aria-label="Mover ação para cima" disabled={index === 0} onClick={() => move(-1)}><ArrowUp className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Mover ação para baixo" disabled={index === count - 1} onClick={() => move(1)}><ArrowDown className="h-4 w-4" /></Button>
      <Button variant="destructive-ghost" size="icon" aria-label="Remover ação" disabled={count === 1} onClick={remove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {action.action === 'create_task' && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_150px]">
      <div className="space-y-1.5"><Label htmlFor={fieldId('title')}>Título *</Label><Input id={fieldId('title')} value={value(action, 'title')} onChange={(event) => set('title', event.target.value)} placeholder="Ex.: Ligar para {NOME}" /></div>
      <div className="space-y-1.5"><Label htmlFor={fieldId('days')}>Prazo em dias</Label><DaysInput id={fieldId('days')} days={action.config.dueDays} onChange={(next) => set('dueDays', next)} /></div>
      <div className="space-y-1.5"><Label htmlFor={fieldId('mode')}>Contagem</Label><DayModeSelect id={fieldId('mode')} mode={value(action, 'dayMode')} onChange={(next) => set('dayMode', next)} /></div>
      <div className="flex items-center justify-between gap-3 sm:col-span-3"><div><Label htmlFor={fieldId('schedule')}>Mostrar na Agenda</Label><p className="text-xs text-muted-foreground">A tarefa continua no cartão mesmo quando estiver fora da Agenda.</p></div><Switch id={fieldId('schedule')} checked={action.config.showInSchedule !== false} onCheckedChange={(checked) => set('showInSchedule', checked)} /></div>
    </div>}
    {action.action === 'apply_checklist' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={fieldId('template')}>Modelo *</Label><Select value={value(action, 'templateId')} onValueChange={(next) => set('templateId', next)}><SelectTrigger id={fieldId('template')}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.templates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select>{!resources.templates.length && <p className="text-xs text-muted-foreground">Cadastre um modelo na aba Checklists das configurações.</p>}</div>
      <div className="space-y-1.5"><Label htmlFor={fieldId('name')}>Nome no cartão</Label><Input id={fieldId('name')} value={value(action, 'name')} onChange={(event) => set('name', event.target.value)} placeholder="Documentos de {NOME}" /></div>
      <div className="flex items-center justify-between gap-3 sm:col-span-2"><div><Label htmlFor={fieldId('task')}>Criar tarefa vinculada</Label><p className="text-xs text-muted-foreground">Concluir um lado atualiza o outro.</p></div><Switch id={fieldId('task')} checked={Boolean(action.config.createTask)} onCheckedChange={(checked) => set('createTask', checked)} /></div>
    </div>}
    {action.action === 'set_due' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={fieldId('days')}>Prazo em dias</Label><DaysInput id={fieldId('days')} days={action.config.dueDays} onChange={(next) => set('dueDays', next)} /></div>
      <div className="space-y-1.5"><Label htmlFor={fieldId('mode')}>Contagem</Label><DayModeSelect id={fieldId('mode')} mode={value(action, 'dayMode')} onChange={(next) => set('dayMode', next)} /></div>
    </div>}
    {action.action === 'assign_user' && <div className="space-y-1.5"><Label htmlFor={fieldId('user')}>Responsável *</Label><Select value={value(action, 'userId')} onValueChange={(next) => set('userId', next)}><SelectTrigger id={fieldId('user')}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.users.map((user) => <SelectItem key={user.user_id} value={user.user_id}>{user.full_name || user.email}</SelectItem>)}</SelectContent></Select></div>}
    {action.action === 'add_label' && <div className="space-y-1.5"><Label htmlFor={fieldId('label')}>Etiqueta *</Label><Select value={value(action, 'labelId')} onValueChange={(next) => set('labelId', next)}><SelectTrigger id={fieldId('label')}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.labels.map((label) => <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>)}</SelectContent></Select>{!resources.labels.length && <p className="text-xs text-muted-foreground">Cadastre uma etiqueta na aba Etiquetas das configurações.</p>}</div>}
    {(action.action === 'move_card' || action.action === 'copy_card') && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label htmlFor={fieldId('workflow')}>Funil de destino *</Label><Select value={value(action, 'workflowId')} onValueChange={(next) => change({ ...action, config: { ...action.config, workflowId: next, stageId: '' } })}><SelectTrigger id={fieldId('workflow')}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.pipelines.map((pipeline) => <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label htmlFor={fieldId('stage')}>Etapa de destino *</Label><Select value={value(action, 'stageId')} onValueChange={(next) => set('stageId', next)} disabled={!value(action, 'workflowId')}><SelectTrigger id={fieldId('stage')}><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{destinationStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></div>
      {action.action === 'copy_card' && <div className="space-y-1.5 sm:col-span-2"><Label htmlFor={fieldId('copy')}>Título da cópia</Label><Input id={fieldId('copy')} value={value(action, 'title')} onChange={(event) => set('title', event.target.value)} /></div>}
      {action.action === 'move_card' && <p className="text-xs text-muted-foreground sm:col-span-2">Mover encerra esta automação; a etapa de destino pode continuar o fluxo.</p>}
    </div>}
  </div>;
}

const sectionLabel = 'text-xs font-semibold uppercase tracking-wide text-muted-foreground';

export function CrmStageAutomationDialog({ open, onOpenChange, stage: stageProp, initialTab = 'column' }: Props) {
  const { toast } = useToast();
  const { stages, updateStage } = useCrmStages();
  // Quem abre o diálogo guarda uma FOTO da etapa; depois de salvar, a foto fica
  // velha. A versão do cache é a que diz se ainda há alteração pendente.
  const stage = useMemo(
    () => stages.find((item) => item.id === stageProp?.id) ?? stageProp,
    [stages, stageProp],
  );
  const automations = useCrmStageAutomations(stage?.pipeline_id);
  const [tab, setTab] = useState<StageTab>(initialTab);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState<CrmStageRequirements>({});
  const [taskNames, setTaskNames] = useState('');
  const [checklistNames, setChecklistNames] = useState('');
  const [draft, setDraft] = useState<CrmAutomationRuleInput | null>(null);
  const [draftBaseline, setDraftBaseline] = useState('');
  const [pendingDiscard, setPendingDiscard] = useState<(() => void) | null>(null);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const stageId = stage?.id;
  useEffect(() => {
    if (!open || !stageProp) return;
    setTab(initialTab);
    setName(stageProp.name); setDescription(stageProp.description ?? ''); setRequirements(stageProp.requirements ?? {});
    setTaskNames((stageProp.requirements?.taskNames ?? []).join('\n'));
    setChecklistNames((stageProp.requirements?.checklistNames ?? []).join('\n'));
    setDraft(null); setDraftBaseline(''); setPendingDiscard(null); setDeleteRuleId(null);
    // Só ao abrir ou trocar de etapa: reagir ao objeto inteiro apagaria o que a
    // pessoa está digitando a cada atualização do cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stageId]);
  const rules = useMemo(() => automations.rules.filter((rule) => rule.trigger_stage_id === stageId), [automations.rules, stageId]);
  if (!stage) return null;

  const savedRequirements = stage.requirements ?? {};
  const columnDirty = name.trim() !== stage.name || description.trim() !== (stage.description ?? '');
  const rulesDirty = serializeRequirements(requirements, taskNames, checklistNames)
    !== serializeRequirements(savedRequirements, (savedRequirements.taskNames ?? []).join('\n'), (savedRequirements.checklistNames ?? []).join('\n'));
  const draftDirty = Boolean(draft) && JSON.stringify(draft) !== draftBaseline;
  const requirementCount = countCrmStageRequirements(savedRequirements);
  const activeRuleCount = rules.filter((rule) => rule.enabled).length;

  const startDraft = (next: CrmAutomationRuleInput) => {
    setDraft(next);
    setDraftBaseline(JSON.stringify(next));
  };
  /** Troca de automação (ou fecha) sem perder o que foi digitado por engano. */
  const guardDraft = (action: () => void) => {
    if (draftDirty) setPendingDiscard(() => action);
    else action();
  };
  const requestClose = (next: boolean) => {
    if (next) { onOpenChange(true); return; }
    if (draftDirty || columnDirty || rulesDirty) setPendingDiscard(() => () => onOpenChange(false));
    else onOpenChange(false);
  };

  const saveStage = async (what: 'column' | 'rules') => {
    try {
      await updateStage.mutateAsync({ id: stage.id, name: name.trim(), description: description.trim() || null, requirements: { ...requirements, taskNames: splitRequirementNames(taskNames), checklistNames: splitRequirementNames(checklistNames) } });
      toast({ title: what === 'column' ? 'Etapa salva' : 'Regras de saída salvas' });
    } catch { /* o hook já apresenta o erro */ }
  };
  const saveRule = async () => {
    if (!draft) return;
    const errors = validateCrmAutomationRule(draft);
    if (errors.length) { toast({ title: 'Revise a automação', description: errors[0], variant: 'destructive' }); return; }
    try { await automations.saveRule.mutateAsync(draft); toast({ title: draft.enabled ? 'Automação salva e ativa' : 'Automação salva como pausada' }); setDraft(null); }
    catch { toast({ title: 'Erro ao salvar automação', variant: 'destructive' }); }
  };
  const confirmDeleteRule = async () => {
    if (!deleteRuleId) return;
    try {
      await automations.deleteRule.mutateAsync(deleteRuleId);
      toast({ title: 'Automação excluída' });
      if (draft?.id === deleteRuleId) setDraft(null);
    } catch { toast({ title: 'Erro ao excluir automação', variant: 'destructive' }); }
    setDeleteRuleId(null);
  };
  const updateDraft = (patch: Partial<CrmAutomationRuleInput>) => setDraft((current) => current ? { ...current, ...patch } : current);

  const newRuleButton = <Button size="sm" aria-label="Nova automação" onClick={() => guardDraft(() => startDraft(emptyRule(stage)))}><Plus className="mr-1.5 h-4 w-4" />Nova</Button>;

  const ruleEditor = draft && <div className="space-y-5">
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className={sectionLabel}>{draft.id ? 'Editar automação' : 'Nova automação'}</p>
        <h3 className="mt-1 truncate text-lg font-semibold">{draft.name.trim() || 'Sem nome'}</h3>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <div className="flex items-center gap-2"><Switch id="crm-rule-enabled" checked={draft.enabled} onCheckedChange={(enabled) => updateDraft({ enabled })} /><Label htmlFor="crm-rule-enabled">{draft.enabled ? 'Ativa' : 'Pausada'}</Label></div>
        {draft.id && <Button variant="destructive-ghost" size="sm" onClick={() => setDeleteRuleId(draft.id!)}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button>}
      </div>
    </div>
    <div className="space-y-3">
      <p className={sectionLabel}>Quando</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="crm-rule-name">Nome *</Label><Input id="crm-rule-name" value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} placeholder="Ex.: Follow-up após orçamento" /></div>
        <div className="space-y-1.5"><Label htmlFor="crm-rule-trigger">Gatilho</Label><Select value={draft.trigger_type} onValueChange={(next) => updateDraft({ trigger_type: next as CrmAutomationTriggerType, trigger_config: {} })}><SelectTrigger id="crm-rule-trigger"><SelectValue /></SelectTrigger><SelectContent>{TRIGGER_TYPES.map((type) => <SelectItem key={type} value={type}>{CRM_AUTOMATION_TRIGGER_LABELS[type]}</SelectItem>)}</SelectContent></Select></div>
      </div>
      {draft.trigger_type === 'task_completed' && <div className="space-y-1.5"><Label htmlFor="crm-rule-task">Nome exato da tarefa *</Label><Input id="crm-rule-task" value={String(draft.trigger_config.taskName ?? '')} onChange={(event) => updateDraft({ trigger_config: { taskName: event.target.value } })} /></div>}
      {draft.trigger_type === 'checklist_completed' && <div className="space-y-1.5"><Label htmlFor="crm-rule-checklist">Nome exato do checklist *</Label><Input id="crm-rule-checklist" value={String(draft.trigger_config.name ?? '')} onChange={(event) => updateDraft({ trigger_config: { name: event.target.value } })} /></div>}
      {draft.trigger_type === 'business_event' && <div className="space-y-1.5"><Label htmlFor="crm-rule-event">Evento *</Label><Select value={String(draft.trigger_config.event ?? '')} onValueChange={(event) => updateDraft({ trigger_config: { event } })}><SelectTrigger id="crm-rule-event"><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{Object.entries(CRM_BUSINESS_EVENT_LABELS).map(([event, label]) => <SelectItem key={event} value={event}>{label}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground">Vale para os cartões que estiverem nesta etapa quando o evento acontecer.</p></div>}
    </div>
    <div className="space-y-3">
      <div><p className={sectionLabel}>Então</p><p className="mt-1 text-xs text-muted-foreground">As ações rodam na ordem abaixo. Nos textos, {'{NOME}'} vira o título do cartão e {'{CLIENTE}'} o nome do cliente.</p></div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-xl border bg-card">
        {draft.actions.map((action, index) => <ActionEditor key={action.id ?? `${index}-${action.action}`} action={action} index={index} count={draft.actions.length} resources={automations.resources} change={(next) => updateDraft({ actions: draft.actions.map((item, itemIndex) => itemIndex === index ? next : item) })} move={(offset) => { const actions = [...draft.actions]; const target = index + offset; [actions[index], actions[target]] = [actions[target], actions[index]]; updateDraft({ actions }); }} remove={() => updateDraft({ actions: draft.actions.filter((_, itemIndex) => itemIndex !== index) })} />)}
      </div>
      <Button variant="outline" size="sm" onClick={() => updateDraft({ actions: [...draft.actions, createDefaultCrmAction('create_task')] })}><Plus className="mr-1.5 h-4 w-4" />Adicionar ação</Button>
    </div>
    <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-4">
      {!draft.enabled && <p className="mr-auto text-xs text-muted-foreground">Pausada: fica salva, mas só roda depois de ativada.</p>}
      <Button variant="ghost" onClick={() => guardDraft(() => setDraft(null))}>Cancelar</Button>
      <Button onClick={() => void saveRule()} disabled={automations.saveRule.isPending}>{automations.saveRule.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar automação</Button>
    </div>
  </div>;

  return <>
    <ResponsiveModal open={open} onOpenChange={requestClose} title={`Configurar ${stage.name}`} className="sm:max-w-[960px]">
      <Tabs value={tab} onValueChange={(next) => setTab(next as StageTab)} className="min-h-[470px]">
        <TabsList variant="underline" aria-label="Configuração da etapa">
          <TabsTrigger variant="underline" value="column" className="gap-2"><Columns3 className="h-4 w-4" />Etapa</TabsTrigger>
          <TabsTrigger variant="underline" value="rules" className="gap-2"><ShieldCheck className="h-4 w-4" />Regras de saída{requirementCount > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">{requirementCount}</span>}</TabsTrigger>
          <TabsTrigger variant="underline" value="automations" className="gap-2"><Zap className="h-4 w-4" />Automações{rules.length > 0 && <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold leading-5 text-primary-foreground">{rules.length}</span>}</TabsTrigger>
        </TabsList>
        <TabsContent value="column" className="space-y-4 pt-4">
          <div className="space-y-2"><Label htmlFor="crm-stage-name">Nome *</Label><Input id="crm-stage-name" value={name} onChange={(event) => setName(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="crm-stage-description">Orientação para o time</Label><Textarea id="crm-stage-description" rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="O que precisa acontecer enquanto o cartão estiver aqui?" /></div>
          <div className="flex justify-end"><Button onClick={() => void saveStage('column')} disabled={!name.trim() || !columnDirty || updateStage.isPending}>{updateStage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar etapa</Button></div>
        </TabsContent>
        <TabsContent value="rules" className="space-y-5 pt-4">
          <div><h3 className="text-sm font-semibold">Antes de sair desta etapa</h3><p className="text-sm text-muted-foreground">O cartão só avança quando cumprir o que estiver ligado aqui. Vale também ao arrastar no quadro e nas integrações.</p></div>
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">{requirementOptions.map((item) => <div key={item.key} className="flex items-start justify-between gap-3 bg-card p-3"><div><Label htmlFor={`crm-requirement-${item.key}`}>{item.label}</Label><p className="mt-1 text-xs text-muted-foreground">{item.hint}</p></div><Switch id={`crm-requirement-${item.key}`} checked={Boolean(requirements[item.key])} onCheckedChange={(checked) => setRequirements((current) => ({ ...current, [item.key]: checked }))} /></div>)}</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="crm-requirement-task-names">Tarefas obrigatórias por nome</Label><Textarea id="crm-requirement-task-names" rows={4} value={taskNames} onChange={(event) => setTaskNames(event.target.value)} placeholder="Uma por linha" /><p className="text-xs text-muted-foreground">O cartão precisa ter uma tarefa concluída com exatamente este nome.</p></div>
            <div className="space-y-2"><Label htmlFor="crm-requirement-checklist-names">Checklists obrigatórios por nome</Label><Textarea id="crm-requirement-checklist-names" rows={4} value={checklistNames} onChange={(event) => setChecklistNames(event.target.value)} placeholder="Um por linha" /><p className="text-xs text-muted-foreground">O cartão precisa ter um checklist completo com exatamente este nome.</p></div>
          </div>
          <div className="flex justify-end"><Button onClick={() => void saveStage('rules')} disabled={!name.trim() || !rulesDirty || updateStage.isPending}>{updateStage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar regras</Button></div>
        </TabsContent>
        <TabsContent value="automations" className="space-y-4 pt-4">
          {automations.error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription>Feche e abra a configuração novamente.</AlertDescription></Alert>}
          {automations.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <CrmSettingsListDetail
            listTitle="Automações"
            count={rules.length}
            listAction={newRuleButton}
            listHint={rules.length ? `${activeRuleCount} de ${rules.length} ${rules.length === 1 ? 'ativa' : 'ativas'}. Automação nova nasce pausada.` : undefined}
            emptyList={<p className="py-6 text-sm text-muted-foreground">Nenhuma automação nesta etapa.</p>}
            detailOpen={Boolean(draft)}
            onBack={() => guardDraft(() => setDraft(null))}
            backLabel="Voltar às automações"
            className="lg:grid-cols-[16rem_minmax(0,1fr)]"
            list={rules.map((rule) => <CrmSettingsListRow
              key={rule.id}
              selected={draft?.id === rule.id}
              onSelect={() => { if (draft?.id !== rule.id) guardDraft(() => startDraft(editRule(rule))); }}
              title={rule.name}
              subtitle={<><span className={cn('font-semibold', rule.enabled ? 'text-success' : 'text-warning')}>{rule.enabled ? 'Ativa' : 'Pausada'}</span>{` · ${describeRule(rule)}`}</>}
            />)}
          >
            {ruleEditor || <CrmSettingsDetailEmpty
              icon={<Workflow className="h-8 w-8" />}
              title={rules.length ? 'Selecione uma automação' : 'Nenhuma automação nesta etapa'}
              description={rules.length ? 'Escolha na lista para editar, ou crie uma nova a partir de um modelo.' : 'Automatize tarefas, checklists, responsável e movimentações quando algo acontecer com o cartão. Comece por um modelo:'}
            >
              {RULE_PRESETS.map((preset) => <Button key={preset.label} variant="outline" size="sm" onClick={() => startDraft(preset.build(stage))}><Plus className="mr-1.5 h-4 w-4" />{preset.label}</Button>)}
            </CrmSettingsDetailEmpty>}
          </CrmSettingsListDetail>}
        </TabsContent>
      </Tabs>
    </ResponsiveModal>

    <CrmDiscardChangesDialog pending={pendingDiscard} onResolve={() => setPendingDiscard(null)} />

    <AlertDialog open={Boolean(deleteRuleId)} onOpenChange={(next) => { if (!next) setDeleteRuleId(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>Excluir automação?</AlertDialogTitle><AlertDialogDescription>Ela deixa de rodar para os próximos cartões. Tarefas e checklists que ela já criou continuam nos cartões.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Cancelar</AlertDialogCancel><AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={() => void confirmDeleteRule()}>Excluir</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </>;
}
