import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStage = { mutate: vi.fn(), isPending: false };

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [],
    createStage,
    updateStage: { mutate: vi.fn() },
    deleteStage: { mutate: vi.fn() },
    reorderStages: { mutate: vi.fn() },
    getStageColorClass: () => '',
  }),
}));

import { StageManagerDialog } from './StageManagerDialog';

describe('StageManagerDialog', () => {
  beforeEach(() => vi.clearAllMocks());

  it('mostra o formulário somente depois de clicar em Novo estágio', () => {
    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.queryByPlaceholderText('Nome do estágio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Novo estágio' }));
    expect(screen.getByPlaceholderText('Nome do estágio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar novo estágio' })).toBeTruthy();
  });
});
