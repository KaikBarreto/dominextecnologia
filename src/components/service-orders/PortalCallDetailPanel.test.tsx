import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PortalCall } from '@/lib/portalCalls';
import { PortalCallDetailPanel } from './PortalCallDetailPanel';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({
    locale: 'pt-br',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    countryCode: 'BR',
    isLoading: false,
    setUserLanguage: vi.fn(),
  }),
}));

const baseCall: PortalCall = {
  id: '11111111-1111-4111-8111-111111111111',
  company_id: '22222222-2222-4222-8222-222222222222',
  customer_id: '33333333-3333-4333-8333-333333333333',
  equipment_id: null,
  contract_id: null,
  description: 'Ar-condicionado parou de resfriar na recepção.',
  source: 'customer',
  status: 'aguardando_analise',
  service_order_id: null,
  protocol_number: 42,
  created_at: '2026-11-13T12:00:00.000Z',
  updated_at: '2026-11-13T12:00:00.000Z',
  resolved_at: null,
  resolved_by: null,
  customer: {
    id: '33333333-3333-4333-8333-333333333333',
    name: 'Cliente de teste',
    phone: '62999999999',
    celular: null,
  },
};

function renderDetail(call: PortalCall, overrides: Partial<React.ComponentProps<typeof PortalCallDetailPanel>> = {}) {
  const props: React.ComponentProps<typeof PortalCallDetailPanel> = {
    call,
    canManage: true,
    isConverting: false,
    isClosing: false,
    onBack: vi.fn(),
    onConvert: vi.fn().mockResolvedValue(undefined),
    onCloseWithoutOs: vi.fn().mockResolvedValue(undefined),
    onOpenServiceOrder: vi.fn(),
    ...overrides,
  };
  render(<PortalCallDetailPanel {...props} />);
  return props;
}

describe('PortalCallDetailPanel', () => {
  it('explica a triagem e só cria a OS após confirmação explícita', async () => {
    const props = renderDetail(baseCall);

    expect(screen.getByText('Protocolo CH-42')).toBeInTheDocument();
    expect(screen.getByText(baseCall.description)).toBeInTheDocument();
    expect(screen.queryByText('Preencher OS')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar OS a partir do chamado' }));
    expect(screen.getByText('Criar uma OS para este chamado?')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Criar OS' }));
    await waitFor(() => expect(props.onConvert).toHaveBeenCalledWith(baseCall.id));
  });

  it('mostra a OS somente depois da conversão e oferece o vínculo', () => {
    const onOpenServiceOrder = vi.fn();
    const converted: PortalCall = {
      ...baseCall,
      status: 'convertido',
      service_order_id: '44444444-4444-4444-8444-444444444444',
      resolved_at: '2026-11-13T12:05:00.000Z',
      service_order: {
        id: '44444444-4444-4444-8444-444444444444',
        order_number: 1372,
        status: 'pendente',
        scheduled_date: null,
      },
    };
    renderDetail(converted, { onOpenServiceOrder });

    expect(screen.getByText('OS #1372. Defina equipe e agenda na ordem de serviço.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Abrir OS' }));
    expect(onOpenServiceOrder).toHaveBeenCalledWith(converted.service_order_id);
  });
});
