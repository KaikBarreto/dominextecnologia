import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  Plus, Search, ClipboardList, LayoutGrid, LayoutList, CalendarDays,
  AlertCircle, Clock, CheckCircle2, ListTodo, CalendarClock,
  MessageCircle, Check, User,
} from 'lucide-react';
import { buildWhatsAppLink } from '@/utils/shareLinks';
import { getFollowupMessage } from '@/utils/followupMessages';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Filter } from 'lucide-react';
import { format, parseISO, isBefore, startOfDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import {
  useAdminTasks,
  filterAdminTasks,
  countActiveTaskFilters,
  EMPTY_TASK_FILTERS,
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
  type AdminTask,
  type AdminTaskStatus,
  type TaskFilters,
} from '@/hooks/useAdminTasks';
import { TaskKanbanBoard } from './TaskKanbanBoard';
import { TaskAgendaView } from './TaskAgendaView';
import { TaskCreateDialog, type TaskAdminOption } from './TaskCreateDialog';
import { AdminTaskCardModal } from './AdminTaskCardModal';
import { CompleteTaskModal } from './CompleteTaskModal';
import { TaskFiltersForm } from './TaskFilters';
import { MobilePageHeader } from '@/components/mobile/MobilePageHeader';
import { StatCarousel, type StatCarouselItem } from '@/components/mobile/StatCarousel';
import { FilterSheet } from '@/components/mobile/FilterSheet';
import { FABButton } from '@/components/mobile/FABButton';
import { MobileListItem, type ItemAction } from '@/components/mobile/MobileListItem';
import { EmptyState } from '@/components/mobile/EmptyState';

type ViewMode = 'kanban' | 'list' | 'agenda';

function getInitials(name?: string | null) {
  return name?.split(' ').map(n => n[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '?';
}

export function AdminTasksTab() {
  const isMobile = useIsMobile();
  const { user } = useAuth();

  // Fonte canônica dos responsáveis = usuários do admin Auctus (view
  // salespeople_basic), NÃO profiles globais (que incluem tenants clientes).
  // Mesma régua do "Responsável" do lead admin. `user_id` = auth uid → assigned_to.
  const { data: salespeople = [] } = useQuery({
    queryKey: ['salespeople-basic-tasks'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('salespeople_basic')
        .select('id, name, user_id, photo_url')
        .order('name');
      if (error) throw error;
      return data || [];
    },
  });

  const [showFuture, setShowFuture] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('admin-tasks-view-mode') : null;
    return saved === 'list' || saved === 'agenda' ? saved : 'kanban';
  });

  // Na agenda, o hook SEMPRE busca completo (showFuture=true): o default
  // esconde pendentes com due_date futura e o calendário ficaria vazio pra
  // frente. O switch "Ver futuras" também some da UI nesse modo.
  const { tasks, isLoading, createTask, updateTask, deleteTask } = useAdminTasks({
    showFuture: viewMode === 'agenda' ? true : showFuture,
  });

  const [filters, setFilters] = useState<TaskFilters>(EMPTY_TASK_FILTERS);
  const [search, setSearch] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<AdminTask | null>(null);
  const [completingTask, setCompletingTask] = useState<AdminTask | null>(null);

  const setView = (v: ViewMode) => {
    setViewMode(v);
    localStorage.setItem('admin-tasks-view-mode', v);
  };

  // Lista de responsáveis = usuários do admin (salespeople_basic com user_id),
  // keyed por user_id (= auth uid de assigned_to).
  const admins: TaskAdminOption[] = useMemo(
    () => salespeople
      .filter((sp: any) => sp.user_id && sp.name)
      .map((sp: any) => ({ user_id: sp.user_id as string, full_name: sp.name as string, photo_url: sp.photo_url ?? null })),
    [salespeople],
  );

  // Mapa user_id -> responsável, pra resolver nome/avatar nos cards e listas
  // (substitui o assigned_profile derivado de profiles).
  const adminByUserId = useMemo(() => {
    const m = new Map<string, TaskAdminOption>();
    for (const a of admins) m.set(a.user_id, a);
    return m;
  }, [admins]);

  // Default: ao abrir, filtra pelas tarefas do próprio usuário logado (quando ele
  // é um responsável atribuível). Aplica UMA vez — depois disso, limpar o filtro
  // de Responsável persiste (a ref impede re-aplicação do default).
  const didInitResponsibleRef = useRef(false);
  useEffect(() => {
    if (didInitResponsibleRef.current) return;
    if (admins.length === 0) return; // lista ainda carregando
    didInitResponsibleRef.current = true;
    if (user?.id && adminByUserId.has(user.id)) {
      setFilters(prev => ({ ...prev, assigned_to: [user.id] }));
    }
  }, [admins, adminByUserId, user?.id]);

  const effectiveFilters: TaskFilters = useMemo(
    () => ({ ...filters, search }),
    [filters, search],
  );

  const filteredTasks = useMemo(
    () => filterAdminTasks(tasks, effectiveFilters),
    [tasks, effectiveFilters],
  );

  const activeFilterCount = countActiveTaskFilters(filters);

  const clearFilters = () => setFilters(EMPTY_TASK_FILTERS);

  // Stats (refletem o conjunto exibido após filtros).
  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    return {
      total: filteredTasks.length,
      novo: filteredTasks.filter(t => t.status === 'novo').length,
      andamento: filteredTasks.filter(t => t.status === 'em_andamento').length,
      resolvido: filteredTasks.filter(t => t.status === 'resolvido').length,
      atrasadas: filteredTasks.filter(t =>
        t.due_date && t.status !== 'resolvido' && isBefore(parseISO(t.due_date), today),
      ).length,
    };
  }, [filteredTasks]);

  const statItems: StatCarouselItem[] = [
    { key: 'total', label: 'Total', count: stats.total, icon: <ListTodo className="h-4 w-4" />, accentColor: 'hsl(var(--primary))' },
    { key: 'novo', label: 'A Fazer', count: stats.novo, icon: <AlertCircle className="h-4 w-4" />, accentColor: '#3b82f6' },
    { key: 'andamento', label: 'Em Andamento', count: stats.andamento, icon: <Clock className="h-4 w-4" />, accentColor: '#f59e0b' },
    { key: 'atrasadas', label: 'Atrasadas', count: stats.atrasadas, icon: <CalendarClock className="h-4 w-4" />, accentColor: 'hsl(var(--destructive))' },
    { key: 'resolvido', label: 'Resolvidas', count: stats.resolvido, icon: <CheckCircle2 className="h-4 w-4" />, accentColor: '#10b981' },
  ];

  // Interceptação: concluir follow-up abre o CompleteTaskModal (observação opcional).
  // Demais tipos vão direto pra resolvido.
  const handleStatusChange = (taskId: string, newStatus: AdminTaskStatus) => {
    if (newStatus === 'resolvido') {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.type === 'follow-up' && task.status !== 'resolvido') {
        setCompletingTask(task);
        return;
      }
    }
    updateTask.mutate({ id: taskId, status: newStatus });
  };

  const handleTaskUpdate = (updates: Partial<AdminTask> & { id: string }) => {
    if (updates.status === 'resolvido') {
      const task = tasks.find(t => t.id === updates.id);
      if (task && task.type === 'follow-up' && task.status !== 'resolvido') {
        setCompletingTask(task);
        return;
      }
    }
    updateTask.mutate(updates);
  };

  const handleComplete = (taskId: string, observation: string | null) => {
    updateTask.mutate({ id: taskId, status: 'resolvido', observation });
  };

  const filtersContent = (
    <TaskFiltersForm filters={filters} onChange={setFilters} admins={admins} />
  );

  return (
    <div className={cn('space-y-4', isMobile && 'pb-24')}>
      {/* Header */}
      {isMobile ? (
        <MobilePageHeader title="Tarefas" subtitle="Chamados, bugs e follow-ups" icon={ClipboardList} />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="text-lg lg:text-xl font-bold text-foreground flex items-center gap-2">
              <ClipboardList className="h-5 w-5" /> Tarefas
            </h2>
            <p className="text-sm text-muted-foreground">Chamados, bugs e follow-ups da equipe</p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Tarefa
          </Button>
        </div>
      )}

      {/* Stats */}
      {isMobile ? (
        <StatCarousel items={statItems} loading={isLoading} />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {statItems.map(item => (
            <div key={item.key} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span style={{ color: item.accentColor }}>{item.icon}</span>
                <div>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                  <p className="text-lg font-bold">{item.count}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar: busca + filtros + ver futuras + view toggle */}
      {isMobile ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar tarefas..."
                className="pl-9 h-10"
              />
            </div>
            <FilterSheet triggerLabel="Filtros" activeCount={activeFilterCount} onClear={clearFilters}>
              {filtersContent}
            </FilterSheet>
          </div>
          <div className="flex items-center justify-between gap-2 px-1">
            {viewMode !== 'agenda' ? (
              <div className="flex items-center gap-2">
                <Switch id="show-future-m" checked={showFuture} onCheckedChange={setShowFuture} />
                <Label htmlFor="show-future-m" className="text-xs cursor-pointer">Ver futuras</Label>
              </div>
            ) : <span />}
            {/* No mobile só existem 2 modos: lista nativa (kanban/list caem aqui) e agenda */}
            <div className="flex rounded-lg border overflow-hidden h-8">
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="Ver como lista"
                className={cn('flex items-center justify-center px-3 transition-colors',
                  viewMode !== 'agenda' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('agenda')}
                aria-label="Ver como agenda"
                className={cn('flex items-center justify-center px-3 transition-colors',
                  viewMode === 'agenda' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar tarefas..." className="pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {viewMode !== 'agenda' && (
              <div className="flex items-center gap-2 px-2 py-1 rounded-md border bg-card h-9">
                <Switch id="show-future-d" checked={showFuture} onCheckedChange={setShowFuture} />
                <Label htmlFor="show-future-d" className="text-xs cursor-pointer whitespace-nowrap">Ver futuras</Label>
              </div>
            )}
            <DesktopFilterSheet
              filters={filters}
              onChange={setFilters}
              admins={admins}
              activeFilterCount={activeFilterCount}
              onClear={clearFilters}
            />
            <div className="flex rounded-lg border overflow-hidden h-9">
              <button
                type="button"
                onClick={() => setView('kanban')}
                className={cn('flex items-center justify-center gap-1.5 px-3 text-sm transition-colors',
                  viewMode === 'kanban' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                <LayoutGrid className="h-4 w-4" /> Kanban
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={cn('flex items-center justify-center gap-1.5 px-3 text-sm transition-colors',
                  viewMode === 'list' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                <LayoutList className="h-4 w-4" /> Lista
              </button>
              <button
                type="button"
                onClick={() => setView('agenda')}
                className={cn('flex items-center justify-center gap-1.5 px-3 text-sm transition-colors',
                  viewMode === 'agenda' ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-muted')}
              >
                <CalendarDays className="h-4 w-4" /> Agenda
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visualização */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-64 rounded-lg bg-muted animate-pulse" />)}
        </div>
      ) : viewMode === 'agenda' ? (
        // === AGENDA (desktop: grade mensal; mobile: lista por dia) ===========
        // onResolve passa pelo interceptor de follow-up (CompleteTaskModal).
        <TaskAgendaView
          tasks={filteredTasks}
          adminByUserId={adminByUserId}
          onTaskClick={setSelectedTask}
          onResolve={(id) => handleStatusChange(id, 'resolvido')}
        />
      ) : isMobile ? (
        // === MOBILE: lista nativa (default) ===================================
        filteredTasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-12 w-12" />}
            title={search || activeFilterCount > 0 ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa'}
            description={search || activeFilterCount > 0 ? 'Tente filtros diferentes.' : 'Toque em "Tarefa" para criar.'}
          />
        ) : (
          <div className="rounded-xl border bg-card overflow-hidden">
            {filteredTasks.map((task) => {
              const typeConfig = TASK_TYPE_CONFIG[task.type];
              const statusConfig = TASK_STATUS_CONFIG[task.status];
              const overdue = !!task.due_date && task.status !== 'resolvido'
                && isBefore(parseISO(task.due_date), startOfDay(new Date()));
              const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;
              // Follow-up: abre o WhatsApp com a mensagem do passo já pré-preenchida.
              // Outros tipos (ou passo fora de 1–10): abre sem texto.
              const followupMessage = getFollowupMessage(task.type, (task as any).followup_step);
              const whatsappLink = buildWhatsAppLink(task.crm_lead?.phone, followupMessage);

              // Swipe revela WhatsApp (verde) + Resolver (verde). Resolver passa
              // pelo interceptor de follow-up (abre CompleteTaskModal quando aplicável).
              const actions: ItemAction[] = [];
              if (whatsappLink) {
                actions.push({
                  key: 'whatsapp',
                  label: 'WhatsApp',
                  icon: <MessageCircle className="h-5 w-5" />,
                  variant: 'whatsapp',
                  onClick: () => window.open(whatsappLink, '_blank', 'noopener,noreferrer'),
                });
              }
              if (task.status !== 'resolvido') {
                actions.push({
                  key: 'resolve',
                  label: 'Resolver',
                  icon: <Check className="h-5 w-5" />,
                  variant: 'success',
                  onClick: () => handleStatusChange(task.id, 'resolvido'),
                });
              }

              const responsible = task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null;

              return (
                <MobileListItem
                  key={task.id}
                  onClick={() => setSelectedTask(task)}
                  actions={actions.length > 0 ? actions : undefined}
                  leading={
                    responsible ? (
                      <SalespersonAvatar name={responsible.full_name} photoUrl={responsible.photo_url} size="md" />
                    ) : (
                      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                        <User className="h-4 w-4" />
                      </span>
                    )
                  }
                  title={<span className="truncate">{task.title}</span>}
                  subtitle={
                    <span className="flex items-center gap-2 flex-wrap text-xs">
                      <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', typeConfig.className)}>{typeConfig.label}</span>
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <User className="h-3 w-3 shrink-0" />
                        {responsible ? (
                          <span className="font-medium text-foreground truncate max-w-[110px]">{responsible.full_name.split(' ')[0]}</span>
                        ) : (
                          <span className="italic">Sem responsável</span>
                        )}
                      </span>
                      {leadName && <span className="text-primary font-medium truncate max-w-[110px]">{leadName}</span>}
                    </span>
                  }
                  trailing={
                    <div className="flex flex-col items-end gap-1">
                      <Badge className={cn('text-[10px] px-2 py-0.5 border-0', statusConfig.className)}>{statusConfig.label}</Badge>
                      {task.due_date && (
                        <span className={cn('text-[10px]', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                          {format(parseISO(task.due_date), 'dd MMM', { locale: ptBR })}
                        </span>
                      )}
                    </div>
                  }
                />
              );
            })}
          </div>
        )
      ) : viewMode === 'kanban' ? (
        // === DESKTOP: Kanban ==================================================
        <TaskKanbanBoard tasks={filteredTasks} onStatusChange={handleStatusChange} onTaskClick={setSelectedTask} adminByUserId={adminByUserId} />
      ) : (
        // === DESKTOP: Lista ===================================================
        filteredTasks.length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="h-12 w-12" />}
            title={search || activeFilterCount > 0 ? 'Nenhuma tarefa encontrada' : 'Nenhuma tarefa'}
            description={search || activeFilterCount > 0 ? 'Tente filtros diferentes.' : 'Crie a primeira tarefa.'}
          />
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Título</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Tipo</th>
                    <th className="px-4 py-3 font-medium">Prioridade</th>
                    <th className="px-4 py-3 font-medium">Responsável</th>
                    <th className="px-4 py-3 font-medium">Vencimento</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTasks.map((task) => {
                    const typeConfig = TASK_TYPE_CONFIG[task.type];
                    const statusConfig = TASK_STATUS_CONFIG[task.status];
                    const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
                    const overdue = !!task.due_date && task.status !== 'resolvido'
                      && isBefore(parseISO(task.due_date), startOfDay(new Date()));
                    return (
                      <tr key={task.id} onClick={() => setSelectedTask(task)} className="border-b hover:bg-muted/30 cursor-pointer transition-colors">
                        <td className="px-4 py-3 font-medium max-w-[260px] truncate">{task.title}</td>
                        <td className="px-4 py-3"><span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', statusConfig.className)}>{statusConfig.label}</span></td>
                        <td className="px-4 py-3"><span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', typeConfig.className)}>{typeConfig.label}</span></td>
                        <td className="px-4 py-3"><span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full', priorityConfig.className)}>{priorityConfig.label}</span></td>
                        <td className="px-4 py-3 max-w-[160px]">
                          {task.assigned_to && adminByUserId.has(task.assigned_to) ? (
                            <div className="flex items-center gap-2 min-w-0">
                              <SalespersonAvatar
                                name={adminByUserId.get(task.assigned_to)!.full_name}
                                photoUrl={adminByUserId.get(task.assigned_to)!.photo_url}
                                size="sm"
                              />
                              <span className="text-xs text-muted-foreground truncate">{adminByUserId.get(task.assigned_to)!.full_name}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className={cn('px-4 py-3 text-xs', overdue ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                          {task.due_date ? format(parseISO(task.due_date), 'dd/MM/yyyy') : '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}

      {/* Modais */}
      <TaskCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={(t) => createTask.mutate(t)}
        admins={admins}
        isLoading={createTask.isPending}
      />

      <AdminTaskCardModal
        task={selectedTask}
        open={!!selectedTask}
        onOpenChange={(o) => { if (!o) setSelectedTask(null); }}
        onUpdate={handleTaskUpdate}
        onDelete={(id) => deleteTask.mutate(id)}
        admins={admins}
      />

      <CompleteTaskModal
        task={completingTask}
        open={!!completingTask}
        onOpenChange={(o) => { if (!o) setCompletingTask(null); }}
        onConfirm={handleComplete}
        isLoading={updateTask.isPending}
      />

      {/* FAB no mobile */}
      {isMobile && (
        <FABButton icon={<Plus className="h-5 w-5" />} label="Tarefa" onClick={() => setCreateOpen(true)} />
      )}
    </div>
  );
}

// ============================================================================
// Filtros desktop em Sheet lateral (mesmo padrão do AdminCRM).
// ============================================================================
function DesktopFilterSheet({
  filters, onChange, admins, activeFilterCount, onClear,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  admins: TaskAdminOption[];
  activeFilterCount: number;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)} className="relative h-9">
        <Filter className="h-4 w-4 mr-2" /> Filtros
        {activeFilterCount > 0 && (
          <Badge className="ml-2 h-5 px-1.5 bg-primary text-primary-foreground border-0">{activeFilterCount}</Badge>
        )}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col">
          <SheetHeader><SheetTitle>Filtros</SheetTitle></SheetHeader>
          <div className="flex-1 overflow-y-auto py-4">
            <TaskFiltersForm filters={filters} onChange={onChange} admins={admins} />
          </div>
          <SheetFooter className="gap-2">
            <Button variant="outline" onClick={onClear}>Limpar</Button>
            <Button onClick={() => setOpen(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
