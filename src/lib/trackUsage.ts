import { supabase } from '@/integrations/supabase/client';

/**
 * Emite um evento de uso (best-effort, NÃO bloqueante).
 *
 * - Sempre fire-and-forget: não aguarda resposta com `await`, não exibe erro pro usuário.
 * - Falhas silenciosas: instrumentação NUNCA deve quebrar a UX.
 * - Só envia se houver user autenticado E profile.company_id definidos.
 * - RLS garante que usuário só insere event da própria empresa
 *   (policy "authenticated users can insert usage_events for own company").
 *
 * IMPORTANTE pra LGPD: NÃO armazenar PII em `metadata`. Mantenha apenas
 * paths, ids opacos (os_id, etc), nunca CPF/email completo.
 */
export function trackUsage(eventType: string, metadata: Record<string, any> = {}): void {
  // Encapsula tudo em IIFE async pra realmente disparar fire-and-forget
  // sem fazer o caller esperar.
  void (async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // profiles.user_id aponta pra auth.users.id (profiles.id é PK próprio)
      const { data: profile } = await supabase
        .from('profiles')
        .select('company_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!profile?.company_id) return;

      await supabase.from('usage_events').insert({
        company_id: profile.company_id,
        user_id: user.id,
        event_type: eventType,
        metadata,
      });
    } catch {
      // silenciosamente ignora — instrumentação NUNCA deve quebrar a UX
    }
  })();
}
