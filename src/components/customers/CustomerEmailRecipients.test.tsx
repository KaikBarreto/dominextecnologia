import { act } from 'react';
import type { ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerEmailRecipients } from './CustomerEmailRecipients';
import {
  CUSTOMER_EMAIL_EVENTS,
  type CustomerEmailRoute,
} from '@/hooks/useCustomerEmailRoutes';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contacts = [
  { id: 'financeiro', customer_id: 'customer-1', name: 'Financeiro', phone: null, email: 'financeiro@cliente.com.br', position: 'Contas a pagar', birth_date: null, notes: null, created_at: '', updated_at: '' },
  { id: 'invalido', customer_id: 'customer-1', name: 'Sem e-mail', phone: null, email: null, position: null, birth_date: null, notes: null, created_at: '', updated_at: '' },
];

function explicitRoute(): CustomerEmailRoute {
  return {
    id: 'route-1',
    company_id: 'company-1',
    customer_id: 'customer-1',
    enabled: true,
    created_by: 'user-1',
    created_at: '',
    updated_at: '',
    recipients: [{
      id: 'recipient-1',
      route_id: 'route-1',
      recipient_kind: 'customer_contact',
      customer_contact_id: 'financeiro',
      charge_created_enabled: true,
      due_reminder_enabled: true,
      charge_overdue_enabled: true,
      charge_paid_enabled: true,
      charge_refunded_enabled: true,
      created_at: '',
    }],
  };
}

describe('CustomerEmailRecipients', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  function render(overrides: Partial<ComponentProps<typeof CustomerEmailRecipients>> = {}) {
    act(() => {
      root.render(
        <CustomerEmailRecipients
          customerId="customer-1"
          primaryName="Condomínio Horizonte"
          primaryEmail="sindico@cliente.com.br"
          contacts={contacts}
          route={undefined}
          isLoading={false}
          isError={false}
          isSaving={false}
          channelEnabled
          globallyEnabledEvents={CUSTOMER_EMAIL_EVENTS}
          canEdit
          onRetry={() => {}}
          onSave={vi.fn()}
          {...overrides}
        />,
      );
    });
  }

  it('explica o fallback principal e bloqueia contato sem e-mail válido', () => {
    render();

    expect(container.textContent).toContain('Padrão atual: o e-mail principal recebe');
    expect(container.querySelector('[aria-label="E-mail: Sem e-mail"]')).toHaveProperty('disabled', true);
    expect(container.querySelector('[aria-label="E-mail: Condomínio Horizonte"]')).toHaveAttribute('data-state', 'checked');
  });

  it('permite remover um evento de apenas um destinatário', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render({ route: explicitRoute(), onSave });

    const paid = container.querySelector('[aria-label="Financeiro: Pagamento confirmado"]')!;
    act(() => paid.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    const save = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Salvar destinatários'))!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({
      enabled: true,
      recipients: [{
        kind: 'customer_contact',
        contactId: 'financeiro',
        events: [
          'charge_created',
          'charge_due_reminder',
          'charge_overdue',
          'charge_refunded',
        ],
      }],
    });
  });

  it('avisa quando o canal global está desligado', () => {
    render({ channelEnabled: false });
    expect(container.textContent).toContain('O canal de e-mail está desativado em Integrações');
  });

  it('não presume o destinatário principal quando a leitura falha', () => {
    render({ isError: true });
    expect(container.textContent).toContain('Nenhuma configuração foi presumida por segurança');
    expect(container.textContent).not.toContain('Padrão atual: o e-mail principal recebe');
  });
});
