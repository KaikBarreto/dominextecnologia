/**
 * TasksDrawer — badge de pendentes no header + drawer com listagem e criação.
 *
 * - Badge: ícone CheckSquare + contador saturado. Mobile = drawer de baixo; Desktop = drawer lateral.
 * - Drawer: lista de tarefas pendentes (EmptyState quando vazio), botão "Nova tarefa",
 *   formulário inline de criação, ações por item (concluir + excluir).
 * - Cores: concluir = success (verde), excluir = destructive (vermelho). Regra CEO.
 * - Status badge saturado (fundo na cor + texto branco). Regra CEO.
 * - Atrasadas: badge vermelho "Atrasada" no item.
 */

import { useState } from 'react';
import { CheckSquare, Plus, Check, Trash2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
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
import { EmptyState } from '@/components/mobile/EmptyState';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useToast } from '@/hooks/use-toast';
import { useTenantTasks, type TenantTask } from '@/hooks/useTenantTasks';
import { useProfiles } from '@/hooks/useProfiles';
import { cn } from '@/lib/utils';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Data de hoje no fuso BRT (YYYY-MM-DD). */
function todayBrt(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

/** Verifica se task_date (YYYY-MM-DD) é anterior a hoje (BRT). */
function isOverdue(taskDate: string): boolean {
  return taskDate < todayBrt();
}

/** Verifica se task_date é hoje (BRT). */
function isToday(taskDate: string): boolean {
  return taskDate === todayBrt();
}

/** Valor sentinela para "sem responsável" — Radix Select proíbe SelectItem com value="". */
const ASSIGNEE_NONE = '__none__';

// ── sub-componente: formulário de criação ────────────────────────────────────

interface TaskFormProps {
  onClose: () => void;
}

function TaskCreateForm({ onClose }: TaskFormProps) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.tasks;
  const { toast } = useToast();
  const { createTask } = useTenantTasks();
  const { data: profiles = [] } = useProfiles();

  const [title, setTitle] = useState('');
  const [taskDate, setTaskDate] = useState(todayBrt());
  const [description, setDescription] = useState('');
  const [assignedTo, setAssignedTo] = useState<string>(ASSIGNEE_NONE);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setSaving(true);
    try {
      await createTask.mutateAsync({
        title: title.trim(),
        task_date: taskDate,
        description: description.trim() || null,
        assigned_to: assignedTo && assignedTo !== ASSIGNEE_NONE ? assignedTo : null,
      });
      toast({ title: t.toastCreated });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      {/* Título */}
      <div className="space-y-1.5">
        <Label htmlFor="task-title" className="text-sm font-medium">
          {t.fieldTitle} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t.fieldTitlePlaceholder}
          required
          autoFocus
        />
      </div>

      {/* Data */}
      <div className="space-y-1.5">
        <Label htmlFor="task-date" className="text-sm font-medium">
          {t.fieldDate} <span className="text-destructive">*</span>
        </Label>
        <Input
          id="task-date"
          type="date"
          value={taskDate}
          onChange={(e) => setTaskDate(e.target.value)}
          required
        />
      </div>

      {/* Descrição */}
      <div className="space-y-1.5">
        <Label htmlFor="task-desc" className="text-sm font-medium">
          {t.fieldDescription}
        </Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.fieldDescriptionPlaceholder}
          rows={2}
          className="resize-none"
        />
      </div>

      {/* Responsável — select com perfis da empresa */}
      {profiles.length > 0 && (
        <div className="space-y-1.5">
          <Label htmlFor="task-assignee" className="text-sm font-medium">
            {t.fieldAssignedTo}
          </Label>
          <Select value={assignedTo} onValueChange={setAssignedTo}>
            <SelectTrigger id="task-assignee">
              <SelectValue placeholder={t.fieldAssignedToPlaceholder} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ASSIGNEE_NONE}>{t.fieldAssignedToNone}</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.full_name || p.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onClose} disabled={saving}>
          {t.cancel}
        </Button>
        <Button type="submit" className="flex-1" disabled={saving || !title.trim()}>
          {t.save}
        </Button>
      </div>
    </form>
  );
}

// ── sub-componente: item de tarefa ───────────────────────────────────────────

type TasksT = typeof import('@/lib/i18n/messages/app/tasks').tasks['pt-br'];

interface TaskItemProps {
  task: TenantTask;
  t: TasksT;
  onComplete: (task: TenantTask) => void;
  onDelete: (task: TenantTask) => void;
}

