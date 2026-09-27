import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const createPipeline = { mutate: vi.fn(), isPending: false };
const reorderPipelines = { mutate: vi.fn() };

vi.mock('@/hooks/useAdminCrm', () => ({
  useAdminCrmPipelines: () => ({
    pipelines: [
      { id: 'pipeline-1', name: 'Funil principal', color: '#2563EB', position: 0, is_default: true },
      { id: 'pipeline-2', name: 'Renovações', color: '#22C55E', position: 1, is_default: false },
    ],
    createPipeline,
    updatePipeline: { mutate: vi.fn() },
    setDefaultPipeline: { mutate: vi.fn() },
    reorderPipelines,
    deletePipeline: { mutate: vi.fn() },
  }),
}));

vi.mock('@/components/admin/AdminStageManagerDialog', () => ({
  AdminStageManagerDialog: ({ pipelineId, compact }: { pipelineId: string; compact: boolean }) => (
    <div data-testid="admin-stages">{`${pipelineId}:${compact}`}</div>
  ),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, children }: { open: boolean; children: ReactNode }) => open ? <div>{children}</div> : null,
}));

import { AdminPipelineManagerDialog } from './AdminPipelineManagerDialog';

describe('AdminPipelineManagerDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('expande o funil solicitado e incorpora suas etapas', () => {
    render(
      <AdminPipelineManagerDialog
        open={false}
        onOpenChange={() => undefined}
        embedded
        initialExpandedPipelineId="pipeline-2"
      />,
    );

    expect(screen.getByTestId('admin-stages').textContent).toBe('pipeline-2:true');
    expect(screen.getByRole('button', { name: 'Recolher Renovações' })).toBeTruthy();
  });

  it('mostra o formulário somente depois de clicar em Novo funil', () => {
    render(<AdminPipelineManagerDialog open={false} onOpenChange={() => undefined} embedded />);

    expect(screen.queryByPlaceholderText('Ex.: Parcerias, Onboarding, Renovação')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Novo funil' }));
    expect(screen.getByPlaceholderText('Ex.: Parcerias, Onboarding, Renovação')).toBeTruthy();
  });
});
