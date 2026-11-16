import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const test = vi.hoisted(() => ({
  company: {} as Record<string, unknown>, plans: [] as Record<string, unknown>[], manager: true,
  navigate: vi.fn(), mutateAsync: vi.fn(), coreFilters: [] as string[],
}));
vi.mock('react-router-dom', () => ({ useNavigate: () => test.navigate, useSearchParams: () => [new URLSearchParams('nucleo=services')] }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'fictitious-user' },
  profile: { company_id: 'fictitious-company', is_active: true }, isAdminOrGestor: () => test.manager, hasRole: () => false }) }));
vi.mock('@/hooks/useWhiteLabel', () => ({ useWhiteLabel: () => ({ enabled: false, isLoading: false }) }));
vi.mock('@/hooks/useIsDark', () => ({ useIsDark: () => false }));
vi.mock('@/hooks/usePlanChange', () => ({ usePlanChange: () => ({ mutateAsync: test.mutateAsync, isPending: false }) }));
vi.mock('@/hooks/useSubscriptionUpgradeCheckout', () => ({ useSubscriptionUpgradeCheckout: () => ({ isLoading: false, isError: false }) }));
vi.mock('@/hooks/useAsaasPayment', () => ({ useAsaasPayment: () => ({ stopPolling: () => {} }) }));
vi.mock('@/components/checkout/CheckoutLayout', () => ({ CheckoutLayout: () => <div>Pagamento preparado</div> }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  auth: { getUser: async () => ({ data: { user: { id: 'fictitious-user' } } }) },
  from: (table: string) => {
    const builder = {
      select: () => builder, eq: () => builder,
      or: (filter: string) => { test.coreFilters.push(filter); return builder; },
      order: async () => ({ data: test.plans, error: null }),
      single: async () => ({ data: table === 'profiles' ? { company_id: 'fictitious-company' } : test.company, error: null }),
    };
    return builder;
  },
} }));
import Checkout from './Checkout';

function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><Checkout /></QueryClientProvider>);
}
beforeEach(() => {
  test.company = { id: 'fictitious-company', business_core: 'retail', business_core_version: 2,
    subscription_plan: 'retail_start', subscription_status: 'testing', trial_days: 7, subscription_value: 0, ltv: 0 };
  test.plans = [];
  test.manager = true;
  test.coreFilters.length = 0;
  test.navigate.mockReset();
  test.mutateAsync.mockReset().mockResolvedValue({ requires_payment: true, checkout_url: '/checkout?mode=upgrade&change=fictitious-quote' });
});
describe('primeira contratação no checkout', () => {
  it('mostra indisponibilidade explícita quando os preços da Loja não foram configurados', async () => {
    open();
    expect(await screen.findByText('Contratação indisponível por enquanto')).toBeInTheDocument();
    expect(screen.getByText(/Os preços da Loja ainda estão sendo configurados/)).toBeInTheDocument();
    expect(screen.queryByText(/R\$ 0/)).not.toBeInTheDocument();
    expect(test.coreFilters).toContain('business_core.eq.retail,code.eq.personalizado');
  });
  it('personalizado sem cotação encaminha o administrador à montagem canônica', async () => {
    test.company.subscription_plan = 'personalizado';
    test.plans = [{ code: 'personalizado', price: 0, business_core: 'services' }];
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Montar meu plano' }));
    expect(test.navigate).toHaveBeenCalledWith('/assinatura?configurar=1');
    expect(test.mutateAsync).not.toHaveBeenCalled();
  });
  it('usuário sem gestão recebe orientação para o administrador', async () => {
    test.manager = false;
    open();
    expect(await screen.findByText(/Peça a um administrador/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Montar meu plano' })).not.toBeInTheDocument();
  });
  it.each([0, 123])('preset inicial com base %s solicita cotação do servidor e abre seu pagamento', async subscriptionValue => {
    test.company.subscription_value = subscriptionValue;
    test.plans = [{ id: 'fictitious-plan', code: 'retail_start', name: 'Loja · Inicial', price: 123,
      business_core: 'retail', max_users: 3, is_active: true }];
    open();
    fireEvent.click(await screen.findByText('Loja · Inicial'));
    fireEvent.click(screen.getByRole('button', { name: /Assinar por R\$ 123/ }));
    await waitFor(() => expect(test.mutateAsync).toHaveBeenCalledWith({
      companyId: 'fictitious-company', planCode: 'retail_start', billingCycle: 'monthly', confirm: true,
    }));
    expect(test.navigate).toHaveBeenCalledWith('/checkout?mode=upgrade&change=fictitious-quote');
  });
});
