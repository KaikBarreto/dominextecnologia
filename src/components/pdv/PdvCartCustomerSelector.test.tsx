import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Customer } from '@/types/database';
import { EMPTY_CART } from '@/lib/pdv/cart';
import { PdvPartyProfileButton } from './PdvPartyProfileButton';

vi.mock('@/components/customers/CustomerSelectField', () => ({ CustomerSelectField: ({ value, onValueChange }: { value: string; onValueChange: (id: string) => void }) => <select aria-label="Cliente" value={value || '_none'} onChange={event => onValueChange(event.target.value)}><option value="_none">Sem cliente</option><option value="customer-1">Cliente da loja</option></select> }));
vi.mock('@/components/pdv/PdvCustomerProfileDialog', () => ({ PdvCustomerProfileDialog: ({ customer }: { customer: Customer }) => {
  const [open, setOpen] = useState(false);
  return <><PdvPartyProfileButton label="Ver ficha do cliente" onClick={() => setOpen(true)} />{open && <div role="dialog" aria-label="Ficha do cliente">{customer.name}</div>}</>;
} }));
import { PdvCartCustomerSelector, type PdvCartSummaryTexts } from './PdvCartSummary';

describe('Ficha do cliente sempre ao lado do seletor', () => {
  it('preserva Info desabilitado sem cliente e habilita a ficha após selecionar', () => {
    const customer: Customer = { id: 'customer-1', customer_type: 'pf', name: 'Cliente da loja', created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z' };
    function Harness() {
      const [customerId, setCustomerId] = useState<string | null>(null);
      return <PdvCartCustomerSelector compact cart={{ ...EMPTY_CART, customerId }} customers={[customer]} texts={{ customerNone: 'Sem cliente' } as PdvCartSummaryTexts} onCustomerChange={setCustomerId} />;
    }
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Ver ficha do cliente' })).toBeDisabled();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'customer-1' } });
    expect(screen.getByRole('button', { name: 'Ver ficha do cliente' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ver ficha do cliente' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Cliente da loja');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '_none' } });
    expect(screen.getByRole('button', { name: 'Ver ficha do cliente' })).toBeDisabled();
  });
});
