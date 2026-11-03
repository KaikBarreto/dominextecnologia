import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  createMutateAsync: vi.fn().mockResolvedValue({ id: 'service-new' }),
  updateMutateAsync: vi.fn().mockResolvedValue({ id: 'service-1' }),
  serviceTypes: [{
    id: 'service-1',
    name: 'Primeiro serviço',
    color: '#2563eb',
    description: 'Cadastro existente',
    is_active: true,
    requires_equipment: true,
    number_prefix: 'PS',
    category_id: null,
    codigo_servico: null,
    codigo_tributacao_municipal: null,
    codigo_nbs: null,
    iss_aliquota: null,
    item_lc116: null,
    default_price: 120,
    created_at: '2026-11-02T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  }],
}));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', currency: 'BRL' }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false, useIsCompact: () => false }));
vi.mock('@/hooks/useCompanyModules', () => ({ useCompanyModules: () => ({ hasModule: () => false }) }));
vi.mock('@/hooks/useServiceTypeCategories', () => ({ useServiceTypeCategories: () => ({ categories: [] }) }));
vi.mock('@/hooks/useServiceTypes', () => ({
  useServiceTypes: () => ({
    serviceTypes: testState.serviceTypes,
    isLoading: false,
    createServiceType: { mutateAsync: testState.createMutateAsync, isPending: false },
    updateServiceType: { mutateAsync: testState.updateMutateAsync, isPending: false },
    deleteServiceType: { mutateAsync: vi.fn(), isPending: false },
  }),
}));
vi.mock('@/components/service-orders/ServiceTypeCategoriesDialog', () => ({
  ServiceTypeCategoriesDialog: () => null,
}));
vi.mock('@/components/fiscal/TaxCodeCombobox', () => ({ TaxCodeCombobox: () => null }));

import { ScreenActionsSlot } from '@/components/ui/ScreenActions';
import { ServiceTypesPanel } from './ServiceTypesPanel';

describe('ServiceTypesPanel — criação isolada da edição', () => {
  beforeEach(() => {
    testState.createMutateAsync.mockClear();
    testState.updateMutateAsync.mockClear();
  });

  it('abre Novo Serviço vazio após carregar uma edição e sempre executa create', async () => {
    render(
      <>
        <ScreenActionsSlot />
        <ServiceTypesPanel />
      </>,
    );

    // Desktop seleciona a primeira ficha para edição contextual.
    expect(await screen.findByDisplayValue('Primeiro serviço')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: 'Novo Serviço' }));

    const dialog = await screen.findByRole('dialog', { name: 'Novo Serviço' });
    const nameInput = within(dialog).getByPlaceholderText('Ex: Manutenção Preventiva');
    expect(nameInput).toHaveValue('');
    expect(within(dialog).getAllByDisplayValue('#22c55e')).toHaveLength(2);

    fireEvent.change(nameInput, { target: { value: 'Higienização premium' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Criar' }));

    await waitFor(() => expect(testState.createMutateAsync).toHaveBeenCalledTimes(1));
    expect(testState.createMutateAsync.mock.calls[0][0]).toEqual(expect.objectContaining({
      name: 'Higienização premium',
      color: '#22c55e',
    }));
    expect(testState.updateMutateAsync).not.toHaveBeenCalled();
  });

  it('descarta rascunho de uma criação cancelada antes de abrir outra', async () => {
    render(
      <>
        <ScreenActionsSlot />
        <ServiceTypesPanel />
      </>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Novo Serviço' }));
    let dialog = await screen.findByRole('dialog', { name: 'Novo Serviço' });
    fireEvent.change(within(dialog).getByPlaceholderText('Ex: Manutenção Preventiva'), { target: { value: 'Rascunho' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo Serviço' })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Novo Serviço' }));
    dialog = await screen.findByRole('dialog', { name: 'Novo Serviço' });
    expect(within(dialog).getByPlaceholderText('Ex: Manutenção Preventiva')).toHaveValue('');
  });
});
