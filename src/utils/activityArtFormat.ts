// ─────────────────────────────────────────────────────────────────────────────
// activityArtFormat — funções PURAS da arte de atividade comercial do vendedor.
//
// Mora num módulo separado de propósito: `ActivityArtCard` (componente) e
// `salespersonActivityArt` (gerador off-screen) precisam das MESMAS funções, e
// o gerador importa o componente. Se as puras vivessem no gerador, o grafo
// ficaria circular (card → gerador → card) — frágil em build/HMR. Com elas
// aqui, as duas pontas importam para baixo e o ciclo desaparece.
//
// Nada neste arquivo toca DOM, React ou Supabase: é tudo testável em isolamento.
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityPeriod = 'morning' | 'afternoon';

// ─────────────────────────────────────────────────────────────────────────────
// Funções puras — testadas em isolamento, sem precisar montar nada no DOM.
// ─────────────────────────────────────────────────────────────────────────────

/** Remove acentos, baixa caixa e troca espaço por hífen — igual à mecânica de
 * `slugify` em `src/lib/canvas/graphExport.ts`, duplicada aqui de propósito
 * (não importamos de `lib/canvas`, que é de outro domínio). */
function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/** Nome do arquivo: `atividade-<vendedor>-<yyyy-MM-dd>-<manha|tarde>.png`. */
export function activityArtFileName(
  salespersonName: string,
  activityDate: string,
  period: ActivityPeriod,
): string {
  const slug = slugify(salespersonName) || 'vendedor';
  const periodSlug = period === 'morning' ? 'manha' : 'tarde';
  return `atividade-${slug}-${activityDate}-${periodSlug}.png`;
}

/** Taxa de conversão em string pronta pra exibir. Denominador 0 (ou inválido)
 * vira "—" — nunca "NaN%" nem "Infinity%". */
export function formatConversionRate(numerator: number, denominator: number): string {
  if (!denominator || denominator <= 0) return '—';
  const pct = (numerator / denominator) * 100;
  if (!Number.isFinite(pct)) return '—';
  return `${Math.round(pct)}%`;
}

export interface GoalProgressResult {
  /** Percentual real — pode passar de 100 (ex.: 125). */
  percent: number;
  /** Percentual capado em [0,100] — é o que vai na largura da barra. */
  barPercent: number;
  met: boolean;
}

/** Progresso da meta diária. Meta 0/indefinida não quebra em NaN: qualquer
 * valor > 0 já é considerada "meta batida" (meta zero é trivialmente atingida). */
export function goalProgress(value: number, goal: number): GoalProgressResult {
  if (!goal || goal <= 0) {
    const met = value > 0;
    return { percent: met ? 100 : 0, barPercent: met ? 100 : 0, met };
  }
  const rawPercent = (value / goal) * 100;
  const percent = Number.isFinite(rawPercent) ? Math.round(rawPercent) : 0;
  const barPercent = Math.max(0, Math.min(100, percent));
  return { percent, barPercent, met: value >= goal };
}
