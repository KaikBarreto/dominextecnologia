import { describe, expect, it } from 'vitest';
import catalog from './daikinCatalog.json';
import errors from './daikinErrorCodeReferences.json';
import { equipmentAssetUrl, getEquipmentAssetReference } from './equipmentCatalogAssets';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { slugify } from '@/lib/slugify';

const models = catalog.models as unknown as EquipmentModel[];
const byCode = new Map(models.map(model => [model.code, model]));

describe('catálogo Daikin documentado', () => {
  it('cobre os domínios e mantém identidades, URLs e slugs únicos', () => {
    expect(models.length).toBeGreaterThan(1700);
    expect(new Set(models.map(model => model.id)).size).toBe(models.length);
    expect(new Set(models.map(model => `${model.domain}:${model.code}`)).size).toBe(models.length);
    expect(new Set(models.map(model => `${model.domain}:${slugify(model.name)}`)).size).toBe(models.length);
    for (const model of models) {
      expect(model.id).toMatch(/^[a-f0-9-]{36}$/);
      expect(model.brand_id).toBe(catalog.brand_id);
      expect(model.image_url).toMatch(/^https:\/\//);
      expect(model.catalog_reference?.source_url).toMatch(/^https:\/\/www\.daikin\.com\.br\//);
      expect(['text', 'visual', 'html']).toContain(model.catalog_reference?.proof_kind);
      expect(model.category?.id).toBe(model.category_id);
      if (model.manual_url) expect(model.catalog_reference?.pages.length).toBeGreaterThan(0);
    }
  });
  it('separa unidades físicas, combinações e séries sem inferir fluido/manual ausente', () => {
    expect(byCode.get('FTKC09T5VL')?.catalog_reference?.unit_kind).toBe('indoor');
    expect(models.filter(model => model.catalog_reference?.record_scope === 'combination').length).toBeGreaterThan(100);
    expect(byCode.get('WSC')?.catalog_reference?.record_scope).toBe('series');
    expect(byCode.get('WSC')?.manual_url).toBeNull();
    expect(byCode.get('RZR30AVL')?.manual_url).toBeNull();
    expect(byCode.get('RZR30AVL')?.refrigerant).toBeNull();
    const purifiers = models.filter(model => model.domain === 'linha_branca');
    expect(purifiers).toHaveLength(8);
    for (const model of purifiers) {
      expect(model.refrigerant).toBeNull();
      expect(model.consumo_kwh_mes).toBeNull();
      expect(model.name).not.toMatch(/BTU/);
    }
  });
  it('preserva a transcrição visual F/E e identifica ilustrações sem chamá-las de fotos', () => {
    expect(byCode.has('HXEV490DSTGF/F2612-JH-2/C2612-MK-2')).toBe(true);
    expect(byCode.has('HXEV490TSTGF/F3012-JH-2/C2612-MK-2')).toBe(true);
    expect(byCode.has('HXEV490DSTGF/E2612-JH-2/C2612-MK-2')).toBe(false);
    let illustrations = 0;
    for (const model of models) {
      const reference = getEquipmentAssetReference(model, 'image_url');
      expect(reference?.scope).toBe('family');
      expect(equipmentAssetUrl(reference!)).toBe(model.image_url);
      if (reference?.image_kind === 'technical_illustration') illustrations++;
    }
    expect(illustrations).toBe(13);
  });
  it('só vincula tabelas complementares aos códigos realmente cadastrados', () => {
    for (const reference of errors.references) {
      expect(reference.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(reference.codes.length).toBeGreaterThan(0);
      for (const code of reference.coveredCodes) expect(byCode.has(code), code).toBe(true);
    }
  });
});
