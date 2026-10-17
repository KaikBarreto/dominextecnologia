import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicApiManagementData } from '@/hooks/usePublicApiManagement';
import { SettingsPublicApiContent } from './SettingsPublicApiContent';

const toast = vi.fn();
const createKey = vi.fn();

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let managementMock: ReturnType<typeof baseManagement>;

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/hooks/useCompanySettings', () => ({
  useCompanySettings: () => ({ settings: { timezone: 'America/Sao_Paulo' } }),
}));
vi.mock('@/hooks/usePublicApiManagement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/usePublicApiManagement')>();
  return {
    ...actual,
    usePublicApiManagement: () => managementMock,
  };
});

function mutation(mutateAsync = vi.fn()) {
  return { mutateAsync, isPending: false, reset: vi.fn() };
}

function baseManagement() {
  const data: PublicApiManagementData = {
    integrations: [{
      id: 'integration-1',
      name: 'Agendamento do site',
      scopes: ['availability:read'],
      distribution_mode: 'unassigned',
      ip_allowlist: [],
      status: 'active',
      resources: [],
      created_at: '2026-10-16T12:00:00Z',
      updated_at: '2026-10-16T12:00:00Z',
      keys: [],
    }],
    booking_settings: null,
    booking_exceptions: [],
    resources: { users: [], teams: [] },
    activity: [],
  };
  return {
    canManage: true,
    data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
    createIntegration: mutation(),
    updateIntegration: mutation(),
    createKey: mutation(createKey),
    rotateKey: mutation(),
    revokeKey: mutation(),
    saveBookingSettings: mutation(),
    saveBookingExceptions: mutation(),
  };
}

describe('SettingsPublicApiContent', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    managementMock = baseManagement();
    createKey.mockReset();
    toast.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('mostra estado restrito sem carregar metadados de chave', () => {
    managementMock = { ...baseManagement(), canManage: false, data: undefined };
    act(() => root.render(<SettingsPublicApiContent />));
    expect(container.textContent).toContain('Gestão de API restrita');
    expect(container.textContent).not.toContain('Agendamento do site');
  });

  it('exibe o segredo retornado pela criação somente no modal de entrega única', async () => {
    createKey.mockResolvedValue({
      api_key: 'dmx_live_seguro_apenas_uma_vez',
      key: { id: 'key-1' },
    });
    act(() => root.render(<SettingsPublicApiContent />));

    const openButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Gerar chave'));
    act(() => openButton?.click());

    const keyDialog = document.body.querySelector('[role="dialog"]');
    const confirmButton = [...(keyDialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.trim() === 'Gerar chave');
    await act(async () => { confirmButton?.click(); });

    expect(createKey).toHaveBeenCalledWith({ integrationId: 'integration-1', name: undefined });
    expect(document.body.querySelector('[data-testid="one-time-api-key"]')?.textContent)
      .toBe('dmx_live_seguro_apenas_uma_vez');
    expect(container.textContent).not.toContain('dmx_live_seguro_apenas_uma_vez');
  });

  it('diferencia os alertas de vencimento em 30, 7 e 1 dia', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-16T12:00:00Z'));
    const integration = managementMock.data.integrations[0];
    managementMock.data.integrations[0] = {
      ...integration,
      keys: [
        ['key-30', 'public30', '0030', '2026-11-15T12:00:00Z'],
        ['key-7', 'public07', '0007', '2026-10-23T12:00:00Z'],
        ['key-1', 'public01', '0001', '2026-10-17T12:00:00Z'],
      ].map(([id, publicId, lastFour, expiresAt]) => ({
        id,
        integration_id: integration.id,
        name: null,
        public_id: publicId,
        secret_last_four: lastFour,
        created_at: '2026-09-01T12:00:00Z',
        valid_from: '2026-09-01T12:00:00Z',
        expires_at: expiresAt,
        last_used_at: null,
        revoked_at: null,
        rotated_from_key_id: null,
      })),
    };

    act(() => root.render(<SettingsPublicApiContent />));

    expect(container.textContent).toContain('Expira em até 30 dias');
    expect(container.textContent).toContain('Expira em até 7 dias');
    expect(container.textContent).toContain('Expira em até 1 dia');
  });

  it('identifica integração inativa e impede gerar chave pela interface', () => {
    managementMock.data.integrations[0] = {
      ...managementMock.data.integrations[0],
      status: 'inactive',
    };

    act(() => root.render(<SettingsPublicApiContent />));

    expect(container.textContent).toContain('Inativa');
    const generateButton = [...container.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('Gerar chave'));
    expect(generateButton?.disabled).toBe(true);
  });
});
