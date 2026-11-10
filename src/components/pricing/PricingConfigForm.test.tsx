import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  mutate: vi.fn(),
  settings: {
    tax_rate: 10,
    admin_indirect_rate: 12,
    default_profit_rate: 10,
    km_cost: 1,
    card_discount_rate: 6,
    card_installments: 10,
  },
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br' }),
}));

vi.mock('@/hooks/usePricingSettings', () => ({
  usePricingSettings: () => ({
    settings: testState.settings,
    isLoading: false,
    upsertSettings: { mutate: testState.mutate, isPending: false },
  }),
}));

import { PricingConfigForm } from './PricingConfigForm';

describe('PricingConfigForm — ação única de salvar', () => {
  beforeEach(() => testState.mutate.mockReset());

  it('mantém um único CTA, habilita ao editar e envia a configuração completa', () => {
    const { container } = render(<PricingConfigForm />);
    const saveButtons = screen.getAllByRole('button', { name: /^Salvar$/i });
    expect(saveButtons).toHaveLength(1);
    expect((saveButtons[0] as HTMLButtonElement).disabled).toBe(true);

    const numberInputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];
    fireEvent.change(numberInputs[0], { target: { value: '11.5' } });

    expect(screen.getByText('Há alterações de precificação ainda não salvas.')).toBeInTheDocument();
    expect((saveButtons[0] as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(saveButtons[0]);

    expect(testState.mutate).toHaveBeenCalledWith(expect.objectContaining({
      tax_rate: 11.5,
      admin_indirect_rate: 12,
      km_cost: 1,
      card_installments: 10,
    }));
  });

  it('atualiza a prévia durante a digitação sem persistir antes de Salvar', async () => {
    const onPreviewChange = vi.fn();
    const { container } = render(<PricingConfigForm onPreviewChange={onPreviewChange} />);
    const numberInputs = Array.from(container.querySelectorAll('input')) as HTMLInputElement[];

    await waitFor(() => expect(onPreviewChange).toHaveBeenCalled());
    onPreviewChange.mockClear();

    fireEvent.change(numberInputs[1], { target: { value: '15,5' } });

    await waitFor(() => expect(onPreviewChange).toHaveBeenLastCalledWith(expect.objectContaining({
      taxRate: 10,
      adminRate: 15.5,
      profitRate: 10,
    })));
    expect(testState.mutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole('button', { name: /^Salvar$/i })).toHaveLength(1);
  });
});
