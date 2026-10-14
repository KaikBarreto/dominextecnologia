import { act } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
      }, {
        id: 'finance-advanced',
        code: 'finance_advanced',
        name: 'Financeiro Avançado',
        description: 'DRE e DFC.',
        price: 150,
        type: 'module',
      }, {
        id: 'whatsapp',
        code: 'whatsapp',
        name: 'Avisos de WhatsApp',
        description: 'Avisos automáticos ao cliente.',
        price: 49,
        type: 'addon',
      }],
      extraUserPrice: 20,
    },
    isLoading: false,
    isError: false,
  }),
}));

vi.mock('@/utils/proposalSimulatorPdf', () => ({ generateProposalSimulatorPdf: vi.fn() }));

import ProposalSimulator from './ProposalSimulator';

Element.prototype.scrollIntoView = vi.fn();

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
    const configuration = screen.getByRole('region', { name: 'Configuração da proposta' });
    expect(within(configuration).getByText('Módulo Básico')).toBeInTheDocument();
    expect(within(configuration).getByText(/Também inclui Área do Técnico™/)).toBeInTheDocument();
    expect(within(configuration).queryByText('Portal do Cliente', { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText('Área do Técnico™')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remover Portal do Cliente' })).not.toBeInTheDocument();
  });

  it('mostra a Área do Técnico no plano Essencial e não anuncia teste grátis', () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    expect(screen.getByText('Área do Técnico™')).toBeInTheDocument();
    expect(screen.queryByText('7 dias grátis, sem cartão')).not.toBeInTheDocument();
  });

  it('inclui o primeiro nível pago do WhatsApp no total da proposta', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    const whatsappOption = await screen.findByRole('button', { name: /Integração com o WhatsApp/ });
    expect(screen.queryByRole('button', { name: /Financeiro Avançado/ })).not.toBeInTheDocument();
    fireEvent.click(whatsappOption);

    await waitFor(() => {
      expect(screen.getByText('R$ 246,00/mês')).toBeInTheDocument();
    });
    expect(screen.getAllByText('Integração com o WhatsApp')).toHaveLength(2);
  });

  it('ignora o Financeiro Avançado de links antigos sem cobrar nem exibir', () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado&m1=basic,finance_advanced']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    expect(screen.getByText('R$ 197,00/mês')).toBeInTheDocument();
    expect(screen.queryByText('Financeiro Avançado')).not.toBeInTheDocument();
  });

  it('mantém as opções avançadas recolhidas e recalcula desconto e parcelas', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Desconto anual')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));

    fireEvent.change(screen.getByLabelText('Desconto anual'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Parcelas no Pix' }));
    fireEvent.click(await screen.findByRole('option', { name: '6x' }));

    await waitFor(() => {
      expect(screen.getByText('Plano anual · 40% de desconto')).toBeInTheDocument();
      expect(screen.getByText('R$ 2.364,00')).toHaveClass('line-through', 'text-destructive');
      expect(screen.getByText('Economize R$ 946,00 no plano anual')).toHaveClass('font-bold');
      expect(screen.getByText('Em até 6x de R$ 236,33 no Pix')).toBeInTheDocument();
    });
  });
});
