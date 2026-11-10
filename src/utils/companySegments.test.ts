import { describe, expect, it } from 'vitest';
import { companyHasSegment, normalizeCompanySegments } from './companySegments';
import { segmentsHaveTechTools } from '@/config/technicianArea';
import { getCatalogForSegments, segmentsHavePmocCatalog } from '@/data/checklistCatalog';

describe('segmentos da empresa', () => {
  it('usa o campo singular como fallback para empresas legadas', () => {
    expect(normalizeCompanySegments(undefined, 'refrigeracao')).toEqual(['refrigeracao']);
  });

  it('preserva a ordem e remove vazios e duplicados', () => {
    expect(normalizeCompanySegments([' refrigeracao ', 'manutencao', 'refrigeracao', '']))
      .toEqual(['refrigeracao', 'manutencao']);
  });

  it('reconhece qualquer segmento contratado, não apenas o primeiro', () => {
    expect(companyHasSegment(['refrigeracao', 'manutencao'], 'manutencao', 'refrigeracao')).toBe(true);
  });

  it('libera ferramentas e catálogo pelo segmento adicional', () => {
    const segments = ['manutencao', 'refrigeracao'];
    expect(segmentsHaveTechTools(segments)).toBe(true);
    expect(segmentsHavePmocCatalog(segments)).toBe(true);
    expect(getCatalogForSegments(segments).some((template) => template.id.startsWith('ref-'))).toBe(true);
  });
});
