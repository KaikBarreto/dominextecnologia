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
        includedModules: ['basic', 'customer_portal', 'finance_advanced', 'pricing_advanced', 'video_questions'],
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
        price: 0,
        type: 'module',
      }, {
        id: 'cobrancas',
        code: 'cobrancas',
        name: 'Cobranças',
        description: 'Pix, boleto e cartão.',
        price: 150,
        type: 'addon',
      }, {
        id: 'nfe',
        code: 'nfe',
        name: 'Emissão de Notas Fiscais',
        description: 'Emissão de NFS-e integrada ao sistema.',
        price: 150,
        type: 'module',
      }, {
        id: 'whatsapp',
        code: 'whatsapp',
        name: 'Avisos de WhatsApp',
        description: 'Avisos automáticos ao cliente.',
        price: 49,
        type: 'addon',
      }, {
        id: 'white-label',
        code: 'white_label',
        name: 'Sistema com sua marca',
        description: 'Logo, cores e identidade visual da empresa.',
        price: 50,
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

function revealMonthlyPlan() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver plano mensal' }));
}

function revealInstallments() {
  fireEvent.click(screen.getByRole('button', { name: 'Ver parcelamento no Pix' }));
}

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
    expect(within(configuration).getByText('Kit Básico Dominex')).toBeInTheDocument();
    expect(within(configuration).getByText(/Área do Técnico™/)).toBeInTheDocument();
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
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getAllByText('R$ 246,00/mês')).toHaveLength(2);
    });
    expect(screen.getAllByText('Integração com o WhatsApp')).toHaveLength(2);
  }, 30_000);

  it('oferece Cobranças ao adicionar módulo no plano personalizado', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    const chargesOption = await screen.findByRole('button', { name: /Cobranças/ });

    expect(chargesOption).toBeInTheDocument();
    fireEvent.click(chargesOption);
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Remover Cobranças' })).toBeInTheDocument();
      expect(screen.getAllByText('R$ 347,00/mês')).toHaveLength(2);
    });
  }, 30_000);

  it('exibe e soma Notas Fiscais por R$ 150 no plano personalizado', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Emissão de notas fiscais/i }));
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Remover Emissão de notas fiscais/i })).toBeInTheDocument();
      expect(screen.getAllByText('R$ 347,00/mês')).toHaveLength(2);
    });
  }, 30_000);

  it('agrupa o Kit Básico e exibe somente add-ons reais e usuário adicional', () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    const pricingTab = screen.getByRole('tab', { name: 'Tabela' });
    fireEvent.mouseDown(pricingTab, { button: 0, ctrlKey: false });

    const priceTable = screen.getByRole('region', { name: 'Tabela de preços' });
    expect(within(priceTable).getByRole('row', { name: /^Kit Básico Dominex\b/ })).toHaveTextContent('R$ 197,00/mês');
    expect(within(priceTable).getByRole('row', { name: /Cobranças/ })).toHaveTextContent('R$ 150,00/mês');
    expect(within(priceTable).getByRole('row', { name: /Emissão de notas fiscais/i })).toHaveTextContent('R$ 150,00/mês');
    expect(within(priceTable).getByRole('row', { name: /White Label/ })).toHaveTextContent('R$ 50,00/mês');
    expect(within(priceTable).getByRole('row', { name: /Usuário adicional/ })).toHaveTextContent('R$ 20,00/mês');
    expect(within(priceTable).queryByText('Sistema com sua marca')).not.toBeInTheDocument();
  });

  it('ignora o Financeiro Avançado de links antigos sem cobrar nem exibir', () => {
    render(
      <MemoryRouter initialEntries={['/proposta?l1=personalizado&m1=basic,finance_advanced']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    revealMonthlyPlan();
    expect(screen.getAllByText('R$ 197,00/mês')).toHaveLength(2);
    expect(screen.queryByText('Financeiro Avançado')).not.toBeInTheDocument();
  });

  it('usa o mensal negociado como base do desconto adicional no anual', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Desconto adicional no anual')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));

    fireEvent.change(screen.getByLabelText('Desconto adicional no anual'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto mensal em reais' }));
    fireEvent.change(screen.getByLabelText('Desconto mensal'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('combobox', { name: 'Parcelas no Pix' }));
    fireEvent.click(await screen.findByRole('option', { name: '6x' }));
    revealInstallments();
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getByText('Plano anual · 40% de desconto adicional')).toBeInTheDocument();
      expect(screen.getByText('R$ 2.004,00')).toHaveClass('line-through', 'text-destructive');
      expect(screen.getByText('Economia total de R$ 1.161,60 versus a tabela anual')).toHaveClass('font-bold');
      expect(screen.getByText('Em até 6x de R$ 200,40 no Pix')).toBeInTheDocument();
      expect(screen.getByText('Plano mensal · R$ 30,00 de desconto')).toBeInTheDocument();
      expect(screen.getByText('R$ 197,00')).toHaveClass('line-through', 'text-destructive');
      expect(screen.getByText('R$ 167,00/mês')).toBeInTheDocument();
    });
    expect(screen.getByRole('radio', { name: 'Desconto mensal em reais' })).toHaveAttribute('aria-checked', 'true');
  });

  it('remove zeros à esquerda dos campos de desconto durante a digitação', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));
    const annualDiscount = screen.getByLabelText('Desconto adicional no anual');
    const monthlyDiscount = screen.getByLabelText('Desconto mensal');

    expect(annualDiscount).toHaveValue('20');
    expect(monthlyDiscount).toHaveValue('');

    fireEvent.change(annualDiscount, { target: { value: '020' } });
    expect(annualDiscount).toHaveValue('20');

    fireEvent.click(screen.getByRole('radio', { name: 'Desconto mensal em reais' }));
    fireEvent.change(monthlyDiscount, { target: { value: '0050' } });
    expect(monthlyDiscount).toHaveValue('50');
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getByText('Plano anual · 20% de desconto adicional')).toBeInTheDocument();
      expect(screen.getByText('Plano mensal · R$ 50,00 de desconto')).toBeInTheDocument();
    });
  });

  it('calcula R$ 3.811,20 no anual quando o mensal cai de R$ 547 para R$ 397', async () => {
    render(
      <MemoryRouter initialEntries={['/proposta']}>
        <ProposalSimulator />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mais opções' }));

    // O mock tem Essencial a R$ 197; acrescentamos Cobranças (R$ 150), NFS-e
    // (R$ 150) e White Label (R$ 50) para reproduzir a base de R$ 547 da captura.
    fireEvent.click(screen.getByRole('combobox', { name: 'Plano' }));
    fireEvent.click(await screen.findByRole('option', { name: 'Personalizado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Cobranças/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    fireEvent.click(await screen.findByRole('button', { name: /Emissão de notas fiscais/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar módulo' }));
    fireEvent.click(await screen.findByRole('button', { name: /White Label/ }));
    fireEvent.click(screen.getByRole('radio', { name: 'Desconto mensal em reais' }));
    fireEvent.change(screen.getByLabelText('Desconto mensal'), { target: { value: '150' } });
    revealMonthlyPlan();

    await waitFor(() => {
      expect(screen.getByText('R$ 397,00/mês')).toBeInTheDocument();
      expect(screen.getByText('R$ 3.811,20', { exact: false })).toBeInTheDocument();
      expect(screen.getByText('R$ 4.764,00')).toHaveClass('line-through', 'text-destructive');
    });
  }, 30_000);
});
