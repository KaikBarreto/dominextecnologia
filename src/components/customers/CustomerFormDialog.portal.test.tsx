import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerPortalSettings } from '@/hooks/useCustomerPortalSettings';
import type { Customer } from '@/types/database';
import { CustomerFormDialog } from './CustomerFormDialog';
import { CustomersPageChrome } from './CustomersPageChrome';

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock);

const saveSettings = vi.fn();
const toast = vi.fn();
const createCustomer = vi.fn();
let loadedSettings: CustomerPortalSettings | null = null;

const DEFAULT_SETTINGS: CustomerPortalSettings = {
  token: null,
  isActive: true,
  passwordEnabled: false,
  passwordConfigured: false,
  permissions: {
    service_orders: true,
    equipment: true,
    contracts: true,
    charges: true,
    invoices: false,
    documents: false,
    ticket_requests: true,
  },
  publicSections: {
    service_orders: false,
    equipment: false,
    contracts: false,
    charges: false,
    invoices: false,
    documents: false,
    ticket_requests: false,
  },
};

vi.mock('@/hooks/useCustomerPortalSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useCustomerPortalSettings')>();
  return {
    ...actual,
    useCustomerPortalSettings: () => ({
      settings: loadedSettings,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      saveSettings,
      isSaving: false,
    }),
  };
});

// O componente passou a consultar o módulo PDV (gate do "Atende como"). Este
// teste é sobre o Portal, então fixa "sem PDV": é o formulário que ele sempre
// testou. Sem este mock o hook real chama `useAuth` e o render estoura com
// "useAuth must be used within an AuthProvider".
vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasModule: (code: string) => code !== 'pdv' }),
}));

vi.mock('@/hooks/useCustomers', () => ({
  useCustomers: () => ({
    createCustomer: {
      mutateAsync: createCustomer,
      isPending: false,
    },
  }),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    isAdminOrGestor: () => true,
    hasPermission: () => true,
  }),
}));

vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => false,
  useIsCompact: () => false,
  useMediaBreakpoint: () => false,
}));
vi.mock('@/components/customers/CustomerOriginManagerDialog', () => ({
  CustomerOriginManagerDialog: () => null,
}));
vi.mock('@/components/customers/LeadCaptureManagerDialog', () => ({
  LeadCaptureManagerDialog: () => null,
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/useFormDraft', () => ({
  useFormDraft: () => ({
    hasDraft: false,
    draftData: null,
    saveDraft: vi.fn(),
    flush: vi.fn(),
    clearDraft: vi.fn(),
    acceptDraft: vi.fn(),
    discardDraft: vi.fn(),
    showResumePrompt: false,
  }),
}));
vi.mock('@/utils/geolocation', () => ({
  buildCustomerAddress: () => '',
  geocodeAddress: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/customers/OriginSelectField', () => ({
  OriginSelectField: () => null,
}));
vi.mock('@/components/CepLookup', () => ({ CepLookup: () => null }));
vi.mock('@/components/StateCitySelector', () => ({ StateCitySelector: () => null }));
vi.mock('@/components/AddressAutocomplete', () => ({ AddressAutocomplete: () => null }));
vi.mock('@/components/customers/CnpjDocumentInput', () => ({ CnpjDocumentInput: () => null }));
vi.mock('@/components/ui/DatePicker', () => ({ DatePicker: () => null }));
vi.mock('@/components/ui/DraftResumeDialog', () => ({ DraftResumeDialog: () => null }));

function submitForm() {
  const form = document.querySelector<HTMLFormElement>('#customer-form');
  if (!form) throw new Error('customer-form não encontrado');
  fireEvent.submit(form);
}

function fillCustomerName(name = 'Cliente de teste') {
  fireEvent.change(screen.getByRole('textbox', { name: /nome/i }), {
    target: { value: name },
  });
}

function fillMobileDigitByDigit(digits: string) {
  const input = screen.getByRole('textbox', { name: /celular/i });
  for (let index = 1; index <= digits.length; index += 1) {
    fireEvent.change(input, { target: { value: digits.slice(0, index) } });
  }
  return input;
}

