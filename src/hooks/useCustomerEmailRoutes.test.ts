import { describe, expect, it } from 'vitest';
import {
  customerEmailRecipientEvents,
  customerEmailRouteSelection,
  isCustomerEmailValid,
  type CustomerEmailRoute,
} from './useCustomerEmailRoutes';

function route(enabled: boolean): CustomerEmailRoute {
  return {
    id: 'route-1',
    company_id: 'company-1',
    customer_id: 'customer-1',
    enabled,
    created_by: 'user-1',
    created_at: '2026-11-23T00:00:00Z',
    updated_at: '2026-11-23T00:00:00Z',
    recipients: enabled ? [{
      id: 'recipient-1',
      route_id: 'route-1',
      recipient_kind: 'customer_contact',
      customer_contact_id: 'contact-1',
      charge_created_enabled: true,
      due_reminder_enabled: false,
      charge_overdue_enabled: true,
      charge_paid_enabled: false,
      charge_refunded_enabled: false,
      created_at: '2026-11-23T00:00:00Z',
    }] : [],
  };
}

describe('roteamento de e-mails de cobrança por cliente', () => {
  it('usa o e-mail principal com todos os eventos somente sem rota explícita', () => {
    expect(customerEmailRouteSelection(undefined)).toEqual({
      explicit: false,
      enabled: true,
      recipients: [{
        kind: 'customer_primary',
        contactId: null,
        events: [
          'charge_created',
          'charge_due_reminder',
          'charge_overdue',
          'charge_paid',
          'charge_refunded',
        ],
      }],
    });
  });

  it('falha fechado quando a rota explícita está desativada', () => {
    expect(customerEmailRouteSelection(route(false))).toEqual({
      explicit: true,
      enabled: false,
      recipients: [],
    });
  });

  it('preserva os eventos escolhidos individualmente por destinatário', () => {
    const explicit = route(true);
    expect(customerEmailRecipientEvents(explicit.recipients[0])).toEqual([
      'charge_created',
      'charge_overdue',
    ]);
    expect(customerEmailRouteSelection(explicit).recipients).toEqual([{
      kind: 'customer_contact',
      contactId: 'contact-1',
      events: ['charge_created', 'charge_overdue'],
    }]);
  });

  it('valida e normaliza a aceitação de endereços sem aceitar formatos incompletos', () => {
    expect(isCustomerEmailValid(' financeiro@empresa.com.br ')).toBe(true);
    expect(isCustomerEmailValid('financeiro@empresa')).toBe(false);
    expect(isCustomerEmailValid('financeiro empresa.com.br')).toBe(false);
    expect(isCustomerEmailValid(null)).toBe(false);
  });
});
