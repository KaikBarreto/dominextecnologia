import { supabaseAnon } from '@/integrations/supabase/anonClient';

/**
 * Sobe foto/assinatura de uma pergunta de formulário público ANTES do envio.
 *
 * O servidor só aceita, nas perguntas `photo` e `signature`, uma URL pública do
 * NOSSO Storage (`data:` e URL externa são rejeitados, porque o valor é
 * renderizado depois no painel do tenant e em PDF). O único jeito de produzir
 * essa URL é a edge `lead-capture-upload-photo`, que:
 *  - exige o `short_code` de um formulário ativo e não expirado (amarração
 *    anti-abuso: não é um depósito aberto);
 *  - confere o tipo real pelos bytes (JPEG, PNG ou WebP), então a assinatura
 *    PNG do canvas passa pelo mesmo caminho da foto.
 *
 * Usa o `supabaseAnon` de propósito: é a mesma identidade da página pública e a
 * edge é anônima. Serve às duas telas (link público e Portal do Cliente).
 *
 * Lança `Error` com mensagem PT-BR pronta pro usuário final. Nunca propaga
 * texto de banco, stack ou nome de tenant.
 */
export async function uploadPublicFormFile(shortCode: string, dataUrl: string): Promise<string> {
  const fallback = 'Não foi possível enviar o arquivo. Tente novamente.';
  try {
    const { data, error } = await supabaseAnon.functions.invoke('lead-capture-upload-photo', {
      body: { short_code: shortCode, photo_base64: dataUrl },
    });
    if (error) {
      let message = fallback;
      try {
        const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) message = body.error;
        }
      } catch { /* mantém a mensagem padrão */ }
      throw new Error(message);
    }
    const url = (data as { photo_url?: unknown } | null)?.photo_url;
    if (typeof url !== 'string' || !url) throw new Error(fallback);
    return url;
  } catch (err) {
    throw err instanceof Error ? err : new Error(fallback);
  }
}
