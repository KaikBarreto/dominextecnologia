import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DailyTasksPopup } from './DailyTasksPopup';
import {
  OVERLAY_PRIORITY,
  OverlayCoordinatorProvider,
  useOverlaySlot,
} from '@/contexts/OverlayCoordinatorContext';

vi.mock('@/hooks/use-mobile', () => ({ useIsCompact: () => false }));
vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/hooks/useTenantTasks', () => ({
  useTenantTasks: () => ({
    today: '2026-11-12',
    todayAndOverdue: [{ id: 'task-1', task_date: '2026-11-12' }],
    isLoading: false,
  }),
}));

function CriticalTutorial({ open }: { open: boolean }) {
  useOverlaySlot(open, { id: 'critical-tutorial', priority: OVERLAY_PRIORITY.critical });
  return null;
}

function Flow({ tutorialOpen }: { tutorialOpen: boolean }) {
  return (
    <OverlayCoordinatorProvider>
      <CriticalTutorial open={tutorialOpen} />
      <DailyTasksPopup userId="user-1" onOpenDrawer={() => undefined} />
    </OverlayCoordinatorProvider>
  );
}

describe('DailyTasksPopup na fila de onboarding', () => {
  beforeEach(() => window.localStorage.clear());

  it('só marca o lembrete diário depois de ele realmente aparecer', async () => {
    const key = 'dominex:daily-tasks-shown:user-1';
    const { rerender } = render(<Flow tutorialOpen />);

    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
    rerender(<Flow tutorialOpen={false} />);

    await waitFor(() => expect(window.localStorage.getItem(key)).toBe('2026-11-12'));
  });
});
