import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionUpdateNotification } from './VersionUpdateNotification';
import {
  OVERLAY_PRIORITY,
  OverlayCoordinatorProvider,
  useOverlaySlot,
} from '@/contexts/OverlayCoordinatorContext';

const mocks = vi.hoisted(() => ({
  markNotificationShown: vi.fn(),
  dismissNotification: vi.fn(),
  toastCustom: vi.fn(),
}));

vi.mock('@/hooks/useVersionUpdate', () => ({
  useVersionUpdate: () => ({
    showUpdateNotification: true,
    currentVersion: '1.39.34',
    markNotificationShown: mocks.markNotificationShown,
    dismissNotification: mocks.dismissNotification,
  }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/lib/versionTopics', () => ({ getVersionTopics: () => ['Notificações mais fáceis'] }));
vi.mock('sonner', () => ({ toast: { custom: mocks.toastCustom, dismiss: vi.fn() } }));

function CriticalTutorial({ open }: { open: boolean }) {
  useOverlaySlot(open, { id: 'critical-onboarding', priority: OVERLAY_PRIORITY.critical });
  return null;
}

function Flow({ tutorialOpen }: { tutorialOpen: boolean }) {
  return (
    <MemoryRouter>
      <OverlayCoordinatorProvider>
        <CriticalTutorial open={tutorialOpen} />
        <VersionUpdateNotification />
      </OverlayCoordinatorProvider>
    </MemoryRouter>
  );
}

describe('VersionUpdateNotification na fila de onboarding', () => {
  beforeEach(() => vi.clearAllMocks());

  it('não mostra nem consome novidades enquanto o tutorial crítico está aberto', async () => {
    const { rerender } = render(<Flow tutorialOpen />);
    expect(mocks.toastCustom).not.toHaveBeenCalled();
    expect(mocks.markNotificationShown).not.toHaveBeenCalled();

    rerender(<Flow tutorialOpen={false} />);
    await waitFor(() => expect(mocks.toastCustom).toHaveBeenCalledTimes(1));
    expect(mocks.markNotificationShown).toHaveBeenCalled();
  });
});
