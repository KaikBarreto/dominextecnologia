import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FolderKanban,
  Plus,
  Search,
  CalendarClock,
  PlayCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { fuzzyIncludesAny } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { KPICard } from '@/components/dashboard/KPICard';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobileListToolbar } from '@/components/mobile/MobileListToolbar';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FilterButton } from '@/components/ui/FilterButton';
import { SearchField } from '@/components/ui/search-field-actions';
import { FilterCheckboxGroup, type FilterCheckboxOption } from '@/components/mobile/FilterCheckboxGroup';
import { FABButton } from '@/components/mobile/FABButton';
import { RowActionsMenu } from '@/components/ui/RowActionsMenu';
import { ProjectFormDialog } from '@/components/projects/ProjectFormDialog';
import { useProjects, type Project, type ProjectStatus } from '@/hooks/useProjects';
import { useProjectProgress } from '@/hooks/useProjectProgress';
import { projectProgressPct } from '@/lib/projectProgress';
import { useCustomers } from '@/hooks/useCustomers';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { useAuth } from '@/contexts/AuthContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { formatDate } from '@/lib/format';
import { todayInTz } from '@/lib/timezone';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: ProjectStatus[] = ['planejada', 'em_andamento', 'pausada', 'concluida', 'cancelada'];

// Variants do Badge da casa (src/components/ui/badge.tsx) — todos já nascem
// saturados com texto branco garantido. Nunca `bg-primary`: no tema escuro
// (e no white-label) `--primary-foreground` é ESCURO, não branco, e o texto
// do selo sumiria (achado do mesmo dia no CRM).
const STATUS_BADGE_VARIANT: Record<ProjectStatus, 'muted' | 'info' | 'warning' | 'success' | 'destructive'> = {
  planejada: 'muted',
  em_andamento: 'info',
  pausada: 'warning',
  concluida: 'success',
  cancelada: 'destructive',
};

// Mesmos tokens, em classe de fundo — usados no círculo do ícone (mobile/desktop).
const STATUS_BG_CLASS: Record<ProjectStatus, string> = {
  planejada: 'bg-muted-foreground',
  em_andamento: 'bg-info',
  pausada: 'bg-warning',
  concluida: 'bg-success',
  cancelada: 'bg-destructive',
};

const STATUS_ICONS: Record<ProjectStatus, LucideIcon> = {
  planejada: CalendarClock,
  em_andamento: PlayCircle,
  pausada: PauseCircle,
  concluida: CheckCircle2,
  cancelada: XCircle,
};

/** Barra de progresso + percentual, ou "—" quando `projectProgressPct` devolve
 *  null (sem card, só card perdido, ou nenhuma etapa de ganho configurada).
 *  NUNCA renderiza a barra em 0% pra representar "sem dado" — ver o
 *  contrato documentado em src/lib/projectProgress.ts. */
