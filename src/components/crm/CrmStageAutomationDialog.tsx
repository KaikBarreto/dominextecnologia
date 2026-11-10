import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowDown, ArrowUp, Loader2, Pause, Play, Plus, Trash2, Workflow } from 'lucide-react';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useCrmStages, type CrmStage } from '@/hooks/useCrmStages';
import { useCrmStageAutomations } from '@/hooks/useCrmStageAutomations';
import {
  CRM_AUTOMATION_ACTION_LABELS,
  CRM_AUTOMATION_TRIGGER_LABELS,
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

interface Props { open: boolean; onOpenChange: (open: boolean) => void; stage: CrmStage | null }
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
const editRule = (rule: CrmAutomationRule): CrmAutomationRuleInput => ({ ...rule, trigger_config: { ...rule.trigger_config }, actions: rule.actions.map((item) => ({ action: item.action, config: { ...item.config } })) });
const value = (action: CrmAutomationAction, key: string) => typeof action.config[key] === 'string' ? action.config[key] as string : '';

function ActionEditor({ action, index, count, resources, change, move, remove }: {
  action: CrmAutomationAction; index: number; count: number;
  resources: ReturnType<typeof useCrmStageAutomations>['resources'];
  change: (next: CrmAutomationAction) => void; move: (offset: -1 | 1) => void; remove: () => void;
}) {
  const set = (key: string, next: unknown) => change({ ...action, config: { ...action.config, [key]: next } });
  const destinationStages = resources.stages.filter((stage) => stage.pipeline_id === value(action, 'workflowId') && !stage.is_lost);
  return <div className="space-y-3 rounded-xl border bg-card p-3 shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      <Badge variant="secondary">{index + 1}</Badge>
      <Select value={action.action} onValueChange={(next) => change(createDefaultCrmAction(next as CrmAutomationActionType))}>
        <SelectTrigger className="min-w-[190px] flex-1"><SelectValue /></SelectTrigger>
        <SelectContent>{ACTION_TYPES.map((type) => <SelectItem key={type} value={type}>{CRM_AUTOMATION_ACTION_LABELS[type]}</SelectItem>)}</SelectContent>
      </Select>
      <Button variant="ghost" size="icon" aria-label="Mover ação para cima" disabled={index === 0} onClick={() => move(-1)}><ArrowUp className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Mover ação para baixo" disabled={index === count - 1} onClick={() => move(1)}><ArrowDown className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" aria-label="Remover ação" className="text-destructive" onClick={remove}><Trash2 className="h-4 w-4" /></Button>
    </div>
    {action.action === 'create_task' && <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_120px_150px]">
      <div className="space-y-1.5"><Label>Título *</Label><Input value={value(action, 'title')} onChange={(event) => set('title', event.target.value)} placeholder="Ex.: Ligar para {NOME}" /></div>
      <div className="space-y-1.5"><Label>Prazo em dias</Label><Input type="number" min={0} value={Number(action.config.dueDays ?? 1)} onChange={(event) => set('dueDays', Number(event.target.value))} /></div>
      <div className="space-y-1.5"><Label>Contagem</Label><Select value={value(action, 'dayMode') || 'calendar'} onValueChange={(next) => set('dayMode', next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar">Dias corridos</SelectItem><SelectItem value="business">Dias úteis</SelectItem></SelectContent></Select></div>
      <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-3"><div><Label>Mostrar na Agenda</Label><p className="text-xs text-muted-foreground">A tarefa continua no cartão mesmo quando estiver fora da Agenda.</p></div><Switch checked={action.config.showInSchedule !== false} onCheckedChange={(checked) => set('showInSchedule', checked)} /></div>
    </div>}
    {action.action === 'apply_checklist' && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Modelo *</Label><Select value={value(action, 'templateId')} onValueChange={(next) => set('templateId', next)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.templates.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Nome no cartão</Label><Input value={value(action, 'name')} onChange={(event) => set('name', event.target.value)} placeholder="Documentos de {NOME}" /></div>
      <div className="flex items-center justify-between rounded-lg border p-3 sm:col-span-2"><div><Label>Criar tarefa vinculada</Label><p className="text-xs text-muted-foreground">Concluir um lado atualiza o outro.</p></div><Switch checked={Boolean(action.config.createTask)} onCheckedChange={(checked) => set('createTask', checked)} /></div>
    </div>}
    {action.action === 'set_due' && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Prazo em dias</Label><Input type="number" min={0} value={Number(action.config.dueDays ?? 1)} onChange={(event) => set('dueDays', Number(event.target.value))} /></div><div className="space-y-1.5"><Label>Contagem</Label><Select value={value(action, 'dayMode') || 'calendar'} onValueChange={(next) => set('dayMode', next)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="calendar">Dias corridos</SelectItem><SelectItem value="business">Dias úteis</SelectItem></SelectContent></Select></div></div>}
    {action.action === 'assign_user' && <div className="space-y-1.5"><Label>Responsável *</Label><Select value={value(action, 'userId')} onValueChange={(next) => set('userId', next)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.users.map((user) => <SelectItem key={user.user_id} value={user.user_id}>{user.full_name || user.email}</SelectItem>)}</SelectContent></Select></div>}
    {action.action === 'add_label' && <div className="space-y-1.5"><Label>Etiqueta *</Label><Select value={value(action, 'labelId')} onValueChange={(next) => set('labelId', next)}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.labels.map((label) => <SelectItem key={label.id} value={label.id}>{label.name}</SelectItem>)}</SelectContent></Select></div>}
    {(action.action === 'move_card' || action.action === 'copy_card') && <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5"><Label>Funil de destino *</Label><Select value={value(action, 'workflowId')} onValueChange={(next) => change({ ...action, config: { ...action.config, workflowId: next, stageId: '' } })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{resources.pipelines.map((pipeline) => <SelectItem key={pipeline.id} value={pipeline.id}>{pipeline.name}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-1.5"><Label>Etapa de destino *</Label><Select value={value(action, 'stageId')} onValueChange={(next) => set('stageId', next)} disabled={!value(action, 'workflowId')}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{destinationStages.map((stage) => <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>)}</SelectContent></Select></div>
      {action.action === 'copy_card' && <div className="space-y-1.5 sm:col-span-2"><Label>Título da cópia</Label><Input value={value(action, 'title')} onChange={(event) => set('title', event.target.value)} /></div>}
      {action.action === 'move_card' && <p className="text-xs text-muted-foreground sm:col-span-2">Mover encerra esta automação; a etapa de destino pode continuar o fluxo.</p>}
    </div>}
  </div>;
}

export function CrmStageAutomationDialog({ open, onOpenChange, stage }: Props) {
  const { toast } = useToast();
  const { updateStage } = useCrmStages();
  const automations = useCrmStageAutomations(stage?.pipeline_id);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [requirements, setRequirements] = useState<CrmStageRequirements>({});
  const [taskNames, setTaskNames] = useState('');
  const [checklistNames, setChecklistNames] = useState('');
  const [draft, setDraft] = useState<CrmAutomationRuleInput | null>(null);
  useEffect(() => {
    if (!open || !stage) return;
    setName(stage.name); setDescription(stage.description ?? ''); setRequirements(stage.requirements ?? {});
    setTaskNames((stage.requirements?.taskNames ?? []).join('\n'));
    setChecklistNames((stage.requirements?.checklistNames ?? []).join('\n'));
    setDraft(null);
  }, [open, stage]);
  const rules = useMemo(() => automations.rules.filter((rule) => rule.trigger_stage_id === stage?.id), [automations.rules, stage?.id]);
  if (!stage) return null;

  const saveStage = async () => {
    try {
      await updateStage.mutateAsync({ id: stage.id, name: name.trim(), description: description.trim() || null, requirements: { ...requirements, taskNames: splitRequirementNames(taskNames), checklistNames: splitRequirementNames(checklistNames) } });
      toast({ title: 'Configuração da etapa salva' });
    } catch { /* o hook já apresenta o erro */ }
  };
  const saveRule = async () => {
    if (!draft) return;
    const errors = validateCrmAutomationRule(draft);
    if (errors.length) { toast({ title: 'Revise a automação', description: errors[0], variant: 'destructive' }); return; }
    try { await automations.saveRule.mutateAsync(draft); toast({ title: draft.enabled ? 'Automação salva e ativa' : 'Automação salva como pausada' }); setDraft(null); }
    catch { toast({ title: 'Erro ao salvar automação', variant: 'destructive' }); }
  };

  return <ResponsiveModal open={open} onOpenChange={onOpenChange} title={`Configurar ${stage.name}`} className="sm:max-w-[920px]">
    <Tabs defaultValue="column" className="min-h-[470px]">
      <TabsList className="grid w-full grid-cols-3"><TabsTrigger value="column">Coluna</TabsTrigger><TabsTrigger value="rules">Regras</TabsTrigger><TabsTrigger value="automations">Automações</TabsTrigger></TabsList>
      <TabsContent value="column" className="space-y-4 pt-4">
        <div className="space-y-2"><Label>Nome *</Label><Input value={name} onChange={(event) => setName(event.target.value)} /></div>
        <div className="space-y-2"><Label>Orientação para o time</Label><Textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="O que precisa acontecer enquanto o cartão estiver aqui?" /></div>
        <div className="flex justify-end"><Button onClick={() => void saveStage()} disabled={!name.trim() || updateStage.isPending}>{updateStage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar coluna</Button></div>
      </TabsContent>
      <TabsContent value="rules" className="space-y-4 pt-4">
        <div><h3 className="text-sm font-semibold">Antes de sair desta etapa</h3><p className="text-sm text-muted-foreground">O banco aplica estes bloqueios também a arrastes e integrações.</p></div>
        <div className="grid gap-2 sm:grid-cols-2">{requirementOptions.map((item) => <div key={item.key} className="flex items-start justify-between gap-3 rounded-xl border bg-card p-3"><div><Label>{item.label}</Label><p className="mt-1 text-xs text-muted-foreground">{item.hint}</p></div><Switch checked={Boolean(requirements[item.key])} onCheckedChange={(checked) => setRequirements((current) => ({ ...current, [item.key]: checked }))} /></div>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Tarefas obrigatórias por nome</Label><Textarea rows={4} value={taskNames} onChange={(event) => setTaskNames(event.target.value)} placeholder="Uma por linha" /></div><div className="space-y-2"><Label>Checklists obrigatórios por nome</Label><Textarea rows={4} value={checklistNames} onChange={(event) => setChecklistNames(event.target.value)} placeholder="Um por linha" /></div></div>
        <div className="flex justify-end"><Button onClick={() => void saveStage()} disabled={updateStage.isPending}>Salvar regras</Button></div>
      </TabsContent>
      <TabsContent value="automations" className="space-y-4 pt-4">
        {automations.error && <Alert variant="destructive"><AlertCircle className="h-4 w-4" /><AlertTitle>Não foi possível carregar</AlertTitle><AlertDescription>Feche e abra a configuração novamente.</AlertDescription></Alert>}
        {draft ? <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-semibold">{draft.id ? 'Editar automação' : 'Nova automação'}</h3><p className="text-sm text-muted-foreground">Use {'{NOME}'} e {'{CLIENTE}'} nos textos.</p></div><Button variant="ghost" onClick={() => setDraft(null)}>Voltar</Button></div>
          <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1.5"><Label>Nome *</Label><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></div><div className="space-y-1.5"><Label>Gatilho</Label><Select value={draft.trigger_type} onValueChange={(next) => setDraft({ ...draft, trigger_type: next as CrmAutomationTriggerType, trigger_config: {} })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TRIGGER_TYPES.map((type) => <SelectItem key={type} value={type}>{CRM_AUTOMATION_TRIGGER_LABELS[type]}</SelectItem>)}</SelectContent></Select></div></div>
          {draft.trigger_type === 'task_completed' && <div className="space-y-1.5"><Label>Nome exato da tarefa *</Label><Input value={String(draft.trigger_config.taskName ?? '')} onChange={(event) => setDraft({ ...draft, trigger_config: { taskName: event.target.value } })} /></div>}
          {draft.trigger_type === 'checklist_completed' && <div className="space-y-1.5"><Label>Nome exato do checklist *</Label><Input value={String(draft.trigger_config.name ?? '')} onChange={(event) => setDraft({ ...draft, trigger_config: { name: event.target.value } })} /></div>}
          {draft.actions.map((action, index) => <ActionEditor key={`${index}-${action.action}`} action={action} index={index} count={draft.actions.length} resources={automations.resources} change={(next) => setDraft({ ...draft, actions: draft.actions.map((item, itemIndex) => itemIndex === index ? next : item) })} move={(offset) => { const actions = [...draft.actions]; const target = index + offset; [actions[index], actions[target]] = [actions[target], actions[index]]; setDraft({ ...draft, actions }); }} remove={() => setDraft({ ...draft, actions: draft.actions.filter((_, itemIndex) => itemIndex !== index) })} />)}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3"><Button variant="outline" onClick={() => setDraft({ ...draft, actions: [...draft.actions, createDefaultCrmAction('create_task')] })}><Plus className="mr-2 h-4 w-4" />Adicionar ação</Button><div className="flex items-center gap-2"><Label>{draft.enabled ? 'Ativa' : 'Pausada'}</Label><Switch checked={draft.enabled} onCheckedChange={(enabled) => setDraft({ ...draft, enabled })} /><Button onClick={() => void saveRule()} disabled={automations.saveRule.isPending}>Salvar automação</Button></div></div>
        </div> : automations.isLoading ? <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : <div className="space-y-3">
          <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">Fluxos desta etapa</h3><p className="text-sm text-muted-foreground">Novas automações nascem pausadas.</p></div><Button onClick={() => setDraft(emptyRule(stage))}><Plus className="mr-2 h-4 w-4" />Nova automação</Button></div>
          {!rules.length ? <div className="rounded-xl border border-dashed px-5 py-10 text-center"><Workflow className="mx-auto mb-3 h-8 w-8 text-muted-foreground" /><p className="font-medium">Nenhuma automação nesta etapa</p></div> : rules.map((rule) => <div key={rule.id} className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{rule.name}</p><Badge variant={rule.enabled ? 'default' : 'secondary'}>{rule.enabled ? 'Ativa' : 'Pausada'}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{CRM_AUTOMATION_TRIGGER_LABELS[rule.trigger_type]} · {rule.actions.length} {rule.actions.length === 1 ? 'ação' : 'ações'}</p></div><div className="flex gap-1"><Button variant="outline" size="sm" onClick={() => setDraft(editRule(rule))}>Editar</Button><Button variant="ghost" size="icon" aria-label={rule.enabled ? 'Pausar automação' : 'Ativar automação'} onClick={() => void automations.toggleRule.mutateAsync({ id: rule.id, enabled: !rule.enabled })}>{rule.enabled ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}</Button><Button variant="ghost" size="icon" aria-label="Excluir automação" className="text-destructive" onClick={() => void automations.deleteRule.mutateAsync(rule.id)}><Trash2 className="h-4 w-4" /></Button></div></div>)}
        </div>}
      </TabsContent>
    </Tabs>
  </ResponsiveModal>;
}
