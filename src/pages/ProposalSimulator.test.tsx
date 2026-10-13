import { act } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/usePublicSubscriptionPlans', () => ({
  usePublicSubscriptionCatalog: () => ({
    data: {
      plans: [{
        id: 'start',
        code: 'start',
        name: 'Start',
        description: null,
        price: 197,
        maxUsers: 5,
        includedModules: ['basic', 'customer_portal', 'pricing_advanced', 'video_questions'],
      }],
      modules: [{
        id: 'basic',
        code: 'basic',
        name: 'Módulo Básico',
        description: null,
        price: 197,
        type: 'module',
      }, {
        id: 'customer-portal',
        code: 'customer_portal',
        name: 'Portal do Cliente',
        description: null,
        price: 0,
        type: 'module',
      }, {
        id: 'pricing-advanced',
        code: 'pricing_advanced',
        name: 'Precificação Avançada',
        description: null,
        price: 0,
        type: 'module',
      }, {
        id: 'video-questions',
        code: 'video_questions',
        name: 'Perguntas em Vídeo',
        description: null,
        price: 0,
        type: 'module',
      }],
      extraUserPrice: 20,
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/utils/proposalSimulatorPdf', () => ({ generateProposalSimulatorPdf: vi.fn() }));

import ProposalSimulator from './ProposalSimulator';

describe('ProposalSimulator', () => {
  it('preserva todos os cliques rápidos ao aumentar usuários do plano personalizado', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    const increaseUsers = screen.getByRole('button', { name: 'Aumentar usuários' });
    act(() => {
      increaseUsers.click();
      increaseUsers.click();
    });

    await waitFor(() => {
      expect(screen.getByText('7 usuários', { exact: true })).toBeInTheDocument();
    });
    expect(screen.getByText('Portal do Cliente')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover Portal do Cliente' })).not.toBeInTheDocument();
  });
});
