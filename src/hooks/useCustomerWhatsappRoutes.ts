import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { normalizeWhatsAppPhone } from '@/utils/shareLinks';

export type CustomerWhatsappRouteCategory = 'service_order' | 'billing';
export type CustomerWhatsappRecipientKind = 'customer_primary' | 'customer_contact';

export interface CustomerWhatsappRouteRecipient {
  id: string;
  route_id: string;
  recipient_kind: CustomerWhatsappRecipientKind;
  customer_contact_id: string | null;
  created_at: string;
}
export interface CustomerWhatsappRoute {
  id: string;
  company_id: string;
  customer_id: string;
  category: CustomerWhatsappRouteCategory;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  recipients: CustomerWhatsappRouteRecipient[];
}

export interface SaveCustomerWhatsappRouteInput {
  category: CustomerWhatsappRouteCategory;
  enabled: boolean;
  includePrimary: boolean;
  contactIds: string[];
}

export interface CustomerWhatsappRouteSelection {
  explicit: boolean;
  enabled: boolean;
  includePrimary: boolean;
  contactIds: string[];
}

export interface CustomerWhatsappRecipientCandidate {
  kind: CustomerWhatsappRecipientKind;
  contactId: string | null;
  name: string;
  phone: string;
}

export interface ResolvedCustomerWhatsappRecipients {
  isExplicit: boolean;
  disabled: boolean;
  recipients: CustomerWhatsappRecipientCandidate[];
}

interface PrimaryRecipientInput {
  name: string;
  phone?: string | null;
}

interface ContactRecipientInput {
  id: string;
  name: string;
  phone?: string | null;
}

const queryRoot = ['customer-whatsapp-routes'] as const;

export function customerWhatsappRouteSelection(
  route: CustomerWhatsappRoute | undefined,
): CustomerWhatsappRouteSelection {
  if (!route) {
    return {
      explicit: false,
      enabled: true,
      includePrimary: true,
      contactIds: [],
    };
  }

  return {
    explicit: true,
    enabled: route.enabled,
    includePrimary: route.recipients.some((recipient) => recipient.recipient_kind === 'customer_primary'),
    contactIds: route.recipients
      .filter((recipient) => recipient.recipient_kind === 'customer_contact' && recipient.customer_contact_id)
      .map((recipient) => recipient.customer_contact_id as string),
  };
}

export function normalizeWhatsappRecipientPhone(phone?: string | null, countryCode = 'BR'): string {
  return normalizeWhatsAppPhone(phone, countryCode) ?? '';
}

export function isWhatsappRecipientPhoneValid(phone?: string | null, countryCode = 'BR'): boolean {
  return Boolean(normalizeWhatsAppPhone(phone, countryCode));
}

export function isWhatsappPhoneOptedOut(
  phone: string | null | undefined,
  optedOutPhones: string[],
  countryCode = 'BR',
): boolean {
  const digits = normalizeWhatsappRecipientPhone(phone, countryCode);
  if (!digits) return false;
  return optedOutPhones.some((blocked) => {
    const blockedDigits = normalizeWhatsappRecipientPhone(blocked, countryCode);
    return Boolean(blockedDigits) && blockedDigits === digits;
  });
}

/** Fonte compartilhada pelas superfícies manuais para respeitar a rota da ficha. */
export function resolveCustomerWhatsappRecipients(
  route: CustomerWhatsappRoute | undefined,
  primary: PrimaryRecipientInput,
  contacts: ContactRecipientInput[],
  optedOutPhones: string[] = [],
  countryCode = 'BR',
): ResolvedCustomerWhatsappRecipients {
  const selection = customerWhatsappRouteSelection(route);
  if (!selection.enabled) {
    return { isExplicit: selection.explicit, disabled: true, recipients: [] };
  }

  const candidates: CustomerWhatsappRecipientCandidate[] = [];
  if (selection.includePrimary
    && isWhatsappRecipientPhoneValid(primary.phone, countryCode)
    && !isWhatsappPhoneOptedOut(primary.phone, optedOutPhones, countryCode)) {
    candidates.push({ kind: 'customer_primary', contactId: null, name: primary.name, phone: primary.phone });
  }
  for (const contact of contacts) {
    if (!selection.contactIds.includes(contact.id)
      || !isWhatsappRecipientPhoneValid(contact.phone, countryCode)) continue;
    if (isWhatsappPhoneOptedOut(contact.phone, optedOutPhones, countryCode)) continue;
    candidates.push({ kind: 'customer_contact', contactId: contact.id, name: contact.name, phone: contact.phone });
  }

  const seen = new Set<string>();
  return {
    isExplicit: selection.explicit,
    disabled: false,
    recipients: candidates.filter((candidate) => {
      const phone = normalizeWhatsappRecipientPhone(candidate.phone, countryCode);
      if (!phone || seen.has(phone)) return false;
      seen.add(phone);
      return true;
    }),
  };
}

