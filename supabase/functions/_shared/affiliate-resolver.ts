// Resolução do affiliate_id recebido no cadastro público (`?afiliado=` da URL,
// propagado por Registration.tsx via o campo `affiliate_id` do body do
// self-register) contra o Programa de Afiliados.
//
// Aceita UUID OU slug amigável — mesma regra de `useAffiliate()` no frontend
// (src/hooks/useAffiliateData.ts). Duas implementações porque uma edge Deno
// não importa código de `src/` (runtime diferente do bundler Vite). Mudou a
// regra de casamento num lado, muda no outro.
//
// NUNCA lança e NUNCA derruba o cadastro: link de afiliado torto (digitado à
// mão, afiliado desativado, slug que não existe mais) grava affiliate_id=null
// e loga — o cadastro público segue normal (mesma filosofia de
// `canonicalizeCompanyOrigin` em `company-origin.ts`).

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `true` quando o valor casa o formato de UUID — decide se a busca é por
 *  `id` (exato) ou por `slug` (case-insensitive). Função PURA, testável sem
 *  banco. */
export function isUuidLike(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

/** Escapa `%`/`_` antes de usar em `ilike` — sem isso um slug com esses
 *  caracteres vira curinga de verdade e pode casar a linha errada (mesma
 *  régua de `ilikeLiteral` em `src/hooks/useCompanyOrigins.ts`). Função PURA. */
export function ilikeLiteral(value: string): string {
  return value.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
}

interface MaybeSingleResult<T> {
  data: T | null;
  error: { message?: string } | null;
}

/** Cliente mínimo que a resolução precisa — tipado estruturalmente pra não
 *  amarrar a versão do supabase-js de cada edge (mesmo padrão de
 *  `company-origin.ts`). */
interface AffiliateLookupClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): PromiseLike<MaybeSingleResult<{ id: string; is_active: boolean }>> };
      ilike(column: string, pattern: string): { maybeSingle(): PromiseLike<MaybeSingleResult<{ id: string; is_active: boolean }>> };
    };
  };
}

/**
 * Resolve `affiliate_id` (uuid) a partir do parâmetro cru `?afiliado=` (slug
 * OU uuid). Só devolve o id quando o afiliado existe E está ATIVO — afiliado
 * desativado (parceria encerrada) não deve gerar comissão em venda nova, mesmo
 * que um link antigo com o slug dele continue circulando.
 */
export async function resolveAffiliateId(
  client: AffiliateLookupClient,
  raw: string | null | undefined,
  logPrefix: string,
): Promise<string | null> {
  const value = (raw ?? '').trim();
  if (!value) return null;

  try {
    const query = client.from('affiliates').select('id, is_active');
    const { data, error } = isUuidLike(value)
      ? await query.eq('id', value).maybeSingle()
      : await query.ilike('slug', ilikeLiteral(value)).maybeSingle();

    if (error) {
      console.error(`${logPrefix} Falha ao resolver affiliate_id "${value}"; gravando null (não-fatal):`, error.message);
      return null;
    }
    if (!data || data.is_active !== true) {
      console.log(`${logPrefix} affiliate_id "${value}" não encontrado ou inativo — gravando null.`);
      return null;
    }
    return data.id;
  } catch (err) {
    console.error(`${logPrefix} Exceção ao resolver affiliate_id "${value}"; gravando null (não-fatal):`, err);
    return null;
  }
}

interface OriginNameLookupClient {
  from(table: string): {
    select(columns: string): {
      eq(column: string, value: string): { maybeSingle(): PromiseLike<MaybeSingleResult<{ name: string }>> };
    };
  };
}

/** Fallback só pra quando o catálogo ainda não tem a linha do seed (não
 *  deveria acontecer em produção — a migration `affiliates_schema` garante). */
export const AFFILIATE_ORIGIN_FALLBACK_NAME = 'Afiliado';

/**
 * Nome canônico ATUAL da origem "Afiliado" — resolvido por `utm_key='affiliate'`
 * (chave estável), nunca por nome hardcoded. Espelha
 * `resolveAffiliateOriginName()` em `src/utils/companyOriginCatalog.ts`.
 *
 * Usado só quando `resolveAffiliateId()` acima já confirmou um afiliado ativo:
 * a origem gravada em `companies.origin` tem que ser a de afiliado mesmo que o
 * `?origem=` da URL tenha chegado desatualizado (link antigo, origem renomeada
 * depois de gerado) — esta é a fonte AUTORITATIVA, o client é só UX.
 */
export async function resolveAffiliateOriginName(
  client: OriginNameLookupClient,
  logPrefix: string,
): Promise<string> {
  try {
    const { data, error } = await client
      .from('company_origins')
      .select('name')
      .eq('utm_key', 'affiliate')
      .maybeSingle();
    if (error) {
      console.error(`${logPrefix} Falha ao resolver nome da origem de afiliado; usando fallback "${AFFILIATE_ORIGIN_FALLBACK_NAME}":`, error.message);
      return AFFILIATE_ORIGIN_FALLBACK_NAME;
    }
    return data?.name || AFFILIATE_ORIGIN_FALLBACK_NAME;
  } catch (err) {
    console.error(`${logPrefix} Exceção ao resolver nome da origem de afiliado; usando fallback "${AFFILIATE_ORIGIN_FALLBACK_NAME}":`, err);
    return AFFILIATE_ORIGIN_FALLBACK_NAME;
  }
}