function TaskItem({ task, t, onComplete, onDelete }: TaskItemProps) {
  const overdue = isOverdue(task.task_date);
  const todayTask = isToday(task.task_date);

  return (
    <div className="flex items-start gap-3 rounded-lg border bg-card p-3">
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium leading-snug break-words">{task.title}</p>
          {overdue && (
            <span className="inline-flex items-center rounded-full bg-destructive px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
              {t.overdue}
            </span>
          )}
          {todayTask && !overdue && (
            <span className="inline-flex items-center rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white shrink-0">
              {t.today}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1">
          <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />
          {/* Exibe a data de forma simples: a coluna task_date é date-only (YYYY-MM-DD).
              Parseamos manualmente para evitar off-by-one de fuso. */}
          {(() => {
            const [y, m, d] = task.task_date.split('-').map(Number);
            return new Intl.DateTimeFormat('pt-BR').format(new Date(y, m - 1, d));
          })()}
        </p>
        {task.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-success hover:bg-success hover:text-white"
          onClick={() => onComplete(task)}
          title={t.markDone}
          aria-label={t.markDone}
        >
          <Check className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-destructive hover:bg-destructive hover:text-white"
          onClick={() => onDelete(task)}
          title={t.deleteTask}
          aria-label={t.deleteTask}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ── componente principal ─────────────────────────────────────────────────────

interface TasksDrawerProps {
  /** Controla se o drawer está aberto externamente (opcional). */
  open?: boolean;
  /** Callback para mudança de estado externo (opcional). */
  onOpenChange?: (open: boolean) => void;
}

export function TasksDrawer({ open: externalOpen, onOpenChange: externalOnOpenChange }: TasksDrawerProps = {}) {
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.tasks;
  const { toast } = useToast();
  const { pendingTasks, pendingCount, completeTask, deleteTask } = useTenantTasks();

  const [internalOpen, setInternalOpen] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TenantTask | null>(null);

  const isMobile = useIsMobile();

  // Suporte a modo controlado (externo) ou não-controlado (interno)
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen : internalOpen;
  const setOpen = (v: boolean) => {
    if (externalOnOpenChange) {
      externalOnOpenChange(v);
    } else {
      setInternalOpen(v);
    }
  };

  const handleComplete = async (task: TenantTask) => {
    await completeTask.mutateAsync(task.id);
    toast({ title: t.toastDone });
  };

  const handleDelete = (task: TenantTask) => {
    setTaskToDelete(task);
  };

  const confirmDelete = async () => {
    if (!taskToDelete) return;
    await deleteTask.mutateAsync(taskToDelete.id);
    toast({ title: t.toastDeleted });
    setTaskToDelete(null);
  };

  const ariaLabel =
    pendingCount > 0
      ? t.badgeAriaLabel.replace('{n}', String(pendingCount))
      : t.badgeAriaLabelNone;

  const drawerTitle =
    pendingCount > 0
      ? t.drawerTitleWithCount.replace('{n}', String(pendingCount))
      : t.drawerTitle;

  // ── Trigger: botão com badge ─────────────────────────────────────────────
  const Trigger = (
    <Button
      variant="ghost"
      size="icon"
      className="relative h-9 w-9"
      onClick={() => { setOpen(true); setShowForm(false); }}
      aria-label={ariaLabel}
      title={ariaLabel}
    >
      <CheckSquare className="h-5 w-5" />
      {pendingCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 flex items-center justify-center text-[10px] font-semibold border-2 border-background"
        >
          {pendingCount > 99 ? '99+' : pendingCount}
        </Badge>
      )}
    </Button>
  );

  // ── Conteúdo do drawer ───────────────────────────────────────────────────
  const DrawerBody = (
    <div className="flex flex-col gap-4">
      {/* Botão Nova tarefa — SEMPRE visível no topo */}
      {!showForm && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={() => setShowForm(true)}
        >
          <Plus className="h-4 w-4" />
          {t.newTask}
        </Button>
      )}

      {/* Formulário de criação (inline, colapsável) */}
      {showForm && (
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="text-sm font-semibold mb-3">{t.formTitle}</p>
          <TaskCreateForm onClose={() => setShowForm(false)} />
        </div>
      )}

      {/* Lista de pendentes */}
      {pendingTasks.length === 0 ? (
        <EmptyState
          icon={<CheckSquare className="h-10 w-10" />}
          title={t.emptyTitle}
          description={t.emptyDesc}
          size="compact"
        />
      ) : (
        <div className="space-y-2">
          {pendingTasks.map((task) => (
            <TaskItem
              key={task.id}
              task={task}
              t={t}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      {!isControlled && Trigger}

      {/* Drawer — mobile e desktop usam o mesmo Drawer de baixo
          (padrão do repo: modal no mobile = drawer). */}
      <Drawer open={open} onOpenChange={(v) => { setOpen(v); if (!v) setShowForm(false); }}>
        <DrawerContent className={cn('flex flex-col', isMobile ? 'max-h-[85dvh]' : 'max-h-[90dvh]')}>
          <DrawerHeader className="shrink-0 text-left border-b pb-3">
            <DrawerTitle className="flex items-center gap-2 text-base">
              <CheckSquare className="h-5 w-5 text-primary" />
              {drawerTitle}
            </DrawerTitle>
          </DrawerHeader>
          <div className="flex-1 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            {DrawerBody}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Confirmação de exclusão */}
      <AlertDialog open={!!taskToDelete} onOpenChange={(v) => !v && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.deleteConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.deleteConfirmDesc.replace('{title}', taskToDelete?.title ?? '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.deleteConfirmNo}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90 text-white"
              onClick={confirmDelete}
            >
              {t.deleteConfirmYes}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
