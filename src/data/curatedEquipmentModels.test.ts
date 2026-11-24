import { describe, expect, it, vi } from 'vitest';
import { curatedEquipmentModel, curatedEquipmentModels, mergeCuratedEquipmentModels } from './curatedEquipmentModels';
vi.mock('./additionalCatalog.json', () => ({ default: { models: [] } }));

vi.mock('./daikinCatalog.json', () => ({ default: { models: [
  { id: 'curated-indoor', brand_id: 'daikin', code: 'FTKC09T5VL', domain: 'ar_condicionado', name: 'Modelo conferido', image_url: 'https://example.org/photo.jpg', manual_url: 'https://example.org/manual.pdf', manual_type: 'usuario', category_id: 'hiwall', category: { id: 'hiwall', name: 'Hi-Wall' }, catalog_reference: { line: 'Full Inverter', unit_kind: 'indoor' } },
  { id: 'curated-purifier', brand_id: 'daikin', code: 'MC55YCVL', domain: 'linha_branca', name: 'Purificador', image_url: 'https://example.org/purifier.jpg', manual_url: null },
] } }));

describe('modelos documentados complementam o catálogo', () => {
  it('filtra domínio, marca e código antes de acrescentar modelos', () => {
    expect(curatedEquipmentModels({ domain: 'ar_condicionado' }).map(m => m.code)).toEqual(['FTKC09T5VL']);
    expect(curatedEquipmentModels({ brandId: 'outra-marca' })).toEqual([]);
    expect(curatedEquipmentModels({ term: 'ftkc-09' }).map(m => m.code)).toEqual(['FTKC09T5VL']);
    expect(curatedEquipmentModel('curated-purifier')?.domain).toBe('linha_branca');
  });
  it('mantém UUID e conteúdo remoto mesmo com código formatado de outra forma', () => {
    const remote = { id: 'server-id', brand_id: 'daikin', code: 'ftkc-09t5vl', domain: 'ar_condicionado', name: 'Nome cadastrado', image_url: 'https://example.org/current.jpg', manual_url: null, potencia_w: 730 };
    const result = mergeCuratedEquipmentModels([remote], { domain: 'ar_condicionado' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ ...remote, manual_url: 'https://example.org/manual.pdf' });
    expect(result[0]).toHaveProperty('catalog_reference.unit_kind', 'indoor');
    expect(remote.manual_url).toBeNull();
  });
  it('não confunde equipamento sem código, outra marca ou outro domínio', () => {
    const other = { id: 'other', brand_id: 'another', code: 'FTKC09T5VL', domain: 'ar_condicionado' };
    expect(mergeCuratedEquipmentModels([other], { brandId: 'another' })).toEqual([other]);
    const unknown = { ...other, brand_id: 'daikin', code: null };
    expect(mergeCuratedEquipmentModels([unknown], { domain: 'ar_condicionado' })).toHaveLength(2);
    const cloned = mergeCuratedEquipmentModels([], { domain: 'ar_condicionado' });
    expect(mergeCuratedEquipmentModels(cloned, { domain: 'ar_condicionado' })).toHaveLength(1);
  });
});
