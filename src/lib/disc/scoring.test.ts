import { describe, it, expect } from 'vitest';
import {
  computeScores,
  classify,
  scoreAndClassify,
  FACTOR_ANGLE,
  type DiscScores,
} from './scoring';
import { DISC_ITEMS } from './questions';
import { selectFormItems, FORM_ITEMS_PER_FACTOR, FORM_TOTAL_ITEMS } from './formSelection';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Responde todos os itens do subconjunto fornecido com o mesmo valor Likert.
 * Usado para testar a normalização dinâmica: qualquer tamanho de subconjunto
 * deve produzir o mesmo escore para o mesmo valor Likert.
 */
function answerSubset(items: readonly { id: string; reverse: boolean }[], value: number): Record<string, number> {
  return Object.fromEntries(items.map((item) => [item.id, value]));
}

/**
 * Responde todos os 48 itens do banco com o mesmo valor Likert.
 */
function answerAll(value: number): Record<string, number> {
  return Object.fromEntries(DISC_ITEMS.map((item) => [item.id, value]));
}

/**
 * Responde de forma a MAXIMIZAR cada fator em um subconjunto:
 * 5 nos itens diretos, 1 nos reverse → todo fator vai para 100.
 */
function answerMaxSubset(items: readonly { id: string; reverse: boolean }[]): Record<string, number> {
  return Object.fromEntries(
    items.map((item) => [item.id, item.reverse ? 1 : 5]),
  );
}

/**
 * Responde de forma a MAXIMIZAR todos os 48 itens do banco.
 */
function answerMaxAllFactors(): Record<string, number> {
  return Object.fromEntries(
    DISC_ITEMS.map((item) => [item.id, item.reverse ? 1 : 5]),
  );
}

// ── Sanidade do banco de itens (48 itens, 12 por fator) ───────────────────────

describe('DISC_ITEMS — mapa canônico (banco completo)', () => {
  it('tem 48 itens, 12 por fator', () => {
    expect(DISC_ITEMS).toHaveLength(48);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(DISC_ITEMS.filter((i) => i.factor === f)).toHaveLength(12);
    }
  });

  it('tem exatamente 3 reverse por fator (d6/d7/d11, i6/i7/i11, s6/s7/s11, c6/c7/c11)', () => {
    const reverseIds = DISC_ITEMS.filter((i) => i.reverse).map((i) => i.id).sort();
    expect(reverseIds).toEqual(
      ['c6', 'c7', 'c11', 'd6', 'd7', 'd11', 'i6', 'i7', 'i11', 's6', 's7', 's11'].sort(),
    );
  });
});

// ── selectFormItems — sorteio determinístico ──────────────────────────────────

describe('selectFormItems', () => {
  it(`retorna ${FORM_TOTAL_ITEMS} itens (${FORM_ITEMS_PER_FACTOR} por fator)`, () => {
    const items = selectFormItems('abc123');
    expect(items).toHaveLength(FORM_TOTAL_ITEMS);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(items.filter((i) => i.factor === f)).toHaveLength(FORM_ITEMS_PER_FACTOR);
    }
  });

  it('é determinístico: mesmo seed → mesmo resultado', () => {
    const a = selectFormItems('seed-fixo-abc');
    const b = selectFormItems('seed-fixo-abc');
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
  });

  it('seeds diferentes → subconjuntos/ordens diferentes', () => {
    const a = selectFormItems('seed-um-xyz');
    const b = selectFormItems('seed-dois-xyz');
    // É altamente improvável (astronomicamente) que a ordem seja idêntica
    expect(a.map((i) => i.id)).not.toEqual(b.map((i) => i.id));
  });

  it('todos os itens retornados pertencem ao banco canônico', () => {
    const ids = new Set(DISC_ITEMS.map((i) => i.id));
    const items = selectFormItems('qualquer-seed');
    for (const item of items) {
      expect(ids.has(item.id)).toBe(true);
    }
  });

  it('não repete itens dentro do mesmo formulário', () => {
    const items = selectFormItems('no-repeat-seed');
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('perFactor customizado funciona (ex.: 5 por fator = 20 total)', () => {
    const items = selectFormItems('custom-per-factor', 5);
    expect(items).toHaveLength(20);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(items.filter((i) => i.factor === f)).toHaveLength(5);
    }
  });
});

