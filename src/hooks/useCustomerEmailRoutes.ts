import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type CustomerEmailRecipientKind = 'customer_primary' | 'customer_contact';
export type CustomerEmailEvent =
  | 'charge_created'
  | 'charge_due_reminder'
  | 'charge_overdue'
  | 'charge_paid'
  | 'charge_refunded';

export const CUSTOMER_EMAIL_EVENTS: CustomerEmailEvent[] = [
  'charge_created',
  'charge_due_reminder',
  'charge_overdue',
  'charge_paid',
  'charge_refunded',
];

export interface CustomerEmailRouteRecipient {
  id: string;
  route_id: string;
  recipient_kind: CustomerEmailRecipientKind;
  customer_contact_id: string | null;
  charge_created_enabled: boolean;
  due_reminder_enabled: boolean;
  charge_overdue_enabled: boolean;
  charge_paid_enabled: boolean;
  charge_refunded_enabled: boolean;
  created_at: string;
}

export interface CustomerEmailRoute {
  id: string;
  company_id: string;
  customer_id: string;
  enabled: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  recipients: CustomerEmailRouteRecipient[];
}

export interface CustomerEmailRecipientSelection {
  kind: CustomerEmailRecipientKind;
  contactId: string | null;
  events: CustomerEmailEvent[];
}

export interface SaveCustomerEmailRouteInput {
  enabled: boolean;
  recipients: CustomerEmailRecipientSelection[];
}

export interface CustomerEmailRouteSelection {
  explicit: boolean;
  enabled: boolean;
  recipients: CustomerEmailRecipientSelection[];
}

const queryRoot = ['customer-email-routes'] as const;

export function isCustomerEmailValid(email?: string | null): boolean {
  if (!email || email.length > 254) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export function customerEmailRecipientEvents(
  recipient: CustomerEmailRouteRecipient,
): CustomerEmailEvent[] {
  return CUSTOMER_EMAIL_EVENTS.filter((event) => {
    switch (event) {
      case 'charge_created': return recipient.charge_created_enabled;
      case 'charge_due_reminder': return recipient.due_reminder_enabled;
      case 'charge_overdue': return recipient.charge_overdue_enabled;
      case 'charge_paid': return recipient.charge_paid_enabled;
      case 'charge_refunded': return recipient.charge_refunded_enabled;
    }
  });
}

export function customerEmailRouteSelection(
  route: CustomerEmailRoute | undefined,
): CustomerEmailRouteSelection {
  if (!route) {
    return {
      explicit: false,
      enabled: true,
      recipients: [{
        kind: 'customer_primary',
        contactId: null,
        events: [...CUSTOMER_EMAIL_EVENTS],
      }],
    };
  }

  return {
    explicit: true,
    enabled: route.enabled,
    recipients: route.recipients.map((recipient) => ({
      kind: recipient.recipient_kind,
      contactId: recipient.customer_contact_id,
      events: customerEmailRecipientEvents(recipient),
    })),
  };
}

export function useCustomerEmailRoute(
  customerId?: string,
  enabled = true,
  companyId?: string | null,
) {
  const queryClient = useQueryClient();
  const queryKey = [...queryRoot, companyId, customerId] as const;

  const query = useQuery({
    queryKey,
    enabled: Boolean(customerId) && Boolean(companyId) && enabled,
    queryFn: async (): Promise<CustomerEmailRoute | undefined> => {
      if (!customerId || !companyId) return undefined;

      const { data: route, error: routeError } = await supabase
        .from('customer_email_routes')
        .select('*')
        .eq('company_id', companyId)
        .eq('customer_id', customerId)
        .maybeSingle();
      if (routeError) throw routeError;
      if (!route) return undefined;

      const { data: recipients, error: recipientsError } = await supabase
        .from('customer_email_route_recipients')
        .select('*')
        .eq('route_id', route.id)
        .order('created_at');
      if (recipientsError) throw recipientsError;

      return {
        ...route,
        recipients: recipients ?? [],
      } as CustomerEmailRoute;
    },
  });

  const saveRoute = useMutation({
    mutationFn: async (input: SaveCustomerEmailRouteInput) => {
      if (!customerId) throw new Error('Cliente não encontrado.');
      const { data, error } = await supabase.rpc('set_customer_email_route', {
        p_customer_id: customerId,
        p_enabled: input.enabled,
        p_recipients: input.recipients.map((recipient) => ({
          kind: recipient.kind,
          contact_id: recipient.contactId,
          events: recipient.events,
        })),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryRoot });
    },
  });

  return {
    route: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    saveRoute,
  };
}
