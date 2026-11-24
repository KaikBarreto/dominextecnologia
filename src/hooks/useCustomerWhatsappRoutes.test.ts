import { describe, expect, it } from 'vitest';
import {
  customerWhatsappRouteSelection,
  isWhatsappPhoneOptedOut,
  isWhatsappRecipientPhoneValid,
  resolveCustomerWhatsappRecipients,
  type CustomerWhatsappRoute,
} from './useCustomerWhatsappRoutes';

function route(
  category: 'service_order' | 'billing',
  enabled: boolean,
  recipients: Array<{ kind: 'customer_primary' | 'customer_contact'; contactId?: string }>,
): CustomerWhatsappRoute {
  return {
    id: `route-${category}`,
    company_id: 'company-1',
    customer_id: 'customer-1',
    category,
    enabled,
    created_by: 'user-1',
    created_at: '2026-11-15T00:00:00Z',
    updated_at: '2026-11-15T00:00:00Z',
    recipients: recipients.map((recipient, index) => ({
      id: `recipient-${index}`,
      route_id: `route-${category}`,
      recipient_kind: recipient.kind,
      customer_contact_id: recipient.contactId ?? null,
      created_at: '2026-11-15T00:00:00Z',
    })),
  };
}

const primary = { name: 'Condomínio Horizonte', phone: '(21) 99999-0000' };
const contacts = [
  { id: 'portaria', name: 'Portaria', phone: '(21) 98888-0001' },
  { id: 'sindico', name: 'Síndico', phone: '(21) 97777-0002' },
  { id: 'administradora', name: 'Administradora', phone: '(21) 97777-0002' },
];

describe('roteamento de destinatários do WhatsApp', () => {
  it('mantém o contato principal como fallback apenas sem rota explícita', () => {
    expect(customerWhatsappRouteSelection(undefined)).toEqual({
      explicit: false,
      enabled: true,
      includePrimary: true,
      contactIds: [],
    });
    expect(resolveCustomerWhatsappRecipients(undefined, primary, contacts).recipients).toEqual([
      expect.objectContaining({ kind: 'customer_primary', name: 'Condomínio Horizonte' }),
    ]);
  });

  it('separa OS e financeiro por contatos escolhidos livremente', () => {
    const operational = resolveCustomerWhatsappRecipients(
      route('service_order', true, [{ kind: 'customer_contact', contactId: 'portaria' }]),
      primary,
      contacts,
    );
    const financial = resolveCustomerWhatsappRecipients(
      route('billing', true, [{ kind: 'customer_contact', contactId: 'sindico' }]),
      primary,
      contacts,
    );

    expect(operational.recipients.map((recipient) => recipient.contactId)).toEqual(['portaria']);
    expect(financial.recipients.map((recipient) => recipient.contactId)).toEqual(['sindico']);
  });

  it('permite vários selecionados e remove números repetidos', () => {
    const resolved = resolveCustomerWhatsappRecipients(
      route('billing', true, [
        { kind: 'customer_contact', contactId: 'sindico' },
        { kind: 'customer_contact', contactId: 'administradora' },
      ]),
      primary,
      contacts,
    );
    expect(resolved.recipients).toHaveLength(1);
    expect(resolved.recipients[0].contactId).toBe('sindico');
  });

  it('falha fechado em rota desativada e remove telefone com opt-out', () => {
    expect(resolveCustomerWhatsappRecipients(
      route('billing', false, []), primary, contacts,
    )).toEqual({ isExplicit: true, disabled: true, recipients: [] });

    const blocked = resolveCustomerWhatsappRecipients(
      route('billing', true, [{ kind: 'customer_contact', contactId: 'sindico' }]),
      primary,
      contacts,
      ['5521977770002'],
    );
    expect(blocked.recipients).toEqual([]);
  });

  it('falha fechado quando a rota explícita ficou vazia, o contato foi excluído ou o telefone ficou inválido', () => {
    expect(resolveCustomerWhatsappRecipients(
      route('billing', true, []), primary, contacts,
    ).recipients).toEqual([]);

    expect(resolveCustomerWhatsappRecipients(
      route('billing', true, [{ kind: 'customer_contact', contactId: 'excluido' }]),
      primary,
      contacts,
    ).recipients).toEqual([]);

    expect(resolveCustomerWhatsappRecipients(
      route('billing', true, [{ kind: 'customer_contact', contactId: 'invalido' }]),
      primary,
      [{ id: 'invalido', name: 'Inválido', phone: '1199' }],
    ).recipients).toEqual([]);
  });

  it('deduplica o mesmo telefone mesmo quando um cadastro já possui DDI', () => {
    const resolved = resolveCustomerWhatsappRecipients(
      route('billing', true, [
        { kind: 'customer_contact', contactId: 'local' },
        { kind: 'customer_contact', contactId: 'e164' },
      ]),
      primary,
      [
        { id: 'local', name: 'Local', phone: '(21) 98888-0001' },
        { id: 'e164', name: 'E.164', phone: '+55 21 98888-0001' },
      ],
    );
    expect(resolved.recipients).toHaveLength(1);
    expect(resolved.recipients[0].contactId).toBe('local');
  });

  it('valida e compara opt-out conforme o país da empresa', () => {
    expect(isWhatsappRecipientPhoneValid('912 345 678', 'PT')).toBe(true);
    expect(isWhatsappRecipientPhoneValid('912 345', 'PT')).toBe(false);
    expect(isWhatsappPhoneOptedOut('912 345 678', ['351912345678'], 'PT')).toBe(true);
    expect(isWhatsappPhoneOptedOut('912 345 679', ['351912345678'], 'PT')).toBe(false);

    const portuguese = resolveCustomerWhatsappRecipients(
      route('billing', true, [{ kind: 'customer_contact', contactId: 'pt' }]),
      { name: 'Condomínio Lisboa', phone: null },
      [{ id: 'pt', name: 'Administração', phone: '912 345 678' }],
      [],
      'PT',
    );
    expect(portuguese.recipients).toEqual([
      expect.objectContaining({ contactId: 'pt', phone: '912 345 678' }),
    ]);
  });
});
