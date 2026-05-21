import { supabase } from '@/integrations/supabase/client';

/**
 * Emite um evento de uso (best-effort, NÃO bloqueante).
 *
 * - Sempre fire-and-forget: não aguarda resposta com `await`, não exibe erro pro usuário.
 * - Falhas silenciosas: instrumentação NUNCA deve quebrar a UX.
 * - Só envia se houver user autenticado E profile.company_id definidos.
 * - RLS garante que usuário só insere event da própria empresa
 *   (policy "authenticated users can insert usage_events for own company").
 * - **Debounce de 60s por (eventType + metadata)**: chamadas repetidas com a
 *   mesma chave dentro da janela são silenciosamente ignoradas. Evita flood
 *   por re-renders de effect, soft-navigation do React Router e abrir/voltar
 *   da mesma tela várias vezes em sequência. Cache vive em memória da aba
 *   (module-scoped) — se o user recarrega ou abre nova aba, cache zera.
 *
 * IMPORTANTE pra LGPD: NÃO armazenar PII em `metadata`. Mantenha apenas
 * paths, ids opacos (os_id, etc), nunca CPF/email completo.
 */

const DEBOUNCE_MS = 60_000;
const CLEANUP_AFTER_MS = 5 * 60_000; // entradas > 5min são limpas pra não vazar memória
const lastEventTimes = new Map<string, number>();

function buildDebounceKey(eventType: string, metadata: Record<string, any>): string {
  // JSON.stringify estabiliza chaves de ordem variável dentro do mesmo runtime
  // (motor JS preserva ordem de insert pra strings). Em prática, callers do
  // trackUsage usam sempre os mesmos campos na mesma ordem.
  return `${eventType}:${JSON.stringify(metadata)}`;
}

function cleanupOldEntries(now: number): void {
  // Periodicamente remove entradas expiradas pra não acumular indefinidamente
  // se o user navegar por muitas telas distintas na mesma aba.
  for (const [key, time] of lastEventTimes) {
    if (now - time > CLEANUP_AFTER_MS) lastEventTimes.delete(key);
  }
}

export function trackUsage(eventType: string, metadata: Record<string, any> = {}): void {
  const now = Date.now();
  const key = buildDebounceKey(eventType, metadata);
  const lastTime = lastEventTimes.get(key);
  if (lastTime !== undefined && now - lastTime < DEBOUNCE_MS) return;
  lastEventTimes.set(key, now);

  // Cleanup oportunista: a cada N inserts no Map, faz uma varrida.
  if (lastEventTimes.size % 20 === 0) cleanupOldEntries(now);

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