function ProjectProgressBar({
  pct,
  unavailableHint,
  className,
}: {
  pct: number | null;
  unavailableHint: string;
  className?: string;
}) {
  if (pct === null) {
    return (
      <span className={cn('text-xs text-muted-foreground', className)} title={unavailableHint}>
        —
      </span>
    );
  }
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Progress value={pct} className="h-1.5 flex-1" />
      <span className="w-10 shrink-0 text-right text-[11px] font-medium text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default function Projects() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  // Clicar na linha ABRE o projeto — não edita. A tela de detalhe (`/projetos/:id`)
  // é onde moram as frentes, o progresso e as tarefas; sem este clique ela ficava
  // inalcançável pela interface (o menu da linha só tem editar/excluir). Achado
  // no QA de navegador em 2026-10-17, costura entre a lista e o detalhe.
  const openProject = (id: string) => navigate(`/projetos/${id}`);
  const { locale, timezone } = useAppLocaleContext();
  const { isAdminOrGestor, hasPermission } = useAuth();
  const t = MESSAGES[locale].app.projects;
  const tc = MESSAGES[locale].app.common;

  // Espelha `public.can_manage_system` (RLS de INSERT/UPDATE/DELETE de
  // projects) — mesmo gate já usado em PipelineManagerDialog/
  // useCanManageFinanceSettings pra telas administrativas equivalentes.
  // Quem não tem isso só VÊ a lista (a RLS de SELECT é aberta pra toda a
  // empresa); ações de escrita somem da UI em vez de falhar em silêncio.
  const canManageProjects = isAdminOrGestor() || hasPermission('fn:manage_settings');

  const { projects, isLoading, deleteProject } = useProjects();
  const { getProgress } = useProjectProgress();
  const { customers } = useCustomers();

  const customerNameById = useMemo(() => new Map(customers.map((c) => [c.id, c.name])), [customers]);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatus[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);

  const statusLabels: Record<ProjectStatus, string> = {
    planejada: t.statusPlanejada,
    em_andamento: t.statusEmAndamento,
    pausada: t.statusPausada,
    concluida: t.statusConcluida,
    cancelada: t.statusCancelada,
  };

  const today = todayInTz(timezone);

  // "Atrasado" = prazo final já passou e a obra não está concluída nem
  // cancelada — mesma régua pedida no briefing, calculada no fuso da EMPRESA
  // (nunca o do aparelho de quem está olhando a tela).
  const isOverdue = (p: Project) =>
    !!p.end_date && p.end_date < today && p.status !== 'concluida' && p.status !== 'cancelada';

  const kpis = useMemo(() => {
    const total = projects.length;
    const inProgress = projects.filter((p) => p.status === 'em_andamento').length;
    const overdue = projects.filter(isOverdue).length;
    const done = projects.filter((p) => p.status === 'concluida').length;
    return { total, inProgress, overdue, done };
  }, [projects, today]);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter.length > 0) {
      list = list.filter((p) => statusFilter.includes(p.status as ProjectStatus));
    }
    if (search.trim()) {
      list = list.filter((p) =>
        fuzzyIncludesAny([p.name, String(p.code), customerNameById.get(p.customer_id ?? '')], search),
      );
    }
    return list;
  }, [projects, statusFilter, search, customerNameById]);

  const activeFilterCount = statusFilter.length > 0 ? 1 : 0;

  const statusOptions: FilterCheckboxOption[] = STATUS_OPTIONS.map((s) => ({
    value: s,
    label: statusLabels[s],
  }));

  const filterContent = (
    <FilterCheckboxGroup
      label={t.filterStatus}
      options={statusOptions}
      selected={statusFilter}
      onChange={(next) => setStatusFilter(next as ProjectStatus[])}
      emptyLabel={t.filterAll}
    />
  );

  const openCreate = () => { setEditingProject(null); setFormOpen(true); };
  const openEdit = (p: Project) => { setEditingProject(p); setFormOpen(true); };

  const kpiCards = [
    { title: t.kpiTotal, value: kpis.total, icon: FolderKanban, bgClass: 'bg-info', delay: 0 },
    { title: t.kpiInProgress, value: kpis.inProgress, icon: PlayCircle, bgClass: 'bg-warning', delay: 1, onClick: () => setStatusFilter(['em_andamento']) },
    { title: t.kpiOverdue, value: kpis.overdue, icon: AlertTriangle, bgClass: 'bg-destructive', delay: 2 },
    { title: t.kpiDone, value: kpis.done, icon: CheckCircle2, bgClass: 'bg-success', delay: 3, onClick: () => setStatusFilter(['concluida']) },
  ];

  const customerLabel = (p: Project) => (p.customer_id ? customerNameById.get(p.customer_id) ?? '—' : t.internalProject);
  const deadlineLabel = (p: Project) => (p.end_date ? formatDate(p.end_date, locale, timezone) : t.noDeadline);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    deleteProject.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
  };

  const hasAnyProject = projects.length > 0;
  const isFiltering = !!search.trim() || statusFilter.length > 0;

  return (
    <div className={cn('space-y-6', isMobile && 'pb-24 space-y-4')}>
      <PageHeader
        title={t.title}
        subtitle={t.subtitle}
        icon={FolderKanban}
        actions={!isMobile && canManageProjects ? (
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            {t.newProject}
          </Button>
        ) : undefined}
      />

      {/* KPIs */}
      {isMobile ? (
        <div className="relative -mx-3">
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-4 bg-gradient-to-l from-background to-transparent" />
          <div className="flex gap-3 overflow-x-auto px-3 pb-1 snap-x [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {isLoading
              ? [0, 1, 2, 3].map((i) => (
                  <div key={i} className="snap-start shrink-0 w-[78%]">
                    <Skeleton className="h-[108px] w-full rounded-2xl" />
                  </div>
                ))
              : kpiCards.map((card) => (
                  <div key={card.title} className="snap-start shrink-0 w-[78%]">
                    <KPICard {...card} />
                  </div>
                ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {isLoading
            ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[108px] w-full rounded-2xl" />)
            : kpiCards.map((card) => <KPICard key={card.title} {...card} />)}
        </div>
      )}

      {/* Busca e filtros */}
      {isMobile ? (
        <MobileListToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder={t.searchPlaceholderMobile}
        >
          <FilterSheet
            triggerLabel={t.filterStatus}
            activeCount={activeFilterCount}
            onClear={() => setStatusFilter([])}
            triggerClassName="h-10"
          >
            {filterContent}
          </FilterSheet>
        </MobileListToolbar>
      ) : (
        <div>
          <SearchField
            containerClassName="flex-1"
              placeholder={t.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            actions={
              <FilterButton activeCount={activeFilterCount} onClear={() => setStatusFilter([])} embedded>
                {filterContent}
              </FilterButton>
            }
          />
        </div>
      )}

      {/* Lista */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        isMobile ? (
          <EmptyState
            icon={<FolderKanban className="h-12 w-12" />}
            title={isFiltering ? t.emptyFiltered.title : t.empty.title}
            description={isFiltering ? t.emptyFiltered.description : t.empty.description}
            action={!isFiltering && canManageProjects ? { label: t.empty.action, onClick: openCreate } : undefined}
          />
        ) : (
          <Card>
            <CardContent className="p-0">
              <EmptyState
                icon={<FolderKanban className="h-12 w-12" />}
                title={isFiltering ? t.emptyFiltered.title : t.empty.title}
                description={isFiltering ? t.emptyFiltered.description : t.empty.description}
                action={!isFiltering && canManageProjects ? { label: t.empty.action, onClick: openCreate } : undefined}
              />
            </CardContent>
          </Card>
        )
      ) : isMobile ? (
        <div className="rounded-xl border bg-card divide-y divide-border/60 overflow-hidden">
          {filtered.map((p) => {
            const status = (p.status as ProjectStatus) ?? 'em_andamento';
            const StatusIcon = STATUS_ICONS[status] ?? PlayCircle;
            const progress = getProgress(p.id);
            const pct = progress ? projectProgressPct(progress) : null;

            return (
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => openProject(p.id)}
                className={cn(
                  'flex items-start gap-3 px-4 py-3.5',
                  'cursor-pointer active:bg-muted/60 hover:bg-muted/40',
                )}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white', STATUS_BG_CLASS[status])}>
                  <StatusIcon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">#{p.code}</span>
                    <span className="truncate text-[15px] font-medium">{p.name}</span>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {customerLabel(p)} • {deadlineLabel(p)}
                  </p>
                  <ProjectProgressBar pct={pct} unavailableHint={t.progressUnavailable} />
                </div>
                {/* `stopPropagation`: a linha inteira abre o projeto; sem isso,
                    tocar no menu de ações no mobile também mudaria de tela. */}
                <div className="flex shrink-0 flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
                  <Badge variant={STATUS_BADGE_VARIANT[status]} className="text-[10px] whitespace-nowrap">
                    {statusLabels[status]}
                  </Badge>
                  {canManageProjects && (
                    <RowActionsMenu
                      actions={[
                        { label: tc.edit, icon: Pencil, variant: 'edit', onClick: () => openEdit(p) },
                        { label: tc.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteTarget(p) },
                      ]}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.colCode}</TableHead>
                <TableHead>{t.colName}</TableHead>
                <TableHead>{t.colCustomer}</TableHead>
                <TableHead>{t.colDeadline}</TableHead>
                <TableHead>{t.colProgress}</TableHead>
                <TableHead>{t.colStatus}</TableHead>
                <TableHead className="text-right">{t.colActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => {
                const status = (p.status as ProjectStatus) ?? 'em_andamento';
                const progress = getProgress(p.id);
                const pct = progress ? projectProgressPct(progress) : null;
                return (
                  <TableRow
                    key={p.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => openProject(p.id)}
                    className="cursor-pointer"
                  >
                    <TableCell className="font-mono text-xs text-muted-foreground">#{p.code}</TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
                        <span className="truncate">{p.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{customerLabel(p)}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{deadlineLabel(p)}</TableCell>
                    <TableCell className="min-w-[140px]">
                      <ProjectProgressBar pct={pct} unavailableHint={t.progressUnavailable} />
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE_VARIANT[status]} className="text-[10px] whitespace-nowrap">
                        {statusLabels[status]}
                      </Badge>
                    </TableCell>
                    {/* `stopPropagation`: a linha inteira navega pro projeto; sem
                        isso, abrir o menu de ações também mudaria de tela. */}
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {canManageProjects && (
                        <RowActionsMenu
                          actions={[
                            { label: tc.edit, icon: Pencil, variant: 'edit', onClick: () => openEdit(p) },
                            { label: tc.delete, icon: Trash2, variant: 'delete', onClick: () => setDeleteTarget(p) },
                          ]}
                        />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* FAB (mobile) */}
      {isMobile && canManageProjects && (
        <FABButton icon={<Plus className="h-5 w-5" />} label={t.newProjectShort} onClick={openCreate} />
      )}

      {/* Modais */}
      <ProjectFormDialog
        open={formOpen}
        onOpenChange={(v) => { setFormOpen(v); if (!v) setEditingProject(null); }}
        project={editingProject}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>{t.deleteDesc}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tc.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {t.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
