import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  ArrowLeft,
  Pencil,
  Trash2,
  Plus,
  Settings2,
  Workflow,
  ListChecks,
  LayoutDashboard,
  LayoutGrid,
  CalendarDays,
  CalendarClock,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { fuzzyIncludes } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { EmptyState } from '@/components/mobile/EmptyState';
import { SettingsSidebarLayout, type SettingsTab } from '@/components/SettingsSidebarLayout';
import type { RowAction } from '@/components/ui/RowActionsMenu';
import { IconPreview } from '@/components/customers/originIcons';
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog';
import { ProjectPipelineFormDialog } from '@/components/projects/ProjectPipelineFormDialog';
import { PipelineTabsBar } from '@/components/crm/PipelineTabsBar';
import { LeadCard } from '@/components/crm/LeadCard';
import { LeadDetailModal } from '@/components/crm/LeadDetailModal';
import { LeadFormDialog } from '@/components/crm/LeadFormDialog';
import { StageManagerDialog } from '@/components/crm/StageManagerDialog';
import {
  CrmTaskAgendaView,
  CrmTaskKanbanBoard,
  type CrmOpportunityTask,
  type CrmTaskStatus,
} from '@/components/crm/CrmTaskViews';
import { useProjects, type Project, type ProjectStatus } from '@/hooks/useProjects';
import { useProjectProgress } from '@/hooks/useProjectProgress';
import { projectProgressPct } from '@/lib/projectProgress';
import { useProjectPipelines } from '@/hooks/useProjectPipelines';
import type { CrmPipeline } from '@/hooks/useCrmPipelines';
import { useCrmStages } from '@/hooks/useCrmStages';
import { useLeads, type Lead } from '@/hooks/useLeads';
import { useCustomers } from '@/hooks/useCustomers';
import { useUsers } from '@/hooks/useUsers';
import { useServiceOrders } from '@/hooks/useServiceOrders';
import { useProfiles } from '@/hooks/useProfiles';
import { useTeams } from '@/hooks/useTeams';
import { collapseRecurringOccurrences } from '@/lib/taskRecurrence';
import { canSeeAllTasks, isMyTask } from '@/lib/taskVisibility';
import { useAuth } from '@/contexts/AuthContext';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';

const STATUS_BADGE_VARIANT: Record<ProjectStatus, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = {
  planejada: 'muted',
  em_andamento: 'info',
  pausada: 'warning',
  concluida: 'success',
  cancelada: 'destructive',
};

const STATUS_ICONS: Record<ProjectStatus, LucideIcon> = {
  planejada: CalendarClock,
  em_andamento: PlayCircle,
  pausada: PauseCircle,
  concluida: CheckCircle2,
  cancelada: XCircle,
};

type DetailTab = 'overview' | 'frentes' | 'tarefas';

/** Mesmo mapeamento de cor usado no kanban de /crm (CRM.tsx), duplicado aqui
 *  de propósito — a régua do briefing proíbe importar daquele arquivo. */
