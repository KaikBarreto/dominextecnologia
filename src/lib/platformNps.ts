export interface PlatformNpsSurvey {
  id: string;
  title: string;
  description: string | null;
  enjoyment_question: string;
  recommendation_question: string;
  feedback_prompt: string | null;
  google_review_url: string | null;
  google_review_min_score: number | null;
  starts_at: string | null;
  ends_at: string | null;
}
export interface SubmitPlatformNpsInput {
  surveyId: string;
  isEnjoying: boolean;
  score: number;
  feedback: string | null;
}

export interface SubmitPlatformNpsResult {
  responseId: string;
  surveyId: string;
  shouldInviteGoogle: boolean;
  googleReviewUrl: string | null;
}

/**
 * RPCs `RETURNS TABLE` chegam como array; uma eventual versão que devolva
 * `jsonb` chega como objeto. Normalizamos os dois formatos para a UI não
 * depender desse detalhe de transporte.
 */
export function normalizePendingPlatformNps(
  value: unknown,
): PlatformNpsSurvey | null {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row || typeof row !== 'object') return null;

  const candidate = row as Partial<PlatformNpsSurvey>;
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.title !== 'string' ||
    typeof candidate.enjoyment_question !== 'string' ||
    typeof candidate.recommendation_question !== 'string'
  ) {
    return null;
  }

  return {
    id: candidate.id,
    title: candidate.title,
    description: candidate.description ?? null,
    enjoyment_question: candidate.enjoyment_question,
    recommendation_question: candidate.recommendation_question,
    feedback_prompt: candidate.feedback_prompt ?? null,
    google_review_url: candidate.google_review_url ?? null,
    google_review_min_score:
      typeof candidate.google_review_min_score === 'number'
        ? candidate.google_review_min_score
        : null,
    starts_at: candidate.starts_at ?? null,
    ends_at: candidate.ends_at ?? null,
  };
}

export function isValidNpsScore(score: number | null): score is number {
  return Number.isInteger(score) && score >= 0 && score <= 10;
}

/**
 * O convite externo só aparece com URL http(s) válida e quando a nota passa a
 * régua configurada. `null` significa “mostrar para qualquer nota”.
 */
export function shouldInviteToGoogle(
  survey: Pick<PlatformNpsSurvey, 'google_review_url' | 'google_review_min_score'>,
  score: number,
): boolean {
  const url = survey.google_review_url?.trim() ?? '';
  if (!/^https?:\/\//i.test(url)) return false;
  if (!isValidNpsScore(score)) return false;

  const minimum = survey.google_review_min_score;
  return minimum === null || score >= minimum;
}

