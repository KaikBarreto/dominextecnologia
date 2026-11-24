import { describe, expect, it } from 'vitest';
import catalog from './additionalCatalog.json';
import errorTables from './additionalErrorCodeReferences.json';
import { getEquipmentAssetReference } from './equipmentCatalogAssets';
import { getEquipmentCodeReference } from './equipmentErrorCodeReferences';
import { organizeCatalog } from '@/lib/catalogOrganization';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import { slugify } from '@/lib/slugify';

const models = catalog.models as unknown as EquipmentModel[];
const normalize = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
const modelKey = (brand: string, code: string) => `${brand.toLowerCase()}:${normalize(code)}`;
const byIdentity = new Map(models.map(model => [modelKey(model.brand!.name, model.code!), model]));

describe('catálogo multimarcas com procedência documental', () => {
  it('preserva identidades únicas e separa configurações de unidades físicas', () => {
    expect(models.length).toBeGreaterThan(1900);
    expect(new Set(models.map(model => model.id)).size).toBe(models.length);
    expect(new Set(models.map(model => `${model.brand_id}:${model.domain}:${normalize(model.code!)}`)).size).toBe(models.length);
    expect(new Set(models.map(model => `${model.brand_id}:${model.domain}:${slugify(model.name)}`)).size).toBe(models.length);
    expect([...new Set(models.map(model => model.brand!.name))].sort()).toEqual(['Carrier', 'Gree', 'LG', 'Midea', 'Samsung', 'Springer']);
    for (const model of models) {
      const reference = model.catalog_reference!;
      expect(model.category?.id).toBe(model.category_id);
      expect(reference.source_url).toMatch(/^https:\/\//);
      expect(reference.source_sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(['model', 'series', 'combination', 'configuration']).toContain(reference.record_scope);
      expect(['text', 'visual', 'html']).toContain(reference.proof_kind);
      if (reference.source_kind === 'pdf') expect(reference.pages.length).toBeGreaterThan(0);
      expect(model.image_url).toMatch(/^https:\/\//);
    }
  });
  it('mantém provas de imagens familiares e não transforma página de produto em manual', () => {
    for (const model of models) {
      const image = getEquipmentAssetReference(model, 'image_url');
      if (image) expect(['exact', 'family']).toContain(image.scope);
      const manual = getEquipmentAssetReference(model, 'manual_url');
      if (model.catalog_reference?.source_kind === 'html' && !model.catalog_reference.pages.length) expect(manual).toBeUndefined();
      if (manual) expect(manual.extension).toBe('pdf');
    }
  });
  it('todas as tabelas de erro resolvem apenas seus pares explícitos de marca e código', () => {
    for (const table of errorTables.references) {
      expect(table.pdfSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(table.pdfPage).toBeGreaterThan(0);
      for (const covered of table.coveredModels) {
        const model = byIdentity.get(modelKey(covered.brand, covered.code));
        expect(model, `${covered.brand}: ${covered.code}`).toBeDefined();
        expect(getEquipmentCodeReference(model)?.id).toBe(table.id);
        expect(getEquipmentCodeReference({ ...model!, brand: { name: 'Outra marca' } })).toBeNull();
      }
    }
  });
  it('organiza todas as referências uma única vez, mantendo famílias encontráveis', () => {
    const sections = organizeCatalog(models);
    expect(sections.flatMap(section => section.models)).toHaveLength(models.length);
    expect(sections.flatMap(section => section.families.flatMap(family => family.models))).toHaveLength(models.length);
    expect(sections.find(section => section.key === 'industrial')?.models.some(model => model.brand?.name === 'LG')).toBe(true);
  });
});
