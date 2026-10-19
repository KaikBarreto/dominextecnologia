// Prova de DOM real (não só raciocínio) de que o "Atende como" (Serviço/
// Loja, módulo PDV) respeita a lei da onda: sem o módulo `pdv`, o formulário
// fica IDÊNTICO ao de hoje — nem o checkbox aparece, nem a chave entra no
// payload de criação/edição. Com o módulo, o default contextual
// (`defaultCustomerKind`) decide o estado inicial dos dois checkboxes, e
// marcar os dois ao mesmo tempo é permitido (multi-seleção de verdade).
//
// Driver mínimo com createRoot + act, mesmo padrão de ContaFormDialog.test.tsx
// e CRM.test.tsx (o repo não usa @testing-library/react).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver || ResizeObserverStub;
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({ hasPdv: false }));

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
    isLoading: false,
    setUserLanguage: async () => {},
  }),
}));

vi.mock('@/hooks/useCompanyModules', () => ({
  useCompanyModules: () => ({ hasModule: (code: string) => (code === 'pdv' ? state.hasPdv : true) }),
}));

// Stand-ins leves — nada aqui importa pro teste do "Atende como".
vi.mock('@/components/customers/OriginSelectField', () => ({ OriginSelectField: () => null }));
vi.mock('@/components/CepLookup', () => ({ CepLookup: () => null }));
vi.mock('@/components/StateCitySelector', () => ({ StateCitySelector: () => null }));
vi.mock('@/components/AddressAutocomplete', () => ({ AddressAutocomplete: () => null }));
vi.mock('@/components/customers/CnpjDocumentInput', () => ({ CnpjDocumentInput: () => null }));

import { CustomerFormDialog } from './CustomerFormDialog';

let container: HTMLDivElement;
let root: Root;

function mount(props: Partial<React.ComponentProps<typeof CustomerFormDialog>> = {}) {
  const onSubmit = props.onSubmit ?? (async () => {});
  act(() => {
    root.render(
      <CustomerFormDialog
        open
        onOpenChange={() => {}}
        customer={null}
        onSubmit={onSubmit}
        {...props}
      />,
    );
  });
}

const q = (sel: string) => document.querySelector(sel) as HTMLElement | null;

function submitForm() {
  const btn = document.querySelector('button[type="submit"][form="customer-form"]') as HTMLButtonElement;
  act(() => btn.click());
}

function typeInto(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  state.hasPdv = false;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('CustomerFormDialog — "Atende como" (Serviço/Loja, módulo PDV)', () => {
  it('sem o módulo PDV, nenhum checkbox de tipo aparece (form idêntico ao de hoje)', () => {
    state.hasPdv = false;
    mount();
    expect(q('#customer-kind-service')).toBeNull();
    expect(q('#customer-kind-store')).toBeNull();
  });

  it('sem o módulo PDV, o payload de criação NÃO leva is_service_customer/is_store_customer', async () => {
    state.hasPdv = false;
    const onSubmit = vi.fn(async (_data?: unknown) => {});
    mount({ onSubmit });

    const nameInput = Array.from(document.querySelectorAll('input')).find(
      (el) => (el as HTMLInputElement).placeholder?.toLowerCase().includes('nome'),
    ) as HTMLInputElement;
    typeInto(nameInput, 'Cliente Teste');

    submitForm();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.prototype.hasOwnProperty.call(payload, 'is_service_customer')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(payload, 'is_store_customer')).toBe(false);
  });

  it('com o módulo PDV, os dois checkboxes aparecem e o default é Serviço (defaultCustomerKind="servico")', () => {
    state.hasPdv = true;
    mount({ defaultCustomerKind: 'servico' });
    const service = q('#customer-kind-service') as HTMLButtonElement;
    const store = q('#customer-kind-store') as HTMLButtonElement;
    expect(service).toBeTruthy();
    expect(store).toBeTruthy();
    expect(service.getAttribute('data-state')).toBe('checked');
    expect(store.getAttribute('data-state')).toBe('unchecked');
  });

  it('com o módulo PDV, defaultCustomerKind="loja" nasce só Loja marcada (quick-create do PDV)', () => {
    state.hasPdv = true;
    mount({ defaultCustomerKind: 'loja' });
    const service = q('#customer-kind-service') as HTMLButtonElement;
    const store = q('#customer-kind-store') as HTMLButtonElement;
    expect(service.getAttribute('data-state')).toBe('unchecked');
    expect(store.getAttribute('data-state')).toBe('checked');
  });

  it('com o módulo PDV, marcar os dois checkboxes é permitido (multi-seleção de verdade) e vai os dois no payload', async () => {
    state.hasPdv = true;
    const onSubmit = vi.fn(async (_data?: unknown) => {});
    mount({ onSubmit, defaultCustomerKind: 'servico' });

    const nameInput = Array.from(document.querySelectorAll('input')).find(
      (el) => (el as HTMLInputElement).placeholder?.toLowerCase().includes('nome'),
    ) as HTMLInputElement;
    typeInto(nameInput, 'Refrigeração e Loja Ltda');

    const store = q('#customer-kind-store') as HTMLButtonElement;
    act(() => store.click()); // marca Loja também — fica Serviço E Loja

    submitForm();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_service_customer).toBe(true);
    expect(payload.is_store_customer).toBe(true);
  });

  it('com o módulo PDV, salvar sem NENHUM dos dois marcado não é erro de validação', async () => {
    state.hasPdv = true;
    const onSubmit = vi.fn(async (_data?: unknown) => {});
    mount({ onSubmit, defaultCustomerKind: 'servico' });

    const nameInput = Array.from(document.querySelectorAll('input')).find(
      (el) => (el as HTMLInputElement).placeholder?.toLowerCase().includes('nome'),
    ) as HTMLInputElement;
    typeInto(nameInput, 'Cliente Sem Classificação');

    // Desmarca o default (Serviço) e não marca Loja — fica os dois "nenhum".
    const service = q('#customer-kind-service') as HTMLButtonElement;
    act(() => service.click());

    submitForm();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.is_service_customer).toBe(false);
    expect(payload.is_store_customer).toBe(false);
  });
});
