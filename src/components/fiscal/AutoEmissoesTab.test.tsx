import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ContractNfseAutoReadiness } from '@/lib/nfse-auto-readiness';
import { AutoEmissoesTab } from './AutoEmissoesTab';

const navigateMock = vi.fn();
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let readinessMock: ContractNfseAutoReadiness[] = [{
  contract: { id: 'contract-1', name: 'Contrato de comodato e licença de software com nome grande' },
  state: 'missing_source' as const,
  source: null,
  nextDate: null,
  amount: null,
  subscriptionStatus: null,
}];

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    currency: 'BRL',
    timezone: 'America/Sao_Paulo',
  }),
}));

vi.mock('@/hooks/useNfseAutoJobs', () => ({
  useNfseAutoJobs: () => ({
    jobs: [],
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
    retry: vi.fn(),
    isRetrying: false,
  }),
  useNfseAutoReadiness: () => ({
    readiness: readinessMock,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  nfseAutoRetryErrorMessage: (_error: unknown, fallback: string) => fallback,
}));

vi.mock('@/hooks/useNfseEmission', () => ({
  useNfseEmission: () => ({ emission: null }),
}));

describe('AutoEmissoesTab — prontidão antes de existir job', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    navigateMock.mockClear();
    readinessMock = [{
      contract: { id: 'contract-1', name: 'Contrato de comodato e licença de software com nome grande' },
      state: 'missing_source',
      source: null,
      nextDate: null,
      amount: null,
      subscriptionStatus: null,
    }];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('mantém o aviso de fonte ausente visível e abre o contrato afetado', async () => {
    await act(async () => root.render(<AutoEmissoesTab />));

    expect(container.textContent).toContain('Falta definir a origem do valor em 1 contrato');
    expect(container.textContent).toContain('Contrato de comodato e licença de software com nome grande');
    expect(container.textContent).toContain('falta definir de onde virá o valor da nota');

    const warning = container.querySelector('button');
    expect(warning).not.toBeNull();
    await act(async () => warning?.dispatchEvent(new MouseEvent('click', { bubbles: true })));

    expect(navigateMock).toHaveBeenCalledWith('/contratos/contract-1');
  });

  it('não oferece criar parcelas quando o próximo ciclo virá do Asaas', async () => {
    readinessMock = [{
      contract: { id: 'contract-1', name: 'Contrato Asaas' },
      state: 'waiting_asaas_cycle',
      source: 'asaas',
      nextDate: '2026-12-10',
      amount: 250,
      subscriptionStatus: 'active',
    }];

    await act(async () => root.render(<AutoEmissoesTab />));

    expect(container.textContent).toContain('Aguardando as próximas parcelas do Asaas');
    expect(container.textContent).toContain('Asaas criará e vinculará automaticamente');
    expect(container.textContent).not.toContain('Criar parcela');
  });
});
