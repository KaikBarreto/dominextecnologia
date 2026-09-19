import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSectionLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  User, Phone, Mail, Calendar, DollarSign, TrendingUp,
  MessageSquare, Clock, Plus, Send, Edit, Trash2, X, Wrench, CalendarPlus,
  UserX, UserPlus, CheckCircle2, Circle, Repeat, Loader2, AlertTriangle,
} from 'lucide-react';
import {
  useLeadInteractions,
  type Lead,
  getInteractionTypes,
  useLeads
} from '@/hooks/useLeads';
import { STAGE_CHANGE_INTERACTION_TYPE, parseStageChangeDescription } from '@/lib/leadStageHistory';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useCrmPipelines } from '@/hooks/useCrmPipelines';
import { IconPreview } from '@/components/customers/originIcons';
import { OriginBadge } from '@/components/crm/OriginBadge';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR, enUS, es as esLocale, fr as frLocale, type Locale } from 'date-fns/locale';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatMoney } from '@/lib/format';
import type { LocaleCode } from '@/lib/i18n/locales';
import { useAuth } from '@/contexts/AuthContext';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useTaskSubmit } from '@/hooks/useTaskSubmit';
import { useProfiles } from '@/hooks/useProfiles';
import { collapseRecurringOccurrences } from '@/lib/taskRecurrence';
import { cn } from '@/lib/utils';
import { ServiceOrderFormDialog } from '@/components/service-orders/ServiceOrderFormDialog';
import { TaskFormDialog, type TaskFormData } from '@/components/schedule/TaskFormDialog';

const DATE_FNS_LOCALES: Record<LocaleCode, Locale> = {
  'pt-br': ptBR,
  en: enUS,
  es: esLocale,
  fr: frLocale,
};

interface LeadDetailModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: Lead | null;
  onEdit: (lead: Lead) => void;
  /** Centralizado no CRM.tsx (requestStageChange): decide se pede motivo de perda antes de gravar. */
  onStageChange: (lead: Lead, stageId: string) => void;
  /**
   * Aba em que o modal abre. Quem vem da aba Tarefas do CRM entra direto em
   * "tarefas": abrir em "detalhes" obrigava a clicar de novo pra ver a tarefa
   * que a pessoa acabou de clicar.
   */
  initialTab?: 'detalhes' | 'tarefas' | 'historico';
}

