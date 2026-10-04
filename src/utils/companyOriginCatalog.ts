// Régua ÚNICA de resolução de origem de captação do painel master (Auctus).
//
// `companies.origin` e `admin_leads.source` guardam o NOME da origem em texto,
// não o id. O catálogo é a tabela `company_origins`. Antes deste módulo cada
// tela tinha a sua regra de casamento (umas exatas, outras case-insensitive) e
// cada uma degradava diferente quando o nome não casava: texto cru no detalhe
// da empresa, "N/A" na listagem, badge sem cor no card do CRM e cor sorteada
// por hash no gráfico. Daqui pra frente todas passam por `resolveOrigin`.
//
// Casamento é case-insensitive e com trim: pro CEO "Whatsapp" e "WhatsApp" são
// a mesma origem.
//
// Módulo PURO de propósito (sem React, sem lucide): é consumido tanto por
// componentes quanto por lógica pura (`src/lib/adminCrmFunnel.ts`). Quem precisa
// renderizar o ícone usa `OriginBadge`/`OriginIcon` em
// `src/components/admin/OriginBadge.tsx`.

/** Origem NÃO reconhecida no catálogo: cinza neutro + ícone genérico. */
export const UNKNOWN_ORIGIN_COLOR = '#6B7280';
export const UNKNOWN_ORIGIN_ICON = 'Globe';

/** Origem AUSENTE (null/vazia) — estado diferente de "não reconhecida". */
export const NO_ORIGIN_LABEL = 'Não informado';
export const NO_ORIGIN_COLOR = '#9CA3AF';

/** Linha do catálogo `company_origins` (campos extras são opcionais de propósito,
 *  porque algumas telas só fazem `select('name, color')`). */
export interface CatalogOrigin {
  id?: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  show_in_signup?: boolean;
  sort_order?: number;
}

export interface ResolvedOrigin {
  /** Nome canônico do catálogo quando casou; senão o texto salvo, com trim. */
  name: string;
  /** Sempre um hex utilizável. Cinza neutro quando não casou. */
  color: string;
  /** Sempre um nome de ícone lucide utilizável. 'Globe' quando não casou. */
  icon: string;
  /** false = origem fora do catálogo (rede de proteção, não deveria acontecer). */
  known: boolean;
  /** Linha do catálogo, quando casou. */
  catalog: CatalogOrigin | null;
}

function key(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Resolve o nome salvo contra o catálogo.
 *
 * - `null`/`''`/só espaços  → `null` ("sem origem"; a tela decide o vazio dela,
 *   NUNCA um badge cinza — ausência de origem não é origem desconhecida).
 * - casou no catálogo       → nome canônico + cor e ícone cadastrados.
 * - não casou               → o texto salvo preservado, cinza neutro e `Globe`.
 */
export function resolveOrigin(
  name: string | null | undefined,
  origins: CatalogOrigin[] | null | undefined,
): ResolvedOrigin | null {
  const raw = (name ?? '').trim();
  if (!raw) return null;

  const wanted = key(raw);
  const match = (origins || []).find((o) => o?.name && key(o.name) === wanted) || null;

  if (match) {
    return {
      name: match.name,
      color: match.color || UNKNOWN_ORIGIN_COLOR,
      icon: match.icon || UNKNOWN_ORIGIN_ICON,
      known: true,
      catalog: match,
    };
  }

  return {
    name: raw,
    color: UNKNOWN_ORIGIN_COLOR,
    icon: UNKNOWN_ORIGIN_ICON,
    known: false,
    catalog: null,
  };
}

/** `true` quando o nome salvo não está no catálogo (e não é vazio). */
export function isUnlistedOrigin(
  name: string | null | undefined,
  origins: CatalogOrigin[] | null | undefined,
): boolean {
  const resolved = resolveOrigin(name, origins);
  return !!resolved && !resolved.known;
}

/** Ordena o catálogo pelo que o painel master configurou (ordem, depois nome). */
export function sortOrigins<T extends CatalogOrigin>(origins: T[]): T[] {
  return origins.slice().sort((a, b) => {
    const oa = a.sort_order ?? 99;
    const ob = b.sort_order ?? 99;
    if (oa !== ob) return oa - ob;
    return (a.name || '').localeCompare(b.name || '', 'pt-BR');
  });
}
