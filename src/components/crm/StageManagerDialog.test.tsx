import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createStage = { mutate: vi.fn(), isPending: false };
const state = vi.hoisted(() => ({
  stages: [] as Array<Record<string, unknown>>,
  rules: [] as Array<Record<string, unknown>>,
  isMobile: false,
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: state.stages,
    createStage,
    updateStage: { mutate: vi.fn() },
    deleteStage: { mutate: vi.fn() },
    reorderStages: { mutate: vi.fn() },
    getStageColorClass: () => '',
  }),
}));

vi.mock('@/hooks/useCrmStageAutomations', () => ({
  useCrmAutomationRules: () => ({ rules: state.rules }),
}));

vi.mock('@/hooks/use-mobile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/hooks/use-mobile')>()),
  useIsMobile: () => state.isMobile,
}));

vi.mock('@/components/crm/CrmStageAutomationDialog', () => ({
  CrmStageAutomationDialog: ({ stage, initialTab }: { stage: { name: string }; initialTab?: string }) => (
    <div data-testid="stage-config">{`${stage.name}:${initialTab}`}</div>
  ),
}));

import { StageManagerDialog } from './StageManagerDialog';

const stage = (overrides: Record<string, unknown>) => ({
  id: 'stage-1', pipeline_id: 'pipeline-1', name: 'Proposta', color: '#2563EB', icon: null,
  is_won: false, is_lost: false, description: null, requirements: {}, ...overrides,
});

describe('StageManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.stages = [];
    state.rules = [];
    state.isMobile = false;
  });

  it('mostra o formulário somente depois de clicar em Novo estágio', () => {
    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.queryByPlaceholderText('Nome do estágio')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Novo estágio' }));
    expect(screen.getByPlaceholderText('Nome do estágio')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Fechar novo estágio' })).toBeTruthy();
  });

  it('avisa quando o funil ainda não tem etapas', () => {
    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.getByText('Este funil ainda não tem etapas')).toBeTruthy();
  });

  it('mostra na linha quantas regras e automações a etapa já tem', () => {
    state.stages = [
      stage({ requirements: { tasks: true, customer: true, taskNames: ['Enviar proposta'] } }),
      stage({ id: 'stage-2', name: 'Negociação' }),
    ];
    state.rules = [{ id: 'rule-1', trigger_stage_id: 'stage-1' }];

    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.getByText('3 regras · 1 automação')).toBeTruthy();
    expect(screen.getAllByText(/regra|automação/i).filter((node) => node.tagName === 'SPAN')).toHaveLength(1);
  });

  it('deixa regras e automações à vista no computador e abre direto nas regras', () => {
    state.stages = [stage({})];

    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    fireEvent.click(screen.getByRole('button', { name: 'Regras e automações' }));
    expect(screen.getByTestId('stage-config').textContent).toBe('Proposta:rules');
  });

  it('no celular a ação fica no menu da linha, sem botão solto', () => {
    state.isMobile = true;
    state.stages = [stage({})];

    render(<StageManagerDialog embedded compact pipelineId="pipeline-1" pipelineName="Vendas" />);

    expect(screen.queryByRole('button', { name: 'Regras e automações' })).toBeNull();
  });
});
