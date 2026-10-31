import { fireEvent, render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { MobilePillTabs } from './MobilePillTabs';

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    disconnect() {}
  });
});

describe('MobilePillTabs underline', () => {
  it('mantém semântica de abas e troca a seleção sem superfície segmentada', () => {
    const onTabChange = vi.fn();

    render(
      <MobilePillTabs
        variant="underline"
        tabs={[
          { value: 'clientes', label: 'Clientes' },
          { value: 'fornecedores', label: 'Fornecedores' },
        ]}
        activeTab="clientes"
        onTabChange={onTabChange}
      />,
    );

    const tablist = screen.getByRole('tablist');
    const clientes = screen.getByRole('tab', { name: 'Clientes' });
    const fornecedores = screen.getByRole('tab', { name: 'Fornecedores' });

    expect(tablist).toHaveClass('border-b', 'border-border');
    expect(tablist).not.toHaveClass('bg-muted');
    expect(clientes).toHaveAttribute('aria-selected', 'true');
    expect(clientes).toHaveClass('border-primary', 'bg-transparent', 'rounded-none');
    expect(fornecedores).toHaveAttribute('aria-selected', 'false');

    fireEvent.click(fornecedores);
    expect(onTabChange).toHaveBeenCalledWith('fornecedores');
  });

  it('destaca em negrito a aba ativa de nível de tela', () => {
    render(
      <MobilePillTabs
        variant="underline"
        level="screen"
        tabs={[
          { value: 'orcamentos', label: 'Orçamentos', icon: <span data-testid="icon-orcamentos" /> },
          { value: 'custos', label: 'Custos dos Serviços', icon: <span data-testid="icon-custos" /> },
        ]}
        activeTab="orcamentos"
        onTabChange={() => undefined}
      />,
    );

    expect(screen.getByRole('tab', { name: 'Orçamentos' })).toHaveClass('font-bold');
    expect(screen.getByRole('tab', { name: 'Custos dos Serviços' })).not.toHaveClass('font-bold');
    expect(screen.getByTestId('icon-orcamentos')).toBeInTheDocument();
    expect(screen.getByTestId('icon-custos')).toBeInTheDocument();
  });
});
