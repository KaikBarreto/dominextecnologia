export type DreBucket = 'revenue' | 'revenue_reduction' | 'tax' | 'cpv' | 'opex' | 'non_operating';

export interface DreCategoryRow { name: string; label: string | null; type: string | null; dre_bucket?: string | null; affects_result?: boolean | null; }
export interface DreTransactionLike { type: string; category: string | null; amount: number | string; }
export interface DreCategoryRule { label: string; bucket: DreBucket | null; affectsResult: boolean; }
export type DreCategoryIndex = Map<string, DreCategoryRule>;

export const LEGACY_CATEGORY_LABELS: Record<string, string> = {
  sale: 'Vendas', first_sale: 'Vendas', renewal: 'Renovações', partner_contribution: 'Aporte de sócio', other_income: 'Outras receitas', upgrade: 'Upgrade',
  asaas_fee: 'Tarifas de cobrança', tarifa_asaas: 'Tarifas de cobrança', tax: 'Impostos', impostos: 'Impostos', infrastructure: 'Infraestrutura',
  salary: 'Salários', marketing: 'Marketing', development: 'Desenvolvimento', commission: 'Comissões', advance: 'Vales/adiantamentos', tools: 'Ferramentas', administrative: 'Administrativo', other_expense: 'Outras despesas', distribuicao_de_lucros: 'Distribuição de lucros',
};

const EXPENSE_BUCKETS: DreBucket[] = ['revenue_reduction', 'tax', 'cpv', 'opex', 'non_operating'];
const isBucket = (value: string | null | undefined): value is DreBucket =>
  value === 'revenue' || value === 'revenue_reduction' || value === 'tax' || value === 'cpv' || value === 'opex' || value === 'non_operating';

export function buildDreCategoryIndex(rows: DreCategoryRow[] | null | undefined): DreCategoryIndex {
  return new Map((rows ?? []).filter((row) => row?.name).map((row) => [row.name, {
    label: row.label?.trim() || LEGACY_CATEGORY_LABELS[row.name] || row.name,
    bucket: isBucket(row.dre_bucket) ? row.dre_bucket : null,
    affectsResult: row.affects_result !== false,
  }]));
}
export const labelForCategory = (category: string, index?: DreCategoryIndex) => index?.get(category)?.label || LEGACY_CATEGORY_LABELS[category] || category;

export function classifyForDre(tx: DreTransactionLike, index: DreCategoryIndex): { bucket: DreBucket | null; unclassified: boolean } {
  const rule = tx.category ? index.get(tx.category) : undefined;
  if (rule && !rule.affectsResult) return { bucket: null, unclassified: false };
  if (tx.type === 'income') return { bucket: 'revenue', unclassified: rule?.bucket !== 'revenue' };
  return rule?.bucket && EXPENSE_BUCKETS.includes(rule.bucket)
    ? { bucket: rule.bucket, unclassified: false }
    : { bucket: 'opex', unclassified: true };
}

export interface DreCategoryBreakdown { category: string; label: string; value: number; unclassified: boolean; }
export interface DreTotals {
  receitaBruta: number; revenueByCategory: DreCategoryBreakdown[]; estornos: number; estornosByCategory: DreCategoryBreakdown[];
  impostos: number; taxesByCategory: DreCategoryBreakdown[]; receitaLiquida: number; cpv: number; cpvByCategory: DreCategoryBreakdown[];
  lucroBruto: number; margemBruta: number; opex: number; opexByCategory: DreCategoryBreakdown[]; ebitda: number; margem: number;
  nonOperating: number; nonOperatingByCategory: DreCategoryBreakdown[]; resultadoFinal: number; unclassifiedCategories: string[];
}
type BucketMap = Map<string, { value: number; unclassified: boolean }>;
const round = (value: number) => Math.round(value * 100) / 100;

export function aggregateDre(transactions: DreTransactionLike[], index: DreCategoryIndex): DreTotals {
  const groups: Record<DreBucket, BucketMap> = { revenue: new Map(), revenue_reduction: new Map(), tax: new Map(), cpv: new Map(), opex: new Map(), non_operating: new Map() };
  const unclassified = new Set<string>();
  for (const tx of transactions) {
    const rule = tx.category ? index.get(tx.category) : undefined;
    const classified = classifyForDre(tx, index);
    if (!classified.bucket) continue;
    const bucket = classified.bucket;
    const missing = classified.unclassified;
    if (missing && tx.category) unclassified.add(tx.category);
    const key = tx.category || 'sem_categoria'; const previous = groups[bucket].get(key);
    groups[bucket].set(key, { value: (previous?.value ?? 0) + (Number(tx.amount) || 0), unclassified: Boolean(previous?.unclassified || missing) });
  }
  const sum = (bucket: DreBucket) => round([...groups[bucket].values()].reduce((total, row) => total + row.value, 0));
  const lines = (bucket: DreBucket): DreCategoryBreakdown[] => [...groups[bucket].entries()].filter(([, row]) => Math.abs(row.value) > .0001).map(([category, row]) => ({ category, label: labelForCategory(category, index), value: round(row.value), unclassified: row.unclassified })).sort((a,b) => b.value-a.value);
  const receitaBruta = sum('revenue'), estornos = sum('revenue_reduction'), impostos = sum('tax'), receitaLiquida = round(receitaBruta-estornos-impostos), cpv = sum('cpv'), lucroBruto = round(receitaLiquida-cpv), opex = sum('opex'), ebitda = round(lucroBruto-opex), nonOperating = sum('non_operating');
  return { receitaBruta, revenueByCategory: lines('revenue'), estornos, estornosByCategory: lines('revenue_reduction'), impostos, taxesByCategory: lines('tax'), receitaLiquida, cpv, cpvByCategory: lines('cpv'), lucroBruto, margemBruta: receitaLiquida ? lucroBruto/receitaLiquida*100 : 0, opex, opexByCategory: lines('opex'), ebitda, margem: receitaBruta ? ebitda/receitaBruta*100 : 0, nonOperating, nonOperatingByCategory: lines('non_operating'), resultadoFinal: round(ebitda-nonOperating), unclassifiedCategories: [...unclassified].sort() };
}
