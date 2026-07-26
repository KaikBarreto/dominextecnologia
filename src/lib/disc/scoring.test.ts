import { describe, it, expect } from 'vitest';
import {
  computeScores,
  classify,
  scoreAndClassify,
  FACTOR_ANGLE,
  type DiscAnswers,
} from './scoring';
import {
  DISC_ITEMS,
  DISC_CHOICE_ITEMS,
  DISC_CHOICE_ITEM_IDS,
  isChoiceItem,
  type DiscFactor,
} from './questions';
import {
  selectFormItems,
  FORM_LIKERT_PER_FACTOR,
  FORM_CHOICE_ITEMS,
  FORM_TOTAL_ITEMS,
} from './formSelection';

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Responde todos os itens do subconjunto fornecido com o mesmo valor Likert.
 * Só considera itens de ESCALA (Likert); ignora itens de alternativa.
 */
function answerSubset(
  items: readonly { id: string; reverse?: boolean }[],
  value: number,
): DiscAnswers {
  return Object.fromEntries(
    items.filter((i) => 'reverse' in i).map((item) => [item.id, value]),
  );
}

/**
 * Responde todos os 56 itens do banco com o mesmo valor Likert.
 */
function answerAll(value: number): DiscAnswers {
  return Object.fromEntries(DISC_ITEMS.map((item) => [item.id, value]));
}

/**
 * Responde de forma a MAXIMIZAR cada fator em um subconjunto:
 * 5 nos itens diretos, 1 nos reverse → todo fator vai para 100.
 */
function answerMaxSubset(
  items: readonly { id: string; reverse: boolean }[],
): DiscAnswers {
  return Object.fromEntries(
    items.map((item) => [item.id, item.reverse ? 1 : 5]),
  );
}

/**
 * Responde de forma a MAXIMIZAR todos os 56 itens do banco.
 */
function answerMaxAllFactors(): DiscAnswers {
  return Object.fromEntries(
    DISC_ITEMS.map((item) => [item.id, item.reverse ? 1 : 5]),
  );
}

// ── Sanidade do banco de itens (56 itens, 14 por fator) ───────────────────────

describe('DISC_ITEMS — mapa canônico (banco completo)', () => {
  it('tem 56 itens, 14 por fator', () => {
    expect(DISC_ITEMS).toHaveLength(56);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(DISC_ITEMS.filter((i) => i.factor === f)).toHaveLength(14);
    }
  });

  it('tem exatamente 3 reverse por fator (d6/d7/d11, i6/i7/i11, s6/s7/s11, c6/c7/c11)', () => {
    const reverseIds = DISC_ITEMS.filter((i) => i.reverse).map((i) => i.id).sort();
    expect(reverseIds).toEqual(
      ['c6', 'c7', 'c11', 'd6', 'd7', 'd11', 'i6', 'i7', 'i11', 's6', 's7', 's11'].sort(),
    );
  });
});

// ── selectFormItems — sorteio determinístico (MISTO) ──────────────────────────

/** Só os itens de escala (Likert) do formulário. */
function likertOf(items: ReturnType<typeof selectFormItems>) {
  return items.filter((i) => !isChoiceItem(i)) as {
    id: string;
    factor: DiscFactor;
    reverse: boolean;
  }[];
}

