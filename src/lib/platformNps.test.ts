import { describe, expect, it } from 'vitest';
import {
  isValidNpsScore,
  normalizePendingPlatformNps,
  shouldInviteToGoogle,
} from './platformNps';

const survey = {
  google_review_url: 'https://search.google.com/local/writereview?placeid=ficticio',
  google_review_min_score: 9,
};

describe('platformNps', () => {
  it('normaliza o retorno tabular da RPC', () => {
    expect(
      normalizePendingPlatformNps([
        {
          id: 'survey-1',
          title: 'Satisfação',
          enjoyment_question: 'Você está gostando?',
          recommendation_question: 'Quanto indicaria?',
        },
      ]),
    ).toMatchObject({ id: 'survey-1', description: null, google_review_url: null });
  });

  it('falha fechado para payload incompleto', () => {
    expect(normalizePendingPlatformNps([{ id: 'survey-1' }])).toBeNull();
    expect(normalizePendingPlatformNps([])).toBeNull();
  });

  it('aceita somente notas inteiras de 0 a 10', () => {
    expect(isValidNpsScore(0)).toBe(true);
    expect(isValidNpsScore(10)).toBe(true);
    expect(isValidNpsScore(-1)).toBe(false);
    expect(isValidNpsScore(8.5)).toBe(false);
    expect(isValidNpsScore(11)).toBe(false);
  });

  it('convida ao Google somente acima da nota mínima', () => {
    expect(shouldInviteToGoogle(survey, 8)).toBe(false);
    expect(shouldInviteToGoogle(survey, 9)).toBe(true);
  });

  it('trata nota mínima nula como sempre e URL inválida como desligado', () => {
    expect(shouldInviteToGoogle({ ...survey, google_review_min_score: null }, 0)).toBe(true);
    expect(shouldInviteToGoogle({ ...survey, google_review_url: 'javascript:alert(1)' }, 10)).toBe(false);
  });
});
