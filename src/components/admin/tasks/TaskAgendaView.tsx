import { useEffect, useMemo, useState } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameWeek,
  isSameDay,
  isSameYear,
  addMonths,
  subMonths,
  addWeeks,
  subWeeks,
  addDays,
  subDays,
} from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ChevronLeft, ChevronRight, ChevronDown, CalendarX2, User, CalendarDays } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { SalespersonAvatar } from '@/components/admin/salesperson/SalespersonAvatar';
import { EmptyState } from '@/components/mobile/EmptyState';
import { MobilePillTabs } from '@/components/mobile/MobilePillTabs';
import {
  TASK_TYPE_CONFIG,
  TASK_STATUS_CONFIG,
  TASK_PRIORITY_CONFIG,
  type AdminTask,
} from '@/hooks/useAdminTasks';
import type { TaskAdminOption } from './TaskCreateDialog';

// ============================================================================
// Visão Agenda das tarefas do admin Auctus — modos Mês | Semana | Dia.
// Espelha a LINGUAGEM visual da agenda do tenant (Schedule.tsx /
// MonthlyCalendar / ScheduleHeader) SEM importar esses componentes — eles são
// acoplados a OS e posicionam por HORÁRIO. Tarefa admin não tem horário
// (due_date é date puro), então:
//
// - Mês: grade dom–sáb no desktop (weekStartsOn: 0), lista agrupada por dia
//   no mobile (estilo MobileAgendaView).
// - Semana: 7 colunas de dia no desktop (sem grade de horas), chips
//   empilhados; mobile reusa a lista agrupada filtrando a semana corrente.
// - Dia: lista de cards detalhados (título, lead, responsável, badges).
// - Navegação ‹ › anda ±1 mês/semana/dia conforme o modo; "Hoje" volta pra
//   data atual em qualquer modo; título adapta o formato.
// - Posicionamento por due_date comparado por STRING YYYY-MM-DD (nunca via
//   Date/UTC, que deslocaria o dia no fuso Brasil UTC-3).
// - Tarefas sem due_date vivem na bandeja colapsável "Sem data" (3 modos).
// - Modo persistido em localStorage('admin-tasks-agenda-mode'); default
//   espelha o Schedule do tenant: dia no mobile, mês no desktop.
// ============================================================================

interface TaskAgendaViewProps {
  /** Lista JÁ filtrada pela tela (filterAdminTasks) — agenda só posiciona. */
  tasks: AdminTask[];
  /** Mapa user_id -> responsável (avatar/nome), igual o kanban recebe. */
  adminByUserId: Map<string, TaskAdminOption>;
  /** Mesma callback do kanban: abre o AdminTaskCardModal. */
  onTaskClick: (task: AdminTask) => void;
}

type AgendaMode = 'month' | 'week' | 'day';

const MODE_STORAGE_KEY = 'admin-tasks-agenda-mode';
const WEEK_STARTS_ON = 0 as const; // dom–sáb, mesmo do mensal/tenant
const WEEK_DAYS_DESKTOP = ['DOM.', 'SEG.', 'TER.', 'QUA.', 'QUI.', 'SEX.', 'SÁB.'];

function readInitialMode(): AgendaMode {
  if (typeof window === 'undefined') return 'month';
  const saved = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (saved === 'month' || saved === 'week' || saved === 'day') return saved;
  // Mesma régua do Schedule do tenant: mobile abre no dia, desktop no mês.
  return window.innerWidth < 1024 ? 'day' : 'month';
}

