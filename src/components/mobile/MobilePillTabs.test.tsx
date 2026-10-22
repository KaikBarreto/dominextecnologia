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
});
