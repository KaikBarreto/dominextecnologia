import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  rules: [] as Array<Record<string, unknown>>,
  stages: [] as Array<Record<string, unknown>>,
  saveRule: vi.fn(),
  deleteRule: vi.fn(),
  updateStage: vi.fn(),
  onOpenChange: vi.fn(),
}));

vi.mock('@/components/ui/ResponsiveModal', () => ({
  ResponsiveModal: ({ open, title, children, onOpenChange }: { open: boolean; title: string; children: ReactNode; onOpenChange: (open: boolean) => void }) => (
    open ? <div><h1>{title}</h1><button type="button" onClick={() => onOpenChange(false)}>FECHAR</button>{children}</div> : null
  ),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: mocks.stages,
    updateStage: { mutateAsync: mocks.updateStage, isPending: false },
  }),
}));

vi.mock('@/hooks/useCrmStageAutomations', () => ({
  useCrmStageAutomations: () => ({
    rules: mocks.rules,
    isLoading: false,
    error: null,
    resources: { users: [], labels: [], templates: [], pipelines: [], stages: [] },
    saveRule: { mutateAsync: mocks.saveRule, isPending: false },
    toggleRule: { mutateAsync: vi.fn() },
    deleteRule: { mutateAsync: mocks.deleteRule },
  }),
}));

import { CrmStageAutomationDialog } from './CrmStageAutomationDialog';
import type { CrmStage } from '@/hooks/useCrmStages';

const stage = {
  id: 'stage-1', pipeline_id: 'pipeline-1', name: 'Proposta', color: '#2563EB', icon: null,
  is_won: false, is_lost: false, description: null, requirements: { tasks: true },
} as unknown as CrmStage;

const rule = {
  id: 'rule-1', company_id: 'company-1', pipeline_id: 'pipeline-1', trigger_stage_id: 'stage-1',
  name: 'Avisar o time', trigger_type: 'stage_enter', trigger_config: {},
  actions: [{ id: 'action-1', action: 'create_task', config: { title: 'Ligar para {NOME}', dueDays: 1 } }],
  enabled: true, position: 0,
};

function renderDialog(initialTab: 'column' | 'rules' | 'automations' = 'automations') {
  return render(<CrmStageAutomationDialog open onOpenChange={mocks.onOpenChange} stage={stage} initialTab={initialTab} />);
}

describe('CrmStageAutomationDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rules = [];
    mocks.stages = [stage as unknown as Record<string, unknown>];
    mocks.saveRule.mockResolvedValue(undefined);
    mocks.deleteRule.mockResolvedValue(undefined);
    mocks.updateStage.mockResolvedValue(undefined);
  });

  it('navega por abas sublinhadas, sem o retângulo cinza atrás', () => {
    renderDialog('column');

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['Etapa', 'Regras de saída1', 'Automações']);
    const list = screen.getByRole('tablist');
    expect(list.className).toContain('border-b');
    expect(list.className).not.toContain('bg-muted');
    tabs.forEach((tab) => {
      expect(tab.className).toContain('border-b-2');
      expect(tab.className).not.toContain('data-[state=active]:bg-background');
    });
  });

  it('só libera salvar as regras de saída depois de uma alteração', () => {
    renderDialog('rules');

    const save = screen.getByRole('button', { name: 'Salvar regras' });
    expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole('switch', { name: 'Cliente' }));
    expect(save).not.toBeDisabled();
  });

  it('lista as automações à esquerda e abre a escolhida no detalhe', () => {
    mocks.rules = [rule];
    renderDialog();

    const list = screen.getByRole('complementary', { name: 'Automações' });
    expect(within(list).getByText('Avisar o time')).toBeTruthy();
    expect(within(list).getByText('Ativa')).toBeTruthy();
    expect(within(list).getByRole('listitem').textContent).toContain('Ativa · Ao entrar nesta etapa · 1 ação');
    expect(screen.getByText('Selecione uma automação')).toBeTruthy();

    fireEvent.click(within(list).getByRole('button', { name: /Avisar o time/ }));

    expect(screen.getByDisplayValue('Avisar o time')).toBeTruthy();
    expect(screen.getByDisplayValue('Ligar para {NOME}')).toBeTruthy();
    // A lista continua visível ao lado: trocar de automação não exige "voltar".
    expect(within(list).getByText('Avisar o time')).toBeTruthy();
  });

  it('oferece o modelo de follow-up após orçamento e salva com o evento certo', async () => {
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Follow-up após orçamento' }));
    expect(screen.getByDisplayValue('Fazer follow-up do orçamento com {CLIENTE}')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Salvar automação' }));

    await vi.waitFor(() => expect(mocks.saveRule).toHaveBeenCalledTimes(1));
    expect(mocks.saveRule.mock.calls[0][0]).toMatchObject({
      name: 'Follow-up após orçamento',
      trigger_type: 'business_event',
      trigger_config: { event: 'quote.created' },
      trigger_stage_id: 'stage-1',
      enabled: false,
    });
  });

  it('pede confirmação antes de excluir uma automação', async () => {
    mocks.rules = [rule];
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Avisar o time/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    expect(mocks.deleteRule).not.toHaveBeenCalled();

    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Excluir automação?')).toBeTruthy();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Excluir' }));

    await vi.waitFor(() => expect(mocks.deleteRule).toHaveBeenCalledWith('rule-1'));
  });

  it('não fecha por cima de uma automação em edição sem confirmar o descarte', () => {
    mocks.rules = [rule];
    renderDialog();

    fireEvent.click(screen.getByRole('button', { name: /Avisar o time/ }));
    fireEvent.change(screen.getByDisplayValue('Avisar o time'), { target: { value: 'Avisar o time comercial' } });
    fireEvent.click(screen.getByRole('button', { name: 'FECHAR' }));

    expect(mocks.onOpenChange).not.toHaveBeenCalled();
    const confirm = screen.getByRole('alertdialog');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Descartar' }));
    expect(mocks.onOpenChange).toHaveBeenCalledWith(false);
  });
});
