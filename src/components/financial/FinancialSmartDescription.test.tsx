import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FinancialSmartDescription } from '@/components/financial/FinancialSmartDescription';

const smartHook = vi.fn();
vi.mock('@/hooks/useFinancialSmartFill', () => ({
  useFinancialSmartFill: (...args: unknown[]) => smartHook(...args),
}));
vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

const pattern = {
  description: 'Enel',
  category: 'Energia elétrica',
  category_label: 'Concessionárias > Energia elétrica',
  supplier_id: 'supplier-enel',
  cost_center_id: 'cc-galpao',
  cost_center_label: 'Galpão 1',
  account_id: 'bank-inter',
  account_label: 'Banco Inter',
  payment_method: 'pix',
  party_label: 'Enel',
  uses: 8,
  last_used: '2026-11-01T12:00:00Z',
};

beforeEach(() => smartHook.mockReturnValue({ patterns: [pattern], loading: false }));

describe('FinancialSmartDescription', () => {
  it('aplica categoria, fornecedor, centro, conta e forma com Tab', () => {
    const onPatch = vi.fn();
    const onApplied = vi.fn();
    render(
      <FinancialSmartDescription
        id="description"
        value="Enel"
        onChange={vi.fn()}
        enabled
        context="bill"
        direction="saida"
        values={{ category: '', supplier_id: '', cost_center_id: '', account_id: '', payment_method: '' }}
        replaceableKeys={['account_id', 'payment_method']}
        allowedValues={{ account_id: ['bank-inter'], payment_method: ['pix', 'boleto'] }}
        onPatch={onPatch}
        onApplied={onApplied}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onPatch).toHaveBeenCalledWith({
      category: 'Energia elétrica',
      supplier_id: 'supplier-enel',
      cost_center_id: 'cc-galpao',
      account_id: 'bank-inter',
      payment_method: 'pix',
    });
    expect(onApplied).toHaveBeenCalledTimes(1);
  });

  it('preserva valor manual e só substitui campos explicitamente automáticos', () => {
    const onPatch = vi.fn();
    render(
      <FinancialSmartDescription
        value="Enel"
        onChange={vi.fn()}
        enabled
        context="bill"
        direction="saida"
        values={{ category: 'Categoria manual', account_id: 'conta-default', payment_method: 'boleto' }}
        replaceableKeys={['account_id', 'payment_method']}
        allowedValues={{ account_id: ['bank-inter'], payment_method: ['pix', 'boleto'] }}
        onPatch={onPatch}
        onApplied={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPatch).toHaveBeenCalledWith({ account_id: 'bank-inter', payment_method: 'pix' });
  });

  it('não aplica forma quando a conta sugerida não está disponível', () => {
    const onPatch = vi.fn();
    render(
      <FinancialSmartDescription
        value="Enel"
        onChange={vi.fn()}
        enabled
        context="bill"
        direction="saida"
        values={{ account_id: '', payment_method: '' }}
        replaceableKeys={['account_id', 'payment_method']}
        allowedValues={{ account_id: ['outra-conta'], payment_method: ['pix'] }}
        onPatch={onPatch}
        onApplied={vi.fn()}
      />,
    );
    const input = screen.getByRole('combobox');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onPatch).not.toHaveBeenCalled();
  });

  it('mantém loading somente para leitores de tela', () => {
    smartHook.mockReturnValue({ patterns: [], loading: true });
    render(
      <FinancialSmartDescription
        value="Enel"
        onChange={vi.fn()}
        enabled
        context="bill"
        direction="saida"
        values={{}}
        onPatch={vi.fn()}
        onApplied={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveClass('sr-only');
  });
});
