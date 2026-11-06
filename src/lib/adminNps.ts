import { calculateNps, classifyNps, type NpsClassification } from '@/hooks/useServiceRatings';
import { companyHasSegment } from '@/utils/companySegments';

export type AdminAudienceCompany = {
  id: string;
  name: string;
  subscription_status: string | null;
  subscription_plan: string | null;
  segment: string | null;
  segments?: string[] | null;
};

export type AdminNpsAudienceFilters = {
  status: string;
  plan: string;
  segment: string;
};

export type AdminNpsResponseMetric = {
  score: number;
  is_enjoying: boolean;
  feedback?: string | null;
};

export function filterAudienceCompanies(
  companies: AdminAudienceCompany[],
  filters: AdminNpsAudienceFilters,
): AdminAudienceCompany[] {
  return companies.filter((company) => {
    if (filters.status && company.subscription_status !== filters.status) return false;
    if (filters.plan && company.subscription_plan !== filters.plan) return false;
    if (filters.segment && !companyHasSegment(company.segments, filters.segment, company.segment)) return false;
    return true;
  });
}
export function uniqueSorted(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim()))))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export function buildAudienceSnapshot(
  filters: AdminNpsAudienceFilters,
  companyCount: number,
): Record<string, string | number> {
  return {
    modo: 'filtros',
    status: filters.status || 'todos',
    plano: filters.plan || 'todos',
    segmento: filters.segment || 'todos',
    empresas_materializadas: companyCount,
  };
}

export function getAdminNpsMetrics(responses: AdminNpsResponseMetric[]) {
  const nps = calculateNps(responses.map((response) => ({ nps_score: response.score })));
  const enjoyingYes = responses.filter((response) => response.is_enjoying).length;
  const enjoyingNo = responses.length - enjoyingYes;
  const feedbackCount = responses.filter((response) => Boolean(response.feedback?.trim())).length;

  return {
    ...nps,
    enjoyingYes,
    enjoyingNo,
    feedbackCount,
    enjoyingPercent: responses.length ? Math.round((enjoyingYes / responses.length) * 100) : 0,
  };
}

export function adminNpsClassification(score: number): NpsClassification {
  return classifyNps(score);
}

