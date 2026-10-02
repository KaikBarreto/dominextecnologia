// ─────────────────────────────────────────────────────────────────────────────
// activityChartFormat — formatação PURA do eixo X dos gráficos "realizado vs
// meta" da aba Atividade Comercial. Fora do componente de propósito: dá pra
// testar sem montar Recharts/DOM.
//
// Problema que resolve: em intervalo longo (ex: "Este ano"), um label por dia
// útil (~250 dias) vira borrão ilegível no eixo. `axisTickInterval` decide de
// quantos em quantos pontos o Recharts desenha o label (prop `interval` do
// `XAxis`), mirando um teto de ~15 labels visíveis independente do tamanho
// do intervalo.
// ─────────────────────────────────────────────────────────────────────────────

import { fromDateKey } from '@/utils/salespersonActivityStats';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

/** Teto de labels visíveis no eixo X, em qualquer tamanho de intervalo. */
const MAX_VISIBLE_TICKS = 15;

/**
 * 'yyyy-MM-dd' → 'dd/MM' (PT-BR curto). Chave inválida devolve a própria
 * chave, pra nunca quebrar o eixo por um dado malformado.
 */
export function formatShortDateBR(dateKey: string): string {
  const date = fromDateKey(dateKey);
  if (!date) return dateKey;
  return format(date, 'dd/MM', { locale: ptBR });
}

/**
 * Prop `interval` do `XAxis` do Recharts: 0 = mostra todos, N = pula N labels
 * entre cada exibido. Calculado pra nunca passar de `MAX_VISIBLE_TICKS` labels
 * na tela, não importa se o período é "Esta semana" (5 pontos) ou "Este ano"
 * (~250 dias úteis).
 */
export function axisTickInterval(pointCount: number): number {
  if (pointCount <= MAX_VISIBLE_TICKS) return 0;
  return Math.ceil(pointCount / MAX_VISIBLE_TICKS) - 1;
}

/**
 * Intervalo longo também pede rotação pro label não se sobrepor ao vizinho —
 * a partir de ~10 pontos visíveis já vale a pena inclinar.
 */
export function shouldRotateAxisLabels(pointCount: number): boolean {
  return pointCount > 10;
}
