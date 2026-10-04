// Canonização da ORIGEM DE CAPTAÇÃO (`companies.origin`) no servidor.
//
// `companies.origin` guarda o NOME da origem em texto, e o catálogo único é a
// tabela `public.company_origins`. Todo relatório de atribuição do painel master
// (listagem de empresas, funil do CRM, gráfico de origens) é lido por essa
// coluna, então texto fora do catálogo não é "detalhe": é relatório errado.
//
// Por que a trava mora AQUI e não no client:
//   • o cadastro público lê a origem do `?origem=` da URL, que é parâmetro
//     PÚBLICO. Links de campanha antigos já publicados carregam valores que
//     nunca existiram no catálogo (foi assim que entraram empresas com "Site");
//   • o client só enxerga 9 das 12 origens (RPC `get_signup_origins`), então ele
//     NÃO consegue validar `BNI`, `Parceiro` e `Prospecção Ativa`, que só
//     aparecem em link de vendedor. A edge roda com service role e vê as 12.
//
// Espelho server-side da régua de leitura `src/utils/companyOriginCatalog.ts`
// (casamento case-insensitive e com trim: pro CEO "Whatsapp" e "WhatsApp" são a
// mesma origem). São dois módulos de propósito: o do `src/` é React/browser e
// não é importável por uma edge Deno. Mudou a regra de casamento num, muda no
// outro.

/** Origem informada que NÃO existe no catálogo. É uma linha real de
 *  `company_origins`, e é o destino honesto de qualquer texto não reconhecido:
 *  não sabemos de onde a pessoa veio. Nunca gravamos o texto cru. */
export const UNKNOWN_ORIGIN_NAME = 'Outros';

const key = (value: string): string => value.trim().toLowerCase();

/**
 * Casa o texto recebido contra os nomes do catálogo (função PURA, testável).
 *
 * - vazio/ausente/só espaços → `null` (ausência de origem NÃO é origem
 *   desconhecida: é "não informado", e essa distinção é a mesma da régua de
 *   leitura do painel);
 * - casou (case-insensitive, com trim) → o nome com a GRAFIA DO BANCO
 *   (`?origem=whatsapp` vira `WhatsApp`);
 * - veio algo que não casou → `UNKNOWN_ORIGIN_NAME`.
 */
export function matchCanonicalOrigin(
  raw: string | null | undefined,
  catalogNames: readonly (string | null | undefined)[],
): string | null {
  const wanted = key(raw ?? '');
  if (!wanted) return null;

  const match = catalogNames.find((name) => !!name && key(name) === wanted);
  return match ? match.trim() : UNKNOWN_ORIGIN_NAME;
}

/** Cliente mínimo que a canonização precisa (qualquer client Supabase com
 *  service role serve; tipado estruturalmente pra não amarrar a versão do
 *  supabase-js de cada edge). */
interface OriginCatalogClient {
  from(table: string): {
    // deno-lint-ignore no-explicit-any
    select(columns: string): PromiseLike<{ data: any[] | null; error: { message?: string } | null }>;
  };
}

/**
 * Lê o catálogo e devolve o nome canônico pra gravar em `companies.origin`.
 *
 * NUNCA lança e NUNCA derruba quem chamou: criar empresa (topo de funil, no
 * cadastro público) não pode quebrar por causa de um campo de atribuição.
 *
 * Catálogo indisponível (erro de rede/banco) → `null`, não `'Outros'`. Nesse
 * caso não dá pra afirmar nada: `null` aparece como "Não informado", que todo
 * mundo lê como dado que falta, enquanto `'Outros'` entraria no relatório como
 * uma escolha que a pessoa nunca fez e ninguém conseguiria separar das reais.
 * A falha fica rastreável no log da função.
 */
export async function canonicalizeCompanyOrigin(
  client: OriginCatalogClient,
  raw: string | null | undefined,
  logPrefix: string,
): Promise<string | null> {
  if (!key(raw ?? '')) return null;

  try {
    const { data, error } = await client.from('company_origins').select('name');
    if (error) {
      console.error(`${logPrefix} Falha ao ler company_origins; origem gravada como null (não-fatal):`, error.message);
      return null;
    }
    return matchCanonicalOrigin(raw, (data || []).map((row) => row?.name));
  } catch (err) {
    console.error(`${logPrefix} Exceção ao ler company_origins; origem gravada como null (não-fatal):`, err);
    return null;
  }
}