describe('CustomerFormDialog — integração do Portal', () => {
  beforeEach(() => {
    loadedSettings = null;
    saveSettings.mockReset();
    toast.mockReset();
    createCustomer.mockReset();
  });

  it('recebe do wrapper desktop o ID criado e salva as configurações do portal', async () => {
    createCustomer.mockResolvedValue({ id: 'customer-created-on-desktop' });
    saveSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, token: 'portal-token' });

    render(
      <CustomersPageChrome activeTab="clientes" onTabChange={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /novo cliente/i }));
    fillCustomerName('Cliente criado no desktop');
    submitForm();

    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetCustomerId: 'customer-created-on-desktop',
    })));
    expect(createCustomer).toHaveBeenCalledTimes(1);
  });

  it('não duplica o cliente quando salvar o portal falha e o usuário tenta novamente', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 'customer-created' });
    const onOpenChange = vi.fn();
    saveSettings
      .mockRejectedValueOnce(new Error('falha no portal'))
      .mockResolvedValueOnce({ ...DEFAULT_SETTINGS, token: 'portal-token' });

    render(
      <CustomerFormDialog
        open
        onOpenChange={onOpenChange}
        onSubmit={onSubmit}
      />,
    );

    fillCustomerName();
    submitForm();

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    submitForm();

    await waitFor(() => expect(saveSettings).toHaveBeenCalledTimes(2));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('preserva o opt-in de WhatsApp ao digitar o celular e respeita o opt-out manual', () => {
    render(
      <CustomerFormDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    const mobileInput = fillMobileDigitByDigit('11933334444');
    const optIn = screen.getByRole('switch', { name: 'Receber mensagens pelo WhatsApp' });

    expect(optIn).not.toBeDisabled();
    expect(optIn).toHaveAttribute('data-state', 'checked');

    fireEvent.click(optIn);
    expect(optIn).toHaveAttribute('data-state', 'unchecked');

    fireEvent.change(mobileInput, { target: { value: '' } });
    fillMobileDigitByDigit('11988887777');

    expect(optIn).not.toBeDisabled();
    expect(optIn).toHaveAttribute('data-state', 'unchecked');
  });

  it('força o opt-in para false no payload quando o celular continua inválido', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 'customer-with-invalid-mobile' });
    saveSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, token: 'portal-token' });

    render(
      <CustomerFormDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );

    fillCustomerName();
    fillMobileDigitByDigit('1199');
    submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
      whatsapp_notifications_enabled: false,
    }));
  });

  it('bloqueia cliente novo protegido até receber senha válida e confirmação', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ id: 'customer-created' });
    saveSettings.mockResolvedValue({
      ...DEFAULT_SETTINGS,
      token: 'portal-token',
      passwordEnabled: true,
      passwordConfigured: true,
    });

    render(
      <CustomerFormDialog open onOpenChange={vi.fn()} onSubmit={onSubmit} />,
    );

    fillCustomerName();
    fireEvent.mouseDown(screen.getByRole('tab', { name: /portal/i }), { button: 0 });
    fireEvent.click(await screen.findByRole('switch', { name: 'Exigir senha para entrar' }));
    submitForm();

    await waitFor(() => expect(toast).toHaveBeenCalled());
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'senha-segura' } });
    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'senha-diferente' } });
    submitForm();
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(2));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Confirmar senha'), { target: { value: 'senha-segura' } });
    submitForm();

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetCustomerId: 'customer-created',
      password: 'senha-segura',
    }));
  });

  it('mantém a senha atual ao editar sem preencher uma nova', async () => {
    loadedSettings = {
      ...DEFAULT_SETTINGS,
      token: 'portal-token',
      passwordEnabled: true,
      passwordConfigured: true,
    };
    const customer = {
      id: 'customer-existing',
      name: 'Cliente existente',
      customer_type: 'pj',
    } as Customer;
    const onSubmit = vi.fn().mockResolvedValue(customer);
    saveSettings.mockResolvedValue(loadedSettings);

    render(
      <CustomerFormDialog
        open
        onOpenChange={vi.fn()}
        customer={customer}
        onSubmit={onSubmit}
      />,
    );

    submitForm();

    await waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({
      targetCustomerId: 'customer-existing',
      password: null,
    }));
  });
});