function getStageHeaderStyle(color: string): { className?: string; style?: React.CSSProperties } {
  const legacyMap: Record<string, string> = {
    muted: 'bg-muted-foreground',
    info: 'bg-info',
    warning: 'bg-warning',
    success: 'bg-success',
    destructive: 'bg-destructive',
    primary: 'bg-primary',
  };
  if (legacyMap[color]) return { className: legacyMap[color] };
  return { style: { backgroundColor: color } };
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { locale, timezone } = useAppLocaleContext();
  const { user, isAdminOrGestor, hasPermission, roles, permissions, hasPermissionRecord } = useAuth();
  const t = MESSAGES[locale].app.projects;
  const td = t.detail;
  const tc = MESSAGES[locale].app.common;

  // Mesmo gate de escrita da listagem (Projects.tsx) — espelha
  // `public.can_manage_system`.
  const canManageProjects = isAdminOrGestor() || hasPermission('fn:manage_settings');

  const { projects, isLoading: projectsLoading } = useProjects();
  const project = useMemo(() => projects.find((p) => p.id === id) ?? null, [projects, id]);

  const { getProgress } = useProjectProgress();
  const progressRow = project ? getProgress(project.id) : null;
  const progressPct = progressRow ? projectProgressPct(progressRow) : null;

  const { customers } = useCustomers();
  const { users } = useUsers();
  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);
  const userNameById = useMemo(() => new Map(users.map((u) => [u.user_id, u.full_name])), [users]);

  const {
    pipelines,
    createProjectPipeline,
    deleteProjectPipeline,
  } = useProjectPipelines(project?.id ?? null);

  const { stages: allStages } = useCrmStages();
  const { leads: allLeads, updateLead } = useLeads();

  const pipelineIds = useMemo(() => new Set(pipelines.map((p) => p.id)), [pipelines]);
  const stagesForProject = useMemo(
    () => allStages.filter((s) => pipelineIds.has(s.pipeline_id)),
    [allStages, pipelineIds],
  );
  const leadsForProject = useMemo(
    () => (allLeads as Lead[]).filter((l) => pipelineIds.has(l.pipeline_id)),
    [allLeads, pipelineIds],
  );

  const cardCountByPipeline = useMemo(() => {
    const map = new Map<string, number>();
    for (const lead of leadsForProject) {
      map.set(lead.pipeline_id, (map.get(lead.pipeline_id) ?? 0) + 1);
    }
    return map;
  }, [leadsForProject]);

  const cardCountLabel = (count: number) =>
    (count === 1 ? td.overviewFrontsCardCount : td.overviewFrontsCardCountPlural).replace(
      '{count}',
      String(count),
    );

  // ── Abas ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');
  const tabs: SettingsTab[] = [
    { value: 'overview', label: td.tabOverview, icon: LayoutDashboard },
    { value: 'frentes', label: td.tabFronts, icon: Workflow },
    { value: 'tarefas', label: td.tabTasks, icon: ListChecks },
  ];

  // ── Frente selecionada (aba Frentes) ────────────────────────────────────
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  useEffect(() => {
    if (selectedPipelineId && pipelines.some((p) => p.id === selectedPipelineId)) return;
    setSelectedPipelineId(pipelines[0]?.id ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipelines]);

  const selectedPipeline = pipelines.find((p) => p.id === selectedPipelineId) ?? null;
  const stagesInSelected = useMemo(
    () =>
      stagesForProject
        .filter((s) => s.pipeline_id === selectedPipelineId)
        .sort((a, b) => a.position - b.position),
    [stagesForProject, selectedPipelineId],
  );
  const leadsInSelectedPipeline = useMemo(
    () => leadsForProject.filter((l) => l.pipeline_id === selectedPipelineId),
    [leadsForProject, selectedPipelineId],
  );
  const leadsByStage = useMemo(() => {
    const firstStageId = stagesInSelected[0]?.id ?? null;
    return leadsInSelectedPipeline.reduce((acc, lead) => {
      const stageId = lead.stage_id || firstStageId || 'unassigned';
      (acc[stageId] ??= []).push(lead);
      return acc;
    }, {} as Record<string, Lead[]>);
  }, [leadsInSelectedPipeline, stagesInSelected]);

  // ── Dialog: editar o projeto em si ──────────────────────────────────────
  const [projectFormOpen, setProjectFormOpen] = useState(false);

  // ── Dialog: criar/editar frente ─────────────────────────────────────────
  const [frontDialogOpen, setFrontDialogOpen] = useState(false);
  const [editingFront, setEditingFront] = useState<CrmPipeline | null>(null);
  const openCreateFront = () => { setEditingFront(null); setFrontDialogOpen(true); };

  // ── Dialog: excluir frente ───────────────────────────────────────────────
  const [deleteFrontTarget, setDeleteFrontTarget] = useState<CrmPipeline | null>(null);
  const confirmDeleteFront = () => {
    if (!deleteFrontTarget) return;
    deleteProjectPipeline.mutate(deleteFrontTarget.id, {
      onSuccess: () => {
        setDeleteFrontTarget(null);
        if (selectedPipelineId === deleteFrontTarget.id) setSelectedPipelineId(null);
      },
    });
  };

  // ── Gerenciar etapas de uma frente ──────────────────────────────────────
  const [stageManagerOpen, setStageManagerOpen] = useState(false);
  const [stageManagerPipelineId, setStageManagerPipelineId] = useState<string | undefined>(undefined);

  // ── Card (oportunidade) — criar/editar/detalhe ──────────────────────────
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailInitialTab, setDetailInitialTab] = useState<'detalhes' | 'tarefas' | 'historico'>('detalhes');
  const detailLead = leadsForProject.find((l) => l.id === detailLeadId) ?? null;

  const openLeadDetail = (lead: Lead) => {
    setDetailLeadId(lead.id);
    setDetailInitialTab('detalhes');
    setDetailOpen(true);
  };

  const handleEditLead = (lead: Lead) => {
    setDetailOpen(false);
    setEditingLead(lead);
    setLeadFormOpen(true);
  };

  // Fonte única de troca de etapa dentro do projeto: SEM diálogo de motivo de
  // perda nem oferta de receita (frente de obra não tem `tracks_value` nem
  // vocabulário de venda) — ao contrário de requestStageChange em CRM.tsx.
  const handleStageChange = async (lead: Lead, stageId: string) => {
    await updateLead.mutateAsync({ id: lead.id, stage_id: stageId });
  };

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    e.dataTransfer.setData('text/plain', lead.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, stageId: string) => {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    if (!leadId) return;
    const lead = leadsInSelectedPipeline.find((l) => l.id === leadId);
    if (!lead || lead.stage_id === stageId) return;
    await handleStageChange(lead, stageId);
  };

  // ── Tarefas ──────────────────────────────────────────────────────────────
  const { serviceOrders, updateServiceOrder } = useServiceOrders();
  const { data: profiles = [] } = useProfiles();
  const profileMap = useMemo(() => new Map(profiles.map((p) => [p.user_id, p])), [profiles]);
  const { teamsWithMembers } = useTeams();
  // Criação de tarefa dedicada (TaskFormDialog) fica pra uma onda futura —
  // hoje a tarefa nasce de dentro do card (aba "Tarefas" do LeadDetailModal),
  // que já tem seu próprio fluxo de criação/edição.

  const projectLeadIds = useMemo(() => new Set(leadsForProject.map((l) => l.id)), [leadsForProject]);
  const leadTitleMap = useMemo(() => new Map(leadsForProject.map((l) => [l.id, l.title])), [leadsForProject]);
  const myTeamIds = useMemo(
    () => (user?.id ? teamsWithMembers.filter((team) => team.members.some((m) => m.user_id === user.id)).map((team) => team.id) : []),
    [teamsWithMembers, user?.id],
  );
  const canSeeEveryTask = useMemo(
    () => canSeeAllTasks({ roles, permissions, hasPermissionRecord }),
    [roles, permissions, hasPermissionRecord],
  );
  const opportunityTasks = useMemo(
    () =>
      (serviceOrders as any[]).filter((o) => {
        if (o.entry_type !== 'tarefa' || !o.lead_id || !projectLeadIds.has(o.lead_id)) return false;
        return canSeeEveryTask || isMyTask(o, user?.id, myTeamIds);
      }),
    [serviceOrders, projectLeadIds, canSeeEveryTask, user?.id, myTeamIds],
  );
  const collapsedTasks = useMemo(() => collapseRecurringOccurrences(opportunityTasks), [opportunityTasks]);

  const [taskSearch, setTaskSearch] = useState('');
  const [taskView, setTaskView] = useState<'kanban' | 'agenda'>('kanban');
  const filteredTasks = useMemo(() => {
    if (!taskSearch.trim()) return collapsedTasks;
    return collapsedTasks.filter((task: any) => fuzzyIncludes(task.task_title || '', taskSearch));
  }, [collapsedTasks, taskSearch]);

  const handleTaskStatusChange = async (task: CrmOpportunityTask, status: CrmTaskStatus) => {
    if (task.status === status) return;
    await updateServiceOrder.mutateAsync({ id: task.id, status } as any);
  };

  const openTaskDetail = (task: CrmOpportunityTask) => {
    if (!task.lead_id) return;
    setDetailLeadId(task.lead_id);
    setDetailInitialTab('tarefas');
    setDetailOpen(true);
  };

  // ── Estado de carregamento / não encontrado ─────────────────────────────
  if (projectsLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate('/projetos')}>
          <ArrowLeft className="h-4 w-4" /> {td.back}
        </Button>
        <Card>
          <CardContent className="py-10">
            <EmptyState icon={<FolderKanban className="h-12 w-12" />} title={td.notFoundTitle} description={td.notFoundDesc} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = (project.status as ProjectStatus) ?? 'em_andamento';
  const StatusIcon = STATUS_ICONS[status] ?? PlayCircle;
  const statusLabels: Record<ProjectStatus, string> = {
    planejada: t.statusPlanejada,
    em_andamento: t.statusEmAndamento,
    pausada: t.statusPausada,
    concluida: t.statusConcluida,
    cancelada: t.statusCancelada,
  };

  const customerLabel = project.customer_id ? customerNameById.get(project.customer_id) ?? '—' : t.internalProject;
  const responsibleLabel = project.responsible_user_id
    ? userNameById.get(project.responsible_user_id) ?? '—'
    : t.form.fieldResponsibleNone;
  const deadlineLabel = project.end_date ? formatDate(project.end_date, locale, timezone) : t.noDeadline;
  const startLabel = project.start_date ? formatDate(project.start_date, locale, timezone) : '—';

  // ------------------------------------------------------------------
  // VISÃO GERAL
  // ------------------------------------------------------------------
  const overviewContent = (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_BADGE_VARIANT[status]} className="gap-1.5">
              <StatusIcon className="h-3.5 w-3.5" />
              {statusLabels[status]}
            </Badge>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs text-muted-foreground">{td.overviewCustomer}</p>
              <p className="text-sm font-medium truncate">{customerLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{td.overviewResponsible}</p>
              <p className="text-sm font-medium truncate">{responsibleLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{td.overviewStart}</p>
              <p className="text-sm font-medium">{startLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{td.overviewDeadline}</p>
              <p className="text-sm font-medium">{deadlineLabel}</p>
            </div>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-1">{td.overviewDescription}</p>
            <p className="text-sm whitespace-pre-wrap">{project.description || td.overviewNoDescription}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">{td.overviewProgress}</p>
            {progressPct === null ? (
              <span className="text-sm text-muted-foreground" title={t.progressUnavailable}>—</span>
            ) : (
              <div className="flex items-center gap-2">
                <Progress value={progressPct} className="h-2 flex-1" />
                <span className="w-10 shrink-0 text-right text-sm font-medium text-muted-foreground">{progressPct}%</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 sm:p-6">
          <p className="text-sm font-semibold mb-3">{td.overviewFrontsTitle}</p>
          {pipelines.length === 0 ? (
            <EmptyState
              size="compact"
              icon={<Workflow className="h-10 w-10" />}
              title={td.overviewEmptyFrontsTitle}
              description={td.overviewEmptyFrontsDesc}
              action={canManageProjects ? { label: td.overviewEmptyFrontsAction, onClick: openCreateFront } : undefined}
            />
          ) : (
            <div className="rounded-xl border divide-y overflow-hidden">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setActiveTab('frentes'); setSelectedPipelineId(p.id); }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 active:bg-muted/60"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                    <span className="truncate text-sm font-medium">{p.name}</span>
                  </span>
                  <Badge variant="secondary" className="shrink-0 whitespace-nowrap">
                    {cardCountLabel(cardCountByPipeline.get(p.id) ?? 0)}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ------------------------------------------------------------------
  // FRENTES (quadro) — quadro PRÓPRIO, deliberadamente mais simples que o
  // kanban comercial de CRM.tsx: sem LossReasonDialog, sem oferta de receita,
  // sem reorder de coluna, sem filtros de R$ (frente de projeto nunca soma
  // valor — `tracks_value: false`).
  // ------------------------------------------------------------------
  const pipelineMenuActions = (p: CrmPipeline): RowAction[] => [
    {
      label: td.frontsManageStages,
      icon: Settings2,
      onClick: () => { setStageManagerPipelineId(p.id); setStageManagerOpen(true); },
    },
    {
      label: td.frontsEditFront,
      icon: Pencil,
      variant: 'edit',
      onClick: () => { setEditingFront(p); setFrontDialogOpen(true); },
    },
    {
      label: td.frontsDeleteFront,
      icon: Trash2,
      variant: 'delete',
      onClick: () => setDeleteFrontTarget(p),
    },
  ];

  const frontsContent =
    pipelines.length === 0 ? (
      <Card>
        <CardContent className="py-10">
          <EmptyState
            icon={<Workflow className="h-12 w-12" />}
            title={td.frontsEmptyNoFrontsTitle}
            description={td.frontsEmptyNoFrontsDesc}
            action={canManageProjects ? { label: td.frontsEmptyNoFrontsAction, onClick: openCreateFront } : undefined}
          />
        </CardContent>
      </Card>
    ) : (
      <div className="space-y-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="min-w-0 max-w-[52%] shrink-0 sm:max-w-[34%]">
            <h2 className="truncate text-base font-semibold sm:text-lg">{selectedPipeline?.name ?? td.tabFronts}</h2>
            <span className="mt-1 block h-0.5 w-full rounded-full" style={{ backgroundColor: selectedPipeline?.color ?? '#2563EB' }} />
          </div>
          <div className="min-w-0 flex-1">
            <PipelineTabsBar
              pipelines={pipelines}
              selectedId={selectedPipelineId}
              onSelect={setSelectedPipelineId}
              onCreate={openCreateFront}
              menuActions={pipelineMenuActions}
              mobile={isMobile}
              configureLabel={td.frontsConfigureFront}
              createLabel={td.frontsNewFront}
              listLabel={td.tabFronts}
              hideSelected
            />
          </div>
          {canManageProjects && (
            <Button
              size="sm"
              className="gap-2"
              disabled={!selectedPipelineId || stagesInSelected.length === 0}
              onClick={() => { setEditingLead(null); setLeadFormOpen(true); }}
            >
              <Plus className="h-4 w-4" /> {td.frontsNewCard}
            </Button>
          )}
        </div>

        {stagesInSelected.length === 0 ? (
          <Card>
            <CardContent className="py-10">
              <EmptyState
                icon={<Settings2 className="h-12 w-12" />}
                title={td.frontsEmptyBoardTitle}
                description={td.frontsEmptyBoardDesc}
                action={canManageProjects ? {
                  label: td.frontsManageStages,
                  onClick: () => { setStageManagerPipelineId(selectedPipelineId ?? undefined); setStageManagerOpen(true); },
                } : undefined}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-x-auto pb-4 -mx-1 px-1">
            <div className="flex items-stretch gap-3 sm:gap-4" style={{ minWidth: `${stagesInSelected.length * 280}px` }}>
              {stagesInSelected.map((stage) => (
                <div
                  key={stage.id}
                  className="flex w-[260px] shrink-0 flex-col sm:w-[300px]"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => handleDrop(e, stage.id)}
                >
                  <div
                    className={cn('shrink-0 rounded-t-lg p-3 text-white', getStageHeaderStyle(stage.color).className)}
                    style={getStageHeaderStyle(stage.color).style}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        {stage.icon && <IconPreview name={stage.icon} className="h-3.5 w-3.5 shrink-0" />}
                        <span className="truncate text-sm font-semibold">{stage.name}</span>
                      </span>
                      <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-xs font-medium">
                        {leadsByStage[stage.id]?.length || 0}
                      </span>
                    </div>
                  </div>
                  <ScrollArea className="h-[450px] rounded-b-lg border border-t-0 bg-card [&_[data-radix-scroll-area-viewport]>div]:!block">
                    <div className="space-y-3 p-3">
                      {(leadsByStage[stage.id] || []).map((lead) => (
                        <div
                          key={lead.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, lead)}
                          className="cursor-grab active:cursor-grabbing"
                        >
                          <LeadCard lead={lead} onClick={() => openLeadDetail(lead)} showValue={false} />
                        </div>
                      ))}
                      {(leadsByStage[stage.id]?.length || 0) === 0 && (
                        <EmptyState size="compact" icon={<Workflow className="h-10 w-10" />} title={td.frontsEmptyStageTitle} />
                      )}
                    </div>
                  </ScrollArea>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );

  // ------------------------------------------------------------------
  // TAREFAS — Decisão do CEO (2026-10-17): tarefa de frente de projeto vive
  // dentro do projeto, não na aba Tarefas do CRM (ver comentário em CRM.tsx).
  // Mesma régua de visibilidade (taskVisibility.ts) pra contagem não divergir.
  // ------------------------------------------------------------------
  const tasksContent = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder={td.tasksSearchPlaceholder}
          value={taskSearch}
          onChange={(e) => setTaskSearch(e.target.value)}
          className="max-w-xs flex-1"
        />
        <div className="ml-auto inline-flex overflow-hidden rounded-lg border">
          <button
            type="button"
            onClick={() => setTaskView('kanban')}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 px-3 text-sm transition-colors',
              taskView === 'kanban' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            <LayoutGrid className="h-4 w-4" /> {td.tasksViewKanban}
          </button>
          <button
            type="button"
            onClick={() => setTaskView('agenda')}
            className={cn(
              'inline-flex h-9 items-center gap-1.5 px-3 text-sm transition-colors',
              taskView === 'agenda' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
            )}
          >
            <CalendarDays className="h-4 w-4" /> {td.tasksViewAgenda}
          </button>
        </div>
      </div>

      {filteredTasks.length === 0 ? (
        <EmptyState icon={<ListChecks className="h-12 w-12" />} title={td.tasksEmptyTitle} description={td.tasksEmptyDesc} />
      ) : taskView === 'kanban' ? (
        <CrmTaskKanbanBoard
          tasks={filteredTasks as CrmOpportunityTask[]}
          leadTitleMap={leadTitleMap}
          profileMap={profileMap}
          onOpen={openTaskDetail}
          onStatusChange={handleTaskStatusChange}
        />
      ) : (
        <CrmTaskAgendaView
          tasks={filteredTasks as CrmOpportunityTask[]}
          leadTitleMap={leadTitleMap}
          profileMap={profileMap}
          onOpen={openTaskDetail}
          onStatusChange={handleTaskStatusChange}
        />
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2 gap-2" onClick={() => navigate('/projetos')}>
        <ArrowLeft className="h-4 w-4" /> {td.back}
      </Button>

      <PageHeader
        title={project.name}
        subtitle={project.code ? `#${project.code}` : undefined}
        icon={FolderKanban}
        actions={canManageProjects ? (
          <Button variant="outline" onClick={() => setProjectFormOpen(true)} className="gap-2">
            <Pencil className="h-4 w-4" /> {tc.edit}
          </Button>
        ) : undefined}
      />

      <SettingsSidebarLayout tabs={tabs} activeTab={activeTab} onTabChange={(v) => setActiveTab(v as DetailTab)}>
        {activeTab === 'overview' && overviewContent}
        {activeTab === 'frentes' && frontsContent}
        {activeTab === 'tarefas' && tasksContent}
      </SettingsSidebarLayout>

      {/* Editar o projeto em si (nome/cliente/responsável/status/prazo) */}
      <ProjectFormDialog open={projectFormOpen} onOpenChange={setProjectFormOpen} project={project} />

      {/* Criar/editar uma frente de trabalho */}
      <ProjectPipelineFormDialog
        open={frontDialogOpen}
        onOpenChange={(v) => { setFrontDialogOpen(v); if (!v) setEditingFront(null); }}
        projectId={project.id}
        pipeline={editingFront}
        onCreated={(newId) => { setActiveTab('frentes'); setSelectedPipelineId(newId); }}
      />

      {/* Excluir frente */}
      <AlertDialog open={!!deleteFrontTarget} onOpenChange={(v) => { if (!v) setDeleteFrontTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{td.frontDeleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{td.frontDeleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteFront} className="bg-destructive text-white hover:bg-destructive/90">
              {td.frontDeleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Gerenciar etapas de uma frente */}
      <StageManagerDialog
        open={stageManagerOpen}
        onOpenChange={setStageManagerOpen}
        pipelineId={stageManagerPipelineId}
        pipelineName={pipelines.find((p) => p.id === stageManagerPipelineId)?.name}
      />

      {/* Card (oportunidade) — criar/editar, ESCOPADO ao projeto: o seletor
          de "mover pra outro funil" só oferece frentes DESTE projeto, nunca
          funil comercial (ver projectId prop em LeadFormDialog/LeadDetailModal). */}
      <LeadFormDialog
        open={leadFormOpen}
        onOpenChange={(v) => { setLeadFormOpen(v); if (!v) setEditingLead(null); }}
        lead={editingLead}
        presetPipelineId={selectedPipelineId}
        projectId={project.id}
      />
      <LeadDetailModal
        open={detailOpen}
        onOpenChange={setDetailOpen}
        lead={detailLead}
        onEdit={handleEditLead}
        onStageChange={handleStageChange}
        initialTab={detailInitialTab}
        projectId={project.id}
      />
    </div>
  );
}
