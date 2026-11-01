import { describe, expect, it } from 'vitest';
import {
  buildAudienceSnapshot,
  filterAudienceCompanies,
  getAdminNpsMetrics,
  type AdminAudienceCompany,
} from './adminNps';

const companies: AdminAudienceCompany[] = [
  { id: '1', name: 'Alfa', subscription_status: 'active', subscription_plan: 'pro', segment: 'HVAC' },
  { id: '2', name: 'Beta', subscription_status: 'testing', subscription_plan: 'start', segment: 'HVAC' },
  { id: '3', name: 'Gama', subscription_status: 'active', subscription_plan: 'pro', segment: 'Elétrica' },
];

describe('segmentação materializada do NPS administrativo', () => {
  it('combina status, plano e segmento sem incluir empresas fora do recorte', () => {
    expect(filterAudienceCompanies(companies, { status: 'active', plan: 'pro', segment: 'HVAC' }))
      .toEqual([companies[0]]);
  });

  it('sem filtros materializa a base inteira e registra a contagem no snapshot', () => {
    const filtered = filterAudienceCompanies(companies, { status: '', plan: '', segment: '' });
    expect(filtered).toHaveLength(3);
    expect(buildAudienceSnapshot({ status: '', plan: '', segment: '' }, filtered.length))
      .toMatchObject({ empresas_materializadas: 3, status: 'todos', plano: 'todos' });
  });
});
describe('métricas do NPS administrativo', () => {
  it('calcula NPS, satisfação e comentários pela mesma base de respostas', () => {
    const result = getAdminNpsMetrics([
      { score: 10, is_enjoying: true, feedback: 'Ótimo' },
      { score: 8, is_enjoying: true, feedback: null },
      { score: 2, is_enjoying: false, feedback: 'Precisa melhorar' },
    ]);

    expect(result).toMatchObject({ nps: 0, promoters: 1, passives: 1, detractors: 1 });
    expect(result.enjoyingPercent).toBe(67);
    expect(result.feedbackCount).toBe(2);
  });
});

