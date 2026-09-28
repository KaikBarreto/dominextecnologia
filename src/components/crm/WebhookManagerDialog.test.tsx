import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/useCrmWebhooks', () => ({
  useCrmWebhooks: () => ({
    webhooks: [],
    isLoading: false,
    createWebhook: { mutateAsync: vi.fn(), isPending: false },
    updateWebhook: { mutate: vi.fn() },
    deleteWebhook: { mutate: vi.fn() },
  }),
}));

vi.mock('@/hooks/useCustomerOrigins', () => ({
  useCustomerOrigins: () => ({
    activeOrigins: [
      { id: 'origin-1', name: 'Indicação', icon: 'Users', color: '#22C55E', is_active: true },
    ],
  }),
}));

vi.mock('@/hooks/useCrmPipelines', () => ({
  useCrmPipelines: () => ({
    pipelines: [
      { id: 'pipeline-1', name: 'Funil de Vendas', color: '#7C3AED' },
    ],
  }),
}));

vi.mock('@/hooks/useCrmStages', () => ({
  useCrmStages: () => ({
    stages: [
      {
        id: 'stage-1',
        pipeline_id: 'pipeline-1',
        name: 'Vistoria técnica',
        color: '#F97316',
        icon: 'MapPin',
        is_won: false,
        is_lost: false,
      },
    ],
    getStageHex: (color: string) => color,
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import { WebhookManagerDialog } from './WebhookManagerDialog';

describe('WebhookManagerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('mostra ícone e cor nas opções de origem, funil e etapa', () => {
    render(<WebhookManagerDialog embedded />);

    fireEvent.click(screen.getByRole('combobox', { name: /origem padrão/i }));
    const origin = document.querySelector('[data-origin-option="Indicação"]');
    expect(origin).toBeTruthy();
    expect(origin?.querySelector('svg')).toBeTruthy();
    expect(origin?.querySelector('[data-origin-color="#22C55E"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /indicação/i }));

    fireEvent.click(screen.getByRole('combobox', { name: /funil de destino/i }));
    const pipeline = document.querySelector('[data-pipeline-option="pipeline-1"]');
    expect(pipeline).toBeTruthy();
    expect(pipeline?.querySelector('svg')).toBeTruthy();
    expect(pipeline?.querySelector('[data-pipeline-color="#7C3AED"]')).toBeTruthy();
    fireEvent.click(screen.getByRole('option', { name: /funil de vendas/i }));

    const stageTrigger = screen.getByRole('combobox', { name: /etapa de destino/i });
    expect(stageTrigger.textContent).toContain('Vistoria técnica');
    expect(stageTrigger.querySelector('[data-stage-option="stage-1"] svg')).toBeTruthy();
    fireEvent.click(stageTrigger);
    expect(document.querySelector('[data-stage-option="stage-1"] svg')).toBeTruthy();
  });
});
