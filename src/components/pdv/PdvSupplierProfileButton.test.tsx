import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '@/hooks/useSuppliers';

const state = vi.hoisted(() => ({ detail: vi.fn() }));
vi.mock('@/components/customers/SupplierDetailDialog', () => ({
  SupplierDetailDialog: (props: { supplier: Supplier; open: boolean; onOpenChange: (open: boolean) => void }) => {
    state.detail(props);
    return props.open ? <div role="dialog" aria-label="Ficha do fornecedor">{props.supplier.name}<button onClick={() => props.onOpenChange(false)}>Fechar ficha</button></div> : null;
  },
}));
import { PdvSupplierProfileButton } from './PdvSupplierProfileButton';

const supplier: Supplier = { id: 'supplier-1', company_id: 'company-1', name: 'Clima Rio', cpf_cnpj: '11.222.333/0001-44', contact_name: null, email: null, phone: null, address: null, notes: null, label_id: null, custom_fields: {}, created_by: null, created_at: '2026-11-14T00:00:00Z', updated_at: '2026-11-14T00:00:00Z' };

describe('Ficha do fornecedor ao lado do seletor no PDV', () => {
  beforeEach(() => vi.clearAllMocks());
  it('sempre mostra Info desabilitado quando não há fornecedor, sem montar leituras', () => {
    render(<PdvSupplierProfileButton />);
    expect(screen.getByRole('button', { name: 'Ver ficha do fornecedor' })).toBeDisabled();
    expect(state.detail).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('habilita após selecionar e passa o fornecedor real à ficha canônica somente ao clicar', () => {
    const changeOpen = vi.fn();
    const { rerender } = render(<PdvSupplierProfileButton onOpenChange={changeOpen} />);
    rerender(<PdvSupplierProfileButton supplier={supplier} onOpenChange={changeOpen} />);
    expect(state.detail).not.toHaveBeenCalled();
    const button = screen.getByRole('button', { name: 'Ver ficha do fornecedor' });
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(screen.getByRole('dialog')).toHaveTextContent('Clima Rio');
    expect(state.detail).toHaveBeenCalledWith(expect.objectContaining({ supplier, open: true }));
    expect(changeOpen).toHaveBeenLastCalledWith(true);
    fireEvent.click(screen.getByRole('button', { name: 'Fechar ficha' }));
    expect(changeOpen).toHaveBeenLastCalledWith(false);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
