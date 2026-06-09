import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import {
  getEffectiveSubscriptionValue,
  hasActiveCustomPrice,
  getNextSubscriptionValue,
} from '@/utils/subscriptionPricing';

export type ModuleCode =
  | 'basic'
  | 'rh'
  | 'crm'
  | 'nfe'
  | 'finance_advanced'
  | 'pricing_advanced'
  | 'customer_portal'
  | 'white_label'
  | 'extra_user';

/**
 * Mapeamento screen → module_code.
 *
 * As CHAVES são os `screenKey` reais usados no app (ver `screen:*` em
 * SidebarMenuContent e nas guards de rota). Porte do EcoSistema, mas ADAPTADO:
 * - No Dominex o gate de tela hoje é feito por `moduleKey` no menu (só `crm` e
 *   `rh` gateiam telas inteiras) + checagens inline de `hasModule(...)` dentro
 *   das páginas (pricing_advanced, customer_portal, white_label, finance_advanced).
 * - Telas não-mapeadas são liberadas por padrão (`hasScreen` retorna true),
 *   espelhando o comportamento do EcoSistema.
 *
 * Por isso só entram aqui as telas que correspondem a uma tela INTEIRA gateada
 * por um módulo. Sub-features inline (BDI/precificação, portal do cliente,
 * white-label, abas avançadas do financeiro) NÃO têm tela própria e continuam
 * sendo gateadas inline via `hasModule(...)`, igual ao white_label do EcoSistema.
 */
const SCREEN_TO_MODULE_MAP: Record<string, ModuleCode> = {
  // Módulo básico (kit base — incluso em todos os planos pagos)
  'screen:dashboard': 'basic',
  'screen:schedule': 'basic',
  'screen:service_orders': 'basic',
  'screen:quotes': 'basic',
  'screen:customers': 'basic',
  'screen:services': 'basic',
  'screen:equipment': 'basic',
  'screen:inventory': 'basic',
  'screen:contracts': 'basic',
  // Financeiro: a TELA é base; só as abas avançadas (DRE, contas a pagar/receber)
  // exigem finance_advanced e são gateadas inline dentro de Finance.tsx.
  'screen:finance': 'basic',
  // Funcionários / RH (tela inteira atrás do módulo rh — espelha moduleKey do menu)
  'screen:employees': 'rh',
  // CRM (tela inteira atrás do módulo crm — espelha moduleKey do menu)
  'screen:crm': 'crm',
};

interface CompanyModule {
  module_code: string;
  quantity: number;
  activated_at: string;
}

interface CompanyInfo {
  subscription_status: string | null;
  subscription_expires_at: string | null;
  subscription_plan: string | null;
  subscription_value: number | null;
  pending_subscription_value: number | null;
  max_users: number | null;
  extra_users: number | null;
  custom_price: number | null;
  custom_price_months: number | null;
  custom_price_payments_made: number | null;
  custom_price_permanent: boolean | null;
}

export interface SubscriptionPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  max_users: number;
  included_modules: ModuleCode[];
  is_active: boolean;
}

