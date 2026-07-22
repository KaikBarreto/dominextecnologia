/**
 * DailyTasksPopup — popup automático que aparece 1x por dia quando há tarefas
 * do dia (ou atrasadas) com status='pendente'.
 *
 * Controle de frequência: localStorage por `userId + data BRT`.
 * Estilo: fundo saturado (bg-primary) + texto e ícones BRANCOS (regra CEO).
 * Layout: Drawer no mobile / Dialog no desktop.
 * Botões: "Ver tarefas" (abre o drawer) e "Depois" (dispensa).
 */

import { useEffect, useState, useCallback } from 'react';
import { CheckSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
} from '@/components/ui/drawer';
import { useIsCompact } from '@/hooks/use-mobile';
import { useAppLocaleContext } from '@/contexts/AppLocaleContext';
import { MESSAGES } from '@/lib/i18n/messages';
import { useTenantTasks } from '@/hooks/useTenantTasks';

// ── localStorage helpers ─────────────────────────────────────────────────────

const LS_PREFIX = 'dominex:daily-tasks-shown';

/** Retorna a data de hoje no fuso BRT (YYYY-MM-DD). */
function todayBrt(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

function storageKey(userId: string): string {
  return `${LS_PREFIX}:${userId}`;
}

function hasShownToday(userId: string): boolean {
  try {
    return localStorage.getItem(storageKey(userId)) === todayBrt();
  } catch {
    return false;
  }
}

function markShownToday(userId: string): void {
  try {
    localStorage.setItem(storageKey(userId), todayBrt());
  } catch {
    // localStorage pode falhar em modo privado com storage cheio — ignora.
  }
}

// ── corpo do popup ────────────────────────────────────────────────────────────

type TasksT = typeof import('@/lib/i18n/messages/app/tasks').tasks['pt-br'];

interface PopupBodyProps {
  todayCount: number;
  overdueCount: number;
  t: TasksT;
  onViewTasks: () => void;
  onDismiss: () => void;
}

function PopupBody({ todayCount, overdueCount, t, onViewTasks, onDismiss }: PopupBodyProps) {
  // Monta o título: "{n} tarefa(s) para hoje" + opcional "e {n} atrasada(s)"
  const titleTemplate = todayCount === 1 ? t.popupTitleOne : t.popupTitleOther;
  let title = titleTemplate.replace('{n}', String(todayCount));

  if (overdueCount > 0) {
    const overdueTemplate = overdueCount === 1 ? t.popupOverdueOne : t.popupOverdueOther;
    title += ` ${overdueTemplate.replace('{n}', String(overdueCount))}`;
  }

  return (
    <div className="bg-primary rounded-2xl p-5 flex flex-col gap-4">
      {/* Ícone + título */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 mt-0.5">
          <CheckSquare className="h-6 w-6 text-white" aria-hidden="true" />
        </div>
        <p className="text-white font-semibold text-base leading-snug">{title}</p>
      </div>

      {/* Botões */}
      <div className="flex flex-col sm:flex-row gap-2">
        <Button
          onClick={onViewTasks}
          className="flex-1 bg-white text-primary hover:bg-white/90 active:bg-white/80 font-semibold border-0 shadow-none"
        >
          {t.popupViewTasks}
        </Button>
        <Button
          onClick={onDismiss}
          variant="outline"
          className="flex-1 bg-transparent border-white/50 text-white hover:bg-white/10 hover:text-white active:bg-white/20 font-medium"
        >
          {t.popupDismiss}
        </Button>
      </div>
    </div>
  );
}

// ── componente principal ──────────────────────────────────────────────────────

interface DailyTasksPopupProps {
  /** ID do usuário logado. */
  userId: string;
  /** Callback para abrir o drawer de tarefas ao clicar em "Ver tarefas". */
  onOpenDrawer: () => void;
}

export function DailyTasksPopup({ userId, onOpenDrawer }: DailyTasksPopupProps) {
  const [open, setOpen] = useState(false);
  const isCompact = useIsCompact();
  const { locale } = useAppLocaleContext();
  const t = MESSAGES[locale].app.tasks;

  const { todayAndOverdue, isLoading } = useTenantTasks();

  // Hoje no BRT
  const today = todayBrt();
  const todayTasks = todayAndOverdue.filter((task) => task.task_date === today);
  const overdueTasks = todayAndOverdue.filter((task) => task.task_date < today);
  const todayCount = todayTasks.length;
  const overdueCount = overdueTasks.length;
  const totalCount = todayAndOverdue.length;

  // Mostra o popup 1x por dia (controle via localStorage)
  useEffect(() => {
    if (isLoading) return;
    if (!userId) return;
    if (totalCount === 0) return;
    if (hasShownToday(userId)) return;

    markShownToday(userId);
    setOpen(true);
    // Intencional: deps não incluem `todayAndOverdue` para não reabrir se a
    // lista mudar depois de montado. O popup abre UMA vez após os dados chegarem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, userId, totalCount]);

  const dismiss = useCallback(() => {
    setOpen(false);
  }, []);

  const viewTasks = useCallback(() => {
    dismiss();
    onOpenDrawer();
  }, [dismiss, onOpenDrawer]);

  if (!open) return null;

  const body = (
    <PopupBody
      todayCount={todayCount}
      overdueCount={overdueCount}
      t={t}
      onViewTasks={viewTasks}
      onDismiss={dismiss}
    />
  );

  if (isCompact) {
    return (
      <Drawer open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
        <DrawerContent className="pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          <div className="px-4 pt-2 pb-4">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent
        className="sm:max-w-md p-0 overflow-hidden border-0 bg-transparent shadow-none"
        aria-describedby={undefined}
      >
        <div className="p-2">{body}</div>
      </DialogContent>
    </Dialog>
  );
}