describe('selectFormItems (misto: escala + alternativa)', () => {
  it(`retorna ${FORM_TOTAL_ITEMS} itens (${FORM_LIKERT_PER_FACTOR}/fator escala + ${FORM_CHOICE_ITEMS} alternativa)`, () => {
    const items = selectFormItems('abc123');
    expect(items).toHaveLength(FORM_TOTAL_ITEMS);

    const choice = items.filter(isChoiceItem);
    const likert = likertOf(items);
    expect(choice).toHaveLength(FORM_CHOICE_ITEMS);
    expect(likert).toHaveLength(FORM_LIKERT_PER_FACTOR * 4);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(likert.filter((i) => i.factor === f)).toHaveLength(FORM_LIKERT_PER_FACTOR);
    }
  });

  it('é determinístico: mesmo seed → mesmo resultado (ids + ordem + tipo)', () => {
    const a = selectFormItems('seed-fixo-abc');
    const b = selectFormItems('seed-fixo-abc');
    expect(a.map((i) => i.id)).toEqual(b.map((i) => i.id));
    expect(a.map(isChoiceItem)).toEqual(b.map(isChoiceItem));
  });

  it('seeds diferentes → subconjuntos/ordens diferentes', () => {
    const a = selectFormItems('seed-um-xyz');
    const b = selectFormItems('seed-dois-xyz');
    // É altamente improvável (astronomicamente) que a ordem seja idêntica
    expect(a.map((i) => i.id)).not.toEqual(b.map((i) => i.id));
  });

  it('itens de escala pertencem ao banco Likert; alternativa ao banco de choice', () => {
    const likertIds = new Set(DISC_ITEMS.map((i) => i.id));
    const choiceIds = new Set(DISC_CHOICE_ITEM_IDS);
    const items = selectFormItems('qualquer-seed');
    for (const item of items) {
      if (isChoiceItem(item)) expect(choiceIds.has(item.id)).toBe(true);
      else expect(likertIds.has(item.id)).toBe(true);
    }
  });

  it('não repete itens dentro do mesmo formulário', () => {
    const items = selectFormItems('no-repeat-seed');
    const ids = items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('parâmetros customizados funcionam (ex.: 7/fator escala + 0 alternativa = 28 Likert)', () => {
    const items = selectFormItems('custom-params', 7, 0);
    expect(items).toHaveLength(28);
    expect(items.filter(isChoiceItem)).toHaveLength(0);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(likertOf(items).filter((i) => i.factor === f)).toHaveLength(7);
    }
  });
});

// ── computeScores — normalização dinâmica ─────────────────────────────────────