// ── computeScores — normalização dinâmica ─────────────────────────────────────

describe('computeScores — normalização dinâmica', () => {
  it('subconjunto de 7/fator: todos "3" → 60 em cada fator', () => {
    // n=7, Likert 3 direto=3, reverse 3→3 (6−3=3). Soma=7×3=21. max=7×5=35.
    // round(100×21/35) = round(60) = 60.
    const items = selectFormItems('test-3-seed');
    const answers = answerSubset(items, 3);
    expect(computeScores(answers)).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });

  it('banco completo (12/fator): todos "3" → 60 em cada fator', () => {
    // n=12, soma=12×3=36. max=12×5=60. round(100×36/60)=60.
    // Mesmo resultado: normalização dinâmica elimina o viés de tamanho.
    expect(computeScores(answerAll(3))).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });

  it('subconjunto 7/fator maximizado → 100 em cada fator', () => {
    const items = selectFormItems('max-seed-test');
    const answers = answerMaxSubset(items);
    expect(computeScores(answers)).toEqual({ D: 100, I: 100, S: 100, C: 100 });
  });

  it('banco completo maximizado → 100 em cada fator', () => {
    expect(computeScores(answerMaxAllFactors())).toEqual({ D: 100, I: 100, S: 100, C: 100 });
  });

  it('subconjunto 7/fator com todos "5": reverse puxa pra baixo', () => {
    // Para 7 itens com 2 reverse (d6,d7 / i6,i7 / s6,s7 / c6,c7):
    // diretos=5 (5 itens × 5 = 25), reverse=1 (2 itens × 1 = 2) → soma=27, max=35
    // round(100×27/35) = round(77.14) = 77
    // OBS: selectFormItems pode não incluir os 2 reverse de cada fator.
    // Testamos com resposta 5 em todos para verificar que o score é < 100.
    const items = selectFormItems('all-five-seed');
    const answers = answerSubset(items, 5);
    const scores = computeScores(answers);
    // Todos os fatores devem estar abaixo de 100 (reverse puxa pra baixo)
    // e acima de 50 (maioria dos itens é direto, 5 é o máximo)
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(scores[f]).toBeGreaterThan(50);
      expect(scores[f]).toBeLessThan(100);
    }
  });

  it('banco completo com todos "5": 9 diretos × 5 + 3 reverse × 1 = 48 bruto, max=60 → 80', () => {
    // 12 itens/fator, 3 reverse cada. 9×5 + 3×1 = 48. max=12×5=60.
    // round(100×48/60) = round(80) = 80.
    expect(computeScores(answerAll(5))).toEqual({ D: 80, I: 80, S: 80, C: 80 });
  });

  it('banco completo com todos "1": 9 diretos × 1 + 3 reverse × 5 = 24, max=60 → 40', () => {
    // 9×1 + 3×5 = 24. max=60. round(100×24/60) = 40.
    expect(computeScores(answerAll(1))).toEqual({ D: 40, I: 40, S: 40, C: 40 });
  });

  it('trata reverse corretamente: item reverse com resposta 5 vira 1 na soma', () => {
    // Só d6 (reverse) respondido com 5. Effective = 6−5 = 1.
    // n=1, max=1×5=5. round(100×1/5) = 20.
    const scores = computeScores({ d6: 5 });
    expect(scores.D).toBe(20);
  });

  it('item direto com resposta 5: effective=5, n=1, max=5 → 100', () => {
    const scores = computeScores({ d1: 5 });
    expect(scores.D).toBe(100);
  });

  it('item direto com resposta 1: effective=1, n=1, max=5 → 20', () => {
    const scores = computeScores({ d1: 1 });
    expect(scores.D).toBe(20);
  });

  it('respostas ausentes não influenciam (max calculado só sobre respondidos)', () => {
    // Só d1 respondido com 3. n=1, max=5. round(100×3/5)=60.
    const scores = computeScores({ d1: 3 });
    expect(scores.D).toBe(60);
    expect(scores.I).toBe(0);
    expect(scores.S).toBe(0);
    expect(scores.C).toBe(0);
  });

  it('respostas ausentes (objeto vazio) → tudo 0', () => {
    expect(computeScores({})).toEqual({ D: 0, I: 0, S: 0, C: 0 });
  });

  it('clampa respostas fora da faixa (0→trata como 1; 9→trata como 5)', () => {
    expect(computeScores(answerAll(9))).toEqual(computeScores(answerAll(5)));
    expect(computeScores(answerAll(0))).toEqual(computeScores(answerAll(1)));
  });

  it('normalização é invariante ao tamanho do subconjunto (3 vs 7 vs 12/fator)', () => {
    // Responde 3, 7 e 12 itens/fator, todos com valor 3 (neutro).
    // Resultado esperado: 60 em todos os cenários.
    const fators = ['D', 'I', 'S', 'C'] as const;

    // 3 itens por fator (primeiros 3 de cada)
    const items3: Record<string, number> = {};
    for (const f of fators) {
      const fItems = DISC_ITEMS.filter((i) => i.factor === f).slice(0, 3);
      for (const item of fItems) items3[item.id] = 3;
    }
    expect(computeScores(items3)).toEqual({ D: 60, I: 60, S: 60, C: 60 });

    // 7 itens por fator
    const items7: Record<string, number> = {};
    for (const f of fators) {
      const fItems = DISC_ITEMS.filter((i) => i.factor === f).slice(0, 7);
      for (const item of fItems) items7[item.id] = 3;
    }
    expect(computeScores(items7)).toEqual({ D: 60, I: 60, S: 60, C: 60 });

    // 12 itens por fator (banco completo)
    expect(computeScores(answerAll(3))).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });
});

