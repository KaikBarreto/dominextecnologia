import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import * as LucideIcons from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResponsiveModal } from '@/components/ui/ResponsiveModal';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, MessageCircle, Pencil, Trash2, Trophy, X, CheckCircle2, Circle,
  Repeat, ListChecks, Calendar, User as UserIcon, Loader2,
} from 'lucide-react';
import { phoneMask } from '@/utils/masks';
import { useAdminLeadInteractions, useAdminCrmStages, useAdminLeads, ADMIN_INTERACTION_TYPES, type AdminLead } from '@/hooks/useAdminCrm';
import {
  useAdminTasks,
  TASK_TYPE_CONFIG,
  TASK_PRIORITY_CONFIG,
  type AdminTask,
} from '@/hooks/useAdminTasks';
import { TaskCreateDialog, type TaskAdminOption } from '@/components/admin/tasks/TaskCreateDialog';
import { useCompanyOrigins } from '@/hooks/useCompanyOrigins';
import { useAuth } from '@/contexts/AuthContext';
import { getSegment } from '@/utils/companySegments';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { RegistrarVendaDialog } from '@/components/admin/salesperson/RegistrarVendaDialog';
import { LossReasonDialog } from '@/components/crm/LossReasonDialog';
import { STAGE_CHANGE_INTERACTION_TYPE, parseStageChangeDescription } from '@/lib/leadStageHistory';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { cn } from '@/lib/utils';
import { AdminLeadFormDialog } from './AdminLeadFormDialog';
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

function OriginIcon({ name, className }: { name: string; className?: string }) {
  const LucideIcon = (LucideIcons as any)[name];
  if (!LucideIcon) return null;
  return <LucideIcon className={className || 'h-3 w-3'} />;
}

// Timestamp armazenado em UTC, exibido sempre em America/Sao_Paulo (UTC-3).
function formatBrDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

type DetailTab = 'detalhes' | 'tarefas' | 'historico';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: AdminLead;
  /** Aba aberta ao montar. Default 'detalhes'. */
  initialTab?: DetailTab;
}

/**
 * Card da oportunidade no CRM do painel master Auctus.
 *
 * Estruturado em três abas — Detalhes / Tarefas / Histórico — espelhando o
 * `LeadDetailModal` do CRM do tenant. Antes era uma coluna única e longa, com a
 * observação só de leitura e sem nenhum rastro de mudança de etapa.
 *
 * De propósito NÃO abre o `AdminTaskCardModal` na aba Tarefas: aquele modal
 * importa ESTE aqui (pra "ir para o lead" a partir do follow-up), e fechar o
 * ciclo de import quebraria os dois. A aba faz o essencial na própria linha
 * (concluir, excluir, criar) — a edição completa da tarefa continua na aba
 * Tarefas do CRM.
 */
