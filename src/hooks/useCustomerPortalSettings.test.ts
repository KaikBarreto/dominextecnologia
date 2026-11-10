import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOMER_PORTAL_PERMISSIONS,
  DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS,
  parsePortalSettings,
} from './useCustomerPortalSettings';

describe('parsePortalSettings', () => {
  it('mantém legado habilitado, mas nasce fechado para fiscal e documentos', () => {
    expect(parsePortalSettings({
      token: 'portal-token',
      is_active: true,
      password_enabled: false,
      password_configured: false,
    })).toEqual({
      token: 'portal-token',
      isActive: true,
      passwordEnabled: false,
      passwordConfigured: false,
      permissions: DEFAULT_CUSTOMER_PORTAL_PERMISSIONS,
      publicSections: DEFAULT_CUSTOMER_PORTAL_PUBLIC_SECTIONS,
    });
  });

  it('preserva as seções explicitamente bloqueadas pelo servidor', () => {
    const parsed = parsePortalSettings({
      token: 'portal-token',
      is_active: true,
      password_enabled: true,
      password_configured: true,
      permissions: {
        service_orders: false,
        equipment: false,
        contracts: true,
        charges: false,
        invoices: true,
        documents: false,
        ticket_requests: false,
      },
      public_sections: {
        service_orders: true,
        equipment: false,
        contracts: true,
        charges: false,
        invoices: true,
        documents: false,
        ticket_requests: false,
      },
    });

    expect(parsed?.passwordEnabled).toBe(true);
    expect(parsed?.permissions).toEqual({
      service_orders: false,
      equipment: false,
      contracts: true,
      charges: false,
      invoices: true,
      documents: false,
      ticket_requests: false,
    });
    expect(parsed?.publicSections).toEqual({
      service_orders: true,
      equipment: false,
      contracts: true,
      charges: false,
      invoices: true,
      documents: false,
      ticket_requests: false,
    });
  });

  it('rejeita payload ausente ou inválido', () => {
    expect(parsePortalSettings(null)).toBeNull();
    expect(parsePortalSettings('invalid')).toBeNull();
  });
});
