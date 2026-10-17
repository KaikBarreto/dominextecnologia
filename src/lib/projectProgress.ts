/**
 * Progresso de um Projeto (gestão de obras, Onda 1 — 2026-10-17).
 *
 * A fonte dos números crus é a RPC `public.project_progress_summary()`
 * (ver src/hooks/useProjectProgress.ts). Esta função é a ÚNICA que converte
 * esses números em percentual — nunca faça essa divisão inline na tela.
 *
 * 🔴 CONTRATO — a forma mais fácil de errar em silêncio:
 * `active_count` é o DENOMINADOR: todo card não-perdido, GANHOS INCLUSIVE.
 * NÃO é "cards em aberto".
 *
 *     progresso % = done_count / active_count                  ✅
 *     progresso % = done_count / (done_count + active_count)   ❌ ERRADO
 *
 * Exemplo real da prova do banco: 3 concluídos + 2 perdidos + 2 abertos =>
 * done=3, active=5 (3 ganhos + 2 abertos, SEM os 2 perdidos), lost=2 =>
 * progresso = 3/5 = 60%.
 *
 * "Cards em aberto" (sem ganho e sem perda), se algum dia a UI quiser
 * mostrar, é `active_count - done_count` — não é um campo separado.
 */
export interface ProjectProgressInput {
  done_count: number;
  active_count: number;
  has_won_stage: boolean;
}

/**
 * Regra de borda — é a que vira print no grupo se for esquecida:
 * `null` quando não há como calcular um percentual com sentido:
 *   - nenhuma frente do projeto tem etapa marcada como `is_won` ainda
 *     (`has_won_stage === false`), OU
 *   - não há NENHUM card não-perdido pra servir de denominador
 *     (`active_count === 0`) — inclui "projeto sem frente nenhuma" e
 *     "projeto só com cards perdidos".
 * A UI mostra "—" pra `null`. NUNCA 0%, NUNCA 100%, NUNCA NaN.
 */
export function projectProgressPct(r: ProjectProgressInput): number | null {
  if (!r.has_won_stage || r.active_count === 0) return null;
  return Math.round((r.done_count / r.active_count) * 100);
}
