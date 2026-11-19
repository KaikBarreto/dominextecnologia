import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pipelines: [] as Array<Record<string, unknown>>,
  createPipeline: vi.fn(),
  updatePipeline: vi.fn(),
  deletePipeline: vi.fn(),
  reorderPipelines: vi.fn(),
  onCreated: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({ useAppLocaleContext: () => ({ locale: 'pt-br' }) }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ isAdminOrGestor: () => true, hasPermission: () => true }),
}));
vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: mocks.pipelines,
    createPipeline: { mutate: mocks.createPipeline, isPending: false },
    updatePipeline: { mutate: mocks.updatePipeline, isPending: false },
    setDefaultPipeline: { mutate: vi.fn(), isPending: false },
    deletePipeline: { mutate: mocks.deletePipeline },
    reorderPipelines: { mutate: mocks.reorderPipelines },
  }),
}));
vi.mock('@/hooks/useCrmPipelineAccess', () => ({ useCrmPipelineAccess: () => ({ access: [] }) }));
vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      { id: 'stage-1', pipeline_id: 'pipeline-1' },
      { id: 'stage-2', pipeline_id: 'pipeline-1' },
    ],
  }),
}));
vi.mock('@/hooks/useLeads', () => ({ useLeads: () => ({ leads: [{ id: 'lead-1', pipeline_id: 'pipeline-1' }] }) }));
vi.mock('@/components/crm/PipelineAccessDialog', () => ({ PipelineAccessDialog: () => null }));
vi.mock('@/components/crm/StageManagerDialog', () => ({
  StageManagerDialog: ({ pipelineName }: { pipelineName: string }) => <div data-testid="stages">{`Etapas de ${pipelineName}`}</div>,
}));

import { PipelineManagerDialog } from './PipelineManagerDialog';

describe('PipelineManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pipelines = [
      { id: 'pipeline-2', name: 'Pós-venda', color: '#7C3AED', is_default: false, tracks_value: true },
      { id: 'pipeline-1', name: 'Vendas', color: '#2563EB', is_default: true, tracks_value: true },
    ];
  });

  it('abre com a lista de funis e o funil padrão já no detalhe', () => {
    render(<PipelineManagerDialog />);

    const list = screen.getByRole('complementary', { name: 'Funis' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText('2 etapas · 1 oportunidades')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Vendas' })).toBeTruthy();
    expect(screen.getByTestId('stages').textContent).toBe('Etapas de Vendas');
  });

  it('troca o detalhe ao escolher outro funil, sem fechar a lista', () => {
    render(<PipelineManagerDialog />);

    const list = screen.getByRole('complementary', { name: 'Funis' });
    fireEvent.click(within(list).getByRole('button', { name: /^Pós-venda/ }));

    expect(screen.getByTestId('stages').textContent).toBe('Etapas de Pós-venda');
    expect(within(list).getByRole('button', { name: /^Vendas/ })).toBeTruthy();
  });

  it('respeita o funil pedido pela engrenagem da aba', () => {
    render(<PipelineManagerDialog initialPipelineId="pipeline-2" />);

    expect(screen.getByTestId('stages').textContent).toBe('Etapas de Pós-venda');
  });

  it('cria o funil pelo painel de detalhe e avisa a tela com o id novo', () => {
    mocks.createPipeline.mockImplementation((_input, options) => options.onSuccess({ id: 'pipeline-3' }));
    render(<PipelineManagerDialog onCreated={mocks.onCreated} />);

    fireEvent.click(screen.getByRole('button', { name: 'Novo funil' }));
    expect(screen.queryByTestId('stages')).toBeNull();
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: '  Licitações ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));

    expect(mocks.createPipeline.mock.calls[0][0]).toEqual({ name: 'Licitações', color: '#2563EB' });
    expect(mocks.onCreated).toHaveBeenCalledWith('pipeline-3');
  });

  it('edita nome, cor e acompanhamento de valores no detalhe', () => {
    render(<PipelineManagerDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Vendas diretas' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(mocks.updatePipeline).toHaveBeenCalledWith({
      id: 'pipeline-1', name: 'Vendas diretas', color: '#2563EB', tracks_value: true,
    });
  });

  it('só exclui depois da confirmação', () => {
    render(<PipelineManagerDialog />);

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(mocks.deletePipeline).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remover' }));
    expect(mocks.deletePipeline.mock.calls[0][0]).toBe('pipeline-1');
  });
});
