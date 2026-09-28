import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStage = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/useAdminCrm', () => ({
  useAdminCrmPipelines: () => ({
    pipelines: [{ id: 'pipeline-1', name: 'Vendas', color: '#2563EB', is_default: true }],
    defaultPipeline: { id: 'pipeline-1', name: 'Vendas' },
  }),
  useAdminCrmStages: () => ({
    stages: [],
    createStage,
    updateStage: { mutate: vi.fn() },
    deleteStage: { mutate: vi.fn() },
    reorderStages: { mutate: vi.fn() },
  }),
}));

import { AdminCrmStagesTab } from './AdminCrmStagesTab';

describe('AdminCrmStagesTab', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o formulário somente depois de clicar em Novo estágio', () => {
    render(<AdminCrmStagesTab embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.queryByPlaceholderText('Nome do estágio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Novo estágio' }));
    expect(screen.getByPlaceholderText('Nome do estágio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar novo estágio' })).toBeTruthy();
  });
});