export function useCompanyModules() {
  const { profile, hasRole } = useAuth();
  const companyId = profile?.company_id;

  const { data: modules = [], isLoading: modulesLoading } = useQuery({
    queryKey: ['company-modules', companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from('company_modules')
        .select('module_code, quantity, activated_at')
        .eq('company_id', companyId);
      if (error) throw error;
      return (data || []) as CompanyModule[];
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Buscamos os dados de assinatura/precificação da empresa.
  // O subscription_status + subscription_expires_at servem para liberar TODOS
  // os módulos enquanto a empresa estiver em trial ativo (status === 'testing'
  // e (sem data de expiração OU ainda não expirou)). Após conversão/expiração,
  // o gating volta a usar company_modules + plano normalmente.
  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ['company-modules-info', companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from('companies')
        .select(
          'subscription_status, subscription_expires_at, subscription_plan, subscription_value, pending_subscription_value, max_users, extra_users, custom_price, custom_price_months, custom_price_payments_made, custom_price_permanent'
        )
        .eq('id', companyId)
        .maybeSingle();
      if (error) throw error;
      return (data as CompanyInfo | null) ?? null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Lista de planos ativos (start/avancado/master/personalizado).
  // Raramente muda — staleTime alto.
  const { data: allPlans = [] } = useQuery({
    queryKey: ['subscription-plans', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, code, name, description, price, max_users, included_modules, is_active')
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return (data || []).map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        description: p.description ?? null,
        price: Number(p.price) || 0,
        max_users: p.max_users ?? 0,
        included_modules: Array.isArray(p.included_modules)
          ? (p.included_modules as unknown[]).filter(
              (m): m is ModuleCode => typeof m === 'string'
            )
          : [],
        is_active: p.is_active ?? false,
      })) as SubscriptionPlan[];
    },
    staleTime: 30 * 60 * 1000,
  });

  // Contagem de usuários da empresa. No Dominex `profiles` não tem coluna de
  // "ativo" — cada profile da empresa conta como um usuário ocupado.
  const { data: currentUserCount = 0 } = useQuery({
    queryKey: ['company-user-count', companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count, error } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  const isTrialActive = (() => {
    if (!company) return false;
    if (company.subscription_status !== 'testing') return false;
    // null = trial sem data definida ⇒ tratamos como "não expirou" (libera).
    if (!company.subscription_expires_at) return true;
    return new Date(company.subscription_expires_at).getTime() > Date.now();
  })();

  // Plano atual da empresa (default 'start' quando ausente, igual EcoSistema).
  const plan = company?.subscription_plan || 'start';

  // Conjunto de módulos concedidos pelo PLANO atual (defense-in-depth: além de
  // company_modules, o plano também concede seus included_modules). Memoizado.
  const planModules = useMemo(() => {
    const set = new Set<ModuleCode>();
    const planDef = allPlans.find((p) => p.code === plan);
    planDef?.included_modules.forEach((m) => set.add(m));
    return set;
  }, [allPlans, plan]);

  const hasModule = (code: ModuleCode): boolean => {
    // Super admins sempre têm acesso a tudo.
    if (hasRole('super_admin')) return true;
    // Trial ativo libera qualquer módulo — benefício de teste, não promessa.
    // Quando o trial expira ou converte (status muda), cai no gate normal.
    if (isTrialActive) return true;
    // Concedido se contratado em company_modules OU incluso no plano atual.
    if (modules.some((m) => m.module_code === code)) return true;
    return planModules.has(code);
  };

  // Acesso por tela. Tela não-mapeada é liberada (default true), espelhando o
  // EcoSistema. Super_admin e trial caem no `hasModule` (que já libera tudo).
  const hasScreen = (screenId: string): boolean => {
    const moduleCode = SCREEN_TO_MODULE_MAP[screenId];
    if (!moduleCode) return true;
    return hasModule(moduleCode);
  };

  const moduleCodes = modules.map((m) => m.module_code);

  // --- Precificação / limites de usuário (espelha o EcoSistema) ---
  // Para o plano 'personalizado', companies.max_users JÁ é o total (não soma
  // extra_users por cima). Para os demais, max_users do plano é a base e
  // extra_users são adicionais. Quando não há plano carregado, usamos o que
  // estiver em companies.max_users como fallback.
  const planMaxUsers =
    allPlans.find((p) => p.code === plan)?.max_users ?? company?.max_users ?? 0;
  const extraUsers = company?.extra_users || 0;
  const maxUsers =
    plan === 'personalizado'
      ? company?.max_users || 0
      : planMaxUsers + extraUsers;
  const canAddUser = currentUserCount < maxUsers;

  // Valor efetivo cobrado hoje (usa custom_price se promoção ativa) e o
  // próximo valor agendado (pending). Reaproveita os helpers canônicos.
  const pricingFields = {
    subscription_value: company?.subscription_value,
    custom_price: company?.custom_price,
    custom_price_months: company?.custom_price_months,
    custom_price_payments_made: company?.custom_price_payments_made,
    pending_subscription_value: company?.pending_subscription_value,
  };
  const subscriptionValue = company?.subscription_value || 0;
  const customPrice = hasActiveCustomPrice(pricingFields)
    ? Number(company?.custom_price) || 0
    : null;
  const effectiveValue = getEffectiveSubscriptionValue(pricingFields);
  const pendingValue = getNextSubscriptionValue(pricingFields);

  return {
    // --- Chaves existentes (NÃO remover — consumidores atuais dependem) ---
    modules,
    moduleCodes,
    hasModule,
    isLoading: modulesLoading || companyLoading,

    // --- Plano / módulos ---
    plan,
    allPlans,
    isTrialActive,

    // --- Telas ---
    hasScreen,

    // --- Precificação ---
    subscriptionValue,
    customPrice,
    effectiveValue,
    pendingValue,

    // --- Usuários ---
    extraUsers,
    maxUsers,
    currentUserCount,
    canAddUser,
  };
}

// Exporta o mapa para uso em outros lugares (ex.: guard de rota por screen).
export { SCREEN_TO_MODULE_MAP };