// ── classify — perfil ─────────────────────────────────────────────────────────

describe('classify — profileCode', () => {
  it('D=82, C=71, I=45, S=38 → combinado "DC" (gap 11, secundário alto)', () => {
    const c = classify({ D: 82, I: 45, S: 38, C: 71 });
    expect(c.primary).toBe('D');
    expect(c.secondary).toBe('C');
    expect(c.profileCode).toBe('DC');
    expect(c.isPure).toBe(false);
  });

  it('perfil puro: um fator alto, resto baixo → 1 letra', () => {
    // gap 90−40=50 (≥15) e secundário 40 (<55) → puro "D"
    const c = classify({ D: 90, I: 40, S: 35, C: 30 });
    expect(c.profileCode).toBe('D');
    expect(c.isPure).toBe(true);
  });

  it('não é puro se o secundário for alto mesmo com gap grande', () => {
    // gap 90−70=20 (≥15) MAS secundário 70 (≥55) → combinado "DI"
    const c = classify({ D: 90, I: 70, S: 35, C: 30 });
    expect(c.profileCode).toBe('DI');
    expect(c.isPure).toBe(false);
  });

  it('empate primário↔secundário vira combinado (2 letras, não puro)', () => {
    // D e I empatados em 80 → não é puro; desempate canônico D antes de I
    const c = classify({ D: 80, I: 80, S: 30, C: 25 });
    expect(c.primary).toBe('D');
    expect(c.secondary).toBe('I');
    expect(c.profileCode).toBe('DI');
    expect(c.isPure).toBe(false);
  });

  it('desempate é determinístico pela ordem canônica D→I→S→C', () => {
    const c = classify({ D: 60, I: 60, S: 60, C: 60 });
    expect(c.primary).toBe('D');
    expect(c.secondary).toBe('I');
  });

  it('exemplo CD: C mais alto, D segundo → "CD"', () => {
    const c = classify({ D: 68, I: 30, S: 25, C: 88 });
    expect(c.profileCode).toBe('CD');
  });
});

// ── classify — roda (blendAngle / intensity) ─────────────────────────────────

