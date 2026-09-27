import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantSubscriptionCheckoutPayload } from '@/hooks/useTenantSubscriptionCheckout';

const { toast, writeText } = vi.hoisted(() => ({ toast: vi.fn(), writeText: vi.fn() }));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/BrandedQRCode', () => ({
  BrandedQRCode: ({ value }: { value: string }) => <div data-testid="qr">{value}</div>,
}));

import {
  PublicSubscriptionCheckoutContent,
  resolvePublicSubscriptionView,
} from './PublicSubscriptionCheckout';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makePayload(
  kind: 'pix_auto' | 'asaas' = 'pix_auto',
  status = 'pending',
): TenantSubscriptionCheckoutPayload {
  return {
    checkout: {
      kind,
      status,
      expires_at: null,
      checkout_url: kind === 'asaas' ? 'https://www.asaas.com/c/abc' : null,
      qr_code: kind === 'pix_auto' ? 'base64' : null,
      copy_paste: kind === 'pix_auto' ? '000201010212' : null,
    },
    subscription: {
      description: 'Plano de manutenção',
      value: 120,
      cycle: 'MONTHLY',
      next_due_date: '2030-02-25',
      billing_type: kind === 'pix_auto' ? 'PIX_AUTO' : 'CREDIT_CARD',
    },
    merchant: { name: 'Clima Sul', logo_url: null },
    customer: { first_name: 'Ana' },
  };
}

let container: HTMLDivElement;
let root: Root;

function mount(payload: TenantSubscriptionCheckoutPayload | null, isLoading = false, isError = false) {
  act(() => {
    root.render(
      <PublicSubscriptionCheckoutContent
        payload={payload}
        isLoading={isLoading}
        isError={isError}
        onRetry={vi.fn()}
      />,
    );
  });
}

const text = () => document.body.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = '';
});

describe('PublicSubscriptionCheckout', () => {
  it('mostra resumo allowlisted e instruções do Pix Automático pendente', () => {
    mount(makePayload());
    expect(text()).toContain('Clima Sul');
    expect(text()).toContain('Olá, Ana');
    expect(text()).toContain('R$ 120,00');
    expect(text()).toContain('Mensal');
    expect(text()).toContain('Autorize no app do seu banco');
    expect(document.querySelector('[data-testid="qr"]')?.textContent).toBe('000201010212');
  });

  it('copia o código Pix pelo botão', async () => {
    mount(makePayload());
    const button = Array.from(document.querySelectorAll('button')).find((item) => item.textContent?.includes('Copiar código Pix'));
    await act(async () => { button?.click(); });
    expect(writeText).toHaveBeenCalledWith('000201010212');
    expect(text()).toContain('Código copiado');
  });

  it.each([
    ['authorized', 'Pix Automático autorizado'],
    ['cancelled', 'Autorização cancelada'],
    ['expired', 'Link expirado'],
  ])('exibe o estado terminal %s sem QR', (status, title) => {
    mount(makePayload('pix_auto', status));
    expect(text()).toContain(title);
    expect(document.querySelector('[data-testid="qr"]')).toBeNull();
  });

  it('no ramo Asaas abre somente o checkout externo, sem formulário de cartão', () => {
    const payload = makePayload('asaas');
    mount(payload);
    expect(resolvePublicSubscriptionView(payload)).toBe('external_asaas');
    const link = document.querySelector('a') as HTMLAnchorElement;
    expect(link.href).toBe('https://www.asaas.com/c/abc');
    expect(text()).toContain('Continuar na Asaas');
    expect(text()).not.toContain('Número do cartão');
  });

  it('diferencia carregamento de link inválido', () => {
    mount(null, true, false);
    expect(text()).toContain('Carregando sua assinatura');

    mount(null, false, true);
    expect(text()).toContain('Link indisponível');
  });
});
