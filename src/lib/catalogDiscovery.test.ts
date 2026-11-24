import { describe, expect, it } from 'vitest';
import type { EquipmentModel } from '@/hooks/useEquipmentCatalog';
import type { CatalogModelProvenance } from '@/data/curatedEquipmentModels';
import { catalogDiscoveryRank, everydayCatalogModels, prioritizeCatalogModels } from './catalogDiscovery';

function model(id: string, category = 'Split Hi-Wall', extra: Partial<EquipmentModel> = {}): EquipmentModel {
  return { id, name: id, code: id, domain: 'ar_condicionado', brand_id: 'brand-a', category_id: category,
    category: { id: category, name: category }, image_url: null, manual_url: null, refrigerant: null,
    potencia_w: null, consumo_kwh_mes: null, created_at: '', ...extra };
}

function reference(
  line = 'Split',
  unit_kind: CatalogModelProvenance['unit_kind'] = 'indoor',
  record_scope: CatalogModelProvenance['record_scope'] = 'model',
): CatalogModelProvenance {
  return { line, unit_kind, record_scope, source_url: 'https://example.org/catalog', document: '', pages: [], reviewed_at: '' };
}

describe('descoberta editorial do catálogo', () => {
  it('a adição de 100 industriais não esconde nem ultrapassa fichas básicas existentes', () => {
    const oldBasic = model('old-basic');
    const industrial = Array.from({ length: 100 }, (_, index) => model(`industrial-${index}`, 'Chiller'));
    const input = [...industrial, oldBasic];
    const result = prioritizeCatalogModels(input);
    expect(result).toHaveLength(101);
    expect(result[0]).toBe(oldBasic);
    expect(result.slice(1)).toEqual(industrial);
    expect(everydayCatalogModels(input)).toEqual([oldBasic]);
  });

  it('retorna cópia estável, preserva referências e mantém a ordem de empates', () => {
    const first = model('first');
    const second = model('second');
    const industrial = model('industrial', 'Chiller');
    const input = [industrial, first, second];
    const result = prioritizeCatalogModels(input);
    expect(result).not.toBe(input);
    expect(input).toEqual([industrial, first, second]);
    expect(result).toEqual([first, second, industrial]);
    expect(result[0]).toBe(first);
    expect(prioritizeCatalogModels(result)).toEqual(result);
  });

  it('prioriza split/janela, comercial unitário, VRF e industrial conforme arquitetura publicada', () => {
    const basic = model('basic');
    const window = model('window', 'Janela');
    const cassette = model('cassette', 'Cassete');
    const duct = model('duct', 'Dutado');
    const multi = model('multi', 'Hi-Wall', { catalog_reference: reference('Multi Split Lite Smart', 'system') });
    const vrf = model('vrf', 'Cassete', { catalog_reference: reference('VRV 6', 'system') });
    const industrial = model('industrial', 'Chiller');
    expect(prioritizeCatalogModels([industrial, vrf, cassette, duct, multi, basic, window]))
      .toEqual([basic, window, cassette, duct, multi, vrf, industrial]);
    expect(catalogDiscoveryRank(cassette)).toBeLessThan(catalogDiscoveryRank(vrf));
  });

  it('prefere fichas completas, depois unidades internas/externas e deixa abstrações após físicos', () => {
    const complete = model('existing-complete');
    const indoor = model('indoor', 'Hi-Wall', { catalog_reference: reference() });
    const outdoor = model('outdoor', 'Hi-Wall', { catalog_reference: reference('Split', 'outdoor') });
    const industrial = model('physical-chiller', 'Chiller');
    const configuration = model('configuration', 'Hi-Wall', { catalog_reference: reference('Split', 'system', 'configuration') });
    const series = model('series', 'Hi-Wall', { catalog_reference: reference('Split', 'system', 'series') });
    const combination = model('combination', 'Hi-Wall', { catalog_reference: reference('Split', 'system', 'combination') });
    expect(prioritizeCatalogModels([configuration, series, combination, outdoor, indoor, industrial, complete]))
      .toEqual([complete, indoor, outdoor, industrial, configuration, series, combination]);
    expect(everydayCatalogModels([configuration, series, combination, outdoor, indoor, industrial, complete]))
      .toEqual([complete, indoor]);
  });

  it('distribui marcas com fila interna priorizada e retorna todos os básicos para paginação', () => {
    const a1 = model('a1');
    const a2 = model('a2');
    const a3 = model('a3');
    const b1 = model('b1', 'Hi-Wall', { brand_id: 'brand-b' });
    const b2 = model('b2', 'Hi-Wall', { brand_id: 'brand-b' });
    const c1 = model('c1', 'Janela', { brand_id: 'brand-c' });
    expect(everydayCatalogModels([a1, a2, a3, b1, b2, c1])).toEqual([a1, b1, c1, a2, b2, a3]);
  });

  it('não usa prefixo, capacidade ou dados técnicos para inventar popularidade e especificações', () => {
    const large = model('large', 'Hi-Wall', { name: 'Modelo 60000 BTU', code: 'VRF60000', potencia_w: 9000 });
    const small = model('small', 'Hi-Wall', { name: 'Modelo 9000 BTU', code: 'SMALL9000', potencia_w: 1000 });
    const unknown = model('unknown', 'Não identificado', { code: 'SPLIT9000' });
    expect(catalogDiscoveryRank(large)).toBe(catalogDiscoveryRank(small));
    expect(prioritizeCatalogModels([large, small])).toEqual([large, small]);
    expect(everydayCatalogModels([unknown, large, small])).toEqual([large, small]);
    expect(large.refrigerant).toBeNull();
    expect(large.catalog_reference).toBeUndefined();
  });

  it('preserva compressores, controles e outros domínios nas posições originais', () => {
    const compressor = model('compressor', 'Scroll', { domain: 'compressor' });
    const remote = model('remote', 'Controle universal', { domain: 'controle_remoto' });
    const appliance = model('appliance', 'Geladeira', { domain: 'linha_branca' });
    const chiller = model('chiller', 'Chiller');
    const basic = model('basic');
    const input = [compressor, chiller, remote, basic, appliance];
    expect(prioritizeCatalogModels(input)).toEqual([compressor, basic, remote, chiller, appliance]);
    expect(prioritizeCatalogModels([remote, compressor, appliance])).toEqual([remote, compressor, appliance]);
    expect(everydayCatalogModels([remote, compressor, appliance])).toEqual([]);
  });

  it('usa apenas rótulos explícitos para unidade externa e mantém fallback quando só existem externas', () => {
    const outdoor = model('outside', 'Condensadora Split');
    const complete = model('complete');
    expect(everydayCatalogModels([outdoor, complete])).toEqual([complete]);
    expect(everydayCatalogModels([outdoor])).toEqual([outdoor]);
    expect(everydayCatalogModels([])).toEqual([]);
  });
});