export function LeadDetailModal({ open, onOpenChange, lead, onEdit, onStageChange, initialTab = 'detalhes' }: LeadDetailModalProps) {
  const { locale, currency } = useAppLocaleContext();
  const t = MESSAGES[locale].app.crm;
  const dfLocale = DATE_FNS_LOCALES[locale];
  const interactionTypes = getInteractionTypes(locale);
  const { stages, getStageHex } = useCrmStages();
  // Onda D — multi-pipeline: mesmo agrupamento por funil do LeadFormDialog.
  const { pipelines } = useCrmPipelines();
  const hasMultiplePipelines = pipelines.length > 1;
  const { interactions, isLoading: loadingInteractions, createInteraction } = useLeadInteractions(lead?.id || null);
  const { deleteLead, claimLead, updateLeadNotes } = useLeads();

  const { user, isAdminOrGestor, hasPermission } = useAuth();
  const { createServiceOrder, serviceOrders, deleteServiceOrder, updateServiceOrder } = useServiceOrders();
  const { submitTask } = useTaskSubmit();
  const { data: profiles = [] } = useProfiles();
  // Tarefa ainda não tem permissão própria (fn:manage_tasks é Onda E do
  // overhaul do CRM) — hoje o próprio Schedule.tsx usa o mesmo gate de OS
  // pra oferecer a criação de tarefa (ver FAB "Nova Tarefa/OS"). Espelhamos
  // o mesmo padrão aqui até a permissão dedicada existir.
  const canCreateOS = isAdminOrGestor() || hasPermission('fn:create_os');
  const canCreateTask = canCreateOS;

  const [newInteraction, setNewInteraction] = useState({
    type: '',
    description: '',
    next_action: '',
    next_action_date: '',
  });
  const [isAddingInteraction, setIsAddingInteraction] = useState(false);
  const [osFormOpen, setOsFormOpen] = useState(false);
  const [taskFormOpen, setTaskFormOpen] = useState(false);
  // `null` = criando; preenchido = editando esta tarefa (aba Tarefas do card).
  const [editingTask, setEditingTask] = useState<any | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  // ── Tarefas da oportunidade (Onda E1) ──────────────────────────────────
  // `serviceOrders` traz TODA tarefa/OS da empresa (useServiceOrders não
  // filtra por tela) — recortamos aqui só as tarefas (entry_type='tarefa')
  // vinculadas a ESTE lead. `lead?.id` porque estes hooks rodam antes do
  // `if (!lead) return null` mais abaixo (regra dos hooks).
  const leadTasks = useMemo(
    () => (serviceOrders as any[]).filter((o) => o.entry_type === 'tarefa' && o.lead_id === lead?.id),
    [serviceOrders, lead?.id],
  );
  // Colapsa série recorrente numa linha só (a próxima ocorrência pendente) —
  // função compartilhada com a aba Tarefas da tela (src/pages/CRM.tsx), pra
  // as duas nunca divergirem sobre "qual ocorrência mostrar" da mesma série.
  const sortedLeadTasks = useMemo(() => {
    const collapsed = collapseRecurringOccurrences(leadTasks);
    return [...collapsed].sort((a: any, b: any) => {
      if (!a.scheduled_date) return 1;
      if (!b.scheduled_date) return -1;
      return a.scheduled_date.localeCompare(b.scheduled_date);
    });
  }, [leadTasks]);
  const profileMap = useMemo(
    () => new Map(profiles.map((p) => [p.user_id, p])),
    [profiles],
  );

  // ── Autosave de "Observações" (pedido do CEO: digitar direto, sem entrar
  // em modo Editar) ───────────────────────────────────────────────────────
  // Mesmo padrão de auto-save com debounce + indicador visual já usado em
  // Configurações (SettingsRegionalContent.tsx): baseline "último salvo" +
  // debounce curto + flush ao desmontar, pra nunca perder o que foi digitado.
  // Reidrata só quando troca de LEAD (o modal fecha antes de abrir o form de
  // edição — nunca os dois escrevem `notes` ao mesmo tempo, ver handleEditClick).
  const [notesValue, setNotesValue] = useState(lead?.notes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState(false);
  const notesLeadIdRef = useRef<string | null>(lead?.id ?? null);
  const notesLastSavedRef = useRef<string>(lead?.notes ?? '');
  const notesValueRef = useRef(notesValue);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  notesValueRef.current = notesValue;

  useEffect(() => {
    if (notesLeadIdRef.current === (lead?.id ?? null)) return;
    notesLeadIdRef.current = lead?.id ?? null;
    notesLastSavedRef.current = lead?.notes ?? '';
    setNotesValue(lead?.notes ?? '');
    setNotesDirty(false);
    setNotesSaveError(false);
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const saveNotesNow = useCallback((value: string) => {
    if (!lead) return;
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    if (value === notesLastSavedRef.current) { setNotesDirty(false); return; }
    updateLeadNotes.mutate(
      { id: lead.id, notes: value || null },
      {
        onSuccess: () => {
          // Só confirma "Salvo" se nada novo foi digitado enquanto a request
          // estava em voo — senão o indicador mentiria "Salvo" com uma
          // edição mais nova ainda pendente.
          if (notesValueRef.current === value) {
            notesLastSavedRef.current = value;
            setNotesDirty(false);
            setNotesSaveError(false);
          }
        },
        onError: () => setNotesSaveError(true),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  useEffect(() => {
    if (!lead) return;
    if (notesValue === notesLastSavedRef.current) { setNotesDirty(false); return; }
    setNotesDirty(true);
    setNotesSaveError(false);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => saveNotesNow(notesValue), 800);
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesValue, lead?.id]);

  // Flush ao desmontar (fechar o modal antes do debounce dar tempo) — igual
  // ao flushRef de SettingsRegionalContent.tsx.
  useEffect(() => () => {
    if (notesTimerRef.current) saveNotesNow(notesValueRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!lead) return null;

  const formatCurrency = (value: number) => formatMoney(value, currency, locale);

  // Lead sem stage_id pertence ao primeiro estágio da pipeline — mesma regra de
  // fallback usada em leadsByStage (src/pages/CRM.tsx), pra não mostrar o select vazio.
  const currentStageId = lead.stage_id || (stages.length > 0 ? stages[0].id : undefined);
  const currentStage = stages.find((s) => s.id === currentStageId) || null;

  const handleStageChange = (stageId: string) => {
    onStageChange(lead, stageId);
  };

  // Botão "Editar" do header: dispara o flush do autosave de Observações na
  // hora (sem esperar a resposta do servidor) e repassa pro form de edição o
  // valor mais atual DIGITADO (não o `lead.notes` do servidor, que pode
  // ainda não refletir a última tecla) — assim o form nunca sobrescreve o
  // que o usuário acabou de escrever aqui.
  const handleEditClick = () => {
    if (notesTimerRef.current) saveNotesNow(notesValueRef.current);
    onEdit({ ...lead, notes: notesValue });
  };

  const handleAddInteraction = async () => {
    if (!newInteraction.type || !newInteraction.description) return;
    
    await createInteraction.mutateAsync({
      lead_id: lead.id,
      interaction_type: newInteraction.type,
      description: newInteraction.description,
      next_action: newInteraction.next_action || null,
      next_action_date: newInteraction.next_action_date || null,
    });
    
    setNewInteraction({ type: '', description: '', next_action: '', next_action_date: '' });
    setIsAddingInteraction(false);
  };

  const handleDelete = async () => {
    if (confirm(t.detail.deleteConfirm)) {
      await deleteLead.mutateAsync(lead.id);
      onOpenChange(false);
    }
  };

  // Fila "sem responsável" (correção da Onda C): ao assumir, o usuário vira o
  // responsável principal e o lead sai da fila compartilhada pra quem não tem
  // fn:manage_crm. O toast de claimLead (useLeads) já avisa essa consequência
  // — não usamos confirm() aqui de propósito: o texto do botão + a legenda
  // logo abaixo dele já deixam claro o que vai acontecer, e um confirm extra
  // só atrasaria a ação mais comum desse estado (pegar o lead da fila).
  const handleClaim = async () => {
    if (!user) return;
    await claimLead.mutateAsync(lead.id);
  };

  // Concluir/reabrir uma tarefa do card (Onda E1). Atualiza só o `status` da
  // ocorrência clicada — mesmo caminho que a Agenda já usa pra finalizar
  // tarefa/OS (updateServiceOrder.mutateAsync({ id, status: 'concluida' })).
  const handleToggleTaskDone = async (task: any) => {
    const isDone = task.status === 'concluida';
    await updateServiceOrder.mutateAsync({ id: task.id, status: isDone ? 'pendente' : 'concluida' } as any);
  };

  // Exclui só ESTA ocorrência (nunca a série inteira) — mesmo comportamento
  // já usado na aba Tarefas do cliente (CustomerDetail.tsx). confirm() nativo
  // de propósito, igual ao handleDelete acima: dois Dialogs Radix empilhados
  // (este modal + um AlertDialog) já deram bug de foco/pointer-events.
  const handleDeleteTask = async (task: any) => {
    const message = task.recurrence_group_id
      ? `${t.detail.tasksDeleteConfirm}${t.detail.tasksDeleteSeriesNote}`
      : t.detail.tasksDeleteConfirm;
    if (confirm(message)) {
      await deleteServiceOrder.mutateAsync(task.id);
    }
  };

  const getInteractionIcon = (type: string) => {
    const found = interactionTypes.find(it => it.value === type);
    return found?.icon || '📝';
  };

  const getInteractionLabel = (type: string) => {
    const found = interactionTypes.find(it => it.value === type);
    return found?.label || type;
  };

  // Registro automático de mudança de estágio (aba Histórico) — grava um JSON
  // dos nomes no momento da troca (leadStageHistory.ts). Se o parse falhar
  // (formato inesperado), cai pro texto cru em vez de sumir com o registro.
  const renderStageChangeText = (raw: string | null) => {
    const snapshot = parseStageChangeDescription(raw);
    if (!snapshot) return raw || '';
    const toName = snapshot.to_stage_name || t.detail.stageChangeUnknownStage;
    if (snapshot.from_stage_name) {
      return t.detail.stageChangeFromTo.replace('{from}', snapshot.from_stage_name).replace('{to}', toName);
    }
    return t.detail.stageChangeToOnly.replace('{to}', toName);
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          {/* pr-28 reserva espaço pro botão "FECHAR" (absolute, ModalCloseButton em
              dialog.tsx) que fica sobreposto no canto superior direito em ambos os
              modos (dialog desktop: right-4/top-4; drawer mobile: right-3/top-3).
              Sem essa reserva, o grupo Editar/Excluir (e, com título de 2 linhas,
              a própria 1ª linha do título) renderiza por baixo do FECHAR. */}
          <div className="flex items-start justify-between gap-4 pr-28">
            <div className="flex-1 min-w-0">
              <DialogTitle className="text-xl font-bold">{lead.title}</DialogTitle>
              {lead.customers && (
                <p className="text-muted-foreground flex items-center gap-1.5 mt-1">
                  <User className="h-4 w-4" />
                  {lead.customers.name}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="edit-ghost" size="sm" onClick={handleEditClick}>
                <Edit className="h-4 w-4 mr-1" />
                {t.detail.edit}
              </Button>
              <Button variant="destructive-ghost" size="sm" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* `key` força remontar quando a aba de entrada muda: `defaultValue` do
            Radix só vale na primeira montagem, e o modal é reaproveitado entre
            aberturas (não desmonta ao fechar). Sem isso, abrir pela aba
            Tarefas continuaria caindo em Detalhes a partir da segunda vez. */}
        <Tabs key={`${lead?.id ?? 'none'}-${initialTab}`} defaultValue={initialTab} className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="flex-shrink-0">
            <TabsTrigger value="detalhes">{t.detail.tabDetails}</TabsTrigger>
            <TabsTrigger value="tarefas">
              {t.detail.tabTasks} ({sortedLeadTasks.length})
            </TabsTrigger>
            <TabsTrigger value="historico">
              {t.detail.tabHistory} ({interactions.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="detalhes" className="flex-1 overflow-auto mt-4 space-y-6">
            {/* Estágio (pipeline do kanban — crm_stages, por empresa) */}
            <div className="flex flex-wrap items-center gap-3">
              <Label className="text-muted-foreground">{t.detail.stageLabel}</Label>
              <Select value={currentStageId} onValueChange={handleStageChange}>
                {/* w-auto + min-w: nome de estágio customizado pode ser longo
                    ("Fechado (Perdido)" já estoura 180px no drawer mobile). */}
                <SelectTrigger className="w-auto min-w-[180px] max-w-full">
                  <SelectValue placeholder={t.form.stagePlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {hasMultiplePipelines
                    ? pipelines.map((pipeline) => {
                        const stagesInPipeline = stages.filter((s) => s.pipeline_id === pipeline.id);
                        if (stagesInPipeline.length === 0) return null;
                        return (
                          <SelectGroup key={pipeline.id}>
                            <SelectSectionLabel>{pipeline.name}</SelectSectionLabel>
                            {stagesInPipeline.map((stage) => (
                              <SelectItem key={stage.id} value={stage.id}>
                                <div className="flex items-center gap-2">
                                  {stage.icon ? (
                                    <span className="shrink-0" style={{ color: getStageHex(stage.color) }}>
                                      <IconPreview name={stage.icon} className="h-3 w-3" />
                                    </span>
                                  ) : (
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ backgroundColor: getStageHex(stage.color) }}
                                    />
                                  )}
                                  {stage.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })
                    : stages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            {stage.icon ? (
                              <span className="shrink-0" style={{ color: getStageHex(stage.color) }}>
                                <IconPreview name={stage.icon} className="h-3 w-3" />
                              </span>
                            ) : (
                              <span
                                className="h-2.5 w-2.5 rounded-full shrink-0"
                                style={{ backgroundColor: getStageHex(stage.color) }}
                              />
                            )}
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              {currentStage && (
                <Badge
                  className="text-white border-0 gap-1"
                  style={{ backgroundColor: getStageHex(currentStage.color) }}
                >
                  {currentStage.icon && <IconPreview name={currentStage.icon} className="h-3 w-3" />}
                  {currentStage.name}
                </Badge>
              )}
              {hasMultiplePipelines && (
                <p className="w-full text-xs text-muted-foreground">{t.detail.stagePipelineHint}</p>
              )}
            </div>

            {/* Responsáveis (Onda C — multi-responsável). Principal em destaque
                (badge saturado + selo "Principal"); co-responsáveis em badge neutro.
                Sem nenhum responsável = lead da fila compartilhada (correção da
                Onda C): badge saturado de atenção + botão pra assumir. */}
            {lead.assignees?.length ? (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-muted-foreground">{t.detail.assigneesLabel}</Label>
                {lead.assignees.map((a) => (
                  <Badge
                    key={a.user_id}
                    variant={a.is_primary ? 'default' : 'secondary'}
                    className="gap-1.5 pl-1 pr-2 font-normal"
                  >
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={a.avatar_url || undefined} />
                      <AvatarFallback className="text-[8px] bg-primary/10 text-primary">
                        {a.full_name?.charAt(0)?.toUpperCase() || '?'}
                      </AvatarFallback>
                    </Avatar>
                    <span>{a.full_name || t.detail.assigneeUnknown}</span>
                    {a.is_primary && (
                      <span className="text-[9px] font-bold uppercase tracking-wide">
                        {t.detail.assigneePrimaryBadge}
                      </span>
                    )}
                  </Badge>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="warning" className="gap-1.5">
                  <UserX className="h-3.5 w-3.5" />
                  {t.detail.unassignedLabel}
                </Badge>
                <div className="flex flex-col gap-1">
                  <Button
                    type="button"
                    size="sm"
                    className="gap-2 w-fit"
                    onClick={handleClaim}
                    disabled={claimLead.isPending}
                  >
                    <UserPlus className="h-4 w-4" />
                    {t.detail.claimButton}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t.detail.claimHint}</p>
                </div>
              </div>
            )}

            {/* Atalhos: gerar OS ou Tarefa já com os dados desta oportunidade */}
            {(canCreateOS || canCreateTask) && (
              <div className="flex flex-wrap gap-2">
                {canCreateOS && (
                  <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => setOsFormOpen(true)}>
                    <Wrench className="h-4 w-4" />
                    {t.detail.createOs}
                  </Button>
                )}
                {canCreateTask && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => { setEditingTask(null); setTaskFormOpen(true); }}
                  >
                    <CalendarPlus className="h-4 w-4" />
                    {t.detail.createTask}
                  </Button>
                )}
              </div>
            )}

            {/* Info Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <DollarSign className="h-4 w-4" />
                  <span className="text-xs">{t.detail.valueEstimated}</span>
                </div>
                <p className="text-xl font-bold text-primary">
                  {lead.value ? formatCurrency(lead.value) : t.detail.valueNotSet}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <TrendingUp className="h-4 w-4" />
                  <span className="text-xs">{t.detail.probability}</span>
                </div>
                <p className="text-xl font-bold">{lead.probability || 50}%</p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <Calendar className="h-4 w-4" />
                  <span className="text-xs">{t.detail.closeDate}</span>
                </div>
                <p className="text-sm font-medium">
                  {lead.expected_close_date
                    ? format(new Date(lead.expected_close_date), "dd MMM yyyy", { locale: dfLocale })
                    : t.detail.closeDateNotSet}
                </p>
              </div>

              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-1">
                  <MessageSquare className="h-4 w-4" />
                  <span className="text-xs">{t.detail.origin}</span>
                </div>
                {lead.source ? (
                  <OriginBadge source={lead.source} className="text-xs px-2 py-0.5" iconClassName="h-3 w-3" />
                ) : (
                  <p className="text-sm font-medium">{t.detail.originNotSet}</p>
                )}
              </div>
            </div>

            {/* Customer Contact */}
            {lead.customers && (
              <div className="rounded-lg border p-4 space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <User className="h-4 w-4" />
                  {t.detail.customerContact}
                </h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(() => {
                    // Exibição: prioriza fixo (phone), cai pro celular se não tiver.
                    // WhatsApp: prioriza celular (é o número que tem WhatsApp de fato).
                    const displayPhone = lead.customers?.phone || lead.customers?.celular;
                    const whatsappSource = lead.customers?.celular || lead.customers?.phone;
                    const whatsappLink = whatsappSource ? buildWhatsAppLink(whatsappSource) : null;
                    if (!displayPhone) return null;
                    return (
                      <div className="flex items-center gap-2">
                        <a
                          href={`tel:${displayPhone}`}
                          className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                        >
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          {displayPhone}
                        </a>
                        {whatsappLink && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-7 gap-1.5 px-2 text-white hover:opacity-90"
                            style={{ backgroundColor: '#25D366' }}
                            onClick={() => window.open(whatsappLink, '_blank')}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            WhatsApp
                          </Button>
                        )}
                      </div>
                    );
                  })()}
                  {lead.customers.email && (
                    <a 
                      href={`mailto:${lead.customers.email}`}
                      className="flex items-center gap-2 text-sm hover:text-primary transition-colors"
                    >
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {lead.customers.email}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Observações: editável direto, com autosave (pedido do CEO, sem
                precisar clicar em "Editar"). Indicador inline avisa se está
                salvando, salvo, pendente ou se falhou — sem toast a cada
                debounce, que seria spam. */}
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-semibold">{t.detail.notes}</h4>
                <span className="flex items-center gap-1.5 text-xs shrink-0">
                  {updateLeadNotes.isPending ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t.detail.notesSaving}
                    </span>
                  ) : notesSaveError ? (
                    <span className="flex items-center gap-1.5 text-destructive">
                      <AlertTriangle className="h-3 w-3" />
                      {t.detail.notesSaveError}
                    </span>
                  ) : notesDirty ? (
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                      {t.detail.notesUnsaved}
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-success">
                      <CheckCircle2 className="h-3 w-3" />
                      {t.detail.notesSaved}
                    </span>
                  )}
                </span>
              </div>
              <Textarea
                value={notesValue}
                onChange={(e) => setNotesValue(e.target.value)}
                placeholder={t.detail.notesPlaceholder}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* Timeline info */}
            <div className="text-xs text-muted-foreground space-y-1">
              <p>{t.detail.createdAt} {format(new Date(lead.created_at), 'dd/MM/yyyy HH:mm', { locale: dfLocale })}</p>
              <p>{t.detail.updatedAt} {formatDistanceToNow(new Date(lead.updated_at), { addSuffix: true, locale: dfLocale })}</p>
            </div>
          </TabsContent>

          {/* Tarefas da oportunidade (Onda E1) — cada tarefa com responsável
              próprio (não precisa ser o responsável do card), checkbox de
              concluir e exclusão. Série recorrente colapsada numa linha só
              (collapseRecurringOccurrences), com selo "Recorrente". */}
          <TabsContent value="tarefas" className="flex-1 overflow-hidden flex flex-col mt-4">
            {canCreateTask && (
              <div className="flex-shrink-0 mb-4 flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="gap-2 shrink-0"
                  onClick={() => { setEditingTask(null); setTaskFormOpen(true); }}
                >
                  <Plus className="h-4 w-4" />
                  {t.detail.tasksNewButton}
                </Button>
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              {sortedLeadTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <CalendarPlus className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium">{t.detail.tasksEmptyTitle}</h3>
                  <p className="text-sm text-muted-foreground">{t.detail.tasksEmptyDesc}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {sortedLeadTasks.map((task: any) => {
                    const isDone = task.status === 'concluida';
                    const assigneeIds = (task._assignee_user_ids || []) as string[];
                    return (
                      <div key={task.id} className="rounded-lg border p-3 flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleTaskDone(task)}
                          className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          title={isDone ? t.detail.tasksMarkPending : t.detail.tasksMarkDone}
                        >
                          {isDone ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-sm font-medium', isDone && 'line-through text-muted-foreground')}>
                            {task.task_title}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {task.scheduled_date
                                ? format(new Date(`${task.scheduled_date}T12:00:00`), 'dd/MM/yyyy', { locale: dfLocale })
                                : t.detail.tasksNoDate}
                            </span>
                            {assigneeIds.length > 0 && (
                              <span className="inline-flex items-center -space-x-1.5">
                                {assigneeIds.map((uid) => {
                                  const p = profileMap.get(uid);
                                  return (
                                    <Avatar key={uid} className="h-4 w-4 border border-background">
                                      <AvatarImage src={p?.avatar_url || undefined} />
                                      <AvatarFallback className="text-[7px] bg-primary/10 text-primary">
                                        {p?.full_name?.charAt(0)?.toUpperCase() || '?'}
                                      </AvatarFallback>
                                    </Avatar>
                                  );
                                })}
                              </span>
                            )}
                            {task._isRecurring && (
                              <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 font-normal">
                                <Repeat className="h-2.5 w-2.5" />
                                {t.detail.tasksRecurringBadge}
                              </Badge>
                            )}
                            {!task.show_in_schedule && (
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                                {t.detail.tasksNotOnScheduleBadge}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <Button
                            type="button"
                            variant="edit-ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => { setEditingTask(task); setTaskFormOpen(true); }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="destructive-ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleDeleteTask(task)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="historico" className="flex-1 overflow-hidden flex flex-col mt-4">
            {/* Add Interaction Button */}
            <div className="flex-shrink-0 mb-4">
              {!isAddingInteraction ? (
                <Button onClick={() => setIsAddingInteraction(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  {t.detail.newInteraction}
                </Button>
              ) : (
                <div className="rounded-lg border p-4 space-y-4 bg-muted/30">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">{t.detail.registerInteraction}</h4>
                    <Button variant="ghost" size="icon" onClick={() => setIsAddingInteraction(false)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label>{t.detail.interactionType}</Label>
                      <Select
                        value={newInteraction.type}
                        onValueChange={(value) => setNewInteraction(prev => ({ ...prev, type: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={t.detail.interactionTypePlaceholder} />
                        </SelectTrigger>
                        <SelectContent>
                          {interactionTypes.map(it => (
                            <SelectItem key={it.value} value={it.value}>
                              {it.icon} {it.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>{t.detail.nextAction}</Label>
                      <Input
                        value={newInteraction.next_action}
                        onChange={(e) => setNewInteraction(prev => ({ ...prev, next_action: e.target.value }))}
                        placeholder={t.detail.nextActionPlaceholder}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>{t.detail.description}</Label>
                    <Textarea
                      value={newInteraction.description}
                      onChange={(e) => setNewInteraction(prev => ({ ...prev, description: e.target.value }))}
                      placeholder={t.detail.descriptionPlaceholder}
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>{t.detail.nextActionDate}</Label>
                    <Input
                      type="date"
                      value={newInteraction.next_action_date}
                      onChange={(e) => setNewInteraction(prev => ({ ...prev, next_action_date: e.target.value }))}
                    />
                  </div>

                  <Button
                    onClick={handleAddInteraction}
                    disabled={!newInteraction.type || !newInteraction.description || createInteraction.isPending}
                    className="gap-2"
                  >
                    <Send className="h-4 w-4" />
                    {t.detail.register}
                  </Button>
                </div>
              )}
            </div>

            {/* Interactions Timeline */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {loadingInteractions ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-20 bg-muted/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : interactions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-medium">{t.detail.noInteractions}</h3>
                  <p className="text-sm text-muted-foreground">
                    {t.detail.noInteractionsDesc}
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {interactions.map((interaction, index) => {
                    const isStageChange = interaction.interaction_type === STAGE_CHANGE_INTERACTION_TYPE;
                    // "Quem" só pro registro automático de mudança de estágio
                    // (pedido do CEO) — interação manual já mostra a autoria
                    // pelo contexto de quem está logado registrando.
                    const byName = isStageChange && interaction.created_by
                      ? profileMap.get(interaction.created_by)?.full_name
                      : null;
                    return (
                      <div key={interaction.id} className="relative">
                        {index < interactions.length - 1 && (
                          <div className="absolute left-4 top-10 bottom-0 w-px bg-border" />
                        )}
                        <div className="flex gap-4">
                          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-lg">
                            {isStageChange ? (
                              <Repeat className="h-4 w-4 text-primary" />
                            ) : (
                              getInteractionIcon(interaction.interaction_type)
                            )}
                          </div>
                          <div className="flex-1 pb-4">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium text-sm">
                                  {isStageChange ? t.detail.stageChangeLabel : getInteractionLabel(interaction.interaction_type)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {format(new Date(interaction.created_at), 'dd/MM/yyyy HH:mm', { locale: dfLocale })}
                                  {byName && ` · ${t.detail.stageChangeBy.replace('{name}', byName)}`}
                                </p>
                              </div>
                            </div>
                            <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                              {isStageChange ? renderStageChangeText(interaction.description) : interaction.description}
                            </p>
                            {!isStageChange && interaction.next_action && (
                              <div className="mt-2 flex items-center gap-2 text-xs bg-warning/10 text-warning p-2 rounded">
                                <Clock className="h-3 w-3" />
                                <span>{t.detail.nextActionPrefix} {interaction.next_action}</span>
                                {interaction.next_action_date && (
                                  <span>
                                    ({format(new Date(interaction.next_action_date), 'dd/MM/yyyy', { locale: dfLocale })})
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>

    {/* Criar OS a partir da oportunidade — cliente, título e vendedor
        responsável pré-preenchidos. Só criação (nunca edição aqui). */}
    <ServiceOrderFormDialog
      open={osFormOpen}
      onOpenChange={setOsFormOpen}
      defaultCustomerId={lead.customer_id ?? undefined}
      defaultDescription={lead.title}
      defaultAssigneeUserIds={
        lead.assignees?.length ? lead.assignees.map((a) => a.user_id) : lead.assigned_to ? [lead.assigned_to] : undefined
      }
      onSubmit={async (data) => {
        await createServiceOrder.mutateAsync(data as any);
      }}
      isLoading={createServiceOrder.isPending}
    />

    {/* Criar/editar Tarefa vinculada à oportunidade (atalho do topo E aba
        Tarefas — Onda E1 compartilham este único dialog). `defaultLeadId`
        liga a tarefa NOVA ao card; em edição o vínculo vem do próprio
        `editingTask.lead_id` (TaskFormDialog lê de lá). Responsável da
        tarefa é próprio, não precisa ser o responsável do card — só
        pré-preenchemos com ele por conveniência na criação. */}
    <TaskFormDialog
      open={taskFormOpen}
      onOpenChange={(open) => { setTaskFormOpen(open); if (!open) setEditingTask(null); }}
      defaultCustomerId={lead.customer_id ?? undefined}
      defaultTitle={editingTask ? undefined : lead.title}
      defaultAssigneeUserIds={
        editingTask
          ? undefined
          : lead.assignees?.length
            ? lead.assignees.map((a) => a.user_id)
            : lead.assigned_to
              ? [lead.assigned_to]
              : undefined
      }
      defaultLeadId={lead.id}
      task={editingTask}
      isLoading={creatingTask}
      onSubmit={async (data: TaskFormData) => {
        setCreatingTask(true);
        try {
          await submitTask(data, editingTask);
        } finally {
          setCreatingTask(false);
          setEditingTask(null);
        }
      }}
    />
    </>
  );
}
