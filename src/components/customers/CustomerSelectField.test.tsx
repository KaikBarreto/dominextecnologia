import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  vi.stubGlobal('scrollTo', vi.fn());
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

  it('no PDV expande a busca na própria ficha e mantém pesquisa por documento, telefone, endereço e etiqueta', async () => {
    const onValueChange = vi.fn();
    const { container } = render(<CustomerSelectField variant="pdv" customers={[
      { ...customers[0], document: '529.982.247-25', phone: '(11) 98877-6655', address: 'Rua das Flores', neighborhood: 'Centro', city: 'São Paulo', state: 'SP' },
      { id: 'customer-2', name: 'Outro cliente' },
    ] as Customer[]} onValueChange={onValueChange} />);

    fireEvent.click(screen.getByRole('combobox'));
    const input = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    expect(input).toHaveAttribute('placeholder', 'Nome, CPF/CNPJ, telefone, endereço…');
    const contact = screen.getByRole('option', { name: /Cliente com nome extenso/ });
    expect(contact).toHaveTextContent('529.982.247-25 · (11) 98877-6655');
    expect(contact).toHaveTextContent('Rua das Flores, Centro, São Paulo - SP');
    expect(container.querySelector('.clientoptions')).toContainElement(input);
    await waitFor(() => expect(input).toHaveFocus());
    for (const query of ['52998224725', '11988776655', 'Rua das Flores', 'Centro', 'São Paulo', 'VIP']) {
      fireEvent.change(input, { target: { value: query } });
      expect(screen.getAllByRole('option')).toHaveLength(1);
      expect(screen.getByRole('option')).toHaveTextContent('Cliente com nome extenso');
    }
    fireEvent.click(screen.getByRole('option'));
    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('customer-1');
    expect(screen.getByRole('combobox')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByRole('combobox')).toHaveFocus();
  });

  it('no PDV permite navegar por teclado, cancelar sem trocar cliente e cadastrar pela busca atual', async () => {
    const onValueChange = vi.fn();
    const onCreateFull = vi.fn();
    render(<CustomerSelectField variant="pdv" customers={customers} value="customer-1" onValueChange={onValueChange} onCreateFull={onCreateFull} />);
    const trigger = screen.getByRole('combobox');
    fireEvent.click(trigger);
    const input = screen.getByRole('searchbox', { name: 'Buscar cliente' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(screen.getByRole('option')).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('option'), { key: 'Escape' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
    expect(onValueChange).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar cliente' }), { target: { value: 'Cliente novo' } });
    await waitFor(() => expect(screen.getByText('Nenhum cliente encontrado.')).toBeVisible());
    fireEvent.click(screen.getByRole('button', { name: 'Criar cliente' }));
    expect(onCreateFull).toHaveBeenCalledOnce();
    expect(onValueChange).not.toHaveBeenCalled();
  });

});
