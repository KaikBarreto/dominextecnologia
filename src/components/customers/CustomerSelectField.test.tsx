import { fireEvent, render, screen } from '@testing-library/react';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { CustomerSelectField } from '@/components/customers/CustomerSelectField';
import type { Customer } from '@/types/database';

vi.mock('@/components/financial/QuickCustomerDialog', () => ({
  QuickCustomerDialog: ({ open }: { open: boolean }) =>
    open ? <div role="dialog">Cadastro rápido</div> : null,
}));
vi.mock('@/hooks/usePartyLabels', () => ({
  usePartyLabels: () => ({
    labels: [], activeLabels: [],
    labelsFor: (_type: string, id?: string) => id === 'customer-1' ? [
      { id: 'label-blocked', company_id: 'company-1', name: 'BLOQUEADO', color: '#DC2626', is_active: true, scope: 'party', show_in_portal: false, created_at: '' },
      { id: 'label-vip', company_id: 'company-1', name: 'VIP', color: '#2563EB', is_active: true, scope: 'party', show_in_portal: false, created_at: '' },
    ] : [],
  }),
}));

const customers = [
  { id: 'customer-1', name: 'Cliente com nome extenso', label_id: 'label-blocked' },
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
    expect(screen.getByRole('combobox').querySelector('[aria-label="Etiquetas: BLOQUEADO, VIP"]')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveTextContent('+1');

    fireEvent.click(screen.getByRole('combobox'));
    expect(screen.queryByText('Cadastrar novo cliente')).not.toBeInTheDocument();
    expect(screen.getAllByRole('option')[0]).toHaveTextContent('Sem cliente');
    const customerOption = screen.getByRole('option', { name: /cliente com nome extenso etiquetas: bloqueado, vip/i });
    expect(customerOption).toHaveTextContent('BLOQUEADO');

    fireEvent.click(quickAdd);
    expect(screen.getByText('Cadastro rápido')).toBeVisible();
  });
});
