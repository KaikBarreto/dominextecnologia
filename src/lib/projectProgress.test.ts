import { describe, it, expect } from 'vitest';
import { projectProgressPct, type ProjectProgressInput } from './projectProgress';

describe('projectProgressPct', () => {
  it('sem card nenhum (projeto novo, sem frente) => "—" (null), nunca 0%', () => {
    const r: ProjectProgressInput = { done_count: 0, active_count: 0, has_won_stage: false };
    expect(projectProgressPct(r)).toBeNull();
  });

  it('só cards perdidos => "—" (active_count é 0 porque perdido não entra no denominador)', () => {
    const r: ProjectProgressInput = { done_count: 0, active_count: 0, has_won_stage: true };
    expect(projectProgressPct(r)).toBeNull();
  });

  it('nenhuma etapa is_won configurada em nenhuma frente => "—", mesmo com cards abertos', () => {
    const r: ProjectProgressInput = { done_count: 0, active_count: 4, has_won_stage: false };
    expect(projectProgressPct(r)).toBeNull();
  });

  it('tudo concluído => 100%', () => {
    const r: ProjectProgressInput = { done_count: 5, active_count: 5, has_won_stage: true };
    expect(projectProgressPct(r)).toBe(100);
  });

  it('misto (exemplo real da prova do banco): 3 concluídos, 2 perdidos, 2 abertos => 60%', () => {
    // done=3, active=5 (3 ganhos + 2 abertos — os 2 perdidos NÃO entram), lost=2.
    const r: ProjectProgressInput = { done_count: 3, active_count: 5, has_won_stage: true };
    expect(projectProgressPct(r)).toBe(60);
  });

  it('NUNCA divide por (done_count + active_count) — provaria 38%, não 60%', () => {
    const r: ProjectProgressInput = { done_count: 3, active_count: 5, has_won_stage: true };
    const wrongFormula = Math.round((r.done_count / (r.done_count + r.active_count)) * 100);
    expect(wrongFormula).toBe(38); // a fórmula errada daria isto
    expect(projectProgressPct(r)).not.toBe(wrongFormula);
    expect(projectProgressPct(r)).toBe(60);
  });

  it('arredonda o percentual (ex: 1/3 => 33%)', () => {
    const r: ProjectProgressInput = { done_count: 1, active_count: 3, has_won_stage: true };
    expect(projectProgressPct(r)).toBe(33);
  });
});
