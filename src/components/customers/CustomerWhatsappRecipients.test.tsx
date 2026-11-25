import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerWhatsappRecipients } from './CustomerWhatsappRecipients';
import type { CustomerWhatsappRoute } from '@/hooks/useCustomerWhatsappRoutes';

vi.mock('@/contexts/AppLocaleContext', () => ({
  useAppLocaleContext: () => ({ locale: 'pt-br', countryCode: 'BR' }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const contacts = [
  { id: 'portaria', customer_id: 'customer-1', name: 'Portaria', phone: '(21) 98888-0001', email: null, position: 'Porteiro', birth_date: null, notes: null, created_at: '', updated_at: '' },
  { id: 'sem-fone', customer_id: 'customer-1', name: 'Sem telefone', phone: null, email: null, position: null, birth_date: null, notes: null, created_at: '', updated_at: '' },
];

function disabledRoute(category: 'service_order' | 'billing'): CustomerWhatsappRoute {
  return {
    id: `route-${category}`,
    company_id: 'company-1',
    customer_id: 'customer-1',
    category,
    enabled: false,
    created_by: 'user-1',
    created_at: '',
    updated_at: '',
    recipients: [],
  };
}

describe('CustomerWhatsappRecipients', () => {
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

  it('mostra fallback legado, bloqueia telefone inválido e respeita leitura financeira', () => {
    act(() => {
      root.render(
        <CustomerWhatsappRecipients
          customerId="customer-1"
          primaryName="Condomínio Horizonte"
          primaryPhone="(21) 99999-0000"
          contacts={contacts}
          routes={[]}
          optedOutPhones={[]}
          isLoading={false}
          isError={false}
          isSaving={false}
          customerAutomationEnabled
          canEditOperational={false}
          canViewFinancial={false}
          canEditFinancial={false}
          onRetry={() => {}}
          onSave={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Padrão atual: o contato principal recebe');
    expect(container.textContent).toContain('Você pode consultar esta configuração');
    expect(container.textContent).not.toContain('Cobranças, vencimentos e links de pagamento');
    const invalidContact = container.querySelector('[aria-label="Ordens de serviço: Sem telefone"]');
    expect(invalidContact).toHaveProperty('disabled', true);
  });

  it('não presume o contato principal quando a leitura falha', () => {
    act(() => {
      root.render(
        <CustomerWhatsappRecipients
          customerId="customer-1"
          primaryName="Condomínio Horizonte"
          primaryPhone="(21) 99999-0000"
          contacts={contacts}
          routes={[]}
          optedOutPhones={[]}
          isLoading={false}
          isError
          isSaving={false}
          customerAutomationEnabled
          canEditOperational
          canViewFinancial
          canEditFinancial
          onRetry={() => {}}
          onSave={vi.fn()}
        />,
      );
    });

    expect(container.textContent).toContain('Nenhuma configuração foi presumida por segurança');
    expect(container.textContent).not.toContain('Padrão atual: o contato principal recebe');
  });

  it('salva contato principal e contato adicional escolhidos livremente', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    act(() => {
      root.render(
        <CustomerWhatsappRecipients
          customerId="customer-1"
          primaryName="Condomínio Horizonte"
          primaryPhone="(21) 99999-0000"
          contacts={contacts}
          routes={[]}
          optedOutPhones={[]}
          isLoading={false}
          isError={false}
          isSaving={false}
          customerAutomationEnabled
          canEditOperational
          canViewFinancial={false}
          canEditFinancial={false}
          onRetry={() => {}}
          onSave={onSave}
        />,
      );
    });

    const portaria = container.querySelector('[aria-label="Ordens de serviço: Portaria"]')!;
    act(() => portaria.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const save = Array.from(container.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Salvar destinatários'))!;
    await act(async () => {
      save.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith({
      category: 'service_order',
      enabled: true,
      includePrimary: true,
      contactIds: ['portaria'],
    });
  });

  it('reseta o editor ao trocar de cliente mesmo quando ambos não possuem rota em cache', () => {
    const render = (customerId: string, routes: CustomerWhatsappRoute[]) => {
      act(() => {
        root.render(
          <CustomerWhatsappRecipients
            customerId={customerId}
            primaryName="Condomínio Horizonte"
            primaryPhone="(21) 99999-0000"
            contacts={contacts}
            routes={routes}
            optedOutPhones={[]}
            isLoading={false}
            isError={false}
            isSaving={false}
            customerAutomationEnabled
            canEditOperational
            canViewFinancial={false}
            canEditFinancial={false}
            onRetry={() => {}}
            onSave={vi.fn()}
          />,
        );
      });
    };

    render('customer-1', [disabledRoute('service_order')]);
    expect(container.querySelector('[aria-label="Enviar mensagens: Ordens de serviço"]'))
      .toHaveAttribute('data-state', 'unchecked');

    render('customer-2', []);
    expect(container.querySelector('[aria-label="Enviar mensagens: Ordens de serviço"]'))
      .toHaveAttribute('data-state', 'checked');
  });

  it('bloqueia número com opt-out e telefone inválido antes de permitir salvar', () => {
    act(() => {
      root.render(
        <CustomerWhatsappRecipients
          customerId="customer-1"
          primaryName="Condomínio Horizonte"
          primaryPhone="1199"
          contacts={contacts}
          routes={[]}
          optedOutPhones={['5521988880001']}
          isLoading={false}
          isError={false}
          isSaving={false}
          customerAutomationEnabled
          canEditOperational
          canViewFinancial={false}
          canEditFinancial={false}
          onRetry={() => {}}
          onSave={vi.fn()}
        />,
      );
    });

    expect(container.querySelector('[aria-label="Contato principal: Condomínio Horizonte"]'))
      .toHaveProperty('disabled', true);
    expect(container.querySelector('[aria-label="Ordens de serviço: Portaria"]'))
      .toHaveProperty('disabled', true);
    expect(container.textContent).toContain('Selecione ao menos um destinatário');
  });
});
