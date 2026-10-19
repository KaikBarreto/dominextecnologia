import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CUSTOMER_PORTAL_PERMISSIONS,
  parsePortalSettings,
} from './useCustomerPortalSettings';

describe('parsePortalSettings', () => {
  it('mantém todas as permissões habilitadas para portais legados', () => {
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
        ticket_requests: false,
      },
    });

    expect(parsed?.passwordEnabled).toBe(true);
    expect(parsed?.permissions).toEqual({
      service_orders: false,
      equipment: false,
      contracts: true,
      charges: false,
      ticket_requests: false,
    });
  });

  it('rejeita payload ausente ou inválido', () => {
    expect(parsePortalSettings(null)).toBeNull();
    expect(parsePortalSettings('invalid')).toBeNull();
  });
});
