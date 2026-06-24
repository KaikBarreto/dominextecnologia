import type { ProposalTemplateProps } from './types';
import type { Quote, QuoteItem } from '@/hooks/useQuotes';

/**
 * Helpers compartilhados pelos templates de proposta (vanguarda, aurora, prisma).
 *
 * Tudo aqui é puro: normaliza os dados de `ProposalTemplateProps` num shape
 * estável que cada template consome, sem repetir o mesmo `?? '—'` em 3 arquivos.
 *
 * White-label: a marca exibida é SEMPRE a do tenant (company/customization).
 * Nunca referenciar Auctus/Dominex.
 */

/** Preserva cores de fundo/figuras na impressão (capa escura, faixas). */
export const colorAdjust: React.CSSProperties = {
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

export interface ProposalData {
  companyName: string;
  /** customization?.logo_url vence o logo da empresa. */
  logoUrl?: string;
  clientName: string;
  clientDoc?: string;
  clientEmail?: string;
  clientPhone?: string;
  serviceItems: QuoteItem[];
  materialItems: QuoteItem[];
  /** Todos os itens já ordenados por posição (quando não há grupos). */
  allItems: QuoteItem[];
  hasGroups: boolean;
  installments?: number;
  /** Linhas de contato da empresa, já filtradas (sem vazios). */
  contactLines: string[];
  addressLine?: string;
  /** Assunto/escopo curto pra subtítulo da capa (em MAIÚSCULAS). */
  subjectLine: string;
}

export function buildProposalData({ quote, company, items, customization }: ProposalTemplateProps): ProposalData {
  const companyName = company?.name || 'Empresa';
  const logoUrl = customization?.logo_url || company?.logo_url || undefined;

  const clientName = quote.customers?.name ?? quote.prospect_name ?? '—';
  const clientDoc = (quote.customers as any)?.document || undefined;
  const clientEmail = quote.customers?.email ?? quote.prospect_email ?? undefined;
  const clientPhone = quote.customers?.phone ?? quote.prospect_phone ?? undefined;

  const byPos = (a: QuoteItem, b: QuoteItem) => (a.position ?? 0) - (b.position ?? 0);
  const serviceItems = items.filter(i => i.item_type === 'servico' || i.item_type === 'mao_de_obra').sort(byPos);
  const materialItems = items.filter(i => i.item_type === 'material').sort(byPos);
  const allItems = [...items].sort(byPos);
  const hasGroups = serviceItems.length > 0 && materialItems.length > 0;

  const installments = (quote as any).card_installments as number | undefined;

  const contactLines = [company?.phone, company?.email].filter(Boolean) as string[];
  const addressParts = [
    company?.address,
    company?.address_number,
    company?.neighborhood,
    company?.city && company?.state ? `${company.city}/${company.state}` : company?.city,
    company?.zip_code ? `CEP ${company.zip_code}` : undefined,
  ].filter(Boolean);
  const addressLine = addressParts.length ? addressParts.join(' · ') : undefined;

  // Subtítulo da capa: primeiro item de serviço como "assunto", senão genérico.
  const subjectRaw = serviceItems[0]?.description || allItems[0]?.description || 'Serviços técnicos especializados';
  const subjectLine = subjectRaw.toUpperCase();

  return {
    companyName,
    logoUrl,
    clientName,
    clientDoc,
    clientEmail,
    clientPhone,
    serviceItems,
    materialItems,
    allItems,
    hasGroups,
    installments,
    contactLines,
    addressLine,
    subjectLine,
  };
}

export const sumTotal = (rows: QuoteItem[]) => rows.reduce((s, i) => s + (i.total_price || 0), 0);

/**
 * Itens do Escopo por folha A4. A 1ª folha do escopo divide espaço com o
 * cabeçalho da seção (kicker + título) → cabe um pouco menos. Valores afinados
 * pra cada card de item (~70–80px) + headers de grupo + linha de subtotal numa
 * folha A4 vertical (1123px, padding 56px). Conservador de propósito: melhor
 * sobrar margem do que cortar item.
 */
export const SCOPE_ITEMS_FIRST_PAGE = 8;
export const SCOPE_ITEMS_PER_PAGE = 9;

/**
 * Flag de personalização com DEFAULT LIGADO: `undefined` → true.
 * Usada por toggles que nasceram depois de configs antigas existirem
 * (show_displacement, show_gifts) — config velha sem o campo NÃO some o dado.
 */
export const flagOn = (v: boolean | undefined) => v !== false;

/**
 * Validade do orçamento em `dd/MM/yyyy`, fuso America/Sao_Paulo.
 * `valid_until` costuma ser date-only (`YYYY-MM-DD`); nesse caso formata pelas
 * partes (sem deslocar dia por UTC). Se vier ISO com hora, usa o fuso BR.
 * Retorna `undefined` quando nulo/ inválido → o template omite a linha.
 */
export function formatValidUntil(quote: Pick<Quote, 'valid_until'>): string | undefined {
  const raw = quote.valid_until;
  if (!raw) return undefined;
  // Date-only: "YYYY-MM-DD" → monta dd/MM/yyyy direto, sem timezone.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (dateOnly) {
    const [, y, m, dd] = dateOnly;
    return `${dd}/${m}/${y}`;
  }
  const d = new Date(raw);
  if (isNaN(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

/** Há deslocamento a exibir? (custo ou distância informados) */
export const hasDisplacement = (quote: Pick<Quote, 'displacement_cost' | 'distance_km'>) =>
  (quote.displacement_cost ?? 0) > 0 || (quote.distance_km ?? 0) > 0;

/** A proposta inclui brindes (cortesias)? */
export const hasGifts = (quote: Pick<Quote, 'include_gifts'>) => quote.include_gifts === true;

/**
 * Uma linha do Escopo já achatada: o item + a qual grupo pertence + o número
 * sequencial GLOBAL (contínuo entre grupos e entre folhas). `groupKey` separa
 * Serviços/Materiais; `groupLabel` é o rótulo exibido.
 */
export interface ScopeRow {
  item: QuoteItem;
  groupKey: string;
  groupLabel: string;
  /** Número sequencial global (1-based) impresso na linha. */
  num: number;
}

/** Bloco de um grupo dentro de uma folha (header + linhas daquele grupo). */
export interface ScopeGroup {
  key: string;
  label: string;
  rows: ScopeRow[];
  /** Este grupo continua de uma folha anterior → header ganha "(continuação)". */
  continued: boolean;
  /** Este bloco fecha o grupo (última fatia dele) → imprime o Subtotal. */
  isGroupEnd: boolean;
  /** Subtotal do GRUPO INTEIRO (soma de todas as folhas), impresso só no fim. */
  groupSubtotal: number;
}

/** Uma folha A4 de Escopo: índice (0-based) + os grupos que cabem nela. */
export interface ScopePage {
  index: number;
  groups: ScopeGroup[];
}

/**
 * Achata o Escopo numa sequência única de linhas numeradas globalmente.
 * Quando há grupos (serviços E materiais), preserva a ordem: serviços, depois
 * materiais. Senão, um único grupo "Itens".
 */
export function buildScopeRows(d: ProposalData): ScopeRow[] {
  const rows: ScopeRow[] = [];
  let n = 1;
  const push = (items: QuoteItem[], groupKey: string, groupLabel: string) => {
    for (const item of items) rows.push({ item, groupKey, groupLabel, num: n++ });
  };
  if (d.hasGroups) {
    push(d.serviceItems, 'servicos', 'Serviços');
    push(d.materialItems, 'materiais', 'Materiais');
  } else {
    push(d.allItems, 'itens', 'Itens');
  }
  return rows;
}

/**
 * Pagina o Escopo em folhas A4 de no máximo `perPage` itens cada, SEM cortar
 * nada. A 1ª folha do escopo carrega o cabeçalho da seção, então aceita um
 * pouco menos (`firstPerPage`). Numeração é global e contínua; quando um grupo
 * é dividido entre folhas, a continuação marca `continued = true`.
 *
 * Retorna sempre ≥1 folha (mesmo escopo vazio → 1 folha, que o template trata).
 */
export function paginateScope(
  rows: ScopeRow[],
  perPage: number,
  firstPerPage: number = perPage,
): ScopePage[] {
  const pages: ScopePage[] = [];
  if (rows.length === 0) return [{ index: 0, groups: [] }];

  // Subtotal de cada grupo inteiro (pra imprimir só quando o grupo fecha).
  const groupTotals = new Map<string, number>();
  for (const r of rows) {
    groupTotals.set(r.groupKey, (groupTotals.get(r.groupKey) ?? 0) + (r.item.total_price || 0));
  }

  let i = 0;
  let pageIndex = 0;
  // Rastreia quais grupos já apareceram pra marcar "(continuação)".
  const seen = new Set<string>();

  while (i < rows.length) {
    const cap = pageIndex === 0 ? firstPerPage : perPage;
    const slice = rows.slice(i, i + Math.max(1, cap));
    i += slice.length;

    // Agrupa as linhas desta folha por groupKey, preservando ordem.
    const groups: ScopeGroup[] = [];
    for (const row of slice) {
      let g = groups[groups.length - 1];
      if (!g || g.key !== row.groupKey) {
        g = {
          key: row.groupKey,
          label: row.groupLabel,
          rows: [],
          continued: seen.has(row.groupKey),
          isGroupEnd: false,
          groupSubtotal: groupTotals.get(row.groupKey) ?? 0,
        };
        groups.push(g);
        seen.add(row.groupKey);
      }
      g.rows.push(row);
    }
    // Marca isGroupEnd: o grupo fecha aqui se a próxima linha do documento
    // (se houver) já não pertence a ele.
    for (const g of groups) {
      const lastRowOfGroup = g.rows[g.rows.length - 1];
      const next = rows[lastRowOfGroup.num]; // num é 1-based → índice da próxima
      g.isGroupEnd = !next || next.groupKey !== g.key;
    }
    pages.push({ index: pageIndex, groups });
    pageIndex++;
  }
  return pages;
}

/**
 * Rótulo "Página XX/YY" no canto inferior direito de uma folha A4.
 * Renderizado SÓ quando o template recebe `customization?.show_pagination`.
 *
 * A cor é decidida PELO TEMPLATE conforme o fundo daquela folha (`onDark`):
 * folha escura → texto claro translúcido; folha clara → texto escuro.
 * Assim a paginação sempre contrasta e fica legível em qualquer página.
 *
 * Fica `position: absolute` no rodapé da `.??-page` (que é `position: relative`
 * com `overflow: hidden`), com padding seguro pra não colar na borda. Discreto.
 */
export function pageFolioStyle(onDark: boolean): React.CSSProperties {
  return {
    position: 'absolute',
    right: 18,
    bottom: 14,
    fontSize: 9.5,
    fontWeight: 600,
    letterSpacing: '0.08em',
    fontVariantNumeric: 'tabular-nums',
    color: onDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)',
    pointerEvents: 'none',
    zIndex: 20,
    ...colorAdjust,
  };
}

/** "Página 01/05" — zero à esquerda, consistente nos 3 templates. */
export const folioLabel = (page: number, total: number) =>
  `Página ${String(page).padStart(2, '0')}/${String(total).padStart(2, '0')}`;