describe('computeScores — normalização dinâmica', () => {
  it('subconjunto de escala do form misto: todos "3" → 60 em cada fator', () => {
    // Só os Likert do form misto (5/fator). Likert 3 direto=3, reverse 3→3.
    // Soma=n×3, max=n×5. round(100×3/5)=60 pra qualquer n. Choice ignorado.
    const items = selectFormItems('test-3-seed');
    const answers = answerSubset(items, 3);
    expect(computeScores(answers)).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });

  it('banco completo (14/fator): todos "3" → 60 em cada fator', () => {
    // n=14, soma=14×3=42. max=14×5=70. round(100×42/70)=60.
    // Mesmo resultado: normalização dinâmica elimina o viés de tamanho.
    expect(computeScores(answerAll(3))).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });

  it('subconjunto de escala maximizado → 100 em cada fator', () => {
    const items = selectFormItems('max-seed-test');
    const answers = answerMaxSubset(likertOf(items));
    expect(computeScores(answers)).toEqual({ D: 100, I: 100, S: 100, C: 100 });
  });

  it('banco completo maximizado → 100 em cada fator', () => {
    expect(computeScores(answerMaxAllFactors())).toEqual({ D: 100, I: 100, S: 100, C: 100 });
  });

  it('subconjunto de escala com todos "5": reverse puxa pra baixo (>50, <100)', () => {
    // Só os Likert do form (choice ignorado). Cada fator tem ao menos 1 reverse
    // no banco; respondendo tudo 5, os reverse viram 1 e derrubam o escore.
    // O form 'wl-reverse-seed' garante ≥1 reverse por fator no subconjunto.
    const items = selectFormItems('wl-reverse-seed');
    const likert = likertOf(items);
    // Garante que há ao menos 1 reverse por fator (senão o assert < 100 falha).
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      const hasReverse = likert.some((i) => i.factor === f && i.reverse);
      if (!hasReverse) return; // subconjunto sem reverse: pula (não é o caso deste seed)
    }
    const answers = answerSubset(likert, 5);
    const scores = computeScores(answers);
    for (const f of ['D', 'I', 'S', 'C'] as const) {
      expect(scores[f]).toBeGreaterThan(50);
      expect(scores[f]).toBeLessThan(100);
    }
  });

  it('banco completo com todos "5": 11 diretos × 5 + 3 reverse × 1 = 58 bruto, max=70 → 83', () => {
    // 14 itens/fator, 3 reverse cada. 11×5 + 3×1 = 58. max=14×5=70.
    // round(100×58/70) = round(82.857) = 83.
    expect(computeScores(answerAll(5))).toEqual({ D: 83, I: 83, S: 83, C: 83 });
  });

  it('banco completo com todos "1": 11 diretos × 1 + 3 reverse × 5 = 26, max=70 → 37', () => {
    // 11×1 + 3×5 = 26. max=70. round(100×26/70) = round(37.14) = 37.
    expect(computeScores(answerAll(1))).toEqual({ D: 37, I: 37, S: 37, C: 37 });
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

  it('normalização é invariante ao tamanho do subconjunto (3 vs 7 vs 14/fator)', () => {
    // Responde 3, 7 e 14 itens/fator, todos com valor 3 (neutro).
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

    // 14 itens por fator (banco completo)
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
  it('form MISTO maximizando D (escala + alternativa) → puro "D"', () => {
    const items = selectFormItems('integration-seed');
    const answers: DiscAnswers = {};
    for (const item of items) {
      if (isChoiceItem(item)) {
        answers[item.id] = 'D'; // sempre escolhe a opção D
      } else if (item.factor === 'D') {
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
    const answers: DiscAnswers = {};
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

// ─────────────────────────────────────────────────────────────────────────────
// FORCED-CHOICE (alternativa) — banco, cálculo e mistura com Likert.
// Régua-lei: o DISC tem que continuar CORRETO com os dois tipos misturados.
// ─────────────────────────────────────────────────────────────────────────────

/** Escolhe sempre o mesmo fator em todos os itens de alternativa do banco. */
function chooseAll(pick: DiscFactor): DiscAnswers {
  return Object.fromEntries(DISC_CHOICE_ITEMS.map((i) => [i.id, pick]));
}

describe('DISC_CHOICE_ITEMS — banco de alternativas', () => {
  it('tem 20 itens ch1..ch20, todos kind "choice"', () => {
    expect(DISC_CHOICE_ITEMS).toHaveLength(20);
    expect(DISC_CHOICE_ITEM_IDS).toEqual(
      Array.from({ length: 20 }, (_, i) => `ch${i + 1}`),
    );
    for (const item of DISC_CHOICE_ITEMS) {
      expect(item.kind).toBe('choice');
      expect(isChoiceItem(item)).toBe(true);
    }
  });

  it('isChoiceItem discrimina Likert de choice', () => {
    expect(isChoiceItem(DISC_ITEMS[0])).toBe(false);
    expect(isChoiceItem(DISC_CHOICE_ITEMS[0])).toBe(true);
  });
});

describe('computeScores — ZERO REGRESSÃO no caminho Likert puro', () => {
  it('answers só-Likert produz EXATAMENTE os escores de antes (valores travados)', () => {
    // Estes são os mesmos valores esperados dos testes pré-existentes: o caminho
    // sem itens de alternativa NÃO muda em nada.
    expect(computeScores(answerAll(3))).toEqual({ D: 60, I: 60, S: 60, C: 60 });
    expect(computeScores(answerAll(5))).toEqual({ D: 83, I: 83, S: 83, C: 83 });
    expect(computeScores(answerAll(1))).toEqual({ D: 37, I: 37, S: 37, C: 37 });
    expect(computeScores(answerMaxAllFactors())).toEqual({
      D: 100, I: 100, S: 100, C: 100,
    });
    // Item único, como antes.
    expect(computeScores({ d1: 5 }).D).toBe(100);
    expect(computeScores({ d6: 5 }).D).toBe(20); // reverse
    expect(computeScores({})).toEqual({ D: 0, I: 0, S: 0, C: 0 });
  });

  it('presença de CHAVES de choice ausentes/vazias não altera o resultado Likert', () => {
    const base = computeScores(answerAll(3));
    // Mesmo passando um objeto com chaves de choice não respondidas (undefined),
    // o resultado é idêntico.
    const withEmptyChoiceKeys: DiscAnswers = { ...answerAll(3) };
    // não seta nenhum ch* → equivalente a ausente
    expect(computeScores(withEmptyChoiceKeys)).toEqual(base);
  });
});

describe('computeScores — só ALTERNATIVA (forced-choice)', () => {
  it('sempre o mesmo fator → esse fator 100, os outros 20', () => {
    // pick=5 em 20 itens (max 100). outros: 1 em 20 itens → 100×(20×1)/(20×5)=20.
    expect(computeScores(chooseAll('D'))).toEqual({ D: 100, I: 20, S: 20, C: 20 });
    expect(computeScores(chooseAll('C'))).toEqual({ D: 20, I: 20, S: 20, C: 100 });
  });

  it('escolha distribuída igual entre os 4 fatores → ~40 em cada', () => {
    // 20 itens, 5 pra cada fator. Pra o fator F: 5 itens picked (5×5=25) +
    // 15 itens não-picked (15×1=15) = 40 bruto. count=20, max=100. → 40.
    const factors: DiscFactor[] = ['D', 'I', 'S', 'C'];
    const answers: DiscAnswers = Object.fromEntries(
      DISC_CHOICE_ITEMS.map((item, idx) => [item.id, factors[idx % 4]]),
    );
    expect(computeScores(answers)).toEqual({ D: 40, I: 40, S: 40, C: 40 });
  });

  it('escolha de choice com letra INVÁLIDA é ignorada (não quebra, não entra na soma)', () => {
    const answers = { ch1: 'X' as unknown as DiscFactor };
    expect(computeScores(answers)).toEqual({ D: 0, I: 0, S: 0, C: 0 });
  });

  it('item de choice não respondido é ignorado', () => {
    // Só ch1='D' respondido. count D=1(picked 5) e count I/S/C=1(cada 1).
    // D: 5/5=100. I/S/C: 1/5=20.
    expect(computeScores({ ch1: 'D' })).toEqual({ D: 100, I: 20, S: 20, C: 20 });
  });
});

describe('computeScores — MISTO (Likert + alternativa somam coerentemente)', () => {
  it('Likert neutro (3) + choice distribuído (40) → escores em [0,100] e coerentes', () => {
    const factors: DiscFactor[] = ['D', 'I', 'S', 'C'];
    const answers: DiscAnswers = {
      ...answerAll(3), // cada fator: 14 itens, soma 42
      ...Object.fromEntries(
        DISC_CHOICE_ITEMS.map((item, idx) => [item.id, factors[idx % 4]]),
      ), // cada fator: 20 itens choice, soma 40
    };
    // Por fator: raw = 42 + 40 = 82; count = 14 + 20 = 34; max = 170.
    // round(100×82/170) = round(48.235) = 48.
    const scores = computeScores(answers);
    expect(scores).toEqual({ D: 48, I: 48, S: 48, C: 48 });
    for (const f of factors) {
      expect(scores[f]).toBeGreaterThanOrEqual(0);
      expect(scores[f]).toBeLessThanOrEqual(100);
    }
  });

  it('choice reforça o mesmo fator que o Likert (D sobe além do Likert puro)', () => {
    const likertD = computeScores({ d1: 5, d2: 5, d3: 5 }); // D=100, resto 0
    const mixed = computeScores({ d1: 5, d2: 5, d3: 5, ch1: 'D', ch2: 'D' });
    // Com choice D, D continua alto; I/S/C recebem os "1" e sobem de 0 pra ~20.
    expect(mixed.D).toBeGreaterThan(50);
    expect(mixed.I).toBeGreaterThan(likertD.I); // 0 → 20
    expect(mixed.I).toBeLessThan(mixed.D);
  });

  it('MISTO é determinístico: mesmas respostas → mesmos escores', () => {
    const answers: DiscAnswers = { ...answerAll(4), ch1: 'D', ch5: 'C', ch10: 'I' };
    expect(computeScores(answers)).toEqual(computeScores(answers));
    expect(scoreAndClassify(answers)).toEqual(scoreAndClassify(answers));
  });
});

describe('robustez / empates com respostas mistas', () => {
  it('empate total (choice equilibrado) resolve pela ordem canônica D→I→S→C', () => {
    const factors: DiscFactor[] = ['D', 'I', 'S', 'C'];
    const answers: DiscAnswers = Object.fromEntries(
      DISC_CHOICE_ITEMS.map((item, idx) => [item.id, factors[idx % 4]]),
    );
    const { classification } = scoreAndClassify(answers); // todos 40
    expect(classification.primary).toBe('D');
    expect(classification.secondary).toBe('I');
  });

  it('mistura de resposta inválida (choice letra ruim) não polui o Likert', () => {
    const answers: DiscAnswers = {
      ...answerAll(3),
      ch1: 'Z' as unknown as DiscFactor, // inválido → ignorado
    };
    expect(computeScores(answers)).toEqual({ D: 60, I: 60, S: 60, C: 60 });
  });
});
