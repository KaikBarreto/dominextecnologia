import { describe, it, expect } from 'vitest';
import {
  computeFactorDeltas,
  describeEvolution,
  EVOLUTION_THRESHOLD,
  type EvolutionMessages,
} from './evolution';
import type { DiscScores } from './scoring';
import type { DiscFactor } from './questions';

// Fragmentos i18n mínimos (pt-br-like) para os testes.
const M: EvolutionMessages = {
  intro: 'Comparando com a avaliação anterior:',
  stable: 'Seu perfil se manteve estável.',
  profileChanged: 'Seu estilo evoluiu de {from} para {to}.',
  profileSame: 'Você seguiu com o estilo {profile}.',
  and: ' e ',
  up: {
    D: 'sua {factor} subiu',
    I: 'sua {factor} subiu',
    S: 'sua {factor} subiu',
    C: 'sua {factor} subiu',
  },
  down: {
    D: 'sua {factor} recuou',
    I: 'sua {factor} recuou',
    S: 'sua {factor} recuou',
    C: 'sua {factor} recuou',
  },
};

const FACTOR_NAME: Record<DiscFactor, string> = {
  D: 'Dominância',
  I: 'Influência',
  S: 'Estabilidade',
  C: 'Conformidade',
};
const factorName = (f: DiscFactor) => FACTOR_NAME[f];
const PROFILE_NAME: Record<string, string> = { CS: 'Analista', CI: 'Preciso', D: 'Dominante' };
const profileName = (code: string) => PROFILE_NAME[code] ?? code;

describe('computeFactorDeltas', () => {
  it('classifica subida, queda e estabilidade pelo limiar', () => {
    const prev: DiscScores = { D: 40, I: 50, S: 60, C: 70 };
    const curr: DiscScores = {
      D: 40 + EVOLUTION_THRESHOLD, // subiu
      I: 50 - EVOLUTION_THRESHOLD, // caiu
      S: 63, // dentro do limiar → estável
      C: 70, // igual → estável
    };
    const deltas = computeFactorDeltas(prev, curr);
    const byFactor = Object.fromEntries(deltas.map((d) => [d.factor, d.direction]));
    expect(byFactor.D).toBe('up');
    expect(byFactor.I).toBe('down');
    expect(byFactor.S).toBe('stable');
    expect(byFactor.C).toBe('stable');
  });
});

describe('describeEvolution', () => {
  it('descreve subida e menciona a mudança de perfil', () => {
    const prev: DiscScores = { D: 30, I: 40, S: 50, C: 60 };
    const curr: DiscScores = { D: 50, I: 40, S: 50, C: 60 };
    const text = describeEvolution(prev, curr, 'CS', 'CI', M, factorName, profileName);
    expect(text).toContain('Dominância');
    expect(text).toContain('subiu');
    expect(text).toContain('de Analista para Preciso');
  });

  it('usa a frase estável quando nada passa do limiar', () => {
    const prev: DiscScores = { D: 50, I: 50, S: 50, C: 50 };
    const curr: DiscScores = { D: 52, I: 48, S: 51, C: 49 };
    const text = describeEvolution(prev, curr, 'CS', 'CS', M, factorName, profileName);
    expect(text).toContain('estável');
    expect(text).toContain('Você seguiu com o estilo Analista');
  });

  it('destaca no máximo 2 fatores, os de maior variação', () => {
    const prev: DiscScores = { D: 20, I: 20, S: 20, C: 20 };
    const curr: DiscScores = { D: 90, I: 80, S: 40, C: 45 }; // D e I são as maiores subidas
    const text = describeEvolution(prev, curr, null, null, M, factorName, profileName);
    expect(text).toContain('Dominância');
    expect(text).toContain('Influência');
    // S e C também subiram além do limiar, mas não devem aparecer (limite 2).
    expect(text).not.toContain('Estabilidade');
    expect(text).not.toContain('Conformidade');
  });

  it('junta 2 fatores com o conector "e"', () => {
    const prev: DiscScores = { D: 20, I: 20, S: 50, C: 50 };
    const curr: DiscScores = { D: 40, I: 40, S: 50, C: 50 };
    const text = describeEvolution(prev, curr, null, null, M, factorName, profileName);
    expect(text).toMatch(/ e /);
  });
});