export function whatsappRouteBadgesForContact(
  routes: CustomerWhatsappRoute[],
  contactId: string,
): CustomerWhatsappRouteCategory[] {
  return routes
    .filter((route) => route.enabled && route.recipients.some(
      (recipient) => recipient.recipient_kind === 'customer_contact' && recipient.customer_contact_id === contactId,
    ))
    .map((route) => route.category);
}

export function useCustomerWhatsappRoutes(
  customerId?: string,
  enabled = true,
  companyId?: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = [...queryRoot, companyId, customerId] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(customerId) && enabled,
    queryFn: async (): Promise<CustomerWhatsappRoute[]> => {
      if (!customerId) return [];
      if (!companyId) throw new Error('Empresa do cliente não encontrada.');

      const { data: routes, error: routesError } = await supabase
        .from('customer_whatsapp_routes')
        .select('*')
        .eq('company_id', companyId)
        .eq('customer_id', customerId)
        .order('category');
      if (routesError) throw routesError;

      const routeRows = (routes ?? []) as Omit<CustomerWhatsappRoute, 'recipients'>[];
      const routeIds = routeRows.map((route) => route.id);
      if (routeIds.length === 0) return [];

      const { data: recipients, error: recipientsError } = await supabase
        .from('customer_whatsapp_route_recipients')
        .select('*')
        .in('route_id', routeIds)
        .order('created_at');
      if (recipientsError) throw recipientsError;

      const recipientRows = (recipients ?? []) as CustomerWhatsappRouteRecipient[];
      return routeRows.map((route) => ({
        ...route,
        recipients: recipientRows.filter((recipient) => recipient.route_id === route.id),
      }));
    },
  });

  const optOutQuery = useQuery({
    queryKey: ['customer-whatsapp-opt-outs', companyId, customerId],
    enabled: Boolean(customerId) && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      if (!companyId) throw new Error('Empresa do cliente não encontrada.');
      const { data, error } = await supabase
        .from('whatsapp_opt_outs')
        .select('phone')
        .eq('company_id', companyId);
      if (error) throw error;
      return Array.from(new Set(
        (data ?? []).map((row) => row.phone.replace(/\D/g, '')).filter(Boolean),
      ));
    },
  });

  const saveRoute = useMutation({
    mutationFn: async (input: SaveCustomerWhatsappRouteInput) => {
      if (!customerId) throw new Error('Cliente não encontrado.');
      const { data, error } = await supabase.rpc('set_customer_whatsapp_route', {
        p_customer_id: customerId,
        p_category: input.category,
        p_enabled: input.enabled,
        p_include_primary: input.includePrimary,
        p_contact_ids: input.contactIds,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoot });
    },
  });

  const routes = query.data ?? [];
  const routeByCategory = (category: CustomerWhatsappRouteCategory) =>
    routes.find((route) => route.category === category);

  const refetch = async () => {
    const [routeResult, optOutResult] = await Promise.all([
      query.refetch(),
      optOutQuery.refetch(),
    ]);
    if (routeResult.error) throw routeResult.error;
    if (optOutResult.error) throw optOutResult.error;
    return {
      routes: routeResult.data ?? [],
      optedOutPhones: optOutResult.data ?? [],
    };
  };

  return {
    routes,
    optedOutPhones: optOutQuery.data ?? [],
    routeByCategory,
    isLoading: query.isLoading || optOutQuery.isLoading,
    isError: query.isError || optOutQuery.isError,
    error: query.error ?? optOutQuery.error,
    refetch,
    saveRoute,
  };
}
