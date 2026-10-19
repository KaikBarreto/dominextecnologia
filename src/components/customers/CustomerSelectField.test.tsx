import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import type { Customer } from '@/types/database';

vi.mock('@/components/financial/QuickCustomerDialog', () => ({
  QuickCustomerDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Cadastro rápido</div> : null,
}));

const customers = [
  { id: 'customer-1', name: 'Cliente com nome extenso' },
] as Customer[];

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});

describe('CustomerSelectField', () => {
  it('usa quick-add externo no resumo e não repete a ação no fim das opções', () => {
    render(
      <CustomerSelectField
        variant="summary"
        summaryLabel="Cliente (opcional)"
        createLabel="Cadastrar novo cliente"
        value="customer-1"
        customers={customers}
        allowNone
        noneValue="_none"
        noneLabel="Sem cliente"
        onValueChange={() => {}}
      />,
    );

    const quickAdd = screen.getByRole('button', { name: 'Cadastrar novo cliente' });
    expect(quickAdd).toHaveClass('w-14', 'bg-foreground', 'text-background');
    expect(screen.getByRole('combobox').querySelector('.lucide-chevrons-up-down')).toHaveClass('-translate-y-2');

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Cadastrar novo cliente')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Sem cliente');

    fireEvent.click(quickAdd);
    expect(screen.getByText('Cadastro rápido')).toBeVisible();
  });
});