export function TaskAgendaView({ tasks, adminByUserId, onTaskClick }: TaskAgendaViewProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<AgendaMode>(readInitialMode);
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [noDateOpen, setNoDateOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(MODE_STORAGE_KEY, mode);
  }, [mode]);

  // Agrupa por dia comparando STRING (due_date é date puro YYYY-MM-DD).
  const tasksByDate = useMemo(() => {
    const map = new Map<string, AdminTask[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const key = task.due_date.slice(0, 10);
      const arr = map.get(key);
      if (arr) arr.push(task);
      else map.set(key, [task]);
    }
    return map;
  }, [tasks]);

  const noDateTasks = useMemo(() => tasks.filter(t => !t.due_date), [tasks]);

  // ── Navegação adaptativa: ±1 mês/semana/dia conforme o modo ──────────────
  const handlePrev = () =>
    setCurrentDate(d => (mode === 'month' ? subMonths(d, 1) : mode === 'week' ? subWeeks(d, 1) : subDays(d, 1)));
  const handleNext = () =>
    setCurrentDate(d => (mode === 'month' ? addMonths(d, 1) : mode === 'week' ? addWeeks(d, 1) : addDays(d, 1)));
  const handleToday = () => setCurrentDate(new Date());

  const today = new Date();
  const showingCurrentPeriod =
    mode === 'month'
      ? isSameMonth(currentDate, today)
      : mode === 'week'
        ? isSameWeek(currentDate, today, { weekStartsOn: WEEK_STARTS_ON })
        : isSameDay(currentDate, today);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: WEEK_STARTS_ON });

  // ── Título adaptativo por modo ────────────────────────────────────────────
  const periodTitle = useMemo(() => {
    if (mode === 'month') return format(currentDate, "MMMM 'de' yyyy", { locale: ptBR });
    if (mode === 'day') {
      return `${format(currentDate, "dd 'de' MMMM yyyy", { locale: ptBR })} — ${format(currentDate, 'EEEE', { locale: ptBR })}`;
    }
    // Semana: intervalo legível ("8 – 14 de junho 2026"; encurta quando cruza mês/ano)
    if (isSameMonth(weekStart, weekEnd)) {
      return `${format(weekStart, 'd')} – ${format(weekEnd, "d 'de' MMMM yyyy", { locale: ptBR })}`;
    }
    if (isSameYear(weekStart, weekEnd)) {
      return `${format(weekStart, "d 'de' MMM", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}`;
    }
    return `${format(weekStart, "d 'de' MMM yyyy", { locale: ptBR })} – ${format(weekEnd, "d 'de' MMM yyyy", { locale: ptBR })}`;
  }, [mode, currentDate, weekStart, weekEnd]);

  // ── Seletor de modo (padrão visual do tenant: pills no mobile, Tabs no desktop)
  const modeTabs = isMobile ? (
    <MobilePillTabs
      tabs={[
        { value: 'day', label: 'Dia' },
        { value: 'week', label: 'Semana' },
        { value: 'month', label: 'Mês' },
      ]}
      activeTab={mode}
      onTabChange={v => setMode(v as AgendaMode)}
    />
  ) : (
    <div className="flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        onClick={handleToday}
        className="hover:bg-secondary hover:text-secondary-foreground"
      >
        Hoje
      </Button>
      <Tabs value={mode} onValueChange={v => setMode(v as AgendaMode)}>
        <TabsList className="h-9">
          <TabsTrigger value="month" className="text-xs px-3">Mês</TabsTrigger>
          <TabsTrigger value="week" className="text-xs px-3">Semana</TabsTrigger>
          <TabsTrigger value="day" className="text-xs px-3">Dia</TabsTrigger>
        </TabsList>
      </Tabs>
    </div>
  );

  // ── Navegação: ‹ | título + "Voltar para hoje" | › (padrão do tenant) ────
  const periodNav = (
    <div className="flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={handlePrev}
        aria-label="Período anterior"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted active:bg-muted/80"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex flex-col items-center flex-1 min-w-0">
        <h3 className="text-base font-semibold capitalize truncate max-w-full">{periodTitle}</h3>
        {!showingCurrentPeriod && (
          <button
            type="button"
            onClick={handleToday}
            className="text-[11px] text-primary font-medium leading-tight"
          >
            Voltar para hoje
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={handleNext}
        aria-label="Próximo período"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground transition-colors hover:bg-muted active:bg-muted/80"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  );

  const header = isMobile ? (
    <div className="space-y-3">
      {periodNav}
      {modeTabs}
    </div>
  ) : (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div className="flex-1 min-w-[280px]">{periodNav}</div>
      {modeTabs}
    </div>
  );

  // ── Bandeja "Sem data" (colapsável, contagem no header — visível nos 3 modos)
  const noDateTray = noDateTasks.length > 0 && (
    <div className="rounded-xl border bg-card overflow-hidden">
      <button
        type="button"
        onClick={() => setNoDateOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <CalendarX2 className="h-4 w-4 text-muted-foreground" /> Sem data
          <Badge variant="secondary" className="h-5 px-1.5 text-xs">{noDateTasks.length}</Badge>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', noDateOpen && 'rotate-180')} />
      </button>
      {noDateOpen && (
        <div className={cn('border-t', isMobile ? 'divide-y' : 'p-2 flex flex-wrap gap-1.5')}>
          {noDateTasks.map(task =>
            isMobile ? (
              <AgendaTaskCard key={task.id} task={task} adminByUserId={adminByUserId} onClick={() => onTaskClick(task)} />
            ) : (
              <AgendaTaskChip key={task.id} task={task} onClick={() => onTaskClick(task)} className="w-auto max-w-[220px]" />
            ),
          )}
        </div>
      )}
    </div>
  );

  // ── Lista agrupada por dia (mobile: usada nos modos Mês e Semana) ────────
  const renderGroupedDayList = (days: Date[], emptyTitle: string, emptyDescription: string) => {
    const daysWithTasks = days
      .map(day => ({ day, key: format(day, 'yyyy-MM-dd') }))
      .filter(({ key }) => (tasksByDate.get(key)?.length ?? 0) > 0);

    if (daysWithTasks.length === 0) {
      return (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title={emptyTitle}
          description={emptyDescription}
        />
      );
    }

    return daysWithTasks.map(({ day, key }) => {
      const dayTasks = tasksByDate.get(key)!;
      const isToday = isSameDay(day, new Date());
      return (
        <div key={key} className="space-y-1.5">
          <div className="flex items-center gap-2 px-1">
            <span
              className={cn(
                'text-xs font-semibold uppercase tracking-wide capitalize',
                isToday ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              {format(day, "EEEE, dd 'de' MMMM", { locale: ptBR })}
            </span>
            {isToday && (
              <Badge className="h-4 px-1.5 text-[10px] bg-primary text-primary-foreground border-0">Hoje</Badge>
            )}
          </div>
          <div className="rounded-xl border bg-card overflow-hidden divide-y">
            {dayTasks.map(task => (
              <AgendaTaskCard key={task.id} task={task} adminByUserId={adminByUserId} onClick={() => onTaskClick(task)} />
            ))}
          </div>
        </div>
      );
    });
  };

  // ── Visão Dia (desktop e mobile): cards detalhados ou estado vazio ───────
  const renderDayView = () => {
    const dayKey = format(currentDate, 'yyyy-MM-dd');
    const dayTasks = tasksByDate.get(dayKey) ?? [];

    if (dayTasks.length === 0) {
      return (
        <EmptyState
          icon={<CalendarDays className="h-12 w-12" />}
          title="Nenhuma tarefa neste dia"
          description="Não há tarefas com vencimento nesta data."
        />
      );
    }

    return (
      <div className="rounded-xl border bg-card overflow-hidden divide-y">
        {dayTasks.map(task => (
          <AgendaTaskDayCard key={task.id} task={task} adminByUserId={adminByUserId} onClick={() => onTaskClick(task)} />
        ))}
      </div>
    );
  };

  // ════════════════════════════════════════════════════════════════════════
  // MOBILE
  // ════════════════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <div className="space-y-3">
        {header}
        {noDateTray}
        {mode === 'month' &&
          renderGroupedDayList(
            eachDayOfInterval({ start: startOfMonth(currentDate), end: endOfMonth(currentDate) }),
            'Nenhuma tarefa no mês',
            'Não há tarefas com vencimento neste mês.',
          )}
        {mode === 'week' &&
          renderGroupedDayList(
            eachDayOfInterval({ start: weekStart, end: weekEnd }),
            'Nenhuma tarefa na semana',
            'Não há tarefas com vencimento nesta semana.',
          )}
        {mode === 'day' && renderDayView()}
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // DESKTOP
  // ════════════════════════════════════════════════════════════════════════

  // Mês: grade dom–sáb (estilo MonthlyCalendar do tenant)
  const renderMonthGrid = () => {
    const calendarDays = eachDayOfInterval({
      start: startOfWeek(startOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON }),
      end: endOfWeek(endOfMonth(currentDate), { weekStartsOn: WEEK_STARTS_ON }),
    });

    return (
      <div className="flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden">
        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {WEEK_DAYS_DESKTOP.map(day => (
            <div key={day} className="py-3 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              {day}
            </div>
          ))}
        </div>

        {/* Grade */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const isCurrentMonth = isSameMonth(day, currentDate);
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={cn(
                  'min-h-[110px] border-b border-r p-1.5 transition-colors',
                  !isCurrentMonth && 'bg-muted/30',
                  isToday && 'bg-primary/5',
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                      !isCurrentMonth && 'text-muted-foreground',
                      isToday && 'bg-primary text-primary-foreground',
                    )}
                  >
                    {format(day, 'd')}
                  </span>
                  {dayTasks.length > 3 && (
                    <Badge variant="secondary" className="text-xs h-5 px-1.5">+{dayTasks.length - 3}</Badge>
                  )}
                </div>
                <div className="space-y-1 overflow-hidden">
                  {dayTasks.slice(0, 3).map(task => (
                    <AgendaTaskChip key={task.id} task={task} onClick={() => onTaskClick(task)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Semana: 7 colunas de dia (SEM grade de horas — due_date não tem horário),
  // chips/cards empilhados por dia, hoje destacado.
  const renderWeekGrid = () => {
    const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

    return (
      <div className="flex flex-col bg-card rounded-xl border shadow-sm overflow-hidden">
        {/* Cabeçalho: dia da semana + número, hoje destacado */}
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {weekDays.map((day, idx) => {
            const isToday = isSameDay(day, new Date());
            return (
              <div key={idx} className={cn('py-2.5 flex flex-col items-center gap-1', isToday && 'bg-primary/5')}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {WEEK_DAYS_DESKTOP[idx]}
                </span>
                <span
                  className={cn(
                    'text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full',
                    isToday && 'bg-primary text-primary-foreground',
                  )}
                >
                  {format(day, 'd')}
                </span>
              </div>
            );
          })}
        </div>

        {/* Colunas de dia com tarefas empilhadas */}
        <div className="grid grid-cols-7">
          {weekDays.map((day, idx) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const dayTasks = tasksByDate.get(dateKey) ?? [];
            const isToday = isSameDay(day, new Date());

            return (
              <div
                key={idx}
                className={cn('min-h-[280px] border-r last:border-r-0 p-1.5 transition-colors', isToday && 'bg-primary/5')}
              >
                <div className="space-y-1">
                  {dayTasks.map(task => (
                    <AgendaTaskChip key={task.id} task={task} onClick={() => onTaskClick(task)} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {header}
      {noDateTray}
      {mode === 'month' && renderMonthGrid()}
      {mode === 'week' && renderWeekGrid()}
      {mode === 'day' && renderDayView()}
    </div>
  );
}

// Resolvida espelha o EventCard do tenant (opacity-60 + line-through); atrasada
// segue a convenção do TaskCard (tons destructive). Comparação por STRING pra
// não deslocar o dia no fuso Brasil — padrão do arquivo inteiro.
function isTaskOverdue(task: AdminTask): boolean {
  return (
    !!task.due_date &&
    task.status !== 'resolvido' &&
    task.due_date.slice(0, 10) < format(new Date(), 'yyyy-MM-dd')
  );
}

// ============================================================================
// Chip compacto (células das grades mensal/semanal + bandeja "Sem data"
// desktop). Cor por prioridade; resolvida = atenuada + riscada; atrasada =
// anel destructive + ponto.
// ============================================================================
function AgendaTaskChip({ task, onClick, className }: { task: AdminTask; onClick: () => void; className?: string }) {
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  return (
    <button
      type="button"
      onClick={onClick}
      title={overdue ? `${task.title} — atrasada` : task.title}
      className={cn(
        'w-full flex items-center gap-1 text-left text-[11px] leading-tight font-medium px-1.5 py-0.5 rounded transition-opacity hover:opacity-90',
        priorityConfig.className,
        resolved && 'opacity-60 line-through',
        overdue && 'ring-1 ring-destructive',
        className,
      )}
    >
      {overdue && <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />}
      <span className="min-w-0 truncate">{task.title}</span>
    </button>
  );
}

// ============================================================================
// Card da lista mobile (modos Mês/Semana e bandeja "Sem data" mobile) —
// visual de app nativo.
// ============================================================================
function AgendaTaskCard({
  task, adminByUserId, onClick,
}: {
  task: AdminTask;
  adminByUserId: Map<string, TaskAdminOption>;
  onClick: () => void;
}) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  const responsible = task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null;
  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left bg-card active:bg-muted/60 transition-colors',
        resolved && 'opacity-60',
        overdue && 'border-l-2 border-destructive',
      )}
    >
      {responsible ? (
        <SalespersonAvatar name={responsible.full_name} photoUrl={responsible.photo_url} size="md" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm font-medium truncate', resolved && 'line-through')}>{task.title}</p>
        <span className="flex items-center gap-2 flex-wrap text-xs mt-0.5">
          <span className={cn('px-1.5 py-0.5 rounded-full text-[10px]', typeConfig.className)}>{typeConfig.label}</span>
          {overdue && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-destructive bg-destructive/10">
              Atrasada
            </span>
          )}
          {leadName && <span className="text-primary font-medium truncate max-w-[120px]">{leadName}</span>}
        </span>
      </div>
      <Badge className={cn('text-[10px] px-2 py-0.5 border-0 shrink-0', statusConfig.className)}>{statusConfig.label}</Badge>
    </button>
  );
}

// ============================================================================
// Card detalhado da visão Dia (desktop e mobile): título, lead, responsável
// com avatar + nome, badges de tipo/prioridade/status.
// ============================================================================
function AgendaTaskDayCard({
  task, adminByUserId, onClick,
}: {
  task: AdminTask;
  adminByUserId: Map<string, TaskAdminOption>;
  onClick: () => void;
}) {
  const typeConfig = TASK_TYPE_CONFIG[task.type];
  const statusConfig = TASK_STATUS_CONFIG[task.status];
  const priorityConfig = TASK_PRIORITY_CONFIG[task.priority];
  const resolved = task.status === 'resolvido';
  const overdue = isTaskOverdue(task);
  const responsible = task.assigned_to ? adminByUserId.get(task.assigned_to) ?? null : null;
  const leadName = task.crm_lead?.company_name || task.crm_lead?.contact_name || task.crm_lead?.title;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 px-4 py-3 text-left bg-card hover:bg-muted/40 active:bg-muted/60 transition-colors',
        resolved && 'opacity-60',
        overdue && 'border-l-2 border-destructive',
      )}
    >
      {responsible ? (
        <SalespersonAvatar name={responsible.full_name} photoUrl={responsible.photo_url} size="md" />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <User className="h-4 w-4" />
        </span>
      )}
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn('text-sm font-semibold leading-snug', resolved && 'line-through')}>{task.title}</p>
        {leadName && <p className="text-xs text-primary font-medium truncate">{leadName}</p>}
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className={cn('px-1.5 py-0.5 rounded-full text-[10px] font-medium', typeConfig.className)}>
            {typeConfig.label}
          </span>
          <span className={cn('px-1.5 py-0.5 rounded text-[10px] font-medium', priorityConfig.className)}>
            {priorityConfig.label}
          </span>
          {overdue && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium text-destructive bg-destructive/10">
              Atrasada
            </span>
          )}
          <Badge className={cn('text-[10px] px-2 py-0.5 border-0', statusConfig.className)}>{statusConfig.label}</Badge>
        </div>
        {responsible && <p className="text-xs text-muted-foreground truncate">{responsible.full_name}</p>}
      </div>
    </button>
  );
}
