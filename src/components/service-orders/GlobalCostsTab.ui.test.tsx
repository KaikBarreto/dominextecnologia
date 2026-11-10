import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  deleteMutate: vi.fn(),
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false, useIsCompact: () => false }));
vi.mock('@/hooks/usePricingSettings', () => ({
  usePricingSettings: () => ({
    settings: {
      tax_rate: 10,
      admin_indirect_rate: 12,
      default_profit_rate: 10,
      km_cost: 1,
      card_discount_rate: 6,
      card_installments: 10,
    },
  }),
}));
vi.mock('@/hooks/useCostResources', () => ({
  useCostResources: () => ({
    resources: [
      {
        id: 'resource-1', company_id: 'company-1', category: 'vehicle', name: 'Van técnica',
        is_active: true, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 500, hourly_rate: 2.84,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
      {
        id: 'resource-2', company_id: 'company-1', category: 'tool', name: 'Furadeira',
        is_active: true, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 100, hourly_rate: 0.57,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
      {
        id: 'resource-3', company_id: 'company-1', category: 'gift', name: 'Kit boas-vindas',
        is_active: false, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 25, hourly_rate: 0,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
      {
        id: 'resource-4', company_id: 'company-1', category: 'epi', name: 'Kit EPI',
        is_active: true, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 80, hourly_rate: 0.45,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
      {
        id: 'resource-5', company_id: 'company-1', category: 'other', name: 'Licença',
        is_active: true, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 90, hourly_rate: 0.51,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
      {
        id: 'resource-6', company_id: 'company-1', category: 'legacy', name: 'Categoria antiga',
        is_active: true, monthly_hours: 176, notes: null, photo_url: null,
        total_monthly_cost: 10, hourly_rate: 0.06,
        created_at: '2026-11-02T00:00:00Z', updated_at: '2026-11-02T00:00:00Z',
      },
    ],
    kpis: { vehicleHourlyCost: 2.84, toolHourlyCost: 0, epiHourlyCost: 0, giftCostPerUnit: 0 },
    isLoading: false,
    createResource: { mutate: vi.fn(), isPending: false },
    updateResource: { mutate: vi.fn(), isPending: false },
    deleteResource: { mutate: testState.deleteMutate, isPending: false },
  }),
  useCostResourceItems: () => ({ data: [], isLoading: false }),
}));
vi.mock('./CostResourceFormSheet', () => ({ CostResourceFormSheet: () => null }));

import { GlobalCostsTab } from './GlobalCostsTab';

describe('GlobalCostsTab — exclusão contextual', () => {
  beforeEach(() => testState.deleteMutate.mockReset());

  it('confirma a exclusão e só fecha o diálogo após sucesso da mutação', () => {
    render(<GlobalCostsTab />);
    fireEvent.click(screen.getByRole('button', { name: /Van técnica/ }));
    fireEvent.click(screen.getByRole('button', { name: /Excluir/ }));

    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: /Excluir/ });
    fireEvent.click(confirm);

    expect(testState.deleteMutate).toHaveBeenCalledTimes(1);
    expect(testState.deleteMutate.mock.calls[0][0]).toBe('resource-1');
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    act(() => testState.deleteMutate.mock.calls[0][1].onSuccess());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('mostra categoria saturada com ícone e mantém o status em badge separado', () => {
    render(<GlobalCostsTab />);

    const expected = [
      ['vehicle', 'Car'],
      ['tool', 'Wrench'],
      ['gift', 'Gift'],
      ['epi', 'HardHat'],
      ['other', 'Package'],
    ] as const;

    for (const [category, icon] of expected) {
      const badge = document.querySelector(`[data-resource-category-badge="${category}"]`);
      expect(badge).not.toBeNull();
      expect(badge).toHaveClass('text-white');
      expect((badge as HTMLElement).style.backgroundColor).not.toBe('');
      expect(badge?.querySelector(`.lucide-${icon.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase()}`)).not.toBeNull();
    }

    // Valor legado/desconhecido cai de forma segura em “Outros”.
    expect(document.querySelectorAll('[data-resource-category-badge="other"]')).toHaveLength(2);
    const activeStatus = document.querySelector('[data-resource-status-badge="active"]');
    expect(activeStatus).not.toBeNull();
    expect(activeStatus).toHaveClass('text-white', 'bg-green-600');
    expect(activeStatus).not.toBe(document.querySelector('[data-resource-category-badge="vehicle"]'));

    fireEvent.click(screen.getByRole('button', { name: /Van técnica/ }));
    expect(document.querySelectorAll('[data-resource-category-badge="vehicle"]')).toHaveLength(2);
    expect(screen.getByText('Seu custo por hora utilizada')).toBeInTheDocument();
    expect(screen.getByText('Cliente paga com BDI por hora utilizada')).toBeInTheDocument();
  });
});
