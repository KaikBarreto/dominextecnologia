import { supabase } from '@/integrations/supabase/client';

/**
 * Carimbo de EMPRESA nos uploads de arquivo.
 *
 * Por quê: os buckets `customer-photos`, `employee-photos`, `financial-receipts`,
 * `equipment-files` e `company-logos` guardam o arquivo com caminho PLANO
 * (`logo_<ts>.png`, `photos/<ts>_<nome>`), sem nada que diga de quem é. Sem essa
 * âncora, a regra de acesso do servidor não tinha o que comparar e qualquer
 * usuário logado de qualquer empresa lia, trocava e apagava arquivo das outras —
 * nos dois buckets privados (comprovante financeiro e foto de funcionário) isso
 * era vazamento de leitura, porque dava pra LISTAR o bucket inteiro.
 *
 * A saída, sem mover 2.727 arquivos nem reescrever endereço em 13 colunas, é
 * CARIMBAR a empresa dona em cada objeto (`user_metadata.company_id`) e deixar a
 * regra de acesso ler o carimbo.
 *
 * ⚠️ Não dá pra carimbar por gatilho no banco: `storage.objects` pertence ao
 * `supabase_storage_admin` e o papel de migration não pode criar trigger nela
 * ("must be owner of table objects"). Então o carimbo sai daqui, do cliente.
 *
 * ⚠️ E não, isso não é carimbo que o cliente escolhe: a regra de INSERT no
 * servidor compara o valor declarado com a empresa REAL do chamador. Mentir no
 * `company_id` não passa — o upload é recusado. O carimbo aqui é conveniência,
 * a autoridade continua no servidor.
 *
 * Uso: `await supabase.storage.from(B).upload(path, file, await tenantFileOptions())`
 * ou, com opções próprias, `await tenantFileOptions({ upsert: true })`.
 */

type FileOptions = Record<string, unknown>;

// A empresa do usuário não muda durante a sessão; resolver uma vez evita uma ida
// ao banco por arquivo (o envio de fotos da OS manda 3 em paralelo).
let cache: { userId: string; companyId: string | null } | null = null;

/** company_id do usuário logado, ou null (anônimo / perfil sem empresa). */
export async function currentCompanyId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  const userId = data.session?.user?.id;
  if (!userId) return null;
  if (cache && cache.userId === userId) return cache.companyId;

  const { data: profile } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('user_id', userId)
    .maybeSingle();

  cache = { userId, companyId: (profile?.company_id as string | undefined) ?? null };
  return cache.companyId;
}

/** Esquece o cache — chamar no logout/troca de conta. */
export function clearTenantStorageCache(): void {
  cache = null;
}

/**
 * Opções de upload já com o carimbo da empresa. Mescla com as opções que o
 * chamador quiser (`upsert`, `contentType`, ...). Sem empresa resolvida devolve
 * as opções sem carimbo — aí o servidor é quem decide recusar ou não.
 */
export async function tenantFileOptions(extra?: FileOptions): Promise<FileOptions> {
  const companyId = await currentCompanyId();
  if (!companyId) return { ...(extra ?? {}) };
  return {
    ...(extra ?? {}),
    metadata: {
      ...((extra?.metadata as Record<string, unknown> | undefined) ?? {}),
      company_id: companyId,
    },
  };
}