describe('classify — blendAngle', () => {
  it('só D alto aponta pro topo (270°)', () => {
    const c = classify({ D: 100, I: 0, S: 0, C: 0 });
    expect(c.blendAngle).toBeCloseTo(FACTOR_ANGLE.D, 1); // 270
  });

  it('só I alto aponta pra direita (0°)', () => {
    const c = classify({ D: 0, I: 100, S: 0, C: 0 });
    expect(c.blendAngle).toBeCloseTo(FACTOR_ANGLE.I, 1); // 0
  });

  it('só S alto aponta pra baixo (90°)', () => {
    const c = classify({ D: 0, I: 0, S: 100, C: 0 });
    expect(c.blendAngle).toBeCloseTo(FACTOR_ANGLE.S, 1); // 90
  });

  it('só C alto aponta pra esquerda (180°)', () => {
    const c = classify({ D: 0, I: 0, S: 0, C: 100 });
    expect(c.blendAngle).toBeCloseTo(FACTOR_ANGLE.C, 1); // 180
  });

  it('D+I iguais → diagonal superior-direita (~315°)', () => {
    // vetor (270°=cima) + (0°=direita) → 315° em convenção horária SVG
    const c = classify({ D: 100, I: 100, S: 0, C: 0 });
    expect(c.blendAngle).toBeCloseTo(315, 1);
  });

  it('escores todos iguais → default estável (topo/270°)', () => {
    const c = classify({ D: 50, I: 50, S: 50, C: 50 });
    expect(c.blendAngle).toBe(FACTOR_ANGLE.D);
  });
});

describe('classify — intensity', () => {
  it('tudo em 50 → intensidade 0 (centro/adaptável)', () => {
    expect(classify({ D: 50, I: 50, S: 50, C: 50 }).intensity).toBe(0);
  });

  it('escores nos extremos (100/0/0/0) → intensidade máxima 1', () => {
    // dist média = (50+50+50+50)/4 = 50 → 50/50 = 1
    expect(classify({ D: 100, I: 0, S: 0, C: 0 }).intensity).toBe(1);
  });

  it('todos em 0 → intensidade 1 (distância 50 da média)', () => {
    expect(classify({ D: 0, I: 0, S: 0, C: 0 }).intensity).toBe(1);
  });

  it('perfil moderado (60/55/45/40) → intensidade baixa e < 1', () => {
    // dist = (10+5+5+10)/4 = 7.5 → 7.5/50 = 0.15
    expect(classify({ D: 60, I: 55, S: 45, C: 40 }).intensity).toBeCloseTo(0.15, 3);
  });
});

// ── scoreAndClassify — integração ────────────────────────────────────────────

describe('scoreAndClassify', () => {
  it('maximizando D e minimizando o resto no subconjunto sorteado → puro "D"', () => {
    const items = selectFormItems('integration-seed');
    const answers: Record<string, number> = {};
    for (const item of items) {
      if (item.factor === 'D') {
        answers[item.id] = item.reverse ? 1 : 5; // maximiza D → 100
      } else {
        answers[item.id] = item.reverse ? 5 : 1; // minimiza os outros → 20
      }
    }
    const { scores, classification } = scoreAndClassify(answers);
    expect(scores.D).toBe(100);
    expect(scores.I).toBeLessThan(scores.D);
    expect(classification.primary).toBe('D');
    expect(classification.isPure).toBe(true);
    expect(classification.profileCode).toBe('D');
  });

  it('maximizando D e minimizando o resto no banco completo → puro "D"', () => {
    const answers: Record<string, number> = {};
    for (const item of DISC_ITEMS) {
      if (item.factor === 'D') {
        answers[item.id] = item.reverse ? 1 : 5;
      } else {
        answers[item.id] = item.reverse ? 5 : 1;
      }
    }
    const { scores, classification } = scoreAndClassify(answers);
    expect(scores.D).toBe(100);
    expect(scores.I).toBeLessThan(scores.D);
    expect(classification.primary).toBe('D');
    expect(classification.isPure).toBe(true);
    expect(classification.profileCode).toBe('D');
  });

  it('é determinístico: mesma entrada, mesma saída', () => {
    const a = answerAll(4);
    const first = scoreAndClassify(a);
    const second = scoreAndClassify(a);
    expect(first).toEqual(second);
  });
});
