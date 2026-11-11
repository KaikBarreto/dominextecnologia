import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useUserCompany } from '@/hooks/useUserCompany';

export interface NotificationRecipientPolicy {
  include_defaults: boolean;
  user_ids: string[];
  permission_keys: string[];
}
export interface CompanyNotificationRule {
  id: string;
  company_id: string;
  event_type: string;
  enabled: boolean;
  in_app_enabled: boolean;
  push_enabled: boolean;
  recipient_policy: NotificationRecipientPolicy;
  schedule_time: string | null;
  reminder_minutes: number | null;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}
export interface UserNotificationPreference {
  id: string;
  company_id: string;
  user_id: string;
  event_type: string;
  in_app_enabled: boolean | null;
  push_enabled: boolean | null;
  quiet_start: string | null;
  quiet_end: string | null;
  timezone: string | null;
  created_at: string;
  updated_at: string;
}
export type CompanyNotificationRulePatch = Partial<Pick<
  CompanyNotificationRule,
  | 'enabled'
  | 'in_app_enabled'
  | 'push_enabled'
  | 'recipient_policy'
  | 'schedule_time'
  | 'reminder_minutes'
>>;

export type UserNotificationPreferencePatch = Partial<Pick<
  UserNotificationPreference,
  'in_app_enabled' | 'push_enabled' | 'quiet_start' | 'quiet_end' | 'timezone'
>>;

type CompanyNotificationRuleInsert = Database['public']['Tables']['company_notification_rules']['Insert'];

const DEFAULT_RECIPIENT_POLICY: NotificationRecipientPolicy = {
  include_defaults: true,
  user_ids: [],
  permission_keys: [],
};

function normalizeRecipientPolicy(value: unknown): NotificationRecipientPolicy {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_RECIPIENT_POLICY };
  }

  const policy = value as Record<string, unknown>;
  return {
    include_defaults: policy.include_defaults !== false,
    user_ids: Array.isArray(policy.user_ids)
      ? policy.user_ids.filter((id): id is string => typeof id === 'string')
      : [],
    permission_keys: Array.isArray(policy.permission_keys)
      ? policy.permission_keys.filter((key): key is string => typeof key === 'string')
      : [],
  };
}
export function useNotificationSettings() {
  const { user } = useAuth();
  const { companyId, isLoading: isLoadingCompany } = useUserCompany();
  const queryClient = useQueryClient();

  const rulesQuery = useQuery({
    queryKey: ['notification-settings', 'company-rules', companyId],
    queryFn: async () => {
      if (!companyId) return [] as CompanyNotificationRule[];
      const { data, error } = await supabase
        .from('company_notification_rules')
        .select('*')
        .eq('company_id', companyId)
        .order('event_type');
      if (error) throw error;
      return ((data ?? []) as unknown as CompanyNotificationRule[]).map((rule) => ({
        ...rule,
        recipient_policy: normalizeRecipientPolicy(rule.recipient_policy),
      }));
    },
    enabled: !!companyId,
  });

  const preferencesQuery = useQuery({
    queryKey: ['notification-settings', 'user-preferences', companyId, user?.id],
    queryFn: async () => {
      if (!companyId || !user?.id) return [] as UserNotificationPreference[];
      const { data, error } = await supabase
        .from('user_notification_preferences')
        .select('*')
        .eq('company_id', companyId)
        .eq('user_id', user.id)
        .order('event_type');
      if (error) throw error;
      return (data ?? []) as UserNotificationPreference[];
    },
    enabled: !!companyId && !!user?.id,
  });

  const updateRuleMutation = useMutation({
    mutationFn: async ({ eventType, patch }: { eventType: string; patch: CompanyNotificationRulePatch }) => {
      if (!companyId || !user?.id) throw new Error('notification_context_unavailable');
      const { recipient_policy: recipientPolicy, ...rest } = patch;
      const payload: CompanyNotificationRuleInsert = {
        company_id: companyId,
        event_type: eventType,
        enabled: true,
        in_app_enabled: true,
        push_enabled: true,
        ...rest,
        recipient_policy: (recipientPolicy ?? DEFAULT_RECIPIENT_POLICY) as unknown as Json,
        updated_by: user.id,
      };
      const { error } = await supabase
        .from('company_notification_rules')
        .upsert(payload, { onConflict: 'company_id,event_type' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['notification-settings', 'company-rules', companyId],
    }),
  });

  const updatePreferenceMutation = useMutation({
    mutationFn: async ({ eventType, patch }: { eventType: string; patch: UserNotificationPreferencePatch }) => {
      if (!companyId || !user?.id) throw new Error('notification_context_unavailable');
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert({
          company_id: companyId,
          user_id: user.id,
          event_type: eventType,
          ...patch,
        }, { onConflict: 'company_id,user_id,event_type' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['notification-settings', 'user-preferences', companyId, user?.id],
    }),
  });

  const updateQuietHoursMutation = useMutation({
    mutationFn: async ({ eventTypes, quietStart, quietEnd, timezone }: {
      eventTypes: string[];
      quietStart: string | null;
      quietEnd: string | null;
      timezone: string | null;
    }) => {
      if (!companyId || !user?.id) throw new Error('notification_context_unavailable');
      const rows = eventTypes.map((eventType) => ({
        company_id: companyId,
        user_id: user.id,
        event_type: eventType,
        quiet_start: quietStart,
        quiet_end: quietEnd,
        timezone,
      }));
      const { error } = await supabase
        .from('user_notification_preferences')
        .upsert(rows, { onConflict: 'company_id,user_id,event_type' });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({
      queryKey: ['notification-settings', 'user-preferences', companyId, user?.id],
    }),
  });

  return {
    companyId,
    rules: rulesQuery.data ?? [],
    preferences: preferencesQuery.data ?? [],
    isLoading: isLoadingCompany || rulesQuery.isLoading || preferencesQuery.isLoading,
    error: rulesQuery.error ?? preferencesQuery.error,
    updateRule: updateRuleMutation.mutateAsync,
    updatePreference: updatePreferenceMutation.mutateAsync,
    updateQuietHours: updateQuietHoursMutation.mutateAsync,
    isSavingRule: updateRuleMutation.isPending,
    isSavingPreference: updatePreferenceMutation.isPending || updateQuietHoursMutation.isPending,
  };
}