export function AdminLeadDetailModal({ open, onOpenChange, lead: leadProp, initialTab = 'detalhes' }: Props) {
  const { interactions, createInteraction } = useAdminLeadInteractions(leadProp.id);
  const { stages } = useAdminCrmStages();
  const { origins } = useCompanyOrigins();
  const { deleteLead, updateLead, updateLeadNotes, leads } = useAdminLeads();
  const { user } = useAuth();

  const lead = leads.find(l => l.id === leadProp.id) || leadProp;
  const stage = stages.find(s => s.id === lead.stage_id);

  // Estágios de fechamento (configuráveis por flag — nunca hardcoded).
  const wonStage = stages.find(s => s.is_won) || null;
  const lostStage = stages.find(s => s.is_lost) || null;
  const isWon = !!stage?.is_won;
  const isLost = !!stage?.is_lost;

  const [tab, setTab] = useState<DetailTab>(initialTab);

  // Vendedores (com foto) p/ resolver o responsável pelo lead e alimentar o
  // seletor de responsável na criação de tarefa.
  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-lead-detail'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, user_id, photo_url');
      if (error) throw error;
      return data || [];
    },
  });
  const responsibleSalesperson = lead.responsible_id
    ? salespeople.find((sp: any) => sp.user_id === lead.responsible_id) || null
    : null;

  const taskAdmins = useMemo<TaskAdminOption[]>(
    () =>
      (salespeople as any[])
        .filter(sp => !!sp.user_id)
        .map(sp => ({ user_id: sp.user_id as string, full_name: sp.name as string, photo_url: sp.photo_url ?? null })),
    [salespeople],
  );

  // ── Tarefas desta oportunidade ──────────────────────────────────────────
  // `showFuture: true` de propósito: aqui o usuário quer ver a cadência INTEIRA
  // de follow-ups do lead, não só o que vence hoje (o recorte do quadro geral).
  const {
    tasks,
    isLoading: tasksLoading,
    createTask,
    updateTask,
    deleteTask,
  } = useAdminTasks({ crm_lead_id: lead.id }, { showFuture: true });

  const openTasksCount = tasks.filter(t => t.status !== 'resolvido').length;

  const [newType, setNewType] = useState('ligacao');
  const [newDesc, setNewDesc] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lossDialogOpen, setLossDialogOpen] = useState(false);
  const [vendaDialogOpen, setVendaDialogOpen] = useState(false);
  const [taskCreateOpen, setTaskCreateOpen] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<AdminTask | null>(null);

  const whatsappLink = buildWhatsAppLink(lead.phone);

  // ── Autosave de "Observações" ───────────────────────────────────────────
  // Mesmo padrão do LeadDetailModal do tenant: baseline "último salvo" +
  // debounce curto + flush ao desmontar, pra nunca perder o que foi digitado.
  // Usa `updateLeadNotes` (mutation silenciosa) em vez de `updateLead`, senão
  // o usuário levaria um toast a cada 800ms de digitação. Reidrata só quando
  // troca de LEAD — o form de edição abre em outro modal e nunca escreve
  // `notes` ao mesmo tempo.
  const [notesValue, setNotesValue] = useState(lead.notes ?? '');
  const [notesDirty, setNotesDirty] = useState(false);
  const [notesSaveError, setNotesSaveError] = useState(false);
  const notesLeadIdRef = useRef<string>(lead.id);
  const notesLastSavedRef = useRef<string>(lead.notes ?? '');
  const notesValueRef = useRef(notesValue);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  notesValueRef.current = notesValue;

  useEffect(() => {
    if (notesLeadIdRef.current === lead.id) return;
    notesLeadIdRef.current = lead.id;
    notesLastSavedRef.current = lead.notes ?? '';
    setNotesValue(lead.notes ?? '');
    setNotesDirty(false);
    setNotesSaveError(false);
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const saveNotesNow = useCallback((value: string) => {
    if (notesTimerRef.current) { clearTimeout(notesTimerRef.current); notesTimerRef.current = null; }
    if (value === notesLastSavedRef.current) { setNotesDirty(false); return; }
    updateLeadNotes.mutate(
      { id: lead.id, notes: value || null },
      {
        onSuccess: () => {
          // Só confirma "Salvo" se nada novo foi digitado enquanto a request
          // estava em voo — senão o indicador mentiria com edição pendente.
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
  }, [lead.id]);

  useEffect(() => {
    if (notesValue === notesLastSavedRef.current) { setNotesDirty(false); return; }
    setNotesDirty(true);
    setNotesSaveError(false);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => saveNotesNow(notesValue), 800);
    return () => { if (notesTimerRef.current) clearTimeout(notesTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notesValue, lead.id]);

  // Flush ao desmontar (fechar o modal antes do debounce vencer).
  useEffect(() => () => {
    if (notesTimerRef.current) saveNotesNow(notesValueRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Editar abre outro modal que também grava `notes`: descarrega o autosave
  // antes, senão o debounce pendente sobrescreveria o que o form salvar.
  const handleEditClick = () => {
    if (notesTimerRef.current) saveNotesNow(notesValueRef.current);
    setEditOpen(true);
  };

  // Perder: abre dialog de motivo e move pro estágio is_lost gravando loss_reason.
  // Reaproveita o mesmo LossReasonDialog usado no drag do kanban.
  const handleLossConfirm = (reason: string, details: string) => {
    if (!lostStage) return;
    const combined = details.trim() ? `${reason} — ${details.trim()}` : reason;
    updateLead.mutate({ id: lead.id, stage_id: lostStage.id, loss_reason: combined });
    setLossDialogOpen(false);
  };

  // Ganhar = gerar a venda (marcando SDR + Closer). O botão só ABRE o diálogo de
  // venda; o lead NÃO vira ganho aqui. Sem venda salva = sem ganho.
  const handleWin = () => {
    if (!wonStage) return;
    setVendaDialogOpen(true);
  };

  // Disparado pelo RegistrarVendaDialog só após a venda ser gravada. Aí sim
  // movemos o lead pro estágio is_won e fechamos o modal de detalhe.
  const handleVendaSuccess = () => {
    if (!wonStage) return;
    updateLead.mutate({ id: lead.id, stage_id: wonStage.id });
    onOpenChange(false);
  };

  const handleAddInteraction = () => {
    if (!newDesc.trim()) return;
    createInteraction.mutate({
      lead_id: lead.id,
      interaction_type: newType,
      description: newDesc.trim(),
      created_by: user?.id,
    });
    setNewDesc('');
    setShowForm(false);
  };

  const handleDelete = () => {
    deleteLead.mutate(lead.id);
    setDeleteConfirmOpen(false);
    onOpenChange(false);
  };

  const handleToggleTaskDone = (task: AdminTask) => {
    updateTask.mutate({ id: task.id, status: task.status === 'resolvido' ? 'novo' : 'resolvido' });
  };

  const originInfo = lead.source ? origins.find(o => o.name === lead.source) : null;
  const segmentInfo = getSegment(lead.segment);

  const formatCurrency = (v: number | null) => v ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '-';

  const todayStr = new Date().toISOString().split('T')[0];

  /** Registro automático de mudança de etapa: um JSON com os NOMES no momento
   *  da troca (leadStageHistory.ts). Parse falhou? cai pro texto cru, em vez de
   *  sumir com o registro. */
  const renderStageChangeText = (raw: string | null) => {
    const snapshot = parseStageChangeDescription(raw);
    if (!snapshot) return raw || '';
    const toName = snapshot.to_stage_name || 'Etapa removida';
    return snapshot.from_stage_name
      ? `De "${snapshot.from_stage_name}" para "${toName}"`
      : `Movido para "${toName}"`;
  };

  const leadFooter = (
    <div className="flex flex-col gap-3">
      {/* Linha principal de fechamento — só aparece com o lead ainda aberto.
          Ganho → selo verde; Perdido → motivo em destaque vermelho. */}
      {isWon ? (
        <div className="flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2.5 text-success">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <span className="font-semibold text-sm">Negócio ganho</span>
        </div>
      ) : isLost ? (
        <div className="flex flex-col gap-1 rounded-lg bg-destructive/10 px-3 py-2.5">
          <span className="inline-flex items-center gap-1.5 font-semibold text-sm text-destructive">
            <X className="h-4 w-4 shrink-0" /> Negócio perdido
          </span>
          {lead.loss_reason && (
            <span className="text-xs text-muted-foreground pl-6">{lead.loss_reason}</span>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            onClick={() => setLossDialogOpen(true)}
            disabled={!lostStage}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground py-3 h-auto text-base font-semibold"
          >
            <X className="h-5 w-5 mr-2" /> Perder
          </Button>
          <Button
            onClick={handleWin}
            disabled={!wonStage}
            className="bg-emerald-600 hover:bg-emerald-700 text-white py-3 h-auto text-base font-semibold"
          >
            <Trophy className="h-5 w-5 mr-2" /> Ganhar
          </Button>
        </div>
      )}

      {/* Linha utilitária — Editar / Excluir */}
      <div className="flex items-center justify-end gap-2">
        <Button
          size="sm"
          className="bg-orange-500 hover:bg-orange-600 text-white"
          onClick={handleEditClick}
        >
          <Pencil className="h-3.5 w-3.5 mr-1.5" /> Editar
        </Button>
        <Button size="sm" variant="destructive" onClick={() => setDeleteConfirmOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Excluir
        </Button>
      </div>
    </div>
  );

  return (
    <>
      <ResponsiveModal open={open} onOpenChange={onOpenChange} title="Lead" footer={leadFooter}>
        <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="detalhes">Detalhes</TabsTrigger>
            <TabsTrigger value="tarefas">
              <span className="inline-flex items-center gap-1.5">
                Tarefas
                {openTasksCount > 0 && (
                  <Badge className="h-4 min-w-4 px-1 text-[10px] bg-primary text-primary-foreground border-0">
                    {openTasksCount}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
            <TabsTrigger value="historico">
              <span className="inline-flex items-center gap-1.5">
                Histórico
                {interactions.length > 0 && (
                  <Badge variant="muted" className="h-4 min-w-4 px-1 text-[10px] border-0">
                    {interactions.length}
                  </Badge>
                )}
              </span>
            </TabsTrigger>
          </TabsList>

          {/* ================= DETALHES ================= */}
          <TabsContent value="detalhes" className="mt-4">
            <div className="max-h-[60vh] overflow-y-auto">
              <div className="space-y-4 pr-2">
                {/* Atalho rápido de contato */}
                {whatsappLink && (
                  <div className="flex justify-end">
                    <Button
                      size="sm"
                      className="bg-[#25D366] hover:bg-[#1da851] text-white"
                      onClick={() => window.open(whatsappLink, '_blank', 'noopener,noreferrer')}
                    >
                      <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                    </Button>
                  </div>
                )}

                {/* Contato */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Contato</h3>
                  <p className="text-base font-bold mb-2">{lead.title}</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Telefone</span>
                      <p className="font-medium">{lead.phone ? phoneMask(lead.phone) : <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">E-mail</span>
                      <p className="font-medium truncate">{lead.email || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[11px] text-muted-foreground/70">Origem</span>
                      <div className="mt-0.5">
                        {originInfo ? (
                          <Badge className="border-0 flex items-center gap-1 w-fit" style={{ backgroundColor: originInfo.color || '#6B7280', color: '#fff' }}>
                            <OriginIcon name={originInfo.icon || 'Globe'} className="h-3 w-3" />
                            {lead.source}
                          </Badge>
                        ) : lead.source ? (
                          <Badge variant="muted">{lead.source}</Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground/40 italic">—</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[11px] text-muted-foreground/70">Segmento</span>
                      <div className="mt-0.5">
                        {segmentInfo ? (
                          <Badge className="border-0 flex items-center gap-1 w-fit" style={{ backgroundColor: segmentInfo.color, color: '#fff' }}>
                            <segmentInfo.icon className="h-3 w-3" />
                            {segmentInfo.label}
                          </Badge>
                        ) : (
                          <span className="text-sm text-muted-foreground/40 italic">—</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Negociação */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Negociação</h3>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Empresa</span>
                      <p className="font-medium">{lead.company_name || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Contato</span>
                      <p className="font-medium">{lead.contact_name || <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Valor</span>
                      <p className="font-medium text-green-600">{formatCurrency(lead.value)}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Etapa</span>
                      <div className="mt-0.5">
                        {stage ? (
                          <Badge style={{ backgroundColor: stage.color, color: '#fff' }}>{stage.name}</Badge>
                        ) : (
                          <span className="text-muted-foreground/40 italic">—</span>
                        )}
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Previsão de Fechamento</span>
                      <p className="font-medium">{lead.expected_close_date ? format(new Date(lead.expected_close_date + 'T12:00:00'), 'dd/MM/yyyy') : <span className="text-muted-foreground/40 italic font-normal">—</span>}</p>
                    </div>
                    <div>
                      <span className="text-[11px] text-muted-foreground/70">Probabilidade</span>
                      <p className="font-medium">
                        {lead.probability !== null && lead.probability !== undefined
                          ? `${lead.probability}%`
                          : <span className="text-muted-foreground/40 italic font-normal">—</span>}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <span className="text-[11px] text-muted-foreground/70">Responsável</span>
                      <div className="mt-0.5">
                        {responsibleSalesperson ? (
                          <div className="flex items-center gap-2">
                            <SalespersonAvatar
                              name={responsibleSalesperson.name}
                              photoUrl={(responsibleSalesperson as any).photo_url}
                              size="sm"
                            />
                            <span className="font-medium">{responsibleSalesperson.name}</span>
                          </div>
                        ) : (
                          <Badge variant="warning" className="gap-1 text-[10px] px-1.5 py-0.5 font-normal">
                            Sem responsável
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Observações — digita direto, salva sozinho. */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Observações</h3>
                    <span className="text-[11px] text-muted-foreground">
                      {notesSaveError ? (
                        <span className="text-destructive">Não salvou. Tentando de novo ao digitar.</span>
                      ) : notesDirty ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                        </span>
                      ) : (
                        'Salvo'
                      )}
                    </span>
                  </div>
                  <Textarea
                    value={notesValue}
                    onChange={e => setNotesValue(e.target.value)}
                    placeholder="Anote o que importa sobre este lead..."
                    rows={4}
                  />
                </div>
                {/* Motivo da perda aparece no rodapé (selo de fechamento). */}
              </div>
            </div>
          </TabsContent>

          {/* ================= TAREFAS ================= */}
          <TabsContent value="tarefas" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <ListChecks className="h-4 w-4" /> Tarefas ({tasks.length})
                </h3>
                <Button size="sm" variant="outline" onClick={() => setTaskCreateOpen(true)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Nova
                </Button>
              </div>

              <div className="max-h-[52vh] overflow-y-auto pr-1">
                {tasksLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-lg bg-muted/50 animate-pulse" />)}
                  </div>
                ) : tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <ListChecks className="h-12 w-12 text-muted-foreground mb-3" />
                    <h4 className="font-medium">Nenhuma tarefa</h4>
                    <p className="text-sm text-muted-foreground">Crie uma tarefa para não perder o próximo passo deste lead.</p>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card divide-y overflow-hidden">
                    {tasks.map(task => {
                      const isDone = task.status === 'resolvido';
                      const isOverdue = !isDone && !!task.due_date && task.due_date < todayStr;
                      const typeConfig = TASK_TYPE_CONFIG[task.type];
                      const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
                      return (
                        <div key={task.id} className="flex items-center gap-2 p-3">
                          <button
                            type="button"
                            onClick={() => handleToggleTaskDone(task)}
                            title={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
                            aria-label={isDone ? 'Reabrir tarefa' : 'Concluir tarefa'}
                            className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                          >
                            {isDone ? <CheckCircle2 className="h-5 w-5 text-success" /> : <Circle className="h-5 w-5" />}
                          </button>

                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm font-medium truncate', isDone && 'line-through text-muted-foreground')}>
                              {task.title}
                            </p>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs text-muted-foreground">
                              <Badge className={cn('text-[10px] px-1.5 py-0 border-0 font-normal', typeConfig.className)}>
                                {typeConfig.label}
                              </Badge>
                              {task.due_date && (
                                <span className={cn('inline-flex items-center gap-1 shrink-0', isOverdue && 'text-destructive font-medium')}>
                                  <Calendar className="h-3 w-3 shrink-0" />
                                  {format(new Date(`${task.due_date}T12:00:00`), 'dd/MM/yyyy')}
                                  {isOverdue ? ' · vencida' : ''}
                                </span>
                              )}
                              {task.assigned_profile ? (
                                <span className="inline-flex items-center gap-1 min-w-0 truncate max-w-[150px]">
                                  <UserIcon className="h-3 w-3 shrink-0" />
                                  <span className="truncate">{task.assigned_profile.full_name}</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 italic">
                                  <UserIcon className="h-3 w-3 shrink-0" /> Sem responsável
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <Badge className={cn('text-[10px] px-1.5 py-0 border-0 font-normal', priorityConfig.className)}>
                              {priorityConfig.label}
                            </Badge>
                            <Button
                              type="button"
                              variant="destructive-ghost"
                              size="icon"
                              className="h-8 w-8"
                              aria-label="Excluir tarefa"
                              onClick={() => setTaskToDelete(task)}
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
            </div>
          </TabsContent>

          {/* ================= HISTÓRICO ================= */}
          <TabsContent value="historico" className="mt-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <MessageCircle className="h-4 w-4" /> Histórico ({interactions.length})
                </h3>
                <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Novo
                </Button>
              </div>

              {showForm && (
                <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                  <Select value={newType} onValueChange={setNewType}>
                    <SelectTrigger className="h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ADMIN_INTERACTION_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Descreva a interação..." rows={2} />
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
                    <Button size="sm" onClick={handleAddInteraction} disabled={!newDesc.trim()}>Salvar</Button>
                  </div>
                </div>
              )}

              <div className="max-h-[52vh] overflow-y-auto pr-1 space-y-2">
                {interactions.map(i => {
                  const isStageChange = i.interaction_type === STAGE_CHANGE_INTERACTION_TYPE;
                  const typeInfo = ADMIN_INTERACTION_TYPES.find(t => t.value === i.interaction_type);
                  return (
                    <div key={i.id} className="border rounded-lg p-3 text-sm space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate inline-flex items-center gap-1.5">
                          {isStageChange ? (
                            <>
                              <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />
                              Mudança de etapa
                            </>
                          ) : (
                            <>{typeInfo?.icon} {typeInfo?.label || i.interaction_type}</>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">{formatBrDateTime(i.created_at)}</span>
                      </div>
                      {i.description && (
                        <p className="text-muted-foreground whitespace-pre-wrap">
                          {isStageChange ? renderStageChangeText(i.description) : i.description}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground/70">
                        por {i.author_name || 'Sistema'}
                      </p>
                    </div>
                  );
                })}
                {interactions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Nenhum registro no histórico</p>
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </ResponsiveModal>

      <AdminLeadFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        editingLead={lead}
      />

      <TaskCreateDialog
        open={taskCreateOpen}
        onOpenChange={setTaskCreateOpen}
        admins={taskAdmins}
        isLoading={createTask.isPending}
        onSubmit={(task) => {
          // Já nasce amarrada a esta oportunidade — é isso que faz a tarefa
          // aparecer aqui e no card de follow-up do quadro geral.
          createTask.mutate({ ...task, crm_lead_id: lead.id });
        }}
      />

      <LossReasonDialog
        open={lossDialogOpen}
        onOpenChange={setLossDialogOpen}
        leadTitle={lead.title}
        onConfirm={handleLossConfirm}
      />

      {/* Ganhar → registra a venda (SDR + Closer). O lead só vira ganho no
          onSuccess; cancelar o diálogo deixa o lead aberto. */}
      <RegistrarVendaDialog
        open={vendaDialogOpen}
        onOpenChange={setVendaDialogOpen}
        prefill={{
          companyName: lead.company_name ?? undefined,
          value: lead.value ?? undefined,
          leadId: lead.id,
        }}
        onSuccess={handleVendaSuccess}
      />

      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lead?</AlertDialogTitle>
            <AlertDialogDescription>
              O lead "{lead.title}" será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-white hover:bg-destructive/90" onClick={handleDelete}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!taskToDelete} onOpenChange={(o) => !o && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              A tarefa "{taskToDelete?.title}" será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                if (taskToDelete) deleteTask.mutate(taskToDelete.id);
                setTaskToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
