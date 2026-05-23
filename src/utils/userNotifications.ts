import { supabase } from '@/integrations/supabase/client';

/**
 * Wrapper pra disparar notificações in-app (sino do header) de qualquer ponto
 * do código.
 *
 * RLS de `user_notifications` bloqueia INSERT direto pelo cliente — sempre
 * via edge function `create-user-notification` (service_role internamente).
 * A função valida que o caller só pode notificar:
 *   - a si mesmo (`caller.id === user_id`); OU
 *   - qualquer um, se o caller tiver role `admin`/`super_admin`.
 *
 * Best-effort: erros são logados mas NÃO propagados — notificação é UX
 * nice-to-have, não pode quebrar o fluxo principal (ex: marcar OS como
 * concluída não pode falhar porque o sino caiu).
 */
export interface UserNotificationParams {
  userId: string;
  type: string;
  title: string;
  message?: string;
  icon?: string;
  actionUrl?: string;
  expiresAt?: string;
}

export async function insertUserNotification(params: UserNotificationParams): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('create-user-notification', {
      body: {
        user_id: params.userId,
        type: params.type,
        title: params.title,
        message: params.message,
        icon: params.icon ?? 'bell',
        action_url: params.actionUrl,
        expires_at: params.expiresAt,
      },
    });
    if (error) {
      console.error('[insertUserNotification] erro:', error);
    }
  } catch (err) {
    console.error('[insertUserNotification] exceção:', err);
    // best-effort — swallow.
  }
}
